import { describe, it, expect } from 'vitest';
import {
  makeBlock,
  treesPerAcre,
  blockTrees,
  blockAge,
  isYoungPlanting,
  mainVariety,
  pollinizerShare,
  isSelfFertile,
  describeBlock,
} from '../../src/placement/block.js';

const base = {
  id: 'BK-2025-0001',
  name: 'Avenue 416 north',
  crop: 'almond',
  acres: 120,
  varieties: [
    { name: 'Nonpareil', share: 0.5 },
    { name: 'Monterey', share: 0.25 },
    { name: 'Fritz', share: 0.25 },
  ],
  plantedYear: 2016,
  rowSpacingFt: 22,
  treeSpacingFt: 18,
  location: { latitude: 36.9, longitude: -120.1 },
};

const block = (overrides = {}) => makeBlock({ ...base, ...overrides });

describe('makeBlock', () => {
  it('keeps the planting geometry', () => {
    const built = block();
    expect(built.rowSpacingFt).toBe(22);
    expect(built.treeSpacingFt).toBe(18);
  });

  it('refuses variety shares that do not add to one', () => {
    expect(() =>
      block({
        varieties: [
          { name: 'Nonpareil', share: 0.5 },
          { name: 'Monterey', share: 0.4 },
        ],
      })
    ).toThrow(/shares add to 0.9/);
  });

  it('accepts shares that add to one within four places', () => {
    const thirds = block({
      varieties: [
        { name: 'A', share: 0.3333 },
        { name: 'B', share: 0.3333 },
        { name: 'C', share: 0.3334 },
      ],
    });
    expect(thirds.varieties).toHaveLength(3);
  });

  it('refuses the same variety twice', () => {
    expect(() =>
      block({
        varieties: [
          { name: 'Nonpareil', share: 0.5 },
          { name: 'Nonpareil', share: 0.5 },
        ],
      })
    ).toThrow(/is listed twice/);
  });

  it('defaults a variety to not self fertile', () => {
    expect(block().varieties[0].selfFertile).toBe(false);
  });

  it('refuses a planting year outside the record', () => {
    expect(() => block({ plantedYear: 1900 })).toThrow(/at least 1950/);
  });

  it('refuses spacing no orchard uses', () => {
    expect(() => block({ rowSpacingFt: 4 })).toThrow(/at least 8/);
    expect(() => block({ treeSpacingFt: 60 })).toThrow(/at most 40/);
  });

  it('refuses an unknown key on the block or in a variety', () => {
    expect(() => makeBlock({ ...base, irrigation: 'drip' })).toThrow(
      /block has unknown keys: irrigation/
    );
    expect(() =>
      block({ varieties: [{ name: 'Nonpareil', share: 1, rootstock: 'Nemaguard' }] })
    ).toThrow(/unknown keys: rootstock/);
  });
});

describe('treesPerAcre and blockTrees', () => {
  it('works the spacing into a tree count', () => {
    expect(treesPerAcre(block())).toBe(110);
    expect(blockTrees(block())).toBe(13200);
  });

  it('packs more trees into tighter spacing', () => {
    expect(treesPerAcre(block({ rowSpacingFt: 16, treeSpacingFt: 14 }))).toBe(194);
  });

  it('rounds a part tree away', () => {
    expect(blockTrees(block({ acres: 0.5 }))).toBe(55);
  });
});

describe('blockAge and isYoungPlanting', () => {
  it('counts seasons since planting', () => {
    expect(blockAge(block(), 2025)).toBe(9);
  });

  it('calls anything under three years young', () => {
    expect(isYoungPlanting(block({ plantedYear: 2023 }), 2025)).toBe(true);
    expect(isYoungPlanting(block({ plantedYear: 2022 }), 2025)).toBe(false);
  });
});

describe('mainVariety and pollinizerShare', () => {
  it('finds the variety with the largest share', () => {
    expect(mainVariety(block()).name).toBe('Nonpareil');
  });

  it('keeps the first on a tie', () => {
    const even = block({
      varieties: [
        { name: 'Monterey', share: 0.5 },
        { name: 'Fritz', share: 0.5 },
      ],
    });
    expect(mainVariety(even).name).toBe('Monterey');
  });

  it('reports everything else as the pollinizer share', () => {
    expect(pollinizerShare(block())).toBe(0.5);
  });

  it('is nothing in a solid block', () => {
    expect(
      pollinizerShare(block({ varieties: [{ name: 'Nonpareil', share: 1 }] }))
    ).toBe(0);
  });
});

describe('isSelfFertile', () => {
  it('is false when any variety needs a pollinizer', () => {
    expect(isSelfFertile(block())).toBe(false);
  });

  it('is true when the whole block is self fertile', () => {
    const independence = block({
      varieties: [{ name: 'Independence', share: 1, selfFertile: true }],
    });
    expect(isSelfFertile(independence)).toBe(true);
  });

  it('is false for a mixed planting where only one variety is self fertile', () => {
    const mixed = block({
      varieties: [
        { name: 'Independence', share: 0.5, selfFertile: true },
        { name: 'Nonpareil', share: 0.5 },
      ],
    });
    expect(isSelfFertile(mixed)).toBe(false);
  });
});

describe('describeBlock', () => {
  it('reads like the line on a set sheet', () => {
    expect(describeBlock(block())).toBe(
      'Avenue 416 north (BK-2025-0001) 120 acres of almond: Nonpareil 50%, Monterey 25%, Fritz 25%'
    );
  });
});
