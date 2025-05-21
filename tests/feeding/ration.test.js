import { describe, it, expect } from 'vitest';
import {
  RATION_KINDS,
  RATION_SPEC,
  VISIT_INTERVAL_DAYS,
  specFor,
  visitsBetween,
  poundsFor,
  costCentsFor,
  cheapestForProtein,
  feedingPlan,
  describePlan,
} from '../../src/feeding/ration.js';

describe('specFor', () => {
  it('knows every ration on the list', () => {
    for (const kind of RATION_KINDS) {
      expect(specFor(kind)).toEqual(RATION_SPEC[kind]);
    }
  });

  it('refuses a ration nobody feeds', () => {
    expect(() => specFor('sugar water')).toThrow(/must be one of/);
  });

  it('puts the most protein a pound in trapped pollen', () => {
    expect(specFor('trapped pollen').proteinPct).toBeGreaterThan(
      specFor('patty').proteinPct
    );
    expect(specFor('trapped pollen').costCentsPerLb).toBeGreaterThan(
      specFor('patty').costCentsPerLb
    );
  });
});

describe('visitsBetween', () => {
  it('is nothing for no days', () => {
    expect(visitsBetween(0)).toBe(0);
  });

  it('is one visit inside the interval', () => {
    expect(visitsBetween(1)).toBe(1);
    expect(visitsBetween(VISIT_INTERVAL_DAYS)).toBe(1);
  });

  it('rounds a part interval up', () => {
    expect(visitsBetween(VISIT_INTERVAL_DAYS + 1)).toBe(2);
    expect(visitsBetween(42)).toBe(3);
  });

  it('refuses a span nobody feeds over', () => {
    expect(() => visitsBetween(400)).toThrow(/at most 365/);
  });
});

describe('poundsFor and costCentsFor', () => {
  it('scales with colonies and visits', () => {
    expect(poundsFor('patty', 400, 3)).toBe(1200);
    expect(poundsFor('dry sub', 400, 3)).toBe(2400);
  });

  it('is nothing for no visits', () => {
    expect(poundsFor('patty', 400, 0)).toBe(0);
    expect(costCentsFor('patty', 400, 0)).toBe(0);
  });

  it('prices the pounds', () => {
    expect(costCentsFor('patty', 400, 3)).toBe(1200 * 285);
  });

  it('refuses a fractional colony count', () => {
    expect(() => poundsFor('patty', 400.5, 3)).toThrow(/whole number/);
  });
});

describe('cheapestForProtein', () => {
  it('sorts by cost', () => {
    const options = cheapestForProtein(400, 3, 180);
    const costs = options.map((option) => option.costCents);
    expect(costs).toEqual([...costs].sort((left, right) => left - right));
  });

  it('carries the protein asked for whichever is chosen', () => {
    for (const option of cheapestForProtein(400, 3, 180)) {
      expect(option.proteinLb).toBeCloseTo(180, 0);
    }
  });

  it('names every ration as an option', () => {
    expect(
      cheapestForProtein(400, 3, 180)
        .map((option) => option.kind)
        .sort()
    ).toEqual([...RATION_KINDS].sort());
  });

  it('picks the cheapest per pound of protein rather than per pound', () => {
    const best = cheapestForProtein(400, 3, 180)[0];
    expect(best.kind).toBe('dry sub');
  });

  it('refuses a protein target of nothing', () => {
    expect(() => cheapestForProtein(400, 3, 0)).toThrow(/at least 0.01/);
  });
});

describe('feedingPlan', () => {
  it('works out the visits from the days', () => {
    const plan = feedingPlan({
      kind: 'patty',
      colonies: 400,
      days: 42,
      startOn: '2025-01-02',
    });
    expect(plan.visits).toBe(3);
    expect(plan.poundsPerVisit).toBe(400);
    expect(plan.totalPoundsLb).toBe(1200);
    expect(plan.costCents).toBe(342000);
  });

  it('plans nothing when there are no days to cover', () => {
    const plan = feedingPlan({
      kind: 'patty',
      colonies: 400,
      days: 0,
      startOn: '2025-01-02',
    });
    expect(plan.visits).toBe(0);
    expect(plan.costCents).toBe(0);
  });

  it('carries the interval so the crew knows when to go back', () => {
    const plan = feedingPlan({
      kind: 'patty',
      colonies: 10,
      days: 30,
      startOn: '2025-01-02',
    });
    expect(plan.intervalDays).toBe(VISIT_INTERVAL_DAYS);
  });
});

describe('describePlan', () => {
  it('says nothing is needed when nothing is', () => {
    const plan = feedingPlan({
      kind: 'patty',
      colonies: 400,
      days: 0,
      startOn: '2025-01-02',
    });
    expect(describePlan(plan)).toBe('400 colonies, no feeding needed');
  });

  it('reads like the note on the shop wall', () => {
    const plan = feedingPlan({
      kind: 'patty',
      colonies: 400,
      days: 42,
      startOn: '2025-01-02',
    });
    expect(describePlan(plan)).toBe(
      '400 colonies, 3 visits of 400 lb patty, 1200 lb in all'
    );
  });
});
