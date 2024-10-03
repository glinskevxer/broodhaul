import { ValidationError } from './errors.js';

/**
 * Rounding, in one place.
 *
 * This started life inside the money helpers and then quantity started
 * importing it, which left frame counts depending on a module about cents.
 * The rounding is the shared thing, so it lives on its own and both sides
 * import it.
 *
 * The modes are the ones the office actually asks for. Half up is the default
 * because that is what a settlement statement does. Half even turns up in the
 * honey weights, where the same drum tare gets applied hundreds of times and
 * always rounding the same way walks the total. Down and up are for the places
 * where a rule says to favour one party.
 */

export const ROUNDING_MODES = ['half-up', 'half-even', 'down', 'up'];

const ROUNDERS = {
  'half-up': (value) => Math.sign(value) * Math.round(Math.abs(value)),
  'half-even': (value) => {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (diff > 0.5) return floor + 1;
    if (diff < 0.5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
  },
  down: (value) => Math.trunc(value),
  up: (value) => (value < 0 ? Math.floor(value) : Math.ceil(value)),
};

export function round(value, mode = 'half-up') {
  const rounder = ROUNDERS[mode];
  if (!rounder) {
    throw new ValidationError(`unknown rounding mode ${mode}`, {
      mode,
      allowed: ROUNDING_MODES,
    });
  }
  if (!Number.isFinite(value)) {
    throw new ValidationError('cannot round a value that is not finite', { value });
  }
  return rounder(value);
}

/** Round to a number of decimal places, which the reports do constantly. */
export function roundTo(value, places, mode = 'half-up') {
  if (!Number.isInteger(places) || places < 0 || places > 6) {
    throw new ValidationError('places must be a whole number from 0 to 6', { places });
  }
  const factor = 10 ** places;
  return round(value * factor, mode) / factor;
}
