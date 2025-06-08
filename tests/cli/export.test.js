import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';
import { parseCsvRecords } from '../../src/core/csv.js';
import { exportNames } from '../../src/reporting/export.js';

let root;

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
  root = mkdtempSync(join(tmpdir(), 'broodhaul-export-cli-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('export list', () => {
  it('names every export and its columns', async () => {
    const { capture } = await run(['export', 'list'], { json: true });
    expect(capture.parsed.map((row) => row.name)).toEqual(exportNames());
    expect(capture.parsed[0].columns).toContain('id');
  });

  it('prints a table in text mode', async () => {
    const { capture } = await run(['export', 'list']);
    expect(capture.lines[0]).toMatch(/^name +columns$/);
  });
});

describe('export csv', () => {
  it('writes a header and the rows', async () => {
    const { status, capture } = await run(['export', 'csv', 'yards']);
    expect(status).toBe(0);
    const records = parseCsvRecords(capture.stdout);
    expect(records).toHaveLength(2);
    expect(records[0].name).toBe('Dinuba home place');
  });

  it('gives the rows as objects in json mode', async () => {
    const { capture } = await run(['export', 'csv', 'colonies'], { json: true });
    expect(capture.parsed).toHaveLength(12);
    expect(capture.parsed[0].queenRace).toBe('italian');
  });

  it('refuses an export nobody has', async () => {
    const { status, capture } = await run(['export', 'csv', 'trucks']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('no export called trucks');
  });

  it('exports the contracts with the money formatted', async () => {
    const { capture } = await run(['export', 'csv', 'contracts']);
    expect(capture.stdout).toContain('$205.00');
  });
});

describe('export all', () => {
  it('writes one file per export', async () => {
    const directory = join(root, 'out');
    const { status, capture } = await run(['export', 'all', directory], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed).toHaveLength(exportNames().length);
    expect(readdirSync(directory).sort()).toEqual(
      exportNames().map((name) => `${name}.csv`)
    );
  });

  it('says how many rows went into each', async () => {
    const directory = join(root, 'out');
    const { capture } = await run(['export', 'all', directory], { json: true });
    expect(capture.parsed.find((row) => row.name === 'colonies').rows).toBe(12);
  });

  it('writes files that parse back', async () => {
    const directory = join(root, 'out');
    await run(['export', 'all', directory]);
    const text = readFileSync(join(directory, 'drops.csv'), 'utf8');
    const records = parseCsvRecords(text);
    expect(records[0].short).toBe('4');
  });

  it('makes the directory when it is not there', async () => {
    const directory = join(root, 'deep', 'out');
    await run(['export', 'all', directory]);
    expect(readdirSync(directory).length).toBeGreaterThan(0);
  });

  it('prints the files it wrote in text mode', async () => {
    const directory = join(root, 'out');
    const { capture } = await run(['export', 'all', directory]);
    expect(capture.lines[0]).toBe('name         rows  file');
  });
});
