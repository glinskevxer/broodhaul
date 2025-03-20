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
      '2025-02-14',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addContract = (overrides = []) =>
  run([
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
    ...overrides,
  ]);

const addRun = (overrides = []) =>
  run([
    'grading',
    'add',
    '--id',
    'GR-2025-0009',
    '--contract',
    'CT-2025-0007',
    '--drop',
    'DR-2025-0004',
    '--grader',
    'M Ojeda',
    '--on',
    '2025-02-14',
    '--at',
    '11:30',
    '--temperature',
    '68',
    '--readings',
    'CY-2025-0011:8,CY-2025-0012:6,CY-2025-0013:10,CY-2025-0014:4',
    ...overrides,
  ]);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-grading-'));
  await addContract();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('grading add', () => {
  it('records the run and says which method the weather gave it', async () => {
    const { status, capture } = await addRun();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id       GR-2025-0009',
      'method   frame',
      'read     4',
      'average  7',
    ]);
  });

  it('falls to a cluster count on a cold morning', async () => {
    const { capture } = await addRun(['--temperature', '52', '--at', '08:30']);
    expect(capture.lines[1]).toBe('method   cluster');
  });

  it('refuses a run in weather that allows neither method', async () => {
    const { status, capture } = await addRun(['--temperature', '44']);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('either method');
  });

  it('takes a cluster width instead of frames', async () => {
    const { capture } = await addRun([
      '--temperature',
      '52',
      '--at',
      '08:30',
      '--readings',
      'CY-2025-0011:10in,CY-2025-0012:12in',
    ]);
    expect(capture.lines[2]).toBe('read     2');
  });

  it('takes a queenless flag', async () => {
    await addRun(['--readings', 'CY-2025-0011:8,CY-2025-0012:6:queenless']);
    const { capture } = await run(['grading', 'show', 'GR-2025-0009'], { json: true });
    expect(capture.parsed.flags.queenless).toBe(1);
  });

  it('refuses readings in the wrong shape', async () => {
    const { status, capture } = await addRun(['--readings', 'CY-2025-0011']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('readings look like');
  });
});

describe('grading show', () => {
  beforeEach(() => addRun());

  it('prints the conditions and the distribution', async () => {
    const { capture } = await run(['grading', 'show', 'GR-2025-0009']);
    expect(capture.stdout).toContain('2025-02-14 11:30, 68F, wind 5 mph, dry');
    expect(capture.stdout).toContain('frames  colonies');
  });

  it('gives the distribution in json', async () => {
    const { capture } = await run(['grading', 'show', 'GR-2025-0009'], { json: true });
    expect(capture.parsed.distribution).toEqual([
      { frames: 4, colonies: 1 },
      { frames: 6, colonies: 1 },
      { frames: 8, colonies: 1 },
      { frames: 10, colonies: 1 },
    ]);
  });
});

describe('grading assess', () => {
  it('prices a light drop under prorate', async () => {
    await addRun();
    const { capture } = await run(
      ['grading', 'assess', 'CT-2025-0007', '--delivered', '240'],
      { json: true }
    );
    expect(capture.parsed).toMatchObject({
      average: 7,
      meetsMinimum: false,
      shortfall: 1,
      perHiveAdjustmentCents: -2500,
      rule: 'prorate',
      payableHives: 240,
      rateCents: 15750,
      valueCents: 3780000,
    });
  });

  it('prices the same bees differently under reject', async () => {
    await run(['yard', 'list']).catch(() => undefined);
    await addContract(['--id', 'CT-2025-0008', '--shortfall', 'reject']);
    await addRun(['--id', 'GR-2025-0010', '--contract', 'CT-2025-0008']);
    const { capture } = await run(
      ['grading', 'assess', 'CT-2025-0008', '--delivered', '240'],
      { json: true }
    );
    expect(capture.parsed.rule).toBe('reject');
    expect(capture.parsed.payableHives).toBe(120);
  });

  it('prints the working plainly', async () => {
    await addRun();
    const { capture } = await run([
      'grading',
      'assess',
      'CT-2025-0007',
      '--delivered',
      '240',
    ]);
    expect(capture.stdout).toContain('minimum met    no, short by 1');
    expect(capture.stdout).toContain('tier per hive  -$25.00');
    expect(capture.stdout).toContain('payable        240 hives at $157.50');
  });

  it('refuses a contract with nothing graded', async () => {
    const { status, capture } = await run([
      'grading',
      'assess',
      'CT-2025-0007',
      '--delivered',
      '240',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('at least 1 entries');
  });
});

describe('grading sample', () => {
  beforeEach(() => addRun());

  it('passes a run that opened enough', async () => {
    const { capture } = await run(
      ['grading', 'sample', 'GR-2025-0009', '--population', '40'],
      { json: true }
    );
    expect(capture.parsed).toEqual({ run: 'GR-2025-0009', opened: 4, wanted: 4 });
  });

  it('refuses one that did not', async () => {
    const { status, capture } = await run([
      'grading',
      'sample',
      'GR-2025-0009',
      '--population',
      '200',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('terms ask for 20');
  });
});

describe('grading list', () => {
  it('summarises each run', async () => {
    await addRun();
    const { capture } = await run(['grading', 'list'], { json: true });
    expect(capture.parsed[0]).toMatchObject({
      id: 'GR-2025-0009',
      method: 'frame',
      average: 7,
    });
  });

  it('filters by contract', async () => {
    await addRun();
    const { capture } = await run(['grading', 'list', '--contract', 'CT-2025-0099'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });
});
