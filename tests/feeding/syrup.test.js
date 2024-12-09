import { describe, it, expect } from 'vitest';
import {
  RATIOS,
  SYRUP_LB_PER_GALLON,
  SUGAR_SHARE,
  GALLONS_PER_COLONY,
  ratioFor,
  makeBatch,
  batchWeightLb,
  sugarLb,
  waterGallons,
  bagsNeeded,
  batchCostCents,
  gallonsPerColony,
  coloniesFed,
  batchForColonies,
  describeBatch,
} from '../../src/feeding/syrup.js';

const thin = makeBatch({ ratio: '1:1', gallons: 100 });
const heavy = makeBatch({ ratio: '2:1', gallons: 100 });

describe('ratioFor', () => {
  it('feeds thin in spring and heavy in autumn', () => {
    expect(ratioFor('bloom')).toBe('1:1');
    expect(ratioFor('flow')).toBe('1:1');
    expect(ratioFor('fall')).toBe('2:1');
    expect(ratioFor('winter')).toBe('2:1');
  });

  it('refuses a stage nobody names', () => {
    expect(() => ratioFor('spring')).toThrow(/must be one of/);
  });
});

describe('makeBatch', () => {
  it('rounds the gallons to a tenth', () => {
    expect(makeBatch({ ratio: '1:1', gallons: 100.44 }).gallons).toBe(100.4);
  });

  it('refuses a ratio nobody mixes', () => {
    expect(() => makeBatch({ ratio: '3:1', gallons: 10 })).toThrow(
      /must be one of 1:1, 2:1/
    );
  });

  it('refuses a batch bigger than the tank', () => {
    expect(() => makeBatch({ ratio: '1:1', gallons: 9000 })).toThrow(/at most 5000/);
  });

  it('refuses a batch of nothing', () => {
    expect(() => makeBatch({ ratio: '1:1', gallons: 0 })).toThrow(/at least 1/);
  });
});

describe('batchWeightLb', () => {
  it('weighs a gallon differently by ratio', () => {
    expect(batchWeightLb(thin)).toBe(1000);
    expect(batchWeightLb(heavy)).toBe(1130);
  });

  it('agrees with the published table', () => {
    for (const ratio of RATIOS) {
      const batch = makeBatch({ ratio, gallons: 1 });
      expect(batchWeightLb(batch)).toBe(SYRUP_LB_PER_GALLON[ratio]);
    }
  });
});

describe('sugarLb and waterGallons', () => {
  it('splits a thin batch in half by weight', () => {
    expect(sugarLb(thin)).toBe(500);
    expect(waterGallons(thin)).toBe(59.95);
  });

  it('puts two thirds of a heavy batch in as sugar', () => {
    expect(sugarLb(heavy)).toBe(753.3);
    expect(waterGallons(heavy)).toBe(45.17);
  });

  it('carries more sugar per gallon in the heavy mix', () => {
    expect(sugarLb(heavy) / heavy.gallons).toBeGreaterThan(
      sugarLb(thin) / thin.gallons
    );
  });

  it('matches the published sugar share', () => {
    for (const ratio of RATIOS) {
      const batch = makeBatch({ ratio, gallons: 100 });
      expect(sugarLb(batch) / batchWeightLb(batch)).toBeCloseTo(SUGAR_SHARE[ratio], 3);
    }
  });
});

describe('bagsNeeded', () => {
  it('buys whole bags', () => {
    expect(bagsNeeded(thin)).toBe(10);
    expect(bagsNeeded(heavy)).toBe(16);
  });

  it('takes another bag size', () => {
    expect(bagsNeeded(thin, 100)).toBe(5);
  });

  it('refuses a bag size nobody sells', () => {
    expect(() => bagsNeeded(thin, 0)).toThrow(/at least 1/);
  });
});

describe('batchCostCents', () => {
  it('prices the sugar', () => {
    expect(batchCostCents(thin, 55)).toBe(27500);
  });

  it('costs more for the heavy mix at the same gallons', () => {
    expect(batchCostCents(heavy, 55)).toBeGreaterThan(batchCostCents(thin, 55));
  });

  it('refuses a sugar price nobody pays', () => {
    expect(() => batchCostCents(thin, 0)).toThrow(/at least 1/);
  });
});

describe('gallonsPerColony and coloniesFed', () => {
  it('knows the feeding rate at each stage', () => {
    expect(gallonsPerColony('fall')).toBe(GALLONS_PER_COLONY.fall);
    expect(gallonsPerColony('bloom')).toBe(0.5);
  });

  it('feeds nothing on the flow or in winter', () => {
    expect(gallonsPerColony('flow')).toBe(0);
    expect(gallonsPerColony('winter')).toBe(0);
  });

  it('works out how many colonies a batch covers', () => {
    expect(coloniesFed(heavy, 'fall')).toBe(50);
    expect(coloniesFed(thin, 'bloom')).toBe(200);
  });

  it('rounds a part colony away', () => {
    expect(coloniesFed(makeBatch({ ratio: '2:1', gallons: 101 }), 'fall')).toBe(50);
  });

  it('refuses to work out a stage that is not fed', () => {
    expect(() => coloniesFed(thin, 'flow')).toThrow(/no syrup is fed in flow/);
  });
});

describe('batchForColonies', () => {
  it('sizes an autumn batch and picks the heavy ratio', () => {
    expect(batchForColonies(200, 'fall')).toEqual({ ratio: '2:1', gallons: 400 });
  });

  it('sizes a spring batch and picks the thin ratio', () => {
    expect(batchForColonies(200, 'bloom')).toEqual({ ratio: '1:1', gallons: 100 });
  });

  it('refuses a stage nobody feeds in', () => {
    expect(() => batchForColonies(200, 'flow')).toThrow(/no syrup is fed in flow/);
  });

  it('round trips with coloniesFed', () => {
    const batch = batchForColonies(137, 'fall');
    expect(coloniesFed(batch, 'fall')).toBe(137);
  });
});

describe('describeBatch', () => {
  it('reads like the note on the tank', () => {
    expect(describeBatch(thin)).toBe(
      '100 gallons of 1:1: 500 lb sugar to 59.95 gallons water'
    );
  });
});
