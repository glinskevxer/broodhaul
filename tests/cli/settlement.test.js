import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

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

const addGrading = (overrides = []) =>
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

const addDrop = (overrides = []) =>
  run([
    'drop',
    'add',
    '--id',
    'DR-2025-0004',
    '--contract',
    'CT-2025-0007',
    '--block',
    'BK-2025-0001',
    '--ordered',
    '48',
    '--latitude',
    '36.9',
    '--longitude',
    '-120.1',
    ...overrides,
  ]);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-settle-'));
  await addContract();
  await addDrop();
  await run(['drop', 'set', 'DR-2025-0004', '--hives', '48', '--on', '2025-02-04']);
  await addGrading();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('settle invoice', () => {
  it('takes the delivered hives off the drops', async () => {
    const { status, capture } = await run(['settle', 'invoice', 'CT-2025-0007'], {
      json: true,
    });
    expect(status).toBe(0);
    expect(capture.parsed.deliveredHives).toBe(48);
  });

  it('bills rent in full and takes the grading off underneath', async () => {
    const { capture } = await run(['settle', 'invoice', 'CT-2025-0007'], {
      json: true,
    });
    expect(capture.parsed.lines.map((line) => line.code)).toEqual([
      'rent',
      'tier',
      'shortfall',
    ]);
    expect(capture.parsed.totalCents).toBe(756000);
  });

  it('numbers the invoice off the contract', async () => {
    const { capture } = await run(['settle', 'invoice', 'CT-2025-0007'], {
      json: true,
    });
    expect(capture.parsed.number).toBe('CT-2025-0007-001');
  });

  it('takes an explicit delivered count', async () => {
    const { capture } = await run(
      ['settle', 'invoice', 'CT-2025-0007', '--delivered', '200'],
      { json: true }
    );
    expect(capture.parsed.deliveredHives).toBe(200);
  });

  it('takes a one off adjustment', async () => {
    const { capture } = await run(
      [
        'settle',
        'invoice',
        'CT-2025-0007',
        '--adjustment',
        '-12500',
        '--note',
        'fence repair',
      ],
      { json: true }
    );
    const line = capture.parsed.lines.find((entry) => entry.code === 'adjustment');
    expect(line).toMatchObject({ description: 'fence repair', amountCents: -12500 });
  });

  it('adds a commission line when the contract has a broker', async () => {
    await addContract(['--broker', 'Central Valley Bee', '--commission', '750']);
    const { capture } = await run(['settle', 'invoice', 'CT-2025-0007'], {
      json: true,
    });
    expect(capture.parsed.commissionCents).toBe(56700);
    expect(capture.parsed.totalCents).toBe(756000 - 56700);
  });

  it('prints the invoice plainly', async () => {
    const { capture } = await run(['settle', 'invoice', 'CT-2025-0007']);
    expect(capture.lines[0]).toBe('contract CT-2025-0007');
    expect(capture.stdout).toContain('$9,840.00');
    expect(capture.lines.pop()).toBe('total  $7,560.00');
  });

  it('refuses a contract with nothing graded', async () => {
    await addContract(['--id', 'CT-2025-0008']);
    const { status, capture } = await run(['settle', 'invoice', 'CT-2025-0008']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('at least 1 entries');
  });
});

describe('settle statement', () => {
  it('gathers every contract a grower has', async () => {
    const { capture } = await run(
      ['settle', 'statement', 'Wilkins Farming', '--season', '2025'],
      { json: true }
    );
    expect(capture.parsed).toMatchObject({
      grower: 'Wilkins Farming',
      season: 2025,
      contracts: 1,
      hives: 48,
      totalCents: 756000,
    });
  });

  it('breaks the statement down by line code', async () => {
    const { capture } = await run(
      ['settle', 'statement', 'Wilkins Farming', '--season', '2025'],
      { json: true }
    );
    const codes = capture.parsed.totals.map((row) => row.code);
    expect(codes).toEqual(['rent', 'tier', 'shortfall']);
  });

  it('prints it the way it goes in the envelope', async () => {
    const { capture } = await run([
      'settle',
      'statement',
      'Wilkins Farming',
      '--season',
      '2025',
    ]);
    expect(capture.lines[0]).toBe('Wilkins Farming season 2025');
    expect(capture.lines.pop()).toBe('statement total  $7,560.00');
  });

  it('refuses a grower with nothing on the books', async () => {
    const { status, capture } = await run([
      'settle',
      'statement',
      'Ackerman Ranches',
      '--season',
      '2025',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('no invoices for Ackerman Ranches');
  });
});

describe('settle register', () => {
  it('reports a row per contract in the season', async () => {
    const { capture } = await run(['settle', 'register', '--season', '2025'], {
      json: true,
    });
    expect(capture.parsed).toEqual([
      {
        contract: 'CT-2025-0007',
        grower: 'Wilkins Farming',
        hives: 48,
        payable: 48,
        rule: 'prorate',
        total: 756000,
      },
    ]);
  });

  it('prints the money as money', async () => {
    const { capture } = await run(['settle', 'register', '--season', '2025']);
    expect(capture.lines[2]).toContain('$7,560.00');
  });

  it('is a bare header for a season with nothing in it', async () => {
    const { capture } = await run(['settle', 'register', '--season', '2024']);
    expect(capture.lines).toHaveLength(2);
  });
});
