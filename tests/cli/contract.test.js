import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-02-05' });

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
    'BK-2025-0001:120:2,BK-2025-0002:68.5:2',
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

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-contract-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('contract add', () => {
  it('works out the hives and the value', async () => {
    const { status, capture } = await addContract();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id     CT-2025-0007',
      'hives  377',
      'acres  188.5',
      'value  $77,285.00',
    ]);
  });

  it('refuses blocks in the wrong shape', async () => {
    const { status, capture } = await addContract(['--blocks', 'BK-2025-0001']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('blocks look like');
  });

  it('refuses tiers in the wrong shape', async () => {
    const { status, capture } = await addContract(['--tiers', '10']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('tiers look like');
  });

  it('refuses tiers that are not strongest first', async () => {
    const { status, capture } = await addContract(['--tiers', '6:-2500,10:2500']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('strongest first');
  });

  it('takes the grading terms off the command line', async () => {
    await addContract([
      '--grade-by',
      'colony',
      '--shortfall',
      'reject',
      '--regrade',
      '3',
    ]);
    const { capture } = await run(['contract', 'show', 'CT-2025-0007'], { json: true });
    expect(capture.parsed.terms).toMatchObject({
      gradeBy: 'colony',
      shortfall: 'reject',
      regradeWithinDays: 3,
    });
  });

  it('takes a broker and a commission', async () => {
    await addContract(['--broker', 'Central Valley Bee', '--commission', '750']);
    const { capture } = await run(['contract', 'show', 'CT-2025-0007'], { json: true });
    expect(capture.parsed.commissionCents).toBe(579638);
    expect(capture.parsed.netCents).toBe(7728500 - 579638);
  });
});

describe('contract show', () => {
  beforeEach(() => addContract());

  it('says the delivery window is open today', async () => {
    const { capture } = await run(['contract', 'show', 'CT-2025-0007']);
    expect(capture.stdout).toContain('delivery    2025-02-01 to 2025-02-10, open');
    expect(capture.stdout).toContain('removal     2025-03-05 to 2025-03-18');
    expect(capture.stdout).not.toContain('2025-03-18, open');
  });

  it('prints the grading terms underneath', async () => {
    const { capture } = await run(['contract', 'show', 'CT-2025-0007']);
    expect(capture.stdout).toContain('minimum 8 frames, graded by average');
    expect(capture.stdout).toContain('shortfall prorate');
  });

  it('says nothing was earned by a broker when there is none', async () => {
    const { capture } = await run(['contract', 'show', 'CT-2025-0007']);
    expect(capture.stdout).toContain('commission  $0.00');
  });
});

describe('contract list', () => {
  it('filters by season and crop', async () => {
    await addContract();
    await addContract([
      '--id',
      'CT-2025-0008',
      '--crop',
      'cherry',
      '--delivery',
      '2025-03-01..2025-03-08',
      '--removal',
      '2025-03-20..2025-03-28',
    ]);
    const bySeason = await run(['contract', 'list', '--season', '2025'], {
      json: true,
    });
    expect(bySeason.capture.parsed).toHaveLength(2);
    const byCrop = await run(['contract', 'list', '--crop', 'cherry'], { json: true });
    expect(byCrop.capture.parsed.map((row) => row.id)).toEqual(['CT-2025-0008']);
  });

  it('prints the rate as money', async () => {
    await addContract();
    const { capture } = await run(['contract', 'list']);
    expect(capture.lines[2]).toContain('$205.00');
  });
});

describe('contract plan', () => {
  beforeEach(() => addContract());

  it('plans the drops in whole pallets', async () => {
    const { capture } = await run(['contract', 'plan', 'CT-2025-0007']);
    expect(capture.lines[0]).toBe('BK-2025-0001 drop 1: 48 hives');
    expect(capture.lines.pop()).toBe('8 drops, 377 hives');
  });

  it('takes a tighter cap', async () => {
    const { capture } = await run(
      ['contract', 'plan', 'CT-2025-0007', '--max-per-drop', '24'],
      { json: true }
    );
    expect(capture.parsed.drops).toHaveLength(16);
    expect(capture.parsed.hives).toBe(377);
  });

  it('plans on six way pallets when asked', async () => {
    const { capture } = await run(
      ['contract', 'plan', 'CT-2025-0007', '--pattern', 'six-way'],
      { json: true }
    );
    expect(capture.parsed.hives).toBe(377);
  });

  it('refuses a contract that is not on file', async () => {
    const { status } = await run(['contract', 'plan', 'CT-2025-0099']);
    expect(status).toBe(3);
  });
});
