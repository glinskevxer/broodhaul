import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

/**
 * Money, from the invoice to the cheque.
 *
 * The invoice goes out, the grower disputes the grading, the dispute is
 * answered and settled, the charge goes on the ledger, a payment arrives
 * against it and the aging report clears. Each of those is a command and each
 * one has its own tests; this is the check that the numbers they hand each
 * other agree.
 */

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

const expectOk = async (args, options) => {
  const outcome = await run(args, { json: true, ...options });
  expect(outcome.status, args.join(' ')).toBe(0);
  return outcome;
};

let invoiceCents;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-settlement-year-'));
  await expectOk(['example', 'load']);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('settling a season', () => {
  it('builds an invoice under the contract value', async () => {
    const { capture } = await expectOk(['settle', 'invoice', 'CT-2025-0007']);
    invoiceCents = capture.parsed.totalCents;
    expect(invoiceCents).toBeLessThan(44 * 20500);
    expect(capture.parsed.lines.map((line) => line.code)).toContain('shortfall');
  });

  it('carries a broker commission line', async () => {
    const { capture } = await expectOk(['settle', 'invoice', 'CT-2025-0007']);
    expect(capture.parsed.lines.map((line) => line.code)).toContain('commission');
    expect(capture.parsed.commissionCents).toBeGreaterThan(0);
  });

  it('produces a statement that matches the invoice', async () => {
    const { capture } = await expectOk([
      'settle',
      'statement',
      'Wilkins Farming',
      '--season',
      '2025',
    ]);
    expect(capture.parsed.totalCents).toBe(invoiceCents);
  });

  it('puts the charge on the ledger', async () => {
    await expectOk([
      'ledger',
      'charge',
      'Wilkins Farming',
      '--id',
      'E1',
      '--amount',
      String(invoiceCents),
      '--on',
      '2025-03-20',
      '--contract',
      'CT-2025-0007',
    ]);
    const { capture } = await expectOk(['ledger', 'balances']);
    expect(capture.parsed[0].balanceCents).toBe(invoiceCents);
  });

  it('shows the charge as current the day it is raised', async () => {
    const { capture } = await expectOk(['ledger', 'aging', '--as-of', '2025-03-20']);
    expect(capture.parsed[0].current).toBe(invoiceCents);
    expect(capture.parsed[0].over30).toBe(0);
  });

  it('takes a dispute against the grading', async () => {
    const { capture } = await expectOk([
      'dispute',
      'raise',
      'CT-2025-0007',
      '--id',
      'DS-1',
      '--grounds',
      'grading',
      '--amount',
      '120000',
      '--on',
      '2025-03-22',
      '--note',
      'grower says the average was read low',
    ]);
    expect(capture.parsed.grounds).toBe('grading');
  });

  it('shows the dispute as open with an answer date', async () => {
    const { capture } = await expectOk(['dispute', 'open'], { today: '2025-03-24' });
    expect(capture.parsed.open).toHaveLength(1);
    expect(capture.parsed.open[0].answerBy).toBe('2025-03-27');
    expect(capture.parsed.exposureCents).toBe(120000);
  });

  it('flags it overdue once the window passes', async () => {
    const { capture } = await expectOk(['dispute', 'open'], { today: '2025-04-01' });
    expect(capture.parsed.open[0].overdue).toBe(true);
  });

  it('answers and settles it', async () => {
    await expectOk(['dispute', 'advance', 'DS-1', 'answered'], { today: '2025-03-26' });
    const { capture } = await expectOk(
      ['dispute', 'advance', 'DS-1', 'settled', '--settled', '60000'],
      { today: '2025-03-28' }
    );
    expect(capture.parsed.state).toBe('settled');
  });

  it('credits the settlement on the ledger', async () => {
    await expectOk([
      'ledger',
      'payment',
      'Wilkins Farming',
      '--id',
      'E2',
      '--amount',
      '-60000',
      '--on',
      '2025-03-28',
      '--reference',
      'dispute DS-1',
    ]);
    const { capture } = await expectOk(['ledger', 'balances']);
    expect(capture.parsed[0].balanceCents).toBe(invoiceCents - 60000);
  });

  it('ages the rest into the over thirty bucket', async () => {
    const { capture } = await expectOk(['ledger', 'aging', '--as-of', '2025-04-25']);
    expect(capture.parsed[0].over30).toBe(invoiceCents - 60000);
    expect(capture.parsed[0].current).toBe(0);
  });

  it('clears once the grower pays the balance', async () => {
    await expectOk([
      'ledger',
      'payment',
      'Wilkins Farming',
      '--id',
      'E3',
      '--amount',
      String(-(invoiceCents - 60000)),
      '--on',
      '2025-04-28',
      '--reference',
      'check 4471',
    ]);
    const { capture } = await expectOk(['ledger', 'aging', '--as-of', '2025-05-01']);
    expect(capture.parsed[0].totalCents).toBe(0);
  });

  it('shows nothing open on the ledger or the dispute book', async () => {
    const balances = await expectOk(['ledger', 'balances']);
    expect(balances.capture.parsed[0].balanceCents).toBe(0);
    const disputes = await expectOk(['dispute', 'open'], { today: '2025-05-01' });
    expect(disputes.capture.parsed.open).toEqual([]);
    expect(disputes.capture.parsed.settledCents).toBe(60000);
  });

  it('leaves the desk with nothing to report', async () => {
    const { capture } = await expectOk(['check'], { today: '2025-05-01' });
    expect(capture.parsed).toEqual([]);
  });
});
