import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { defaultPrintDirectory } from '../../src/cli/commands/print.js';

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-print-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('documents', () => {
  it('names what can be printed', async () => {
    const { capture } = await run(['documents'], { json: true });
    expect(capture.parsed).toEqual(['certificate', 'manifest', 'set-sheet']);
  });
});

describe('print', () => {
  it('prints a set sheet', async () => {
    const { status, capture } = await run(['print', 'set-sheet', 'CT-2025-0007']);
    expect(status).toBe(0);
    expect(capture.lines[0]).toBe('set sheet CT-2025-0007');
  });

  it('prints a manifest', async () => {
    const { capture } = await run(['print', 'manifest', 'LD-2025-0143']);
    expect(capture.stdout).toContain('brands aboard');
  });

  it('prints a grading certificate', async () => {
    const { capture } = await run(['print', 'certificate', 'GR-2025-0009']);
    expect(capture.stdout).toContain('grower signature');
  });

  it('wraps the text in json mode', async () => {
    const { capture } = await run(['print', 'set-sheet', 'CT-2025-0007'], {
      json: true,
    });
    expect(capture.parsed.document).toBe('set-sheet');
    expect(capture.parsed.text).toContain('set sheet');
  });

  it('writes to a file when asked', async () => {
    const path = join(root, 'sheet.txt');
    const { capture } = await run(
      ['print', 'set-sheet', 'CT-2025-0007', '--to', path],
      {
        json: true,
      }
    );
    expect(capture.parsed.file).toBe(path);
    expect(readFileSync(path, 'utf8')).toContain('set sheet CT-2025-0007');
  });

  it('counts the lines it wrote', async () => {
    const path = join(root, 'sheet.txt');
    const { capture } = await run(
      ['print', 'set-sheet', 'CT-2025-0007', '--to', path],
      {
        json: true,
      }
    );
    expect(capture.parsed.lines).toBeGreaterThan(5);
  });

  it('refuses a document nobody prints', async () => {
    const { status, capture } = await run(['print', 'invoice', 'CT-2025-0007']);
    expect(status).toBe(3);
    expect(capture.stderr).toContain('no document with id invoice');
  });

  it('refuses a record that is not on file', async () => {
    const { status } = await run(['print', 'set-sheet', 'CT-2025-0099']);
    expect(status).toBe(3);
  });
});

describe('defaultPrintDirectory', () => {
  it('sits under the record directory', () => {
    expect(defaultPrintDirectory('/records')).toBe(join('/records', 'printed'));
  });
});
