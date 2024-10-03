import { describe, it, expect } from 'vitest';
import { ROUNDING_MODES, round, roundTo } from '../../src/core/rounding.js';

describe('round', () => {
  it('rounds half away from zero by default', () => {
    expect(round(2.5)).toBe(3);
    expect(round(-2.5)).toBe(-3);
    expect(round(2.4)).toBe(2);
  });

  it('rounds half to even when asked', () => {
    expect(round(2.5, 'half-even')).toBe(2);
    expect(round(3.5, 'half-even')).toBe(4);
    expect(round(-2.5, 'half-even')).toBe(-2);
  });

  it('truncates toward zero on down', () => {
    expect(round(2.9, 'down')).toBe(2);
    expect(round(-2.9, 'down')).toBe(-2);
  });

  it('moves away from zero on up', () => {
    expect(round(2.1, 'up')).toBe(3);
    expect(round(-2.1, 'up')).toBe(-3);
  });

  it('leaves a whole number alone in every mode', () => {
    for (const mode of ROUNDING_MODES) {
      expect(round(7, mode)).toBe(7);
      expect(round(-7, mode)).toBe(-7);
    }
  });

  it('names the modes it knows when given a bad one', () => {
    expect(() => round(1, 'banker')).toThrow(/unknown rounding mode banker/);
  });

  it('refuses a value that is not finite', () => {
    expect(() => round(NaN)).toThrow(/not finite/);
    expect(() => round(Infinity)).toThrow(/not finite/);
  });
});

describe('roundTo', () => {
  it('rounds to a number of places', () => {
    expect(roundTo(7.08333, 2)).toBe(7.08);
    expect(roundTo(7.08533, 2)).toBe(7.09);
  });

  it('rounds to whole numbers at zero places', () => {
    expect(roundTo(7.6, 0)).toBe(8);
  });

  it('takes a mode', () => {
    expect(roundTo(7.089, 2, 'down')).toBe(7.08);
    expect(roundTo(7.081, 2, 'up')).toBe(7.09);
  });

  it('refuses a place count outside what any report uses', () => {
    expect(() => roundTo(1, -1)).toThrow(/whole number from 0 to 6/);
    expect(() => roundTo(1, 7)).toThrow(/whole number from 0 to 6/);
    expect(() => roundTo(1, 1.5)).toThrow(/whole number from 0 to 6/);
  });
});
