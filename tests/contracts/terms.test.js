import { describe, it, expect } from 'vitest';
import {
  GRADE_BASES,
  SHORTFALL_RULES,
  makeTerms,
  tierFor,
  adjustmentFor,
  meetsMinimum,
  allowsRegrade,
  strengthsToTier,
  describeTerms,
} from '../../src/contracts/terms.js';

const base = {
  minimumAverage: 8,
  samplePercent: 10,
  tiers: [
    { atLeast: 10, adjustmentCents: 2500 },
    { atLeast: 8, adjustmentCents: 0 },
    { atLeast: 6, adjustmentCents: -2500 },
  ],
};

const terms = (overrides = {}) => makeTerms({ ...base, ...overrides });

describe('makeTerms', () => {
  it('keeps the tiers as written', () => {
    expect(terms().tiers).toHaveLength(3);
    expect(terms().tiers[0]).toEqual({ atLeast: 10, adjustmentCents: 2500 });
  });

  it('defaults to grading by average and prorating a shortfall', () => {
    const built = terms();
    expect(built.gradeBy).toBe('average');
    expect(built.shortfall).toBe('prorate');
    expect(built.regradeWithinDays).toBe(0);
  });

  it('takes the other bases and rules', () => {
    const built = terms({
      gradeBy: 'colony',
      shortfall: 'reject',
      regradeWithinDays: 3,
    });
    expect(built.gradeBy).toBe('colony');
    expect(built.shortfall).toBe('reject');
    expect(built.regradeWithinDays).toBe(3);
  });

  it('refuses a grade basis or shortfall rule nobody writes', () => {
    expect(() => terms({ gradeBy: 'yard' })).toThrow(/must be one of average, colony/);
    expect(() => terms({ shortfall: 'argue' })).toThrow(
      /must be one of prorate, reject, tier/
    );
  });

  it('refuses tiers that are not written strongest first', () => {
    expect(() =>
      terms({
        tiers: [
          { atLeast: 6, adjustmentCents: -2500 },
          { atLeast: 10, adjustmentCents: 2500 },
        ],
      })
    ).toThrow(/strongest first/);
  });

  it('refuses two tiers at the same strength', () => {
    expect(() =>
      terms({
        tiers: [
          { atLeast: 8, adjustmentCents: 2500 },
          { atLeast: 8, adjustmentCents: 0 },
        ],
      })
    ).toThrow(/strongest first/);
  });

  it('refuses a minimum below the weakest tier, which would make the tiers dead letters', () => {
    expect(() => terms({ minimumAverage: 4 })).toThrow(/can never bite/);
  });

  it('allows a minimum sitting exactly on the weakest tier', () => {
    expect(terms({ minimumAverage: 6 }).minimumAverage).toBe(6);
  });

  it('refuses an empty tier table', () => {
    expect(() => terms({ tiers: [] })).toThrow(/at least 1 entries/);
  });

  it('refuses an adjustment larger than any real contract carries', () => {
    expect(() =>
      terms({ tiers: [{ atLeast: 8, adjustmentCents: 90000 }], minimumAverage: 8 })
    ).toThrow(/at most 50000/);
  });

  it('refuses an unknown key inside a tier', () => {
    expect(() =>
      terms({ tiers: [{ atLeast: 8, adjustmentCents: 0, note: 'x' }] })
    ).toThrow(/unknown keys: note/);
  });

  it('refuses a regrade window longer than a month', () => {
    expect(() => terms({ regradeWithinDays: 31 })).toThrow(/at most 30/);
  });
});

describe('tierFor', () => {
  it('finds the strongest tier a reading clears', () => {
    expect(tierFor(terms(), 12).atLeast).toBe(10);
    expect(tierFor(terms(), 10).atLeast).toBe(10);
    expect(tierFor(terms(), 9.75).atLeast).toBe(8);
    expect(tierFor(terms(), 6).atLeast).toBe(6);
  });

  it('finds nothing below the weakest tier', () => {
    expect(tierFor(terms(), 5.75)).toBeUndefined();
  });

  it('refuses a negative strength', () => {
    expect(() => tierFor(terms(), -1)).toThrow(/at least 0/);
  });
});

describe('adjustmentFor', () => {
  it('returns the tier adjustment', () => {
    expect(adjustmentFor(terms(), 11)).toBe(2500);
    expect(adjustmentFor(terms(), 8)).toBe(0);
    expect(adjustmentFor(terms(), 7)).toBe(-2500);
  });

  it('returns nothing below every tier rather than the weakest penalty', () => {
    expect(adjustmentFor(terms(), 2)).toBe(0);
  });
});

describe('meetsMinimum', () => {
  it('includes the minimum itself', () => {
    expect(meetsMinimum(terms(), 8)).toBe(true);
    expect(meetsMinimum(terms(), 7.99)).toBe(false);
  });
});

describe('allowsRegrade', () => {
  it('is false when no window was written into the contract', () => {
    expect(allowsRegrade(terms())).toBe(false);
    expect(allowsRegrade(terms({ regradeWithinDays: 3 }))).toBe(true);
  });
});

describe('strengthsToTier', () => {
  const run = { readings: [{ frames: 8 }, { frames: 6 }, { frames: 10 }] };
  const perRun = () => 8;
  const perColony = (_run, reading) => reading.frames;

  it('gives one strength when grading by average', () => {
    expect(strengthsToTier(terms(), run, perRun)).toEqual([8]);
  });

  it('gives one strength per colony when grading by colony', () => {
    expect(strengthsToTier(terms({ gradeBy: 'colony' }), run, perColony)).toEqual([
      8, 6, 10,
    ]);
  });

  it('covers both bases the terms allow', () => {
    for (const gradeBy of GRADE_BASES) {
      const strengths = strengthsToTier(terms({ gradeBy }), run, (a, b) =>
        b ? b.frames : perRun()
      );
      expect(strengths.length).toBeGreaterThan(0);
    }
  });
});

describe('describeTerms', () => {
  it('prints a line per clause', () => {
    const lines = describeTerms(terms()).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('minimum 8 frames, graded by average');
    expect(lines[4]).toBe('no regrade');
  });

  it('names the regrade window when there is one', () => {
    expect(describeTerms(terms({ regradeWithinDays: 3 }))).toContain(
      'regrade within 3 days'
    );
  });

  it('names every shortfall rule it is given', () => {
    for (const shortfall of SHORTFALL_RULES) {
      expect(describeTerms(terms({ shortfall }))).toContain(`shortfall ${shortfall}`);
    }
  });
});
