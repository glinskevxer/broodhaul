import { describe, it, expect } from 'vitest';
import {
  allocate,
  sumMoney,
  basisPoints,
  multiplyMoney,
  parseMoney,
  formatMoney,
} from '../../src/core/money.js';
import { round, roundTo } from '../../src/core/rounding.js';
import { addDays, diffDays, seasonOf, seasonBounds } from '../../src/core/dates.js';
import {
  makeSpan,
  mergeSpans,
  subtractSpan,
  spanDays,
  spansOverlap,
} from '../../src/core/span.js';
import { makeQuantity, quantityValue, sumQuantities } from '../../src/core/quantity.js';
import { splitIntoDrops } from '../../src/placement/plan.js';
import { instalments, scheduleTotal } from '../../src/contracts/deposit.js';
import { aContract } from '../helpers/contracts.js';

/**
 * The rules that have to hold for every input, not just the ones a test
 * happened to pick.
 *
 * These are not random: a seeded generator would make a failure impossible to
 * reproduce from the output alone, and this codebase has to be able to say
 * exactly which numbers broke it. They walk fixed, wide ranges instead, which
 * is slower and completely repeatable.
 */

const integers = (from, to, step = 1) => {
  const values = [];
  for (let at = from; at <= to; at += step) values.push(at);
  return values;
};

describe('allocation never loses a cent', () => {
  it('adds back to the total for every split it is given', () => {
    for (const total of [0, 1, 7, 99, 100, 12345, 7728500, -10000]) {
      for (const weights of [
        [1],
        [1, 1],
        [1, 2],
        [1, 1, 1],
        [1, 2, 4],
        [0, 1, 2],
        [3, 3, 3, 1],
      ]) {
        expect(sumMoney(allocate(total, weights)), `${total} over ${weights}`).toBe(
          total
        );
      }
    }
  });

  it('gives every part the same sign as the total', () => {
    for (const total of [10000, -10000]) {
      for (const part of allocate(total, [1, 2, 4])) {
        expect(Math.sign(part) === Math.sign(total) || part === 0).toBe(true);
      }
    }
  });

  it('never differs between two parts by more than a cent per unit of weight', () => {
    const parts = allocate(10000, [1, 1, 1]);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });
});

describe('money round trips', () => {
  it('formats and parses back to the same cents', () => {
    for (const cents of integers(-500, 500).concat([12345, 7728500, -7728500])) {
      expect(parseMoney(formatMoney(cents, { grouped: false, symbol: '' }))).toBe(
        cents
      );
    }
  });

  it('never rounds a basis point charge above the amount', () => {
    for (const cents of [1, 99, 12345, 7728500]) {
      for (const bps of [0, 1, 750, 2000, 10000]) {
        expect(basisPoints(cents, bps)).toBeLessThanOrEqual(cents);
      }
    }
  });

  it('multiplies by one without moving', () => {
    for (const cents of [0, 1, 99, 12345, -500]) {
      expect(multiplyMoney(cents, 1)).toBe(cents);
    }
  });
});

describe('rounding', () => {
  it('never moves a value by more than half a unit', () => {
    for (const value of integers(-50, 50).map((at) => at / 4)) {
      expect(Math.abs(round(value) - value)).toBeLessThanOrEqual(0.5);
    }
  });

  it('rounds to places without drifting', () => {
    for (const value of integers(0, 100).map((at) => at / 7)) {
      expect(Math.abs(roundTo(value, 2) - value)).toBeLessThanOrEqual(0.005);
    }
  });
});

describe('dates', () => {
  it('adds and subtracts back to the same day', () => {
    for (const days of integers(-400, 400, 17)) {
      expect(addDays(addDays('2025-06-15', days), -days)).toBe('2025-06-15');
    }
  });

  it('measures what it added', () => {
    for (const days of integers(-400, 400, 13)) {
      expect(diffDays('2025-06-15', addDays('2025-06-15', days))).toBe(days);
    }
  });

  it('puts every day of a season inside that season', () => {
    for (const season of [2024, 2025, 2026]) {
      const bounds = seasonBounds(season);
      for (let at = 0; at <= diffDays(bounds.start, bounds.end); at += 29) {
        expect(seasonOf(addDays(bounds.start, at))).toBe(season);
      }
    }
  });
});

describe('spans', () => {
  const spans = [
    makeSpan('2025-01-01', '2025-01-31'),
    makeSpan('2025-01-15', '2025-02-15'),
    makeSpan('2025-03-01', '2025-03-02'),
    makeSpan('2025-02-16', '2025-02-28'),
  ];

  it('merges into spans that no longer overlap', () => {
    const merged = mergeSpans(spans);
    for (let left = 0; left < merged.length; left += 1) {
      for (let right = left + 1; right < merged.length; right += 1) {
        expect(spansOverlap(merged[left], merged[right])).toBe(false);
      }
    }
  });

  it('keeps every day it started with', () => {
    const before = spanDays(makeSpan('2025-01-01', '2025-03-02'));
    const merged = mergeSpans(spans);
    const covered = merged.reduce((total, span) => total + spanDays(span), 0);
    expect(covered).toBeLessThanOrEqual(before);
    expect(covered).toBeGreaterThan(0);
  });

  it('subtracts to pieces that add back to what is left', () => {
    const span = makeSpan('2025-01-01', '2025-01-31');
    for (const cut of [
      makeSpan('2025-01-10', '2025-01-12'),
      makeSpan('2024-12-01', '2025-01-05'),
      makeSpan('2025-01-25', '2025-02-10'),
      makeSpan('2025-03-01', '2025-03-02'),
    ]) {
      const pieces = subtractSpan(span, cut);
      const days = pieces.reduce((total, piece) => total + spanDays(piece), 0);
      expect(days).toBeLessThanOrEqual(spanDays(span));
    }
  });
});

describe('quantities', () => {
  it('total to the sum of their values', () => {
    for (const places of [0, 1, 2]) {
      const values = [1, 2, 3.5, 10].filter((value) =>
        Number.isInteger(value * 10 ** places)
      );
      const total = sumQuantities(
        values.map((value) => makeQuantity(value, places, 'frames'))
      );
      expect(quantityValue(total)).toBeCloseTo(
        values.reduce((sum, value) => sum + value, 0),
        6
      );
    }
  });
});

describe('the plan and the schedule', () => {
  it('always splits the hives it was given', () => {
    for (const hives of integers(0, 400, 37)) {
      for (const count of [1, 2, 3, 5, 8]) {
        if (hives === 0) continue;
        const drops = splitIntoDrops(hives, count);
        expect(drops.reduce((sum, value) => sum + value, 0)).toBe(hives);
      }
    }
  });

  it('always instals the whole contract value', () => {
    const contract = aContract();
    for (const schedule of ['on removal', 'half and half', 'thirds']) {
      for (const depositBps of [0, 1000, 2500, 5000]) {
        expect(scheduleTotal(instalments(contract, schedule, { depositBps }))).toBe(
          scheduleTotal(instalments(contract, 'on removal'))
        );
      }
    }
  });
});
