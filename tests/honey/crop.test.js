import { describe, it, expect } from 'vitest';
import {
  makeYardCrop,
  standingColonies,
  lbPerColony,
  lbPerColonyAtStart,
  winterLoss,
  seasonTotal,
  bestYards,
  seasonOverSeason,
  cropValueCents,
  cropByYard,
} from '../../src/honey/crop.js';
import { makeDrum } from '../../src/honey/drum.js';
import { makeLot } from '../../src/honey/lot.js';

const crop = (overrides = {}) =>
  makeYardCrop({
    yardId: 'YD-2025-0004',
    season: 2025,
    coloniesAtStart: 100,
    coloniesAtEnd: 80,
    netLb: 4800,
    ...overrides,
  });

describe('makeYardCrop', () => {
  it('keeps the counts and rounds the crop to a tenth', () => {
    expect(crop({ netLb: 4800.44 }).netLb).toBe(4800.4);
  });

  it('refuses a yard that gained colonies over the flow', () => {
    expect(() => crop({ coloniesAtStart: 80, coloniesAtEnd: 100 })).toThrow(
      /more colonies than it started/
    );
  });

  it('refuses a crop with no yard', () => {
    expect(() =>
      makeYardCrop({ season: 2025, coloniesAtStart: 1, coloniesAtEnd: 1, netLb: 0 })
    ).toThrow(/needs a yard/);
  });

  it('accepts a yard that made nothing', () => {
    expect(crop({ netLb: 0 }).netLb).toBe(0);
  });
});

describe('lbPerColony', () => {
  it('divides by the colonies that stood the whole flow', () => {
    expect(standingColonies(crop())).toBe(80);
    expect(lbPerColony(crop())).toBe(60);
  });

  it('is flattered by dividing at the start instead', () => {
    expect(lbPerColonyAtStart(crop())).toBe(48);
    expect(lbPerColonyAtStart(crop())).toBeLessThan(lbPerColony(crop()));
  });

  it('is nothing when the yard died out', () => {
    expect(lbPerColony(crop({ coloniesAtEnd: 0, netLb: 0 }))).toBe(0);
    expect(
      lbPerColonyAtStart(crop({ coloniesAtStart: 0, coloniesAtEnd: 0, netLb: 0 }))
    ).toBe(0);
  });
});

describe('winterLoss', () => {
  it('is the share of colonies lost over the flow', () => {
    expect(winterLoss(crop())).toBe(20);
  });

  it('is nothing when none were lost', () => {
    expect(winterLoss(crop({ coloniesAtEnd: 100 }))).toBe(0);
  });

  it('is nothing on an empty yard rather than a division by zero', () => {
    expect(winterLoss(crop({ coloniesAtStart: 0, coloniesAtEnd: 0, netLb: 0 }))).toBe(
      0
    );
  });
});

describe('seasonTotal', () => {
  const crops = [
    crop({ yardId: 'YD-2025-0004', netLb: 4800, coloniesAtEnd: 80 }),
    crop({ yardId: 'YD-2025-0009', netLb: 2100, coloniesAtEnd: 40 }),
    crop({ yardId: 'YD-2025-0004', season: 2024, netLb: 6000, coloniesAtEnd: 80 }),
  ];

  it('adds one season', () => {
    expect(seasonTotal(crops, 2025)).toEqual({
      season: 2025,
      yards: 2,
      netLb: 6900,
      colonies: 120,
      lbPerColony: 57.5,
    });
  });

  it('is empty for a season with nothing in it', () => {
    expect(seasonTotal(crops, 2023)).toEqual({
      season: 2023,
      yards: 0,
      netLb: 0,
      colonies: 0,
      lbPerColony: 0,
    });
  });
});

describe('bestYards', () => {
  const crops = [
    crop({ yardId: 'YD-2025-0004', netLb: 4800, coloniesAtEnd: 80 }),
    crop({ yardId: 'YD-2025-0009', netLb: 4000, coloniesAtEnd: 40 }),
    crop({ yardId: 'YD-2025-0011', netLb: 900, coloniesAtEnd: 40 }),
  ];

  it('sorts by pounds per colony rather than by total', () => {
    expect(bestYards(crops, 2025).map((entry) => entry.yardId)).toEqual([
      'YD-2025-0009',
      'YD-2025-0004',
      'YD-2025-0011',
    ]);
  });

  it('takes the count asked for', () => {
    expect(bestYards(crops, 2025, 1).map((entry) => entry.yardId)).toEqual([
      'YD-2025-0009',
    ]);
  });

  it('refuses a count of nothing', () => {
    expect(() => bestYards(crops, 2025, 0)).toThrow(/at least 1/);
  });
});

describe('seasonOverSeason', () => {
  const crops = [
    crop({ season: 2024, netLb: 6000, coloniesAtEnd: 80 }),
    crop({ season: 2025, netLb: 4800, coloniesAtEnd: 80 }),
  ];

  it('reports both totals and the change', () => {
    const change = seasonOverSeason(crops, 2024, 2025);
    expect(change.from.netLb).toBe(6000);
    expect(change.to.netLb).toBe(4800);
    expect(change.netLbChange).toBe(-1200);
    expect(change.perColonyChange).toBe(-15);
  });
});

describe('cropValueCents', () => {
  const drums = new Map(
    [
      makeDrum({
        id: 'D-1',
        grossLb: 690,
        tareLb: 48,
        moisturePct: 17,
        floralSource: 'orange blossom',
        filledOn: '2025-05-22',
      }),
      makeDrum({
        id: 'D-2',
        grossLb: 690,
        tareLb: 48,
        moisturePct: 17,
        floralSource: 'sage',
        filledOn: '2025-05-22',
      }),
    ].map((drum) => [drum.id, drum])
  );

  const single = makeLot(
    {
      id: 'HL-2025-0004',
      drums: ['D-1'],
      yardIds: ['YD-2025-0004'],
      extractedFrom: '2025-05-20',
      extractedTo: '2025-05-22',
    },
    drums
  );

  const blend = makeLot(
    {
      id: 'HL-2025-0005',
      drums: ['D-1', 'D-2'],
      yardIds: ['YD-2025-0004'],
      extractedFrom: '2025-05-20',
      extractedTo: '2025-05-22',
    },
    drums
  );

  const prices = { 'single source': 285, blend: 240, wildflower: 195 };

  it('prices a single source lot at the varietal price', () => {
    expect(cropValueCents([single], drums, prices)).toBe(182970);
  });

  it('prices a blend lower even though it holds more honey', () => {
    expect(cropValueCents([blend], drums, prices)).toBe(308160);
    expect(cropValueCents([blend], drums, prices) / 2).toBeLessThan(
      cropValueCents([single], drums, prices)
    );
  });

  it('adds several lots', () => {
    expect(cropValueCents([single, blend], drums, prices)).toBe(491130);
  });

  it('refuses a grade with no price', () => {
    expect(() => cropValueCents([blend], drums, { 'single source': 285 })).toThrow(
      /no price for grade blend/
    );
  });
});

describe('cropByYard', () => {
  it('totals each yard across seasons, sorted', () => {
    const crops = [
      crop({ yardId: 'YD-2025-0009', netLb: 2100 }),
      crop({ yardId: 'YD-2025-0004', season: 2024, netLb: 6000 }),
      crop({ yardId: 'YD-2025-0004', netLb: 4800 }),
    ];
    expect(cropByYard(crops)).toEqual([
      { yardId: 'YD-2025-0004', seasons: 2, netLb: 10800 },
      { yardId: 'YD-2025-0009', seasons: 1, netLb: 2100 },
    ]);
  });
});
