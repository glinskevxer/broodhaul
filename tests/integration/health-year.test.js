import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

/**
 * A mite year, through the command line.
 *
 * August sampling, an August treatment, the withdrawal running out, the supers
 * going back on, and the state inspector finding beetles in September. Every
 * step is a command the crew actually runs, and the interesting part is the
 * order: the treatment cannot go on while the supers are up, and the yard
 * cannot be hauled out of while a hold is running.
 */

let root;

const run = cliRunner(() => root, { today: '2025-08-20' });

const expectOk = async (args, options) => {
  const outcome = await run(args, { json: true, ...options });
  expect(outcome.status, args.join(' ')).toBe(0);
  return outcome;
};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-health-year-'));
  await expectOk(['example', 'load']);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('a mite year', () => {
  it('samples the home yard and calls it', async () => {
    const { capture } = await expectOk([
      'health',
      'yard-rate',
      '--yard',
      'YD-2025-0001',
      '--on',
      '2025-08-14',
      '--washes',
      'CY-2025-0011:9,CY-2025-0012:15,CY-2025-0013:12',
    ]);
    expect(capture.parsed.rate).toBe(4);
    expect(capture.parsed.action).toBe('urgent');
  });

  it('refuses to treat while the supers are still on', async () => {
    const { status, capture } = await run([
      'health',
      'treat',
      '--id',
      'TR-2025-0031',
      '--yard',
      'YD-2025-0001',
      '--product',
      'apiguard',
      '--on',
      '2025-08-20',
      '--colonies',
      'CY-2025-0011,CY-2025-0012',
      '--temperature',
      '82',
      '--applicator',
      'M Ojeda',
      '--supers-on',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('honey supers on');
  });

  it('takes the same product once the supers are off', async () => {
    const { capture } = await expectOk([
      'health',
      'treat',
      '--id',
      'TR-2025-0031',
      '--yard',
      'YD-2025-0001',
      '--product',
      'apiguard',
      '--on',
      '2025-08-20',
      '--colonies',
      'CY-2025-0011,CY-2025-0012',
      '--temperature',
      '82',
      '--applicator',
      'M Ojeda',
    ]);
    expect(capture.parsed.dueOff).toBe('2025-09-17');
    expect(capture.parsed.supersReturn).toBe('2025-09-18');
  });

  it('refuses a second product of the same class straight after', async () => {
    const { status, capture } = await run([
      'health',
      'treat',
      '--id',
      'TR-2025-0032',
      '--yard',
      'YD-2025-0001',
      '--product',
      'apiguard',
      '--on',
      '2025-09-20',
      '--colonies',
      'CY-2025-0011',
      '--temperature',
      '75',
      '--applicator',
      'M Ojeda',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('essential oil');
  });

  it('shows the treatment as still on the hives and overdue later', async () => {
    const onNow = await expectOk(['health', 'treatments', '--on-hives']);
    expect(onNow.capture.parsed.map((row) => row.id)).toContain('TR-2025-0031');
    const later = await expectOk(['health', 'treatments', '--overdue'], {
      today: '2025-10-01',
    });
    expect(later.capture.parsed.map((row) => row.id)).toContain('TR-2025-0031');
  });

  it('pulls it and reports the withdrawal', async () => {
    const { capture } = await expectOk(
      ['health', 'pull', 'TR-2025-0031', '--on', '2025-09-17'],
      { today: '2025-09-17' }
    );
    expect(capture.parsed.withdrawalEnds).toBe('2025-09-17');
  });

  it('records an inspection that finds beetles and holds nothing', async () => {
    const { capture } = await expectOk(
      [
        'health',
        'inspection',
        '--id',
        'IS-2025-0009',
        '--yard',
        'YD-2025-0001',
        '--on',
        '2025-09-20',
        '--inspector',
        'L Prentice',
        '--opened',
        '8',
        '--findings',
        'shb',
        '--affected',
        '2',
      ],
      { today: '2025-09-20' }
    );
    expect(capture.parsed.heldUntil).toBe('not held');
  });

  it('holds the yard once foulbrood turns up', async () => {
    const { capture } = await expectOk(
      [
        'health',
        'inspection',
        '--id',
        'IS-2025-0011',
        '--yard',
        'YD-2025-0001',
        '--on',
        '2025-09-25',
        '--inspector',
        'L Prentice',
        '--opened',
        '8',
        '--findings',
        'afb',
        '--affected',
        '1',
      ],
      { today: '2025-09-25' }
    );
    expect(capture.parsed.heldUntil).toBe('2025-10-25');
    expect(capture.parsed.destruction).toBe(true);
  });

  it('refuses a load out of the held yard', async () => {
    const { status, capture } = await run(
      [
        'load',
        'add',
        '--id',
        'LD-2025-0199',
        '--unit',
        'bh-7',
        '--driver',
        'D Rasmussen',
        '--from',
        'YD-2025-0001',
        '--to',
        'YD-2025-0002',
        '--destination-kind',
        'yard',
        '--pallets',
        'PL-2025-0031',
      ],
      { today: '2025-10-01' }
    );
    expect(status).toBe(5);
    expect(capture.stderr).toContain('is held to 2025-10-25');
  });

  it('lets the load go once the hold runs out', async () => {
    const { capture } = await expectOk(
      [
        'load',
        'add',
        '--id',
        'LD-2025-0199',
        '--unit',
        'bh-7',
        '--driver',
        'D Rasmussen',
        '--from',
        'YD-2025-0001',
        '--to',
        'YD-2025-0002',
        '--destination-kind',
        'yard',
        '--pallets',
        'PL-2025-0031',
      ],
      { today: '2025-10-26' }
    );
    expect(capture.parsed.state).toBe('planned');
  });

  it('shows the year in the health register', async () => {
    const { capture } = await expectOk(['register', 'health'], { today: '2025-10-26' });
    const home = capture.parsed.find((row) => row.yardId === 'YD-2025-0001');
    expect(home.held).toBe(false);
    expect(home.lastProduct).toBe('apiguard');
  });
});
