import { describe, it, expect } from 'vitest';
import {
  rollDates,
  movedRate,
  renewContract,
  renewalDifference,
  unrenewed,
  renewalBook,
  seasonOfRenewal,
} from '../../src/contracts/renewal.js';
import { aContract } from '../helpers/contracts.js';

const contract = aContract();

const renew = (overrides = {}) =>
  renewContract(contract, { id: 'CT-2026-0007', signedOn: '2025-09-14', ...overrides });

describe('rollDates', () => {
  it('moves both windows a year on', () => {
    expect(rollDates(contract)).toEqual({
      delivery: { start: '2026-01-31', end: '2026-02-09' },
      removal: { start: '2026-03-04', end: '2026-03-17' },
    });
  });

  it('moves further for more seasons', () => {
    expect(rollDates(contract, 2).delivery.start).toBe('2027-01-30');
  });

  it('refuses a step of nothing', () => {
    expect(() => rollDates(contract, 0)).toThrow(/at least 1/);
  });
});

describe('movedRate', () => {
  it('leaves the rate alone by default', () => {
    expect(movedRate(contract)).toBe(20500);
  });

  it('moves it by basis points', () => {
    expect(movedRate(contract, 500)).toBe(21525);
    expect(movedRate(contract, -1000)).toBe(18450);
  });

  it('refuses a move nobody would agree to', () => {
    expect(() => movedRate(contract, 9000)).toThrow(/at most 5000/);
  });
});

describe('renewContract', () => {
  it('lands in the next season', () => {
    expect(renew().season).toBe(2026);
  });

  it('keeps the grower, the crop, the blocks and the terms', () => {
    const next = renew();
    expect(next.grower).toEqual(contract.grower);
    expect(next.crop).toBe(contract.crop);
    expect(next.blocks).toEqual(contract.blocks);
    expect(next.terms).toEqual(contract.terms);
  });

  it('moves the rate when asked', () => {
    expect(renew({ moveBps: 500 }).rateCents).toBe(21525);
  });

  it('takes a new block list', () => {
    const next = renew({
      blocks: [{ blockId: 'BK-2026-0001', acres: 60, hivesPerAcre: 2 }],
    });
    expect(next.blocks).toHaveLength(1);
  });

  it('refuses to reuse the old identifier', () => {
    expect(() =>
      renewContract(contract, { id: contract.id, signedOn: '2025-09-14' })
    ).toThrow(/needs its own identifier/);
    expect(() => renewContract(contract, { signedOn: '2025-09-14' })).toThrow(
      /needs its own identifier/
    );
  });

  it('refuses a signing date after the new delivery closes', () => {
    expect(() => renew({ signedOn: '2026-03-01' })).toThrow(
      /signed after delivery closed/
    );
  });

  it('carries the broker through', () => {
    const brokered = aContract({
      broker: { name: 'Central Valley Bee', commissionBps: 750 },
    });
    const next = renewContract(brokered, {
      id: 'CT-2026-0007',
      signedOn: '2025-09-14',
    });
    expect(next.broker.commissionBps).toBe(750);
  });
});

describe('renewalDifference', () => {
  it('reports the rate move in basis points', () => {
    const difference = renewalDifference(contract, renew({ moveBps: 500 }));
    expect(difference.rateMoveBps).toBe(500);
    expect(difference.rateCents).toEqual([20500, 21525]);
  });

  it('reports the seasons and the hive counts', () => {
    const difference = renewalDifference(contract, renew());
    expect(difference.seasons).toEqual([2025, 2026]);
    expect(difference.hives).toEqual([377, 377]);
  });

  it('names the blocks that came and went', () => {
    const next = renew({
      blocks: [
        { blockId: 'BK-2025-0001', acres: 120, hivesPerAcre: 2 },
        { blockId: 'BK-2026-0009', acres: 40, hivesPerAcre: 2 },
      ],
    });
    const difference = renewalDifference(contract, next);
    expect(difference.blocksAdded).toEqual(['BK-2026-0009']);
    expect(difference.blocksDropped).toEqual(['BK-2025-0002']);
  });

  it('names nothing when the blocks are the same', () => {
    const difference = renewalDifference(contract, renew());
    expect(difference.blocksAdded).toEqual([]);
    expect(difference.blocksDropped).toEqual([]);
  });
});

describe('unrenewed and renewalBook', () => {
  const other = aContract({
    id: 'CT-2025-0008',
    grower: { name: 'Ackerman Ranches', county: 'Madera' },
  });

  it('names the growers who did not come back', () => {
    const book = [contract, other, renew()];
    expect(unrenewed(book, 2025).map((entry) => entry.id)).toEqual(['CT-2025-0008']);
  });

  it('names everybody when nothing was renewed', () => {
    expect(unrenewed([contract, other], 2025)).toHaveLength(2);
  });

  it('reports the renewal rate', () => {
    const book = [contract, other, renew()];
    expect(renewalBook(book, 2025)).toEqual({
      season: 2025,
      contracts: 2,
      hives: 754,
      unrenewed: ['CT-2025-0008'],
      renewalRate: 0.5,
    });
  });

  it('is quiet for a season with nothing in it', () => {
    expect(renewalBook([contract], 2023)).toEqual({
      season: 2023,
      contracts: 0,
      hives: 0,
      unrenewed: [],
      renewalRate: 0,
    });
  });
});

describe('seasonOfRenewal', () => {
  it('reads the season off the delivery window', () => {
    expect(seasonOfRenewal(contract)).toBe(2025);
    expect(seasonOfRenewal(renew())).toBe(2026);
  });
});
