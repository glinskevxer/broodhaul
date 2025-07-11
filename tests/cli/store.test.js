import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;
let file;

async function run(args, { json = false } = {}) {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      '2025-03-20',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-store-cli-'));
  file = join(root, 'snap.json');
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('store snapshot', () => {
  it('writes every record to a file', async () => {
    const { status, capture } = await run(['store', 'snapshot', file], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.records).toBe(24);
    expect(existsSync(file)).toBe(true);
  });

  it('stamps the time off the clock', async () => {
    const { capture } = await run(['store', 'snapshot', file], { json: true });
    expect(capture.parsed.takenAt).toBe('2025-03-20T12:00:00Z');
  });

  it('takes a note', async () => {
    await run(['store', 'snapshot', file, '--note', 'before settlement']);
    const { capture } = await run(['store', 'diff', file], { json: true });
    expect(capture.parsed.matches).toBe(true);
  });

  it('says what it wrote in text mode', async () => {
    const { capture } = await run(['store', 'snapshot', file]);
    expect(capture.lines[0]).toContain('24 records written');
    expect(capture.stdout).toContain('colonies');
  });
});

describe('store diff', () => {
  beforeEach(() => run(['store', 'snapshot', file]));

  it('says nothing has changed straight after a snapshot', async () => {
    const { capture } = await run(['store', 'diff', file]);
    expect(capture.lines[0]).toContain('nothing has changed since');
  });

  it('names a record that changed', async () => {
    await run(['yard', 'remove', 'YD-2025-0002']);
    const { capture } = await run(['store', 'diff', file], { json: true });
    expect(capture.parsed.matches).toBe(false);
    expect(capture.parsed.differences).toEqual([
      { collection: 'yards', id: 'YD-2025-0002', change: 'removed' },
    ]);
  });

  it('prints a table of differences', async () => {
    await run(['yard', 'remove', 'YD-2025-0002']);
    const { capture } = await run(['store', 'diff', file]);
    expect(capture.lines[0]).toContain('collection');
    expect(capture.lines[2]).toContain('removed');
  });

  it('refuses a file that is not a snapshot', async () => {
    const { status, capture } = await run([
      'store',
      'diff',
      join(root, 'nothing.json'),
    ]);
    expect(status).toBe(3);
    expect(capture.stderr).toContain('no file with id');
  });
});

describe('store restore', () => {
  beforeEach(async () => {
    await run(['store', 'snapshot', file]);
    await run(['yard', 'remove', 'YD-2025-0002']);
  });

  it('changes nothing without the confirmation', async () => {
    const { capture } = await run(['store', 'restore', file], { json: true });
    expect(capture.parsed.wouldChange).toBe(1);
    const after = await run(['counts'], { json: true });
    expect(after.capture.parsed.find((row) => row.collection === 'yards').records).toBe(
      1
    );
  });

  it('says how to actually do it', async () => {
    const { capture } = await run(['store', 'restore', file]);
    expect(capture.lines[0]).toContain('run again with --confirm');
  });

  it('puts the records back when confirmed', async () => {
    const { capture } = await run(['store', 'restore', file, '--confirm'], {
      json: true,
    });
    expect(capture.parsed.written).toBe(24);
    const after = await run(['counts'], { json: true });
    expect(after.capture.parsed.find((row) => row.collection === 'yards').records).toBe(
      2
    );
  });

  it('removes anything added since the snapshot', async () => {
    await run([
      'yard',
      'add',
      '--id',
      'YD-2025-0009',
      '--name',
      'new place',
      '--county',
      'Kern',
      '--state',
      'CA',
      '--landowner',
      'X',
      '--agreement-on',
      '2024-11-01',
      '--latitude',
      '35.5',
      '--longitude',
      '-119.0',
      '--capacity',
      '48',
    ]);
    const { capture } = await run(['store', 'restore', file, '--confirm'], {
      json: true,
    });
    expect(capture.parsed.removed).toBe(1);
    const diff = await run(['store', 'diff', file], { json: true });
    expect(diff.capture.parsed.matches).toBe(true);
  });
});
