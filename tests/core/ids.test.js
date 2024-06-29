import { describe, it, expect } from 'vitest';
import {
  idPrefix,
  makeId,
  parseId,
  isId,
  nextSequence,
  issueId,
  idSortKey,
} from '../../src/core/ids.js';

describe('idPrefix', () => {
  it('knows the kinds on the paperwork', () => {
    expect(idPrefix('contract')).toBe('CT');
    expect(idPrefix('load')).toBe('LD');
    expect(idPrefix('colony')).toBe('CY');
  });

  it('lists what it knows when asked for something else', () => {
    expect(() => idPrefix('truck')).toThrow(/no identifier prefix for truck/);
  });

  it('issues a distinct prefix for every kind', () => {
    const kinds = [
      'yard',
      'colony',
      'pallet',
      'contract',
      'block',
      'drop',
      'load',
      'grading',
      'treatment',
      'lot',
      'invoice',
      'inspection',
    ];
    const prefixes = kinds.map(idPrefix);
    expect(new Set(prefixes).size).toBe(kinds.length);
  });
});

describe('makeId', () => {
  it('pads the sequence to four digits', () => {
    expect(makeId('contract', 2025, 7)).toBe('CT-2025-0007');
    expect(makeId('load', 2025, 143)).toBe('LD-2025-0143');
    expect(makeId('yard', 2024, 9999)).toBe('YD-2024-9999');
  });

  it('refuses a season that is not a four digit year', () => {
    expect(() => makeId('contract', 25, 1)).toThrow(/four digit year/);
    expect(() => makeId('contract', 2025.5, 1)).toThrow(/four digit year/);
  });

  it('refuses a sequence below one', () => {
    expect(() => makeId('contract', 2025, 0)).toThrow(/positive whole number/);
  });

  it('refuses a sequence that will not fit', () => {
    expect(() => makeId('contract', 2025, 10000)).toThrow(
      /does not fit in four digits/
    );
  });
});

describe('parseId', () => {
  it('takes an identifier apart', () => {
    expect(parseId('CT-2025-0007')).toEqual({
      kind: 'contract',
      season: 2025,
      sequence: 7,
      id: 'CT-2025-0007',
    });
  });

  it('trims before parsing', () => {
    expect(parseId('  LD-2025-0143  ').sequence).toBe(143);
  });

  it('refuses a lowercase or short identifier', () => {
    expect(() => parseId('ct-2025-0007')).toThrow(/office format/);
    expect(() => parseId('CT-2025-7')).toThrow(/office format/);
  });

  it('refuses a prefix nobody issues', () => {
    expect(() => parseId('ZZ-2025-0001')).toThrow(/unknown identifier prefix ZZ/);
  });

  it('checks the kind when one is expected', () => {
    expect(parseId('CT-2025-0007', 'contract').kind).toBe('contract');
    expect(() => parseId('CT-2025-0007', 'load')).toThrow(/expected a load identifier/);
  });

  it('refuses a non string', () => {
    expect(() => parseId(20250007)).toThrow(/must be a string/);
  });
});

describe('isId', () => {
  it('answers without throwing', () => {
    expect(isId('CT-2025-0007')).toBe(true);
    expect(isId('CT-2025-0007', 'contract')).toBe(true);
    expect(isId('CT-2025-0007', 'load')).toBe(false);
    expect(isId('nonsense')).toBe(false);
    expect(isId(undefined)).toBe(false);
  });
});

describe('nextSequence', () => {
  it('starts at one on an empty season', () => {
    expect(nextSequence([], 'contract', 2025)).toBe(1);
  });

  it('ignores other kinds and other seasons', () => {
    const existing = ['CT-2024-0099', 'LD-2025-0400', 'CT-2025-0003'];
    expect(nextSequence(existing, 'contract', 2025)).toBe(4);
  });

  it('does not reuse a gap left by a torn up contract', () => {
    expect(nextSequence(['CT-2025-0001', 'CT-2025-0005'], 'contract', 2025)).toBe(6);
  });

  it('skips anything that is not an identifier at all', () => {
    expect(nextSequence(['scribbled note', 'CT-2025-0002'], 'contract', 2025)).toBe(3);
  });
});

describe('issueId', () => {
  it('hands out the next one in the book', () => {
    const issued = ['CT-2025-0001', 'CT-2025-0002'];
    const next = issueId(issued, 'contract', 2025);
    expect(next).toBe('CT-2025-0003');
    expect(issueId([...issued, next], 'contract', 2025)).toBe('CT-2025-0004');
  });
});

describe('idSortKey', () => {
  it('sorts by sequence rather than by string', () => {
    const ids = ['CT-2025-0100', 'CT-2025-0009', 'CT-2025-0021'];
    const sorted = [...ids].sort((a, b) => idSortKey(a).localeCompare(idSortKey(b)));
    expect(sorted).toEqual(['CT-2025-0009', 'CT-2025-0021', 'CT-2025-0100']);
  });

  it('keeps seasons apart', () => {
    expect(idSortKey('CT-2024-0100') < idSortKey('CT-2025-0009')).toBe(true);
  });
});
