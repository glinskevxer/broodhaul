import { ValidationError } from './errors.js';
import { round } from './rounding.js';

/**
 * Money is integer cents everywhere in this codebase. Pollination rent is
 * quoted per hive and settled per contract, so a grower statement adds a few
 * hundred line items together and then splits the total between the operation
 * and a broker. Floating point loses that argument, and the grower is the one
 * who notices.
 */

const CENTS_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function parseMoney(text, field = 'amount') {
  if (typeof text === 'number') {
    if (!Number.isInteger(text)) {
      throw new ValidationError(`${field} given as a number must be whole cents`, {
        field,
        got: text,
      });
    }
    return text;
  }
  if (typeof text !== 'string') {
    throw new ValidationError(`${field} must be a string or whole cents`, { field });
  }
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!CENTS_PATTERN.test(cleaned)) {
    throw new ValidationError(`${field} is not an amount: ${text}`, {
      field,
      got: text,
    });
  }
  const negative = cleaned.startsWith('-');
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function formatMoney(cents, { symbol = '$', grouped = true } = {}) {
  if (!Number.isInteger(cents)) {
    throw new ValidationError('money must be whole cents', { got: cents });
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100));
  const fraction = String(abs % 100).padStart(2, '0');
  const grouping = grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  return `${negative ? '-' : ''}${symbol}${grouping}.${fraction}`;
}

export function multiplyMoney(cents, factor, mode = 'half-up') {
  if (!Number.isFinite(factor)) {
    throw new ValidationError('factor must be finite', { factor });
  }
  return round(cents * factor, mode);
}

export function divideMoney(cents, divisor, mode = 'half-up') {
  if (divisor === 0) throw new ValidationError('cannot divide money by zero', {});
  return round(cents / divisor, mode);
}

/** Basis points, because contract commissions are quoted that way. */
export function basisPoints(cents, bps, mode = 'half-up') {
  return round((cents * bps) / 10000, mode);
}

/**
 * Split `cents` across `weights` so the parts sum to the original exactly.
 * Largest remainder: every part gets its floor, then the leftover pennies go
 * to the parts with the biggest fractional loss, ties broken by position so
 * two identical runs produce identical statements.
 */
export function allocate(cents, weights) {
  if (weights.length === 0) {
    throw new ValidationError('cannot allocate across no weights', {});
  }
  if (weights.some((w) => w < 0)) {
    throw new ValidationError('allocation weights cannot be negative', { weights });
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) {
    throw new ValidationError('allocation weights sum to zero', { weights });
  }
  const exact = weights.map((w) => (cents * w) / total);
  const parts = exact.map((value) => Math.trunc(value));
  let remainder = cents - parts.reduce((sum, part) => sum + part, 0);
  const step = remainder >= 0 ? 1 : -1;
  const order = exact
    .map((value, index) => ({ index, loss: Math.abs(value - parts[index]) }))
    .sort((a, b) => b.loss - a.loss || a.index - b.index);
  let cursor = 0;
  while (remainder !== 0) {
    parts[order[cursor % order.length].index] += step;
    remainder -= step;
    cursor += 1;
  }
  return parts;
}

export function sumMoney(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
