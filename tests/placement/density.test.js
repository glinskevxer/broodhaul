import { describe, it, expect } from 'vitest';
import {
  BASE_DENSITY,
  SELF_FERTILE_FACTOR,
  THIN_POLLINIZER_FACTOR,
  YOUNG_PLANTING_FACTOR,
  COOL_BLOOM_FACTOR,
  MAX_DENSITY,
  baseDensity,
  densityFactors,
  recommendedDensity,
  recommendedHives,
  densityVariance,
  explainDensity,
} from '../../src/placement/density.js';
import { makeBlock } from '../../src/placement/block.js';
import { CROPS } from '../../src/contracts/contract.js';

const base = {
  id: 'BK-2025-0001',
  name: 'Avenue 416 north',
  crop: 'almond',
  acres: 120,
  varieties: [
    { name: 'Nonpareil', share: 0.5 },
    { name: 'Monterey', share: 0.5 },
  ],
  plantedYear: 2016,
  rowSpacingFt: 22,
  treeSpacingFt: 18,
  location: { latitude: 36.9, longitude: -120.1 },
};

const block = (overrides = {}) => makeBlock({ ...base, ...overrides });

const thinPollinizer = block({
  varieties: [
    { name: 'Nonpareil', share: 0.8 },
    { name: 'Monterey', share: 0.2 },
  ],
});

const selfFertile = block({
  varieties: [{ name: 'Independence', share: 1, selfFertile: true }],
});

describe('baseDensity', () => {
  it('knows a base for every crop the contract allows', () => {
    for (const crop of CROPS) {
      expect(baseDensity(crop)).toBe(BASE_DENSITY[crop]);
      expect(baseDensity(crop)).toBeGreaterThan(0);
    }
  });

  it('refuses a crop nobody contracts', () => {
    expect(() => baseDensity('wheat')).toThrow(/must be one of/);
  });
});

describe('densityFactors', () => {
  it('is empty for an ordinary mature block in fair weather', () => {
    expect(densityFactors(block(), 2025)).toEqual([]);
  });

  it('adds the thin pollinizer factor when the mix is lopsided', () => {
    expect(densityFactors(thinPollinizer, 2025)).toEqual([
      { reason: 'thin pollinizer share', factor: THIN_POLLINIZER_FACTOR },
    ]);
  });

  it('skips the pollinizer rule entirely on a self fertile block', () => {
    const factors = densityFactors(selfFertile, 2025);
    expect(factors).toEqual([
      { reason: 'self fertile planting', factor: SELF_FERTILE_FACTOR },
    ]);
    expect(factors.map((entry) => entry.reason)).not.toContain('thin pollinizer share');
  });

  it('adds the young planting factor', () => {
    const young = block({ plantedYear: 2024 });
    expect(densityFactors(young, 2025)).toEqual([
      { reason: 'young planting', factor: YOUNG_PLANTING_FACTOR },
    ]);
  });

  it('adds the cool bloom factor when asked', () => {
    expect(densityFactors(block(), 2025, { coolBloom: true })).toEqual([
      { reason: 'cool bloom forecast', factor: COOL_BLOOM_FACTOR },
    ]);
  });

  it('stacks several factors in manual order', () => {
    const young = block({
      plantedYear: 2024,
      varieties: [
        { name: 'Nonpareil', share: 0.85 },
        { name: 'Monterey', share: 0.15 },
      ],
    });
    expect(
      densityFactors(young, 2025, { coolBloom: true }).map((entry) => entry.reason)
    ).toEqual(['thin pollinizer share', 'young planting', 'cool bloom forecast']);
  });

  it('refuses a season that is not a year', () => {
    expect(() => densityFactors(block(), 25)).toThrow(/at least 2000/);
  });
});

describe('recommendedDensity', () => {
  it('is the crop base when nothing argues with it', () => {
    expect(recommendedDensity(block(), 2025)).toBe(2);
  });

  it('halves for a self fertile planting', () => {
    expect(recommendedDensity(selfFertile, 2025)).toBe(1);
  });

  it('lifts for a thin pollinizer share', () => {
    expect(recommendedDensity(thinPollinizer, 2025)).toBe(2.5);
  });

  it('multiplies the factors together rather than adding them', () => {
    const young = block({ plantedYear: 2024 });
    expect(recommendedDensity(young, 2025, { coolBloom: true })).toBe(1.8);
  });

  it('never recommends more than the yard can service', () => {
    const crowded = makeBlock({
      ...base,
      crop: 'blueberry',
      varieties: [
        { name: 'Duke', share: 0.9 },
        { name: 'Bluecrop', share: 0.1 },
      ],
      plantedYear: 2024,
    });
    expect(recommendedDensity(crowded, 2025, { coolBloom: true })).toBeLessThanOrEqual(
      MAX_DENSITY
    );
  });

  it('rounds to two places', () => {
    const odd = block({
      crop: 'seed alfalfa',
      plantedYear: 2024,
      varieties: [
        { name: 'seed', share: 0.9 },
        { name: 'trap', share: 0.1 },
      ],
    });
    expect(recommendedDensity(odd, 2025)).toBe(1.41);
  });
});

describe('recommendedHives', () => {
  it('multiplies by the acres and rounds a part hive up', () => {
    expect(recommendedHives(block(), 2025)).toBe(240);
    expect(recommendedHives(block({ acres: 10.5 }), 2025)).toBe(21);
  });

  it('rounds up from a fractional density', () => {
    const thin = makeBlock({ ...base, acres: 7, varieties: thinPollinizer.varieties });
    expect(recommendedHives(thin, 2025)).toBe(18);
  });
});

describe('densityVariance', () => {
  it('reports a contract sitting under the recommendation', () => {
    expect(densityVariance(thinPollinizer, 2025, 2)).toEqual({
      recommended: 2.5,
      contracted: 2,
      difference: -0.5,
      short: true,
    });
  });

  it('reports a contract sitting above it', () => {
    expect(densityVariance(block(), 2025, 2.5).short).toBe(false);
  });

  it('treats an exact match as not short', () => {
    expect(densityVariance(block(), 2025, 2).difference).toBe(0);
    expect(densityVariance(block(), 2025, 2).short).toBe(false);
  });

  it('refuses a contracted density beyond the cap', () => {
    expect(() => densityVariance(block(), 2025, 9)).toThrow(/at most 6/);
  });
});

describe('explainDensity', () => {
  it('shows the base and the answer when nothing applies', () => {
    expect(explainDensity(block(), 2025)).toBe(
      'almond base 2 per acre\nrecommended 2 per acre'
    );
  });

  it('shows a line per factor', () => {
    const lines = explainDensity(thinPollinizer, 2025, { coolBloom: true }).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('thin pollinizer share times 1.25');
    expect(lines[3]).toBe('recommended 3 per acre');
  });
});
