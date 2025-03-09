import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

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
      '2025-02-05',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addDrop = (sequence, overrides = []) =>
  run([
    'drop',
    'add',
    '--id',
    `DR-2025-${String(sequence).padStart(4, '0')}`,
    '--contract',
    'CT-2025-0007',
    '--block',
    'BK-2025-0001',
    '--ordered',
    '24',
    '--latitude',
    '36.9',
    '--longitude',
    '-120.1',
    ...overrides,
  ]);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-drop-'));
  await run([
    'contract',
    'add',
    '--id',
    'CT-2025-0007',
    '--grower',
    'Wilkins Farming',
    '--county',
    'Madera',
    '--crop',
    'almond',
    '--blocks',
    'BK-2025-0001:120:2',
    '--rate',
    '20500',
    '--delivery',
    '2025-02-01..2025-02-10',
    '--removal',
    '2025-03-05..2025-03-18',
    '--signed-on',
    '2024-09-14',
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('drop add', () => {
  it('plans a drop', async () => {
    const { status, capture } = await addDrop(4);
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id       DR-2025-0004',
      'ordered  24',
      'pattern  interior',
    ]);
  });

  it('takes a pattern', async () => {
    const { capture } = await addDrop(4, ['--pattern', 'perimeter']);
    expect(capture.lines[2]).toBe('pattern  perimeter');
  });
});

describe('drop set', () => {
  beforeEach(() => addDrop(4));

  it('records the hives and the shortfall', async () => {
    const { capture } = await run(
      ['drop', 'set', 'DR-2025-0004', '--hives', '20', '--on', '2025-02-04'],
      { json: true }
    );
    expect(capture.parsed).toEqual({
      id: 'DR-2025-0004',
      set: 20,
      short: 4,
      on: '2025-02-04',
    });
  });

  it('refuses a set outside the delivery window', async () => {
    const { status, capture } = await run([
      'drop',
      'set',
      'DR-2025-0004',
      '--hives',
      '24',
      '--on',
      '2025-02-20',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('outside the delivery window');
  });

  it('leaves the drop unset when it refuses', async () => {
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '24', '--on', '2025-02-20']);
    const { capture } = await run(['drop', 'show', 'DR-2025-0004'], { json: true });
    expect(capture.parsed.set).toBeUndefined();
  });
});

describe('drop pull', () => {
  beforeEach(async () => {
    await addDrop(4);
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '24', '--on', '2025-02-04']);
  });

  it('records the pull and the standing span', async () => {
    const { capture } = await run(
      ['drop', 'pull', 'DR-2025-0004', '--on', '2025-03-10'],
      {
        json: true,
      }
    );
    expect(capture.parsed).toEqual({
      id: 'DR-2025-0004',
      pulledOn: '2025-03-10',
      standing: '2025-02-04 to 2025-03-10',
    });
  });

  it('refuses a pull before the removal window opens', async () => {
    const { status, capture } = await run([
      'drop',
      'pull',
      'DR-2025-0004',
      '--on',
      '2025-02-25',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('outside the removal window');
  });
});

describe('drop list', () => {
  beforeEach(async () => {
    await addDrop(4);
    await addDrop(5);
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '20', '--on', '2025-02-04']);
  });

  it('lists them all', async () => {
    const { capture } = await run(['drop', 'list'], { json: true });
    expect(capture.parsed).toHaveLength(2);
  });

  it('filters to the ones still standing', async () => {
    const { capture } = await run(['drop', 'list', '--standing'], { json: true });
    expect(capture.parsed.map((row) => row.id)).toEqual(['DR-2025-0004']);
  });

  it('filters to the short ones, which includes the unset', async () => {
    const { capture } = await run(['drop', 'list', '--short'], { json: true });
    expect(capture.parsed).toHaveLength(2);
  });

  it('filters to one contract', async () => {
    const { capture } = await run(['drop', 'list', '--contract', 'CT-2025-0099'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });
});

describe('drop shortfall', () => {
  it('adds the shortfall by contract', async () => {
    await addDrop(4);
    await addDrop(5);
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '20', '--on', '2025-02-04']);
    await run(['drop', 'set', 'DR-2025-0005', '--hives', '24', '--on', '2025-02-04']);
    const { capture } = await run(['drop', 'shortfall'], { json: true });
    expect(capture.parsed).toEqual([{ contract: 'CT-2025-0007', hives: 4 }]);
  });

  it('says the total in text mode', async () => {
    await addDrop(4);
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '20', '--on', '2025-02-04']);
    const { capture } = await run(['drop', 'shortfall']);
    expect(capture.lines.pop()).toBe('4 hives short in total');
  });

  it('leaves out the contracts that were filled', async () => {
    await addDrop(4);
    await run(['drop', 'set', 'DR-2025-0004', '--hives', '24', '--on', '2025-02-04']);
    const { capture } = await run(['drop', 'shortfall'], { json: true });
    expect(capture.parsed).toEqual([]);
  });
});

describe('drop show', () => {
  it('says not yet before anything is set', async () => {
    await addDrop(4);
    const { capture } = await run(['drop', 'show', 'DR-2025-0004']);
    expect(capture.stdout).toContain('set       not yet');
    expect(capture.stdout).toContain('standing  not set');
  });
});
