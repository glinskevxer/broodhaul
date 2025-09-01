import { describe, it, expect } from 'vitest';
import {
  TANK_GALLONS,
  YARDS_PER_DAY,
  syrupRunFor,
  fillsNeeded,
  daysNeeded,
  runCostCents,
  splitIntoDays,
  proteinRunFor,
  visitDates,
  nextVisitAfter,
  describeRun,
  describeCost,
  daysBetweenVisits,
} from '../../src/feeding/schedule.js';

const yards = [
  { yardId: 'YD-2025-0003', colonies: 96 },
  { yardId: 'YD-2025-0001', colonies: 120 },
  { yardId: 'YD-2025-0002', colonies: 64 },
];

describe('syrupRunFor', () => {
  it('sizes the run off the colony count and the stage', () => {
    const run = syrupRunFor(yards, 'fall');
    expect(run.ratio).toBe('2:1');
    expect(run.colonies).toBe(280);
    expect(run.gallons).toBe(560);
  });

  it('sorts the yards', () => {
    expect(syrupRunFor(yards, 'fall').rows.map((row) => row.yardId)).toEqual([
      'YD-2025-0001',
      'YD-2025-0002',
      'YD-2025-0003',
    ]);
  });

  it('feeds thinner in spring', () => {
    expect(syrupRunFor(yards, 'bloom').ratio).toBe('1:1');
    expect(syrupRunFor(yards, 'bloom').gallons).toBe(140);
  });

  it('refuses a stage nobody feeds in', () => {
    expect(() => syrupRunFor(yards, 'flow')).toThrow(/no syrup is fed in flow/);
  });

  it('refuses a yard with an impossible colony count', () => {
    expect(() => syrupRunFor([{ yardId: 'YD-1', colonies: -1 }], 'fall')).toThrow(
      /at least 0/
    );
  });
});

describe('fillsNeeded and daysNeeded', () => {
  const run = syrupRunFor(yards, 'fall');

  it('counts the tank fills', () => {
    expect(fillsNeeded(run)).toBe(1);
    expect(fillsNeeded(run, 200)).toBe(3);
    expect(TANK_GALLONS).toBe(600);
  });

  it('is nothing for a run with no gallons', () => {
    expect(fillsNeeded(syrupRunFor([], 'fall'))).toBe(0);
  });

  it('takes the greater of the tank and the yard limit', () => {
    expect(daysNeeded(run)).toBe(1);
    expect(daysNeeded(run, { tankGallons: 200 })).toBe(3);
    expect(daysNeeded(run, { yardsPerDay: 1 })).toBe(3);
    expect(YARDS_PER_DAY).toBe(8);
  });
});

describe('splitIntoDays', () => {
  const run = syrupRunFor(yards, 'fall');

  it('puts it all on one day when the tank holds it', () => {
    const days = splitIntoDays(run, '2025-09-15');
    expect(days).toHaveLength(1);
    expect(days[0].gallons).toBe(560);
  });

  it('rolls to the next day when the tank runs out', () => {
    const days = splitIntoDays(run, '2025-09-15', { tankGallons: 250 });
    expect(days.map((day) => day.date)).toEqual([
      '2025-09-15',
      '2025-09-16',
      '2025-09-17',
    ]);
  });

  it('never puts more in a day than the tank holds', () => {
    for (const day of splitIntoDays(run, '2025-09-15', { tankGallons: 250 })) {
      expect(day.gallons).toBeLessThanOrEqual(250);
    }
  });

  it('rolls on the yard limit as well', () => {
    const days = splitIntoDays(run, '2025-09-15', { yardsPerDay: 1 });
    expect(days).toHaveLength(3);
  });

  it('keeps every yard somewhere', () => {
    const days = splitIntoDays(run, '2025-09-15', { tankGallons: 250 });
    const placed = days.flatMap((day) => day.rows.map((row) => row.yardId));
    expect(placed.sort()).toEqual(run.rows.map((row) => row.yardId).sort());
  });

  it('is empty for a run with no yards', () => {
    expect(splitIntoDays(syrupRunFor([], 'fall'), '2025-09-15')).toEqual([]);
  });

  it('puts a yard bigger than the tank on its own day', () => {
    const big = syrupRunFor([{ yardId: 'YD-1', colonies: 500 }], 'fall');
    const days = splitIntoDays(big, '2025-09-15', { tankGallons: 250 });
    expect(days).toHaveLength(1);
    expect(days[0].gallons).toBe(1000);
  });
});

describe('runCostCents', () => {
  const run = syrupRunFor(yards, 'fall');

  it('prices the sugar for the whole run', () => {
    expect(runCostCents(run, 55)).toBeGreaterThan(0);
  });

  it('costs more with more colonies', () => {
    const bigger = syrupRunFor([...yards, { yardId: 'YD-4', colonies: 200 }], 'fall');
    expect(runCostCents(bigger, 55)).toBeGreaterThan(runCostCents(run, 55));
  });
});

describe('proteinRunFor', () => {
  it('works the visits out from the days', () => {
    const run = proteinRunFor(yards, 'patty', 42);
    expect(run.visits).toBe(3);
    expect(run.colonies).toBe(280);
    expect(run.poundsPerVisit).toBe(280);
    expect(run.costCents).toBeGreaterThan(0);
  });

  it('takes a different ration', () => {
    expect(proteinRunFor(yards, 'dry sub', 42).poundsPerVisit).toBe(560);
  });
});

describe('visitDates and nextVisitAfter', () => {
  it('spaces the visits at the interval', () => {
    expect(visitDates('2025-01-02', 42)).toEqual([
      '2025-01-02',
      '2025-01-16',
      '2025-01-30',
    ]);
  });

  it('finds the next one due', () => {
    expect(nextVisitAfter('2025-01-02', 42, '2025-01-10')).toBe('2025-01-16');
    expect(nextVisitAfter('2025-01-02', 42, '2025-01-16')).toBe('2025-01-16');
  });

  it('finds nothing once the run is over', () => {
    expect(nextVisitAfter('2025-01-02', 42, '2025-03-01')).toBeUndefined();
  });

  it('measures the gap between two visits', () => {
    expect(daysBetweenVisits('2025-01-02', '2025-01-16')).toBe(14);
  });
});

describe('describeRun and describeCost', () => {
  const run = syrupRunFor(yards, 'fall');

  it('heads with the totals and gives a line per day', () => {
    const lines = describeRun(run, '2025-09-15', { tankGallons: 250 }).split('\n');
    expect(lines[0]).toBe('560 gallons of 2:1 over 3 yards, 3 days');
    expect(lines).toHaveLength(4);
  });

  it('says what the sugar costs and how many colonies it feeds', () => {
    expect(describeCost(run, 55)).toContain('feeding 280 colonies');
  });
});
