import { describe, it, expect } from 'vitest';
import {
  CROPS,
  makeContract,
  blockHives,
  contractedHives,
  contractAcres,
  contractValueCents,
  commissionCents,
  netToOperationCents,
  deliveryOpen,
  removalOpen,
  windowsCollide,
} from '../../src/contracts/contract.js';

const terms = {
  minimumAverage: 8,
  samplePercent: 10,
  tiers: [
    { atLeast: 10, adjustmentCents: 2500 },
    { atLeast: 8, adjustmentCents: 0 },
    { atLeast: 6, adjustmentCents: -2500 },
  ],
};

const base = {
  id: 'CT-2025-0007',
  grower: { name: 'Wilkins Farming', ranch: 'Avenue 416', county: 'Madera' },
  crop: 'almond',
  blocks: [
    { blockId: 'BK-2025-0001', acres: 120, hivesPerAcre: 2 },
    { blockId: 'BK-2025-0002', acres: 68.5, hivesPerAcre: 2 },
  ],
  rateCents: 20500,
  terms,
  delivery: { start: '2025-02-01', end: '2025-02-10' },
  removal: { start: '2025-03-05', end: '2025-03-18' },
  signedOn: '2024-09-14',
};

const contract = (overrides = {}) => makeContract({ ...base, ...overrides });

describe('makeContract', () => {
  it('takes the season from the delivery window', () => {
    expect(contract().season).toBe(2025);
  });

  it('puts a November delivery in the following season', () => {
    const early = contract({
      delivery: { start: '2024-11-20', end: '2024-11-30' },
      removal: { start: '2024-12-10', end: '2024-12-20' },
    });
    expect(early.season).toBe(2025);
  });

  it('keeps the grower and the crop', () => {
    expect(contract().grower.ranch).toBe('Avenue 416');
    expect(contract().crop).toBe('almond');
  });

  it('leaves the ranch undefined when there is not one', () => {
    const plain = contract({ grower: { name: 'Wilkins Farming', county: 'Madera' } });
    expect(plain.grower.ranch).toBeUndefined();
  });

  it('refuses a crop nobody rents bees for here', () => {
    expect(() => contract({ crop: 'wheat' })).toThrow(/must be one of/);
  });

  it('accepts every crop on the list', () => {
    for (const crop of CROPS) {
      expect(contract({ crop }).crop).toBe(crop);
    }
  });

  it('refuses removal opening before delivery does', () => {
    expect(() =>
      contract({ removal: { start: '2025-01-20', end: '2025-03-18' } })
    ).toThrow(/removal cannot open before delivery/);
  });

  it('allows removal opening the same day delivery does, which happens on a late set', () => {
    const same = contract({ removal: { start: '2025-02-01', end: '2025-03-18' } });
    expect(same.removal.start).toBe('2025-02-01');
  });

  it('refuses a contract signed after delivery closed', () => {
    expect(() => contract({ signedOn: '2025-02-11' })).toThrow(
      /signed after delivery closed/
    );
  });

  it('refuses the same block twice', () => {
    expect(() =>
      contract({
        blocks: [
          { blockId: 'BK-2025-0001', acres: 20, hivesPerAcre: 2 },
          { blockId: 'BK-2025-0001', acres: 30, hivesPerAcre: 2 },
        ],
      })
    ).toThrow(/is on the contract twice/);
  });

  it('refuses a block with no acres or an impossible density', () => {
    expect(() =>
      contract({ blocks: [{ blockId: 'BK-2025-0001', acres: 0, hivesPerAcre: 2 }] })
    ).toThrow(/at least 0.25/);
    expect(() =>
      contract({ blocks: [{ blockId: 'BK-2025-0001', acres: 20, hivesPerAcre: 9 }] })
    ).toThrow(/at most 6/);
  });

  it('refuses a rate outside what anyone pays', () => {
    expect(() => contract({ rateCents: 500 })).toThrow(/at least 1000/);
  });

  it('takes a broker with a commission in basis points', () => {
    const brokered = contract({
      broker: { name: 'Central Valley Bee', commissionBps: 750 },
    });
    expect(brokered.broker.commissionBps).toBe(750);
  });

  it('refuses a commission over twenty percent', () => {
    expect(() =>
      contract({ broker: { name: 'Central Valley Bee', commissionBps: 2500 } })
    ).toThrow(/at most 2000/);
  });

  it('takes the season back when a stored contract is read again', () => {
    const stored = contract();
    expect(makeContract(stored).season).toBe(2025);
  });

  it('refuses a season that disagrees with the delivery window', () => {
    expect(() => contract({ season: 2024 })).toThrow(
      /does not match the delivery window/
    );
  });

  it('refuses an unknown key', () => {
    expect(() => makeContract({ ...base, deposit: 100 })).toThrow(
      /contract has unknown keys: deposit/
    );
  });
});

