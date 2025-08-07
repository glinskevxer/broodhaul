import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { registerNames } from '../../src/reporting/registers.js';

let root;

const run = cliRunner(() => root, { today: '2025-04-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-office-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('register', () => {
  it('names the registers when asked for none', async () => {
    const { capture } = await run(['register'], { json: true });
    expect(capture.parsed).toEqual(registerNames());
  });

  it('prints one', async () => {
    const { status, capture } = await run(['register', 'yards']);
    expect(status).toBe(0);
    expect(capture.lines[0]).toBe('yard register');
    expect(capture.lines.pop()).toBe('2 rows');
  });

  it('gives the rows in json', async () => {
    const { capture } = await run(['register', 'colonies'], { json: true });
    expect(capture.parsed).toHaveLength(12);
  });

  it('refuses one nobody keeps', async () => {
    const { status, capture } = await run(['register', 'trucks']);
    expect(status).toBe(3);
    expect(capture.stderr).toContain('no register with id trucks');
  });
});

describe('ledger charge and payment', () => {
  const charge = (overrides = []) =>
    run([
      'ledger',
      'charge',
      'Wilkins Farming',
      '--id',
      'E1',
      '--amount',
      '500000',
      '--on',
      '2025-01-01',
      ...overrides,
    ]);

  it('puts a charge on the book', async () => {
    const { status, capture } = await charge();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id           E1',
      'grower       Wilkins Farming',
      'amountCents  500000',
    ]);
  });

  it('refuses a charge that is not positive', async () => {
    const { status, capture } = await charge(['--amount', '-1']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('charge has to be positive');
  });

  it('records a payment', async () => {
    await charge();
    const { status } = await run([
      'ledger',
      'payment',
      'Wilkins Farming',
      '--id',
      'E2',
      '--amount',
      '-200000',
      '--on',
      '2025-02-01',
      '--reference',
      'check 4471',
    ]);
    expect(status).toBe(0);
  });

  it('refuses a payment that is not negative', async () => {
    const { status, capture } = await run([
      'ledger',
      'payment',
      'Wilkins Farming',
      '--id',
      'E2',
      '--amount',
      '200000',
      '--on',
      '2025-02-01',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('payment has to be negative');
  });

  it('refuses the same entry twice', async () => {
    await charge();
    const { status, capture } = await charge();
    expect(status).toBe(4);
    expect(capture.stderr).toContain('recorded twice');
  });
});

describe('ledger balances', () => {
  beforeEach(async () => {
    await run([
      'ledger',
      'charge',
      'Wilkins Farming',
      '--id',
      'E1',
      '--amount',
      '500000',
      '--on',
      '2025-01-01',
    ]);
    await run([
      'ledger',
      'payment',
      'Wilkins Farming',
      '--id',
      'E2',
      '--amount',
      '-200000',
      '--on',
      '2025-02-01',
    ]);
  });

  it('nets each grower', async () => {
    const { capture } = await run(['ledger', 'balances'], { json: true });
    expect(capture.parsed).toEqual([
      {
        grower: 'Wilkins Farming',
        chargedCents: 500000,
        paidCents: -200000,
        balanceCents: 300000,
      },
    ]);
  });

  it('prints the money as money', async () => {
    const { capture } = await run(['ledger', 'balances']);
    expect(capture.stdout).toContain('$5,000.00');
  });

  it('ages the open charges', async () => {
    const { capture } = await run(['ledger', 'aging'], { json: true });
    expect(capture.parsed[0].totalCents).toBe(300000);
    expect(capture.parsed[0].over90).toBe(300000);
  });

  it('ages against a given day, before the payment arrived', async () => {
    const { capture } = await run(['ledger', 'aging', '--as-of', '2025-01-15'], {
      json: true,
    });
    expect(capture.parsed[0].current).toBe(500000);
  });

  it('says which growers are over ninety days', async () => {
    const { capture } = await run(['ledger', 'aging']);
    expect(capture.lines.pop()).toContain('of it over ninety days');
  });

  it('lists the open charges for one grower', async () => {
    const { capture } = await run(['ledger', 'open', 'Wilkins Farming'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(1);
    expect(capture.parsed[0].openCents).toBe(300000);
    expect(capture.parsed[0].ageDays).toBe(109);
  });

  it('is empty for a grower with nothing open', async () => {
    const { capture } = await run(['ledger', 'open', 'Ackerman Ranches'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });
});
