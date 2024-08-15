import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORAGE_RADIUS_MILES,
  distanceMiles,
  roundMiles,
  forageOverlap,
  yardsWithin,
  competingColonies,
  stockingDensity,
  separationBreaches,
  centroid,
} from '../../src/apiary/geo.js';

const home = { latitude: 36.5, longitude: -119.4 };
const northOf = (miles) => ({
  latitude: 36.5 + miles / 69.0972,
  longitude: -119.4,
});

describe('distanceMiles', () => {
  it('is zero at the same point', () => {
    expect(distanceMiles(home, home)).toBe(0);
  });

  it('makes one degree of latitude about sixty nine miles', () => {
    expect(distanceMiles(home, { latitude: 37.5, longitude: -119.4 })).toBeCloseTo(
      69.1,
      1
    );
  });

  it('is symmetric', () => {
    const there = northOf(4);
    expect(distanceMiles(home, there)).toBeCloseTo(distanceMiles(there, home), 9);
  });

  it('measures a short hop accurately', () => {
    expect(distanceMiles(home, northOf(2))).toBeCloseTo(2, 3);
  });

  it('refuses a point off the planet', () => {
    expect(() => distanceMiles(home, { latitude: 91, longitude: 0 })).toThrow(
      /at most 90/
    );
  });
});

describe('roundMiles', () => {
  it('rounds to two places by default', () => {
    expect(roundMiles(2.34567)).toBe(2.35);
  });

  it('takes another precision', () => {
    expect(roundMiles(2.34567, 1)).toBe(2.3);
  });
});

describe('forageOverlap', () => {
  it('is whole at the same spot', () => {
    expect(forageOverlap(home, home)).toBe(1);
  });

  it('is nothing at twice the radius', () => {
    expect(forageOverlap(home, northOf(4))).toBe(0);
  });

  it('reports the share to six places', () => {
    const share = forageOverlap(home, northOf(1.37));
    expect(share).toBe(Math.round(share * 1e6) / 1e6);
  });

  it('is nothing well beyond the radius', () => {
    expect(forageOverlap(home, northOf(9))).toBe(0);
  });

  it('is the lens area at one radius apart, not half', () => {
    expect(forageOverlap(home, northOf(2))).toBeCloseTo(0.391, 3);
  });

  it('falls as the yards move apart', () => {
    const near = forageOverlap(home, northOf(1));
    const far = forageOverlap(home, northOf(3));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('takes a tighter radius', () => {
    expect(forageOverlap(home, northOf(2), 1)).toBe(0);
  });

  it('refuses a radius outside what a bee flies', () => {
    expect(() => forageOverlap(home, home, 0)).toThrow(/at least 0.1/);
    expect(() => forageOverlap(home, home, 40)).toThrow(/at most 20/);
  });

  it('uses two miles when no radius is given', () => {
    expect(DEFAULT_FORAGE_RADIUS_MILES).toBe(2);
    expect(forageOverlap(home, northOf(3))).toBe(forageOverlap(home, northOf(3), 2));
  });
});

describe('yardsWithin', () => {
  const yards = [
    { id: 'YD-2025-0001', location: northOf(5) },
    { id: 'YD-2025-0002', location: northOf(1) },
    { id: 'YD-2025-0003', location: northOf(3) },
  ];

  it('keeps only what is inside and sorts nearest first', () => {
    const near = yardsWithin(yards, home, 4);
    expect(near.map((entry) => entry.yard.id)).toEqual([
      'YD-2025-0002',
      'YD-2025-0003',
    ]);
  });

  it('reports the rounded distance', () => {
    expect(yardsWithin(yards, home, 4)[0].miles).toBe(1);
  });

  it('includes a yard sitting exactly on the boundary', () => {
    expect(yardsWithin(yards, home, 3)).toHaveLength(2);
  });

  it('breaks a distance tie on the identifier', () => {
    const tied = [
      { id: 'YD-2025-0009', location: northOf(1) },
      { id: 'YD-2025-0002', location: northOf(1) },
    ];
    expect(yardsWithin(tied, home, 2).map((entry) => entry.yard.id)).toEqual([
      'YD-2025-0002',
      'YD-2025-0009',
    ]);
  });

  it('is empty when nothing is close', () => {
    expect(yardsWithin(yards, home, 0.5)).toEqual([]);
  });
});

describe('competingColonies', () => {
  it('counts a yard on the spot in full', () => {
    expect(competingColonies([{ location: home, colonies: 48 }], home)).toBe(48);
  });

  it('ignores a yard beyond two radii', () => {
    expect(competingColonies([{ location: northOf(5), colonies: 48 }], home)).toBe(0);
  });

  it('weights a partly overlapping yard by its lens', () => {
    expect(competingColonies([{ location: northOf(2), colonies: 100 }], home)).toBe(39);
  });

  it('adds several yards together', () => {
    const placements = [
      { location: home, colonies: 20 },
      { location: northOf(2), colonies: 100 },
      { location: northOf(6), colonies: 500 },
    ];
    expect(competingColonies(placements, home)).toBe(59);
  });

  it('is zero when nothing is placed', () => {
    expect(competingColonies([], home)).toBe(0);
  });
});

describe('stockingDensity', () => {
  it('spreads colonies over the forage circle', () => {
    expect(stockingDensity(48)).toBeCloseTo(3.82, 2);
  });

  it('rises as the radius tightens', () => {
    expect(stockingDensity(48, 1)).toBeGreaterThan(stockingDensity(48, 2));
  });

  it('is zero with no colonies', () => {
    expect(stockingDensity(0)).toBe(0);
  });
});

describe('separationBreaches', () => {
  const yards = [
    { id: 'YD-2025-0001', location: home },
    { id: 'YD-2025-0002', location: northOf(0.4) },
    { id: 'YD-2025-0003', location: northOf(6) },
  ];

  it('names the pair that is too close', () => {
    const breaches = separationBreaches(yards, 1);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].yards).toEqual(['YD-2025-0001', 'YD-2025-0002']);
    expect(breaches[0].miles).toBe(0.4);
  });

  it('is empty when the separation is met', () => {
    expect(separationBreaches(yards, 0.25)).toEqual([]);
  });

  it('is empty with fewer than two yards', () => {
    expect(separationBreaches([yards[0]], 10)).toEqual([]);
    expect(separationBreaches([], 10)).toEqual([]);
  });

  it('reports every offending pair, not just the first', () => {
    expect(separationBreaches(yards, 10)).toHaveLength(3);
  });
});

describe('centroid', () => {
  it('averages the points', () => {
    const middle = centroid([
      { latitude: 36, longitude: -120 },
      { latitude: 38, longitude: -118 },
    ]);
    expect(middle).toEqual({ latitude: 37, longitude: -119 });
  });

  it('refuses an empty set', () => {
    expect(() => centroid([])).toThrow(/centroid of no points/);
  });
});
