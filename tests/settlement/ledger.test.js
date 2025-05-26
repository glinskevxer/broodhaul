import { describe, it, expect } from 'vitest';
import {
  ENTRY_KINDS,
  AGING_BUCKETS,
  makeEntry,
  makeLedger,
  balanceCents,
  balancesByGrower,
  openCharges,
  agingFor,
  agingReport,
  describeAging,
} from '../../src/settlement/ledger.js';

const charge = (id, date, amountCents, grower = 'Wilkins Farming') => ({
  id,
  grower,
  kind: 'charge',
  amountCents,
  date,
});

const payment = (id, date, amountCents, grower = 'Wilkins Farming') => ({
  id,
  grower,
  kind: 'payment',
  amountCents,
  date,
  reference: 'check 4471',
});

describe('makeEntry', () => {
  it('takes a positive charge', () => {
    expect(makeEntry(charge('E1', '2025-03-20', 500000)).amountCents).toBe(500000);
  });

  it('takes a negative payment', () => {
    expect(makeEntry(payment('E2', '2025-04-01', -200000)).kind).toBe('payment');
  });

  it('refuses a charge that is not positive', () => {
    expect(() => makeEntry(charge('E1', '2025-03-20', -1))).toThrow(
      /charge has to be positive/
    );
  });

  it('refuses a payment that is not negative', () => {
    expect(() => makeEntry(payment('E2', '2025-04-01', 1))).toThrow(
      /payment has to be negative/
    );
  });

  it('takes every kind the book has', () => {
    for (const kind of ENTRY_KINDS) {
      const amountCents = kind === 'charge' ? 100 : -100;
      expect(
        makeEntry({ id: 'E', grower: 'W', kind, amountCents, date: '2025-03-20' }).kind
      ).toBe(kind);
    }
  });

  it('refuses a kind nobody writes', () => {
    expect(() =>
      makeEntry({
        id: 'E',
        grower: 'W',
        kind: 'refund',
        amountCents: -1,
        date: '2025-03-20',
      })
    ).toThrow(/must be one of/);
  });
});

describe('makeLedger', () => {
  it('sorts by date then identifier', () => {
    const ledger = makeLedger([
      charge('E2', '2025-04-01', 100),
      charge('E1', '2025-03-20', 100),
    ]);
    expect(ledger.map((entry) => entry.id)).toEqual(['E1', 'E2']);
  });

  it('refuses the same entry twice', () => {
    expect(() =>
      makeLedger([charge('E1', '2025-03-20', 100), charge('E1', '2025-04-01', 100)])
    ).toThrow(/recorded twice/);
  });

  it('takes an empty book', () => {
    expect(makeLedger()).toEqual([]);
  });
});

describe('balanceCents and balancesByGrower', () => {
  const ledger = makeLedger([
    charge('E1', '2025-03-20', 500000),
    payment('E2', '2025-04-01', -200000),
    charge('E3', '2025-03-20', 100000, 'Ackerman Ranches'),
  ]);

  it('nets the whole book', () => {
    expect(balanceCents(ledger)).toBe(400000);
  });

  it('nets one grower', () => {
    expect(balanceCents(ledger, 'Wilkins Farming')).toBe(300000);
    expect(balanceCents(ledger, 'Ackerman Ranches')).toBe(100000);
  });

  it('is nothing for a grower with no entries', () => {
    expect(balanceCents(ledger, 'Nobody')).toBe(0);
  });

  it('reports a row per grower, sorted', () => {
    expect(balancesByGrower(ledger)).toEqual([
      {
        grower: 'Ackerman Ranches',
        chargedCents: 100000,
        paidCents: 0,
        balanceCents: 100000,
      },
      {
        grower: 'Wilkins Farming',
        chargedCents: 500000,
        paidCents: -200000,
        balanceCents: 300000,
      },
    ]);
  });
});

describe('openCharges', () => {
  it('is everything when nothing has been paid', () => {
    const ledger = makeLedger([charge('E1', '2025-03-20', 500000)]);
    const open = openCharges(ledger, 'Wilkins Farming', '2025-04-20');
    expect(open).toHaveLength(1);
    expect(open[0].openCents).toBe(500000);
    expect(open[0].ageDays).toBe(31);
  });

  it('clears the oldest charge first', () => {
    const ledger = makeLedger([
      charge('E1', '2025-03-01', 100000),
      charge('E2', '2025-03-20', 200000),
      payment('E3', '2025-04-01', -150000),
    ]);
    const open = openCharges(ledger, 'Wilkins Farming', '2025-04-20');
    expect(open.map((entry) => entry.id)).toEqual(['E2']);
    expect(open[0].openCents).toBe(150000);
  });

  it('is empty once the balance is paid off', () => {
    const ledger = makeLedger([
      charge('E1', '2025-03-01', 100000),
      payment('E2', '2025-04-01', -100000),
    ]);
    expect(openCharges(ledger, 'Wilkins Farming', '2025-04-20')).toEqual([]);
  });

  it('ignores anything after the date asked about', () => {
    const ledger = makeLedger([
      charge('E1', '2025-03-01', 100000),
      payment('E2', '2025-04-01', -100000),
    ]);
    expect(openCharges(ledger, 'Wilkins Farming', '2025-03-20')).toHaveLength(1);
  });
});

describe('agingFor', () => {
  const ledger = makeLedger([
    charge('E1', '2025-01-01', 100000),
    charge('E2', '2025-03-01', 200000),
    charge('E3', '2025-04-10', 300000),
  ]);

  it('buckets the open charges by age', () => {
    const aging = agingFor(ledger, 'Wilkins Farming', '2025-04-20');
    expect(aging.current).toBe(300000);
    expect(aging.over30).toBe(200000);
    expect(aging.over90).toBe(100000);
    expect(aging.totalCents).toBe(600000);
  });

  it('has a bucket for every published limit', () => {
    const aging = agingFor(ledger, 'Wilkins Farming', '2025-04-20');
    for (const limit of AGING_BUCKETS) {
      expect(aging).toHaveProperty(`over${limit}`);
    }
  });

  it('is all current on the day the charge is raised', () => {
    const aging = agingFor(ledger, 'Wilkins Farming', '2025-01-01');
    expect(aging.current).toBe(100000);
    expect(aging.over30).toBe(0);
  });

  it('is empty for a grower who owes nothing', () => {
    const aging = agingFor(ledger, 'Nobody', '2025-04-20');
    expect(aging.totalCents).toBe(0);
  });
});

describe('agingReport', () => {
  it('covers every grower in the book, sorted', () => {
    const ledger = makeLedger([
      charge('E1', '2025-01-01', 100000),
      charge('E2', '2025-01-01', 100000, 'Ackerman Ranches'),
    ]);
    expect(agingReport(ledger, '2025-04-20').map((row) => row.grower)).toEqual([
      'Ackerman Ranches',
      'Wilkins Farming',
    ]);
  });

  it('is empty for an empty book', () => {
    expect(agingReport([], '2025-04-20')).toEqual([]);
  });
});

describe('describeAging', () => {
  it('reads like the line the office says out loud', () => {
    const ledger = makeLedger([charge('E1', '2025-01-01', 100000)]);
    expect(describeAging(agingFor(ledger, 'Wilkins Farming', '2025-04-20'))).toBe(
      'Wilkins Farming owes $1,000.00, $1,000.00 of it over ninety days'
    );
  });
});