describe('blockHives', () => {
  it('rounds a part hive up', () => {
    expect(blockHives({ acres: 68.5, hivesPerAcre: 2 })).toBe(137);
    expect(blockHives({ acres: 10.1, hivesPerAcre: 1.5 })).toBe(16);
  });

  it('leaves a whole answer alone', () => {
    expect(blockHives({ acres: 120, hivesPerAcre: 2 })).toBe(240);
  });
});

describe('contractedHives and contractAcres', () => {
  it('add the blocks up', () => {
    expect(contractedHives(contract())).toBe(377);
    expect(contractAcres(contract())).toBe(188.5);
  });

  it('round each block before adding, not after', () => {
    const odd = contract({
      blocks: [
        { blockId: 'BK-2025-0001', acres: 10.5, hivesPerAcre: 1 },
        { blockId: 'BK-2025-0002', acres: 10.5, hivesPerAcre: 1 },
      ],
    });
    expect(contractedHives(odd)).toBe(22);
  });
});

describe('money', () => {
  it('values the contract at the rate times the hives', () => {
    expect(contractValueCents(contract())).toBe(7728500);
  });

  it('takes no commission when there is no broker', () => {
    expect(commissionCents(contract())).toBe(0);
    expect(netToOperationCents(contract())).toBe(contractValueCents(contract()));
  });

  it('takes the broker commission in basis points', () => {
    const brokered = contract({
      broker: { name: 'Central Valley Bee', commissionBps: 750 },
    });
    expect(commissionCents(brokered)).toBe(579638);
    expect(netToOperationCents(brokered)).toBe(7728500 - 579638);
  });

  it('leaves the net alone at a zero commission', () => {
    const free = contract({ broker: { name: 'A friend', commissionBps: 0 } });
    expect(netToOperationCents(free)).toBe(contractValueCents(free));
  });
});

describe('windows', () => {
  it('know when delivery is open', () => {
    expect(deliveryOpen(contract(), '2025-02-01')).toBe(true);
    expect(deliveryOpen(contract(), '2025-02-10')).toBe(true);
    expect(deliveryOpen(contract(), '2025-02-11')).toBe(false);
  });

  it('know when removal is open', () => {
    expect(removalOpen(contract(), '2025-03-05')).toBe(true);
    expect(removalOpen(contract(), '2025-03-04')).toBe(false);
  });

  it('spot two contracts wanting the crew the same week', () => {
    const other = contract({
      id: 'CT-2025-0008',
      delivery: { start: '2025-02-08', end: '2025-02-16' },
      removal: { start: '2025-03-10', end: '2025-03-20' },
    });
    expect(windowsCollide(contract(), other)).toBe(true);
  });

  it('see no collision when the windows miss', () => {
    const later = contract({
      id: 'CT-2025-0009',
      delivery: { start: '2025-02-11', end: '2025-02-20' },
      removal: { start: '2025-03-20', end: '2025-03-28' },
    });
    expect(windowsCollide(contract(), later)).toBe(false);
  });
});
