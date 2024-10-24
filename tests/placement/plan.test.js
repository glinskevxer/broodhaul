import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_PER_DROP,
  dropsNeeded,
  splitIntoDrops,
  planBlockDrops,
  planContractDrops,
  planTotal,
  planShortfall,
  planByBlock,
  describePlan,
} from '../../src/placement/plan.js';
import { aContract } from '../helpers/contracts.js';
import { contractedHives } from '../../src/contracts/contract.js';

const contract = aContract();

describe('dropsNeeded', () => {
  it('is nothing for no hives', () => {
    expect(dropsNeeded(0)).toBe(0);
  });

  it('rounds a part drop up', () => {
    expect(dropsNeeded(240, 48)).toBe(5);
    expect(dropsNeeded(241, 48)).toBe(6);
  });

  it('uses the default cap when none is given', () => {
    expect(dropsNeeded(100)).toBe(dropsNeeded(100, DEFAULT_MAX_PER_DROP));
  });

  it('refuses a cap smaller than a pallet', () => {
    expect(() => dropsNeeded(100, 2)).toThrow(/at least 4/);
  });
});

describe('splitIntoDrops', () => {
  it('splits evenly when it can', () => {
    expect(splitIntoDrops(240, 5)).toEqual([48, 48, 48, 48, 48]);
  });

  it('keeps every drop but the last a whole number of pallets', () => {
    const drops = splitIntoDrops(137, 3);
    expect(drops).toEqual([48, 44, 45]);
    for (const drop of drops.slice(0, -1)) {
      expect(drop % 4).toBe(0);
    }
  });

  it('always adds back to the hives it was given', () => {
    for (const hives of [7, 40, 137, 240, 999]) {
      for (const count of [1, 2, 3, 5]) {
        expect(splitIntoDrops(hives, count).reduce((a, b) => a + b, 0)).toBe(hives);
      }
    }
  });

  it('follows a six way pallet instead when the yard runs those', () => {
    expect(splitIntoDrops(240, 5, 'six-way')).toEqual([48, 48, 48, 48, 48]);
    expect(splitIntoDrops(137, 3, 'six-way')).toEqual([48, 42, 47]);
  });

  it('puts everything on one drop when asked for one', () => {
    expect(splitIntoDrops(137, 1)).toEqual([137]);
  });

  it('is empty for nothing', () => {
    expect(splitIntoDrops(0, 0)).toEqual([]);
  });

  it('refuses hives with nowhere to go', () => {
    expect(() => splitIntoDrops(40, 0)).toThrow(/across no drops/);
  });

  it('refuses a pallet pattern nobody builds', () => {
    expect(() => splitIntoDrops(40, 2, 'eight-way')).toThrow(/must be one of/);
  });
});

describe('planBlockDrops', () => {
  it('numbers the drops from one', () => {
    const plan = planBlockDrops(contract.blocks[0]);
    expect(plan.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('carries the block identifier onto every drop', () => {
    const plan = planBlockDrops(contract.blocks[1]);
    expect(new Set(plan.map((entry) => entry.blockId))).toEqual(
      new Set(['BK-2025-0002'])
    );
  });

  it('takes a tighter cap when the grower wants the bees spread', () => {
    const plan = planBlockDrops(contract.blocks[0], { maxPerDrop: 24 });
    expect(plan).toHaveLength(10);
    expect(plan[0].ordered).toBe(24);
  });
});

describe('planContractDrops', () => {
  it('covers every block on the contract', () => {
    const plan = planContractDrops(contract);
    expect(planByBlock(plan)).toEqual([
      { blockId: 'BK-2025-0001', hives: 240 },
      { blockId: 'BK-2025-0002', hives: 137 },
    ]);
  });

  it('plans exactly the hives the contract says', () => {
    expect(planTotal(planContractDrops(contract))).toBe(contractedHives(contract));
  });

  it('plans the same total however the cap is set', () => {
    for (const maxPerDrop of [12, 24, 48, 96]) {
      expect(planTotal(planContractDrops(contract, { maxPerDrop }))).toBe(377);
    }
  });
});

describe('planShortfall', () => {
  const plan = planContractDrops(contract);

  it('is fillable when the yard has enough', () => {
    expect(planShortfall(plan, 400)).toEqual({
      wanted: 377,
      available: 400,
      short: 0,
      fillable: true,
    });
  });

  it('names the gap when it does not', () => {
    expect(planShortfall(plan, 300)).toEqual({
      wanted: 377,
      available: 300,
      short: 77,
      fillable: false,
    });
  });

  it('treats an exact match as fillable', () => {
    expect(planShortfall(plan, 377).fillable).toBe(true);
  });

  it('refuses a fractional count of available hives', () => {
    expect(() => planShortfall(plan, 12.5)).toThrow(/whole number/);
  });
});

describe('describePlan', () => {
  it('gives a line per drop', () => {
    const lines = describePlan(planContractDrops(contract)).split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('BK-2025-0001 drop 1: 48 hives');
    expect(lines[7]).toBe('BK-2025-0002 drop 3: 45 hives');
  });
});
