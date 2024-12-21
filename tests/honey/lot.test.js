import { describe, it, expect } from 'vitest';
import {
  LOT_GRADES,
  makeLot,
  lotDrums,
  lotSpan,
  lotNetLb,
  lotMoisture,
  lotSources,
  lotGrade,
  lotLabel,
  unsaleableDrums,
  lotSummary,
} from '../../src/honey/lot.js';
import { makeDrum } from '../../src/honey/drum.js';

const aDrum = (id, floralSource, overrides = {}) =>
  makeDrum({
    id,
    grossLb: 690,
    tareLb: 48,
    moisturePct: 17.4,
    floralSource,
    filledOn: '2025-05-22',
    ...overrides,
  });

const drums = new Map(
  [
    aDrum('D-1', 'orange blossom'),
    aDrum('D-2', 'orange blossom'),
    aDrum('D-3', 'sage'),
  ].map((drum) => [drum.id, drum])
);

const base = {
  id: 'HL-2025-0004',
  drums: ['D-1', 'D-2'],
  yardIds: ['YD-2025-0004', 'YD-2025-0009'],
  extractedFrom: '2025-05-20',
  extractedTo: '2025-05-22',
};

const lot = (overrides = {}) => makeLot({ ...base, ...overrides }, drums);

describe('makeLot', () => {
  it('sorts and uppercases the drum numbers', () => {
    expect(lot({ drums: ['d-2', 'd-1'] }).drums).toEqual(['D-1', 'D-2']);
  });

  it('drops a repeated yard', () => {
    expect(lot({ yardIds: ['YD-2025-0004', 'YD-2025-0004'] }).yardIds).toEqual([
      'YD-2025-0004',
    ]);
  });

  it('refuses the same drum twice', () => {
    expect(() => lot({ drums: ['D-1', 'D-1'] })).toThrow(/is in the lot twice/);
  });

  it('refuses a drum that is not on file', () => {
    expect(() => lot({ drums: ['D-9'] })).toThrow(
      /names drum D-9, which is not on file/
    );
  });

  it('refuses a run that finished before it started', () => {
    expect(() =>
      lot({ extractedFrom: '2025-05-22', extractedTo: '2025-05-20' })
    ).toThrow(/cannot finish before it started/);
  });

  it('allows a one day run', () => {
    const same = lot({ extractedFrom: '2025-05-22', extractedTo: '2025-05-22' });
    expect(lotSpan(same)).toEqual({ start: '2025-05-22', end: '2025-05-22' });
  });

  it('refuses an empty lot', () => {
    expect(() => lot({ drums: [] })).toThrow(/at least 1 entries/);
  });

  it('refuses an unknown key', () => {
    expect(() => makeLot({ ...base, buyer: 'Sioux' }, drums)).toThrow(
      /lot has unknown keys: buyer/
    );
  });
});

describe('lotDrums, lotNetLb and lotMoisture', () => {
  it('pulls the drums back out', () => {
    expect(lotDrums(lot(), drums).map((drum) => drum.id)).toEqual(['D-1', 'D-2']);
  });

  it('adds the net weight', () => {
    expect(lotNetLb(lot(), drums)).toBe(1284);
  });

  it('averages the moisture', () => {
    expect(lotMoisture(lot(), drums)).toBe(17.4);
  });
});

describe('lotSources', () => {
  it('lists one source for a single source lot', () => {
    expect(lotSources(lot(), drums)).toEqual([{ source: 'orange blossom', lb: 1284 }]);
  });

  it('puts the heavier source first', () => {
    const mixed = lot({ drums: ['D-1', 'D-2', 'D-3'] });
    expect(lotSources(mixed, drums).map((row) => row.source)).toEqual([
      'orange blossom',
      'sage',
    ]);
  });
});

describe('lotGrade and lotLabel', () => {
  it('grades one source as single source', () => {
    expect(lotGrade(lot(), drums)).toBe('single source');
    expect(lotLabel(lot(), drums)).toBe('orange blossom');
  });

  it('grades two sources as a blend named for the heavier', () => {
    const mixed = lot({ drums: ['D-1', 'D-2', 'D-3'] });
    expect(lotGrade(mixed, drums)).toBe('blend');
    expect(lotLabel(mixed, drums)).toBe('orange blossom blend');
  });

  it('grades three sources as wildflower whatever went in', () => {
    const wide = new Map(drums);
    const fourth = aDrum('D-4', 'cotton');
    wide.set(fourth.id, fourth);
    const broad = makeLot({ ...base, drums: ['D-1', 'D-3', 'D-4'] }, wide);
    expect(lotGrade(broad, wide)).toBe('wildflower');
    expect(lotLabel(broad, wide)).toBe('wildflower');
  });

  it('only ever returns a published grade', () => {
    expect(LOT_GRADES).toContain(lotGrade(lot(), drums));
  });
});

describe('unsaleableDrums', () => {
  it('is empty when every drum grades', () => {
    expect(unsaleableDrums(lot(), drums)).toEqual([]);
  });

  it('names the wet drums', () => {
    const wet = new Map(drums);
    const soggy = aDrum('D-5', 'sage', { moisturePct: 19.4 });
    wet.set(soggy.id, soggy);
    const spoiled = makeLot({ ...base, drums: ['D-1', 'D-5'] }, wet);
    expect(unsaleableDrums(spoiled, wet).map((drum) => drum.id)).toEqual(['D-5']);
  });
});

describe('lotSummary', () => {
  it('gives one flat row', () => {
    expect(lotSummary(lot(), drums)).toEqual({
      id: 'HL-2025-0004',
      drums: 2,
      netLb: 1284,
      moisturePct: 17.4,
      grade: 'single source',
      label: 'orange blossom',
      yards: 2,
      unsaleable: 0,
      sources: 1,
    });
  });

  it('counts the sources on a mixed lot', () => {
    const mixed = lot({ drums: ['D-1', 'D-2', 'D-3'] });
    expect(lotSummary(mixed, drums).sources).toBe(2);
  });
});
