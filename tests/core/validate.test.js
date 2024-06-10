import { describe, it, expect } from 'vitest';
import {
  check,
  requireString,
  requireNumber,
  requireInteger,
  requireOneOf,
  requireArray,
  requireObject,
  rejectUnknownKeys,
  optional,
} from '../../src/core/validate.js';
import { ValidationError } from '../../src/core/errors.js';

describe('check', () => {
  it('passes a true condition through', () => {
    expect(check(true, 'never seen')).toBe(true);
  });

  it('throws with the details attached', () => {
    try {
      check(false, 'yard is full', { yard: 'YD-3', capacity: 48 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.details).toEqual({ yard: 'YD-3', capacity: 48 });
    }
  });
});

describe('requireString', () => {
  it('trims and returns', () => {
    expect(requireString('  almonds  ', 'crop')).toBe('almonds');
  });

  it('rejects a non string', () => {
    expect(() => requireString(7, 'crop')).toThrow(/crop must be a string/);
  });

  it('rejects a blank string because trimming makes it empty', () => {
    expect(() => requireString('   ', 'crop')).toThrow(/at least 1 characters/);
  });

  it('honours a longer minimum', () => {
    expect(() => requireString('ab', 'brand', { min: 4 })).toThrow(/at least 4/);
  });

  it('honours the maximum', () => {
    expect(() => requireString('x'.repeat(9), 'brand', { max: 8 })).toThrow(
      /at most 8/
    );
  });
});

describe('requireNumber', () => {
  it('accepts a plain number', () => {
    expect(requireNumber(8.5, 'frames')).toBe(8.5);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => requireNumber(NaN, 'frames')).toThrow(/finite/);
    expect(() => requireNumber(Infinity, 'frames')).toThrow(/finite/);
  });

  it('enforces both bounds', () => {
    expect(() => requireNumber(-1, 'frames', { min: 0 })).toThrow(/at least 0/);
    expect(() => requireNumber(30, 'frames', { max: 20 })).toThrow(/at most 20/);
  });

  it('accepts a value sitting exactly on a bound', () => {
    expect(requireNumber(0, 'frames', { min: 0, max: 20 })).toBe(0);
    expect(requireNumber(20, 'frames', { min: 0, max: 20 })).toBe(20);
  });
});

describe('requireInteger', () => {
  it('rejects a fraction', () => {
    expect(() => requireInteger(3.5, 'hives')).toThrow(/whole number/);
  });

  it('keeps the range checks', () => {
    expect(() => requireInteger(0, 'hives', { min: 1 })).toThrow(/at least 1/);
  });
});

describe('requireOneOf', () => {
  it('accepts a member', () => {
    expect(requireOneOf('almond', 'crop', ['almond', 'cherry'])).toBe('almond');
  });

  it('lists the allowed values when it refuses', () => {
    expect(() => requireOneOf('kiwi', 'crop', ['almond', 'cherry'])).toThrow(
      /must be one of almond, cherry/
    );
  });
});

describe('requireArray', () => {
  it('checks the length window', () => {
    expect(() => requireArray([], 'drops', { min: 1 })).toThrow(/at least 1 entries/);
    expect(() => requireArray([1, 2, 3], 'drops', { max: 2 })).toThrow(/at most 2/);
  });

  it('rejects a non array', () => {
    expect(() => requireArray({}, 'drops')).toThrow(/must be an array/);
  });
});

describe('requireObject', () => {
  it('rejects null and arrays', () => {
    expect(() => requireObject(null, 'terms')).toThrow(/must be an object/);
    expect(() => requireObject([], 'terms')).toThrow(/must be an object/);
  });

  it('returns the object', () => {
    const value = { rate: 200 };
    expect(requireObject(value, 'terms')).toBe(value);
  });
});

describe('rejectUnknownKeys', () => {
  it('names the offending keys in sorted order', () => {
    expect(() => rejectUnknownKeys({ b: 1, a: 2 }, 'terms', [])).toThrow(
      /unknown keys: a, b/
    );
  });

  it('allows a known subset', () => {
    const value = { rate: 1 };
    expect(rejectUnknownKeys(value, 'terms', ['rate', 'crop'])).toBe(value);
  });
});

describe('optional', () => {
  it('skips undefined and null', () => {
    expect(optional(undefined, () => 1)).toBeUndefined();
    expect(optional(null, () => 1)).toBeUndefined();
  });

  it('applies the parser otherwise', () => {
    expect(optional(' x ', (v) => requireString(v, 'x'))).toBe('x');
  });
});
