import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;
let previousExitCode;

async function run(args, { json = false } = {}) {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      '2025-06-20',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addYard = (sequence, overrides = []) =>
  run([
    'yard',
    'add',
    '--id',
    `YD-2025-${String(sequence).padStart(4, '0')}`,
    '--name',
    `yard ${sequence}`,
    '--county',
    'Tulare',
    '--state',
    'CA',
    '--landowner',
    'R Wilkins',
    '--agreement-on',
    '2024-11-01',
    '--latitude',
    '36.5',
    '--longitude',
    '-119.4',
    '--capacity',
    '96',
    ...overrides,
  ]);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-check-'));
  previousExitCode = process.exitCode;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.exitCode = previousExitCode;
});

describe('check', () => {
  it('says nothing to report on a clean desk', async () => {
    await addYard(1);
    const { capture } = await run(['check']);
    expect(capture.lines).toEqual(['nothing to report']);
  });

  it('leaves the exit code alone when it finds nothing', async () => {
    process.exitCode = 0;
    await addYard(1);
    await run(['check']);
    expect(process.exitCode).toBe(0);
  });

  it('reports two yards sitting on top of each other', async () => {
    await addYard(1);
    await addYard(2);
    const { capture } = await run(['check']);
    expect(capture.lines[0]).toContain('yards_too_close');
    expect(capture.lines[0]).toContain('YD-2025-0001');
  });

  it('sets a failing exit code when it finds something', async () => {
    process.exitCode = 0;
    await addYard(1);
    await addYard(2);
    await run(['check']);
    expect(process.exitCode).toBe(1);
  });

  it('gives the problems as json', async () => {
    await addYard(1);
    await addYard(2);
    const { capture } = await run(['check'], { json: true });
    expect(capture.parsed[0].kind).toBe('yards_too_close');
  });

  it('counts by kind', async () => {
    await addYard(1);
    await addYard(2);
    const { capture } = await run(['check', '--counts'], { json: true });
    expect(capture.parsed).toEqual([{ kind: 'yards_too_close', count: 1 }]);
  });
});

describe('counts', () => {
  it('reports every collection', async () => {
    const { capture } = await run(['counts'], { json: true });
    expect(capture.parsed).toHaveLength(10);
    expect(capture.parsed.every((row) => row.records === 0)).toBe(true);
  });

  it('counts what has been written', async () => {
    await addYard(1);
    const { capture } = await run(['counts'], { json: true });
    expect(capture.parsed.find((row) => row.collection === 'yards').records).toBe(1);
  });
});

describe('journal tail', () => {
  beforeEach(async () => {
    await addYard(1);
    await addYard(2);
    await run(['yard', 'remove', 'YD-2025-0002']);
  });

  it('shows the entries in order', async () => {
    const { capture } = await run(['journal', 'tail']);
    expect(capture.lines).toHaveLength(3);
    expect(capture.lines[0]).toContain('insert yards YD-2025-0001');
    expect(capture.lines[2]).toContain('remove yards YD-2025-0002');
  });

  it('honours the limit', async () => {
    const { capture } = await run(['journal', 'tail', '--limit', '1']);
    expect(capture.lines).toHaveLength(1);
    expect(capture.lines[0]).toContain('remove');
  });

  it('filters to a day', async () => {
    const { capture } = await run(['journal', 'tail', '--on', '2025-06-20'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(3);
    const other = await run(['journal', 'tail', '--on', '2025-06-19'], { json: true });
    expect(other.capture.parsed).toEqual([]);
  });

  it('filters from a day onward', async () => {
    const { capture } = await run(['journal', 'tail', '--since', '2025-06-21'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });
});

describe('journal record and actors', () => {
  beforeEach(async () => {
    await addYard(1);
    await addYard(1, ['--capacity', '48']);
  });

  it('shows every entry touching one record', async () => {
    const { capture } = await run(['journal', 'record', 'yards', 'YD-2025-0001'], {
      json: true,
    });
    expect(capture.parsed.map((entry) => entry.action)).toEqual(['insert', 'update']);
  });

  it('is empty for a record nobody has touched', async () => {
    const { capture } = await run(['journal', 'record', 'yards', 'YD-2025-0099'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });

  it('names who has written anything', async () => {
    const { capture } = await run(['journal', 'actors'], { json: true });
    expect(capture.parsed).toEqual(['M Ojeda']);
  });

  it('lists the collections the journal carries', async () => {
    const { capture } = await run(['journal', 'collections'], { json: true });
    expect(capture.parsed).toContain('yards');
    expect(capture.parsed).toContain('gradings');
  });
});
