import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

/**
 * One season, start to finish, through the command line only.
 *
 * Every other test reaches into a module. This one does what the office does:
 * types the yards in, hauls the bees, grades them, argues about the grading,
 * settles it and reads the season back. It exists because each of those steps
 * has passed on its own and still disagreed with the next one, twice.
 */

let root;

async function run(args, { today = '2025-02-03', json = true } = {}) {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      today,
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const expectOk = async (args, options) => {
  const outcome = await run(args, options);
  expect(outcome.status, args.join(' ')).toBe(0);
  return outcome;
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-season-e2e-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('a season through the command line', () => {
  it('starts with nothing on file', async () => {
    const { capture } = await expectOk(['counts']);
    expect(capture.parsed.every((row) => row.records === 0)).toBe(true);
  });

  it('takes the yards', async () => {
    await expectOk([
      'yard',
      'add',
      '--id',
      'YD-2025-0001',
      '--name',
      'Dinuba home place',
      '--county',
      'Tulare',
      '--state',
      'CA',
      '--landowner',
      'R Wilkins',
      '--agreement-on',
      '2024-11-01',
      '--latitude',
      '36.5432',
      '--longitude',
      '-119.3871',
      '--capacity',
      '96',
    ]);
    const { capture } = await expectOk(['yard', 'list']);
    expect(capture.parsed).toHaveLength(1);
  });

  it('takes the colonies and puts them on pallets', async () => {
    for (let sequence = 11; sequence <= 18; sequence += 1) {
      await expectOk([
        'colony',
        'add',
        '--id',
        `CY-2025-00${sequence}`,
        '--brand',
        `BH-00${sequence}`,
        '--yard',
        'YD-2025-0001',
        '--installed-on',
        '2024-11-12',
        '--queen-source',
        'Koehnen',
      ]);
    }
    for (const pallet of ['PL-2025-0031', 'PL-2025-0032']) {
      await expectOk([
        'pallet',
        'add',
        '--id',
        pallet,
        '--yard',
        'YD-2025-0001',
        '--built-on',
        '2024-10-18',
      ]);
    }
    for (let sequence = 11; sequence <= 14; sequence += 1) {
      await expectOk(['pallet', 'set', 'PL-2025-0031', `CY-2025-00${sequence}`]);
    }
    for (let sequence = 15; sequence <= 18; sequence += 1) {
      await expectOk(['pallet', 'set', 'PL-2025-0032', `CY-2025-00${sequence}`]);
    }
    const { capture } = await expectOk(['colony', 'loose']);
    expect(capture.parsed).toEqual([]);
  });

  it('takes the block and the contract', async () => {
    await expectOk([
      'block',
      'add',
      '--id',
      'BK-2025-0001',
      '--name',
      'Avenue 416 north',
      '--crop',
      'almond',
      '--acres',
      '4',
      '--varieties',
      'Nonpareil:0.5,Monterey:0.5',
      '--planted',
      '2016',
      '--latitude',
      '36.9012',
      '--longitude',
      '-120.1044',
    ]);
    const { capture } = await expectOk([
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
      'BK-2025-0001:4:2',
      '--rate',
      '20500',
      '--delivery',
      '2025-02-01..2025-02-10',
      '--removal',
      '2025-03-05..2025-03-18',
      '--signed-on',
      '2024-09-14',
      '--regrade',
      '3',
    ]);
    expect(capture.parsed.hives).toBe(8);
  });

  it('plans the drops in whole pallets', async () => {
    const { capture } = await expectOk(['contract', 'plan', 'CT-2025-0007']);
    expect(capture.parsed.hives).toBe(8);
    expect(capture.parsed.drops).toHaveLength(1);
  });

  it('hauls the bees to the orchard', async () => {
    await expectOk([
      'drop',
      'add',
      '--id',
      'DR-2025-0004',
      '--contract',
      'CT-2025-0007',
      '--block',
      'BK-2025-0001',
      '--ordered',
      '8',
      '--latitude',
      '36.9012',
      '--longitude',
      '-120.1044',
    ]);
    await expectOk([
      'load',
      'add',
      '--id',
      'LD-2025-0143',
      '--unit',
      'bh-7',
      '--driver',
      'D Rasmussen',
      '--from',
      'YD-2025-0001',
      '--to',
      'DR-2025-0004',
      '--pallets',
      'PL-2025-0031,PL-2025-0032',
    ]);
    const weighed = await expectOk(['load', 'weigh', 'LD-2025-0143']);
    expect(weighed.capture.parsed.legal).toBe(true);
    expect(weighed.capture.parsed.colonies).toBe(8);
    await expectOk(['load', 'advance', 'LD-2025-0143', 'loaded', '--on', '2025-02-03']);
    await expectOk([
      'load',
      'advance',
      'LD-2025-0143',
      'delivered',
      '--on',
      '2025-02-04',
    ]);
    await expectOk([
      'drop',
      'set',
      'DR-2025-0004',
      '--hives',
      '8',
      '--on',
      '2025-02-04',
    ]);
  });

  it('grades the drop and lands under the minimum', async () => {
    const { capture } = await expectOk(
      [
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
        '63',
        '--readings',
        'CY-2025-0011:9,CY-2025-0012:7.5,CY-2025-0013:6,CY-2025-0014:10,CY-2025-0015:5,CY-2025-0016:8.25,CY-2025-0017:4,CY-2025-0018:8',
      ],
      { today: '2025-02-14' }
    );
    expect(capture.parsed.method).toBe('frame');
    expect(capture.parsed.average).toBeLessThan(8);
  });

  it('prices the grading against the contract', async () => {
    const { capture } = await expectOk(
      ['grading', 'assess', 'CT-2025-0007', '--delivered', '8'],
      { today: '2025-02-16' }
    );
    expect(capture.parsed.meetsMinimum).toBe(false);
    expect(capture.parsed.rule).toBe('prorate');
    expect(capture.parsed.rateCents).toBeLessThan(20500);
  });

  it('pulls the bees inside the removal window', async () => {
    await expectOk(['drop', 'pull', 'DR-2025-0004', '--on', '2025-03-10'], {
      today: '2025-03-10',
    });
    const { capture } = await expectOk(['drop', 'show', 'DR-2025-0004'], {
      today: '2025-03-10',
    });
    expect(capture.parsed.pulled).toBe(true);
    expect(capture.parsed.short).toBe(0);
  });

  it('settles the contract', async () => {
    const { capture } = await expectOk(['settle', 'invoice', 'CT-2025-0007'], {
      today: '2025-03-20',
    });
    expect(capture.parsed.deliveredHives).toBe(8);
    expect(capture.parsed.lines.map((line) => line.code)).toEqual([
      'rent',
      'tier',
      'shortfall',
    ]);
    expect(capture.parsed.totalCents).toBeLessThan(8 * 20500);
  });

  it('produces a statement that adds to the invoice', async () => {
    const invoice = await expectOk(['settle', 'invoice', 'CT-2025-0007'], {
      today: '2025-03-20',
    });
    const statement = await expectOk(
      ['settle', 'statement', 'Wilkins Farming', '--season', '2025'],
      { today: '2025-03-20' }
    );
    expect(statement.capture.parsed.totalCents).toBe(invoice.capture.parsed.totalCents);
  });

  it('reads the season back with everything in it', async () => {
    const { capture } = await expectOk(['season', '2025'], { today: '2025-03-20' });
    expect(capture.parsed).toMatchObject({
      contracts: 1,
      growers: 1,
      hivesOrdered: 8,
      hivesSet: 8,
      hivesShort: 0,
      gradingRuns: 1,
      coloniesRead: 8,
      colonies: 8,
    });
  });

  it('has nothing to report at the end of it', async () => {
    const { capture } = await expectOk(['check'], { today: '2025-03-20' });
    expect(capture.parsed).toEqual([]);
  });

  it('journalled every write under the one actor', async () => {
    const { capture } = await expectOk(['journal', 'actors'], { today: '2025-03-20' });
    expect(capture.parsed).toEqual(['M Ojeda']);
  });

  it('exports cleanly at the end', async () => {
    const { capture } = await expectOk(['export', 'csv', 'gradings'], {
      today: '2025-03-20',
    });
    expect(capture.parsed).toHaveLength(1);
  });
});
