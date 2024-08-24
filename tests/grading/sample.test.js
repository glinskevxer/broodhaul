import { describe, it, expect } from 'vitest';
import {
  SAMPLE_FLOOR,
  SAMPLE_CEILING,
  CENSUS_THRESHOLD,
  METHOD_MULTIPLIERS,
  methodMultiplier,
  sampleSize,
  seedFrom,
  chooseSample,
  describeSample,
} from '../../src/grading/sample.js';

const colonies = (count) =>
  Array.from({ length: count }, (_unused, at) => ({
    id: `CY-2025-${String(at + 1).padStart(4, '0')}`,
    brand: `BH-${String(at + 1).padStart(4, '0')}`,
  }));

describe('methodMultiplier', () => {
  it('leaves a frame count alone and widens a cluster count', () => {
    expect(methodMultiplier('frame')).toBe(1);
    expect(methodMultiplier('cluster')).toBe(1.5);
  });

  it('agrees with the published table', () => {
    for (const [method, multiplier] of Object.entries(METHOD_MULTIPLIERS)) {
      expect(methodMultiplier(method)).toBe(multiplier);
    }
  });

  it('refuses a method nobody uses', () => {
    expect(() => methodMultiplier('eyeball')).toThrow(/must be one of/);
  });
});

describe('sampleSize', () => {
  it('is nothing for an empty drop', () => {
    expect(sampleSize(0, 10)).toBe(0);
  });

  it('grades a small drop whole and ignores the percentage', () => {
    expect(sampleSize(6, 10)).toBe(6);
    expect(sampleSize(6, 90)).toBe(6);
    expect(sampleSize(CENSUS_THRESHOLD, 10)).toBe(CENSUS_THRESHOLD);
  });

  it('drops to the percentage once past the census threshold', () => {
    expect(sampleSize(CENSUS_THRESHOLD + 1, 10)).toBe(SAMPLE_FLOOR);
  });

  it('rounds the percentage up', () => {
    expect(sampleSize(100, 10)).toBe(10);
    expect(sampleSize(101, 10)).toBe(11);
  });

  it('never goes below the floor', () => {
    expect(sampleSize(20, 1)).toBe(SAMPLE_FLOOR);
  });

  it('never goes above the ceiling', () => {
    expect(sampleSize(1000, 10)).toBe(SAMPLE_CEILING);
  });

  it('applies the cluster multiplier before the floor and ceiling', () => {
    expect(sampleSize(100, 10, 'cluster')).toBe(15);
    expect(sampleSize(20, 1, 'cluster')).toBe(SAMPLE_FLOOR);
    expect(sampleSize(1000, 10, 'cluster')).toBe(SAMPLE_CEILING);
  });

  it('rounds the multiplied figure up as well', () => {
    expect(sampleSize(50, 10, 'cluster')).toBe(8);
  });

  it('never asks for more colonies than there are', () => {
    expect(sampleSize(9, 90, 'cluster')).toBe(9);
  });

  it('refuses a percentage outside one to a hundred', () => {
    expect(() => sampleSize(50, 0)).toThrow(/at least 1/);
    expect(() => sampleSize(50, 101)).toThrow(/at most 100/);
  });

  it('refuses a fractional population', () => {
    expect(() => sampleSize(10.5, 10)).toThrow(/whole number/);
  });
});

describe('seedFrom', () => {
  it('is stable for the same text', () => {
    expect(seedFrom('DR-2025-0004')).toBe(seedFrom('DR-2025-0004'));
  });

  it('differs for different text', () => {
    expect(seedFrom('DR-2025-0004')).not.toBe(seedFrom('DR-2025-0005'));
  });

  it('handles an empty string', () => {
    expect(seedFrom('')).toBe(7);
  });
});

describe('chooseSample', () => {
  it('takes nothing when nothing is asked for', () => {
    expect(chooseSample(colonies(20), 0, 'seed')).toEqual([]);
  });

  it('returns the whole population sorted when it is asked for all of it', () => {
    const chosen = chooseSample(colonies(5), 5, 'seed');
    expect(chosen.map((colony) => colony.brand)).toEqual([
      'BH-0001',
      'BH-0002',
      'BH-0003',
      'BH-0004',
      'BH-0005',
    ]);
  });

  it('takes the number asked for and no duplicates', () => {
    const chosen = chooseSample(colonies(40), 12, 'DR-2025-0004');
    expect(chosen).toHaveLength(12);
    expect(new Set(chosen.map((colony) => colony.id)).size).toBe(12);
  });

  it('gives the same answer twice for the same seed', () => {
    const first = chooseSample(colonies(40), 12, 'DR-2025-0004');
    const second = chooseSample(colonies(40), 12, 'DR-2025-0004');
    expect(first).toEqual(second);
  });

  it('does not depend on the order the register handed them over', () => {
    const forward = chooseSample(colonies(40), 12, 'DR-2025-0004');
    const backward = chooseSample([...colonies(40)].reverse(), 12, 'DR-2025-0004');
    expect(backward).toEqual(forward);
  });

  it('gives a different answer for a different drop', () => {
    const first = chooseSample(colonies(40), 12, 'DR-2025-0004');
    const second = chooseSample(colonies(40), 12, 'DR-2025-0009');
    expect(second).not.toEqual(first);
  });

  it('spreads the choice through the yard rather than taking a block', () => {
    const chosen = chooseSample(colonies(40), 8, 'DR-2025-0004');
    const positions = chosen.map((colony) => Number(colony.brand.slice(3)));
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(20);
  });

  it('comes back sorted by brand', () => {
    const chosen = chooseSample(colonies(40), 12, 'DR-2025-0004');
    const brands = chosen.map((colony) => colony.brand);
    expect(brands).toEqual([...brands].sort());
  });

  it('refuses to take more than the population', () => {
    expect(() => chooseSample(colonies(5), 6, 'seed')).toThrow(
      /cannot take 6 colonies out of 5/
    );
  });
});

describe('describeSample', () => {
  it('says census for a small drop', () => {
    expect(describeSample(6, 10, 'frame')).toBe('census, all 6 colonies');
  });

  it('says the size, the method and the percentage otherwise', () => {
    expect(describeSample(100, 10, 'cluster')).toBe(
      '15 of 100 by cluster count at 10 percent'
    );
  });
});
