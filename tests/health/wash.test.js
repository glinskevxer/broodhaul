import { describe, it, expect } from 'vitest';
import {
  SAMPLE_SOURCES,
  NOMINAL_BEES,
  SOURCE_FACTORS,
  makeWash,
  infestationRate,
  correctedRate,
  yardRate,
  worstWash,
  washesForYard,
  describeWash,
} from '../../src/health/wash.js';

const base = {
  colonyId: 'CY-2025-0011',
  yardId: 'YD-2025-0004',
  date: '2025-08-14',
  mites: 9,
};

const wash = (overrides = {}) => makeWash({ ...base, ...overrides });

describe('makeWash', () => {
  it('assumes a level half cup when no bee count is given', () => {
    expect(wash().beesSampled).toBe(NOMINAL_BEES);
  });

  it('takes a short scoop', () => {
    expect(wash({ beesSampled: 240 }).beesSampled).toBe(240);
  });

  it('defaults the source to a brood frame', () => {
    expect(wash().source).toBe('brood frame');
  });

  it('takes every source the sheet allows', () => {
    for (const source of SAMPLE_SOURCES) {
      expect(wash({ source }).source).toBe(source);
    }
  });

  it('refuses more mites than bees', () => {
    expect(() => wash({ mites: 400, beesSampled: 300 })).toThrow(
      /more mites than bees/
    );
  });

  it('refuses a scoop nobody takes', () => {
    expect(() => wash({ beesSampled: 20 })).toThrow(/at least 50/);
    expect(() => wash({ beesSampled: 900 })).toThrow(/at most 600/);
  });

  it('accepts a clean wash', () => {
    expect(wash({ mites: 0 }).mites).toBe(0);
  });

  it('refuses an unknown key', () => {
    expect(() => makeWash({ ...base, jar: 'blue' })).toThrow(
      /wash has unknown keys: jar/
    );
  });
});

describe('infestationRate', () => {
  it('is mites per hundred bees', () => {
    expect(infestationRate(wash())).toBe(3);
  });

  it('uses the bee count that was actually in the jar', () => {
    expect(infestationRate(wash({ beesSampled: 240 }))).toBe(3.8);
  });

  it('reports to one place', () => {
    expect(infestationRate(wash({ mites: 7, beesSampled: 300 }))).toBe(2.3);
  });

  it('is nothing on a clean wash', () => {
    expect(infestationRate(wash({ mites: 0 }))).toBe(0);
  });
});

describe('correctedRate', () => {
  it('leaves a brood frame wash alone', () => {
    expect(correctedRate(wash())).toBe(infestationRate(wash()));
  });

  it('lifts an outer frame wash', () => {
    expect(correctedRate(wash({ source: 'outer frame' }))).toBe(3.8);
  });

  it('lifts an entrance sample further', () => {
    expect(correctedRate(wash({ source: 'entrance' }))).toBe(4.2);
  });

  it('has a factor of at least one for every source', () => {
    for (const source of SAMPLE_SOURCES) {
      expect(SOURCE_FACTORS[source]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('yardRate', () => {
  it('averages the corrected rates', () => {
    const washes = [wash({ mites: 9 }), wash({ colonyId: 'CY-2025-0012', mites: 3 })];
    expect(yardRate(washes)).toBe(2);
  });

  it('uses the corrected figure rather than the raw one', () => {
    const washes = [wash({ mites: 9, source: 'entrance' })];
    expect(yardRate(washes)).toBe(4.2);
  });

  it('refuses an empty set', () => {
    expect(() => yardRate([])).toThrow(/cannot average no washes/);
  });
});

describe('worstWash', () => {
  it('finds the highest corrected rate', () => {
    const washes = [
      wash({ colonyId: 'CY-2025-0011', mites: 9 }),
      wash({ colonyId: 'CY-2025-0012', mites: 21 }),
      wash({ colonyId: 'CY-2025-0013', mites: 3 }),
    ];
    expect(worstWash(washes).colonyId).toBe('CY-2025-0012');
  });

  it('lets a corrected rate beat a higher raw one', () => {
    const washes = [
      wash({ colonyId: 'CY-2025-0011', mites: 12 }),
      wash({ colonyId: 'CY-2025-0012', mites: 10, source: 'entrance' }),
    ];
    expect(worstWash(washes).colonyId).toBe('CY-2025-0012');
  });

  it('breaks a tie on the colony identifier', () => {
    const washes = [
      wash({ colonyId: 'CY-2025-0022', mites: 9 }),
      wash({ colonyId: 'CY-2025-0011', mites: 9 }),
    ];
    expect(worstWash(washes).colonyId).toBe('CY-2025-0011');
  });

  it('returns nothing for an empty set', () => {
    expect(worstWash([])).toBeUndefined();
  });
});

describe('washesForYard', () => {
  it('keeps only the yard asked for, sorted by date then colony', () => {
    const washes = [
      wash({ colonyId: 'CY-2025-0013', date: '2025-08-20' }),
      wash({ colonyId: 'CY-2025-0012', yardId: 'YD-2025-0009' }),
      wash({ colonyId: 'CY-2025-0011', date: '2025-08-14' }),
    ];
    const found = washesForYard(washes, 'YD-2025-0004');
    expect(found.map((entry) => entry.colonyId)).toEqual([
      'CY-2025-0011',
      'CY-2025-0013',
    ]);
  });
});

describe('describeWash', () => {
  it('reads like the line in the health book', () => {
    expect(describeWash(wash())).toBe(
      'CY-2025-0011 2025-08-14: 9 of 300, 3 per hundred'
    );
  });

  it('says when the figure was corrected', () => {
    expect(describeWash(wash({ source: 'entrance' }))).toBe(
      'CY-2025-0011 2025-08-14: 9 of 300, 4.2 per hundred (corrected from 3)'
    );
  });
});
