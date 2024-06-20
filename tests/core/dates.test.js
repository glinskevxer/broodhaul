import { describe, it, expect } from 'vitest';
import {
  parseDate,
  toStamp,
  fromStamp,
  addDays,
  diffDays,
  compareDates,
  earliest,
  latest,
  dayOfWeek,
  isWeekend,
  seasonOf,
  seasonBounds,
  monthName,
  eachDay,
} from '../../src/core/dates.js';
import { fixedClock, systemClock } from '../../src/core/clock.js';

describe('parseDate', () => {
  it('accepts a real date and trims it', () => {
    expect(parseDate(' 2025-02-14 ')).toBe('2025-02-14');
  });

  it('rejects the wrong shape', () => {
    expect(() => parseDate('14/02/2025')).toThrow(/look like YYYY-MM-DD/);
    expect(() => parseDate('2025-2-4')).toThrow(/look like YYYY-MM-DD/);
  });

  it('rejects a day that does not exist', () => {
    expect(() => parseDate('2025-02-30')).toThrow(/not a real date/);
    expect(() => parseDate('2025-13-01')).toThrow(/not a real date/);
  });

  it('accepts the leap day in a leap year and refuses it otherwise', () => {
    expect(parseDate('2024-02-29')).toBe('2024-02-29');
    expect(() => parseDate('2025-02-29')).toThrow(/not a real date/);
  });

  it('rejects a non string', () => {
    expect(() => parseDate(20250214)).toThrow(/must be a YYYY-MM-DD string/);
  });
});

describe('stamps', () => {
  it('round trips', () => {
    expect(fromStamp(toStamp('2025-02-14'))).toBe('2025-02-14');
  });
});

describe('addDays', () => {
  it('walks forward over a month boundary', () => {
    expect(addDays('2025-01-30', 3)).toBe('2025-02-02');
  });

  it('walks backward over a year boundary', () => {
    expect(addDays('2025-01-02', -3)).toBe('2024-12-30');
  });

  it('crosses a leap day', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 2)).toBe('2025-03-02');
  });

  it('refuses a fractional day', () => {
    expect(() => addDays('2025-01-01', 1.5)).toThrow(/whole number/);
  });
});

describe('diffDays', () => {
  it('counts forward and backward', () => {
    expect(diffDays('2025-02-01', '2025-02-14')).toBe(13);
    expect(diffDays('2025-02-14', '2025-02-01')).toBe(-13);
  });

  it('counts a leap year at 366 days', () => {
    expect(diffDays('2024-01-01', '2025-01-01')).toBe(366);
  });
});

describe('ordering', () => {
  it('compares', () => {
    expect(compareDates('2025-01-01', '2025-01-02')).toBe(-1);
    expect(compareDates('2025-01-02', '2025-01-01')).toBe(1);
    expect(compareDates('2025-01-01', '2025-01-01')).toBe(0);
  });

  it('picks the ends of a set', () => {
    const dates = ['2025-03-01', '2025-01-15', '2025-02-20'];
    expect(earliest(dates)).toBe('2025-01-15');
    expect(latest(dates)).toBe('2025-03-01');
  });

  it('refuses an empty set', () => {
    expect(() => earliest([])).toThrow(/no dates given/);
    expect(() => latest([])).toThrow(/no dates given/);
  });
});

describe('weekdays', () => {
  it('knows the day of week', () => {
    expect(dayOfWeek('2025-02-14')).toBe(5);
    expect(dayOfWeek('2025-02-16')).toBe(0);
  });

  it('flags weekends', () => {
    expect(isWeekend('2025-02-15')).toBe(true);
    expect(isWeekend('2025-02-16')).toBe(true);
    expect(isWeekend('2025-02-14')).toBe(false);
  });
});

describe('seasons', () => {
  it('rolls over on the first of November', () => {
    expect(seasonOf('2024-10-31')).toBe(2024);
    expect(seasonOf('2024-11-01')).toBe(2025);
    expect(seasonOf('2025-02-14')).toBe(2025);
  });

  it('reports the bounds of a season', () => {
    expect(seasonBounds(2025)).toEqual({ start: '2024-11-01', end: '2025-10-31' });
  });

  it('bounds and membership agree at both ends', () => {
    const { start, end } = seasonBounds(2025);
    expect(seasonOf(start)).toBe(2025);
    expect(seasonOf(end)).toBe(2025);
    expect(seasonOf(addDays(start, -1))).toBe(2024);
    expect(seasonOf(addDays(end, 1))).toBe(2026);
  });

  it('refuses a season that is not a year', () => {
    expect(() => seasonBounds(2025.5)).toThrow(/whole year/);
  });
});

describe('monthName', () => {
  it('names both ends of the year', () => {
    expect(monthName('2025-01-09')).toBe('January');
    expect(monthName('2025-12-09')).toBe('December');
  });
});

describe('eachDay', () => {
  it('includes both ends', () => {
    expect(eachDay('2025-02-27', '2025-03-02')).toEqual([
      '2025-02-27',
      '2025-02-28',
      '2025-03-01',
      '2025-03-02',
    ]);
  });

  it('returns a single day for a range of one', () => {
    expect(eachDay('2025-02-27', '2025-02-27')).toEqual(['2025-02-27']);
  });

  it('refuses a backwards range', () => {
    expect(() => eachDay('2025-03-02', '2025-02-27')).toThrow(/runs backwards/);
  });
});

describe('clocks', () => {
  it('a fixed clock always says the same day', () => {
    const clock = fixedClock('2025-02-14');
    expect(clock.today()).toBe('2025-02-14');
    expect(clock.today()).toBe('2025-02-14');
    expect(clock.now()).toBe('2025-02-14T12:00:00Z');
  });

  it('a fixed clock takes a time of day', () => {
    expect(fixedClock('2025-02-14', '06:30:00').now()).toBe('2025-02-14T06:30:00Z');
  });

  it('a fixed clock validates its date', () => {
    expect(() => fixedClock('nope')).toThrow(/clock date/);
  });

  it('the system clock returns a parseable day', () => {
    const clock = systemClock();
    expect(parseDate(clock.today())).toBe(clock.today());
    expect(clock.now().startsWith(clock.today())).toBe(true);
  });
});
