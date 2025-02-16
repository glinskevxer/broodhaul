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
      '2025-06-20',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addPallet = (sequence, overrides = []) =>
  run([
    'pallet',
    'add',
    '--id',
    `PL-2025-${String(sequence).padStart(4, '0')}`,
    '--yard',
    'YD-2025-0001',
    '--built-on',
    '2024-10-18',
    ...overrides,
  ]);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-pallet-'));
  await run([
    'yard',
    'add',
    '--id',
    'YD-2025-0001',
    '--name',
    'home place',
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
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('pallet add', () => {
  it('defaults to a four way pallet', async () => {
    const { status, capture } = await addPallet(31);
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id         PL-2025-0031',
      'pattern    four-way',
      'positions  4',
    ]);
  });

  it('takes a six way pallet', async () => {
    const { capture } = await addPallet(31, ['--pattern', 'six-way']);
    expect(capture.lines[2]).toBe('positions  6');
  });

  it('refuses a tare nobody weighs', async () => {
    const { status, capture } = await addPallet(31, ['--tare', '5']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('at least 20');
  });
});

describe('pallet set and clear', () => {
  beforeEach(() => addPallet(31));

  it('fills the first free position', async () => {
    const { capture } = await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011'], {
      json: true,
    });
    expect(capture.parsed).toEqual({
      id: 'PL-2025-0031',
      colony: 'CY-2025-0011',
      on: 1,
      capacity: 4,
    });
  });

  it('takes a named position', async () => {
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011', '--position', '3']);
    const { capture } = await run(['pallet', 'show', 'PL-2025-0031'], { json: true });
    expect(capture.parsed.positions).toEqual([null, null, 'CY-2025-0011', null]);
  });

  it('refuses a position that is taken', async () => {
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011', '--position', '3']);
    const { status, capture } = await run([
      'pallet',
      'set',
      'PL-2025-0031',
      'CY-2025-0012',
      '--position',
      '3',
    ]);
    expect(status).toBe(4);
    expect(capture.stderr).toContain('is taken');
  });

  it('refuses to overfill', async () => {
    for (const sequence of [11, 12, 13, 14]) {
      await run(['pallet', 'set', 'PL-2025-0031', `CY-2025-00${sequence}`]);
    }
    const { status, capture } = await run([
      'pallet',
      'set',
      'PL-2025-0031',
      'CY-2025-0015',
    ]);
    expect(status).toBe(6);
    expect(capture.stderr).toContain('is full');
  });

  it('takes a colony off by name', async () => {
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011']);
    const { capture } = await run(
      ['pallet', 'clear', 'PL-2025-0031', '--colony', 'CY-2025-0011'],
      { json: true }
    );
    expect(capture.parsed.on).toBe(0);
  });

  it('takes a position off by number', async () => {
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011', '--position', '2']);
    const { capture } = await run(
      ['pallet', 'clear', 'PL-2025-0031', '--position', '2'],
      {
        json: true,
      }
    );
    expect(capture.parsed.on).toBe(0);
  });

  it('refuses to empty a position that is already empty', async () => {
    const { status } = await run([
      'pallet',
      'clear',
      'PL-2025-0031',
      '--position',
      '2',
    ]);
    expect(status).toBe(6);
  });
});

describe('pallet show', () => {
  beforeEach(async () => {
    await addPallet(31);
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011']);
  });

  it('prints a line per position', async () => {
    const { capture } = await run(['pallet', 'show', 'PL-2025-0031']);
    expect(capture.stdout).toContain('position 1  CY-2025-0011');
    expect(capture.stdout).toContain('position 4  empty');
  });

  it('weighs the pallet at the stage asked for', async () => {
    const bloom = await run(['pallet', 'show', 'PL-2025-0031'], { json: true });
    const flow = await run(['pallet', 'show', 'PL-2025-0031', '--stage', 'flow'], {
      json: true,
    });
    expect(bloom.capture.parsed.weightLb).toBe(178);
    expect(flow.capture.parsed.weightLb).toBeGreaterThan(bloom.capture.parsed.weightLb);
  });

  it('refuses a stage nobody names', async () => {
    const { status } = await run([
      'pallet',
      'show',
      'PL-2025-0031',
      '--stage',
      'spring',
    ]);
    expect(status).toBe(2);
  });
});

describe('pallet list', () => {
  it('shows how full each pallet is', async () => {
    await addPallet(31);
    await run(['pallet', 'set', 'PL-2025-0031', 'CY-2025-0011']);
    const { capture } = await run(['pallet', 'list']);
    expect(capture.lines[2]).toContain('1 of 4');
  });

  it('filters to the full ones', async () => {
    await addPallet(31);
    await addPallet(32);
    for (const sequence of [11, 12, 13, 14]) {
      await run(['pallet', 'set', 'PL-2025-0031', `CY-2025-00${sequence}`]);
    }
    const { capture } = await run(['pallet', 'list', '--full'], { json: true });
    expect(capture.parsed.map((row) => row.id)).toEqual(['PL-2025-0031']);
  });

  it('filters to a yard', async () => {
    await addPallet(31);
    const { capture } = await run(['pallet', 'list', '--yard', 'YD-2025-0001'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(1);
  });
});
