import { describe, it, expect } from 'vitest';
import {
  scaleFactor,
  makeQuantity,
  quantityValue,
  formatQuantity,
  addQuantity,
  subtractQuantity,
  sumQuantities,
  scaleQuantity,
  compareQuantity,
  averageQuantity,
  roundToStep,
} from '../../src/core/quantity.js';

const frames = (value) => makeQuantity(value, 2, 'frames');
const pounds = (value) => makeQuantity(value, 1, 'lb');

describe('scaleFactor', () => {
  it('is a power of ten', () => {
    expect(scaleFactor(0)).toBe(1);
    expect(scaleFactor(2)).toBe(100);
  });

  it('refuses more places than the office ever writes', () => {
    expect(() => scaleFactor(5)).toThrow(/whole number from 0 to 4/);
    expect(() => scaleFactor(-1)).toThrow(/whole number from 0 to 4/);
  });
});

describe('makeQuantity', () => {
  it('scales a value by the places', () => {
    expect(frames(8.25)).toEqual({ scaled: 825, places: 2, unit: 'frames' });
  });

  it('accepts a whole number', () => {
    expect(pounds(640)).toEqual({ scaled: 6400, places: 1, unit: 'lb' });
  });

  it('refuses a value with more precision than the scale holds', () => {
    expect(() => pounds(640.25)).toThrow(/needs more than 1 decimal places/);
  });

  it('refuses a value that is not a number', () => {
    expect(() => frames(NaN)).toThrow(/finite number/);
  });

  it('keeps a negative, which is how a shrink adjustment arrives', () => {
    expect(frames(-1.5).scaled).toBe(-150);
  });
});

describe('quantityValue', () => {
  it('reverses the scaling', () => {
    expect(quantityValue(frames(8.25))).toBe(8.25);
    expect(quantityValue(pounds(-3.4))).toBe(-3.4);
  });
});

describe('formatQuantity', () => {
  it('pads the fraction to the scale', () => {
    expect(formatQuantity(frames(8.5))).toBe('8.50 frames');
    expect(formatQuantity(pounds(640))).toBe('640.0 lb');
  });

  it('can leave the unit off', () => {
    expect(formatQuantity(frames(8.5), { withUnit: false })).toBe('8.50');
  });

  it('puts the sign in front', () => {
    expect(formatQuantity(frames(-1.25))).toBe('-1.25 frames');
  });

  it('prints a whole number scale without a point', () => {
    expect(formatQuantity(makeQuantity(12, 0, 'hives'))).toBe('12 hives');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts at the same scale', () => {
    expect(addQuantity(frames(8.25), frames(1.75))).toEqual(frames(10));
    expect(subtractQuantity(frames(8.25), frames(1.75))).toEqual(frames(6.5));
  });

  it('refuses to mix units', () => {
    expect(() => addQuantity(frames(8), pounds(8))).toThrow(/share a unit and a scale/);
  });

  it('refuses to mix scales even inside one unit', () => {
    const coarse = makeQuantity(8, 1, 'frames');
    expect(() => addQuantity(frames(8), coarse)).toThrow(/share a unit and a scale/);
  });

  it('totals a list', () => {
    expect(sumQuantities([frames(8), frames(6.5), frames(7.25)])).toEqual(
      frames(21.75)
    );
  });

  it('refuses to total nothing', () => {
    expect(() => sumQuantities([])).toThrow(/empty list/);
  });
});

describe('scaleQuantity', () => {
  it('multiplies by a rate', () => {
    expect(scaleQuantity(frames(8), 1.5)).toEqual(frames(12));
  });

  it('rounds at the scale, not before it', () => {
    expect(scaleQuantity(frames(8.33), 3)).toEqual(frames(24.99));
  });

  it('takes a rounding mode', () => {
    expect(scaleQuantity(frames(0.05), 0.5, 'down')).toEqual(frames(0.02));
    expect(scaleQuantity(frames(0.05), 0.5, 'up')).toEqual(frames(0.03));
  });

  it('refuses a factor that is not finite', () => {
    expect(() => scaleQuantity(frames(8), Infinity)).toThrow(/must be finite/);
  });
});

describe('compareQuantity', () => {
  it('orders at the same scale', () => {
    expect(compareQuantity(frames(8), frames(8.25))).toBe(-1);
    expect(compareQuantity(frames(8.25), frames(8))).toBe(1);
    expect(compareQuantity(frames(8), frames(8))).toBe(0);
  });
});

describe('averageQuantity', () => {
  it('averages a grading run', () => {
    expect(averageQuantity([frames(8), frames(6), frames(7)])).toEqual(frames(7));
  });

  it('rounds the mean at the scale', () => {
    expect(averageQuantity([frames(8), frames(7)])).toEqual(frames(7.5));
    expect(averageQuantity([frames(8), frames(7), frames(7)])).toEqual(frames(7.33));
  });

  it('honours a rounding mode', () => {
    expect(averageQuantity([frames(8), frames(7), frames(7)], 'up')).toEqual(
      frames(7.34)
    );
  });
});

describe('roundToStep', () => {
  it('rounds frame counts to the nearest quarter', () => {
    expect(roundToStep(8.3, 0.25)).toBe(8.25);
    expect(roundToStep(8.4, 0.25)).toBe(8.5);
  });

  it('rounds half a step away from zero', () => {
    expect(roundToStep(8.125, 0.25)).toBe(8.25);
  });

  it('takes a rounding mode', () => {
    expect(roundToStep(8.4, 0.25, 'down')).toBe(8.25);
  });

  it('refuses a step of zero', () => {
    expect(() => roundToStep(8, 0)).toThrow(/positive number/);
  });
});
