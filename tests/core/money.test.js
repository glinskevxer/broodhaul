import { describe, it, expect } from 'vitest';
import {
  parseMoney,
  formatMoney,
  roundCents,
  multiplyMoney,
  divideMoney,
  basisPoints,
  allocate,
  sumMoney,
} from '../../src/core/money.js';

describe('parseMoney', () => {
  it('reads plain decimals', () => {
    expect(parseMoney('205.00')).toBe(20500);
    expect(parseMoney('205')).toBe(20500);
    expect(parseMoney('0.07')).toBe(7);
  });

  it('reads a single decimal place as tenths', () => {
    expect(parseMoney('12.5')).toBe(1250);
  });

  it('strips a dollar sign and thousands separators', () => {
    expect(parseMoney('$1,240.50')).toBe(124050);
  });

  it('handles negatives, which is how a deduction arrives', () => {
    expect(parseMoney('-18.25')).toBe(-1825);
  });

  it('passes whole cents through', () => {
    expect(parseMoney(20500)).toBe(20500);
  });

  it('refuses cents given as a fraction', () => {
    expect(() => parseMoney(205.5)).toThrow(/whole cents/);
  });

  it('refuses three decimal places', () => {
    expect(() => parseMoney('1.005')).toThrow(/is not an amount/);
  });

  it('refuses junk', () => {
    expect(() => parseMoney('two hundred')).toThrow(/is not an amount/);
    expect(() => parseMoney(null)).toThrow(/must be a string/);
  });
});

describe('formatMoney', () => {
  it('groups thousands', () => {
    expect(formatMoney(124050)).toBe('$1,240.50');
    expect(formatMoney(123456789)).toBe('$1,234,567.89');
  });

  it('pads the cents', () => {
    expect(formatMoney(7)).toBe('$0.07');
    expect(formatMoney(70)).toBe('$0.70');
  });

  it('puts the sign before the symbol', () => {
    expect(formatMoney(-1825)).toBe('-$18.25');
  });

  it('can drop the grouping and the symbol', () => {
    expect(formatMoney(124050, { grouped: false, symbol: '' })).toBe('1240.50');
  });

  it('refuses a fractional cent', () => {
    expect(() => formatMoney(10.5)).toThrow(/whole cents/);
  });
});

describe('roundCents', () => {
  it('rounds half away from zero by default', () => {
    expect(roundCents(2.5)).toBe(3);
    expect(roundCents(-2.5)).toBe(-3);
  });

  it('rounds half to even when asked', () => {
    expect(roundCents(2.5, 'half-even')).toBe(2);
    expect(roundCents(3.5, 'half-even')).toBe(4);
    expect(roundCents(2.4, 'half-even')).toBe(2);
    expect(roundCents(2.6, 'half-even')).toBe(3);
  });

  it('truncates toward zero on down', () => {
    expect(roundCents(2.9, 'down')).toBe(2);
    expect(roundCents(-2.9, 'down')).toBe(-2);
  });

  it('rounds away from zero on up', () => {
    expect(roundCents(2.1, 'up')).toBe(3);
    expect(roundCents(-2.1, 'up')).toBe(-3);
  });

  it('names the modes it knows when given a bad one', () => {
    expect(() => roundCents(1, 'banker')).toThrow(/unknown rounding mode/);
  });
});

describe('multiplyMoney', () => {
  it('applies a per hive rate to a hive count', () => {
    expect(multiplyMoney(20500, 416)).toBe(8528000);
  });

  it('rounds a fractional result', () => {
    expect(multiplyMoney(999, 0.5)).toBe(500);
    expect(multiplyMoney(999, 0.5, 'down')).toBe(499);
  });

  it('refuses a non finite factor', () => {
    expect(() => multiplyMoney(100, NaN)).toThrow(/factor must be finite/);
  });
});

describe('divideMoney', () => {
  it('divides and rounds', () => {
    expect(divideMoney(10000, 3)).toBe(3333);
  });

  it('refuses zero', () => {
    expect(() => divideMoney(100, 0)).toThrow(/divide money by zero/);
  });
});

describe('basisPoints', () => {
  it('takes a broker commission', () => {
    expect(basisPoints(8528000, 750)).toBe(639600);
  });

  it('rounds to the cent', () => {
    expect(basisPoints(101, 500)).toBe(5);
  });
});

describe('allocate', () => {
  it('splits evenly when it can', () => {
    expect(allocate(30000, [1, 1, 1])).toEqual([10000, 10000, 10000]);
  });

  it('never loses or invents a penny', () => {
    const parts = allocate(10000, [1, 1, 1]);
    expect(sumMoney(parts)).toBe(10000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it('gives the leftover to the biggest fractional loser first', () => {
    const parts = allocate(1000, [1, 2, 4]);
    expect(sumMoney(parts)).toBe(1000);
    expect(parts).toEqual([143, 286, 571]);
  });

  it('handles a zero weight without giving it money', () => {
    expect(allocate(900, [0, 1, 2])).toEqual([0, 300, 600]);
  });

  it('works on a negative total', () => {
    const parts = allocate(-10000, [1, 1, 1]);
    expect(sumMoney(parts)).toBe(-10000);
    expect(parts).toEqual([-3334, -3333, -3333]);
  });

  it('refuses an empty or useless weight set', () => {
    expect(() => allocate(100, [])).toThrow(/across no weights/);
    expect(() => allocate(100, [0, 0])).toThrow(/sum to zero/);
    expect(() => allocate(100, [-1, 2])).toThrow(/cannot be negative/);
  });
});

describe('sumMoney', () => {
  it('adds a statement up', () => {
    expect(sumMoney([20500, -1825, 7])).toBe(18682);
  });

  it('is zero on an empty statement', () => {
    expect(sumMoney([])).toBe(0);
  });
});
