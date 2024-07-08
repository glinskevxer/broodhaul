import { ValidationError } from './errors.js';
import { roundCents } from './money.js';

/**
 * Fixed point quantities.
 *
 * Frames of bees are counted in quarters, drum weights in tenths of a pound,
 * orchard blocks in hundredths of an acre. All three get averaged, multiplied
 * by a rate and compared against a contract minimum, and none of that survives
 * being carried around as a float. Quantities are integers here, scaled by a
 * power of ten that the caller states, and the scale travels with the value.
 */

const MAX_PLACES = 4;

export function scaleFactor(places) {
  if (!Number.isInteger(places) || places < 0 || places > MAX_PLACES) {
    throw new ValidationError(`places must be a whole number from 0 to ${MAX_PLACES}`, {
      places,
    });
  }
  return 10 ** places;
}

export function makeQuantity(value, places, unit) {
  const factor = scaleFactor(places);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError('quantity must be a finite number', { value, unit });
  }
  const scaled = roundCents(value * factor, 'half-up');
  if (Math.abs(scaled - value * factor) > 1e-6) {
    throw new ValidationError(
      `${value} ${unit} needs more than ${places} decimal places`,
      { value, places, unit }
    );
  }
  return { scaled, places, unit };
}

export function quantityValue(quantity) {
  return quantity.scaled / scaleFactor(quantity.places);
}

export function formatQuantity(quantity, { withUnit = true } = {}) {
  const factor = scaleFactor(quantity.places);
  const negative = quantity.scaled < 0;
  const abs = Math.abs(quantity.scaled);
  const whole = Math.floor(abs / factor);
  const text =
    quantity.places === 0
      ? String(whole)
      : `${whole}.${String(abs % factor).padStart(quantity.places, '0')}`;
  const signed = `${negative ? '-' : ''}${text}`;
  return withUnit && quantity.unit ? `${signed} ${quantity.unit}` : signed;
}

function sameShape(left, right) {
  if (left.places !== right.places || left.unit !== right.unit) {
    throw new ValidationError('quantities must share a unit and a scale', {
      left: { places: left.places, unit: left.unit },
      right: { places: right.places, unit: right.unit },
    });
  }
}

export function addQuantity(left, right) {
  sameShape(left, right);
  return { scaled: left.scaled + right.scaled, places: left.places, unit: left.unit };
}

export function subtractQuantity(left, right) {
  sameShape(left, right);
  return { scaled: left.scaled - right.scaled, places: left.places, unit: left.unit };
}

export function sumQuantities(quantities) {
  if (quantities.length === 0) {
    throw new ValidationError('cannot total an empty list of quantities', {});
  }
  return quantities.reduce(addQuantity);
}

export function scaleQuantity(quantity, factor, mode = 'half-up') {
  if (!Number.isFinite(factor)) {
    throw new ValidationError('factor must be finite', { factor });
  }
  return {
    scaled: roundCents(quantity.scaled * factor, mode),
    places: quantity.places,
    unit: quantity.unit,
  };
}

export function compareQuantity(left, right) {
  sameShape(left, right);
  if (left.scaled === right.scaled) return 0;
  return left.scaled < right.scaled ? -1 : 1;
}

/**
 * Mean of a set, kept at the same scale. Grading averages a yard's frame
 * counts and the contract reads that average to two decimal places, so the
 * rounding mode is the caller's decision rather than a default.
 */
export function averageQuantity(quantities, mode = 'half-up') {
  const total = sumQuantities(quantities);
  return {
    scaled: roundCents(total.scaled / quantities.length, mode),
    places: total.places,
    unit: total.unit,
  };
}

/** Round a plain number to the nearest multiple of `step`, such as a quarter frame. */
export function roundToStep(value, step, mode = 'half-up') {
  if (!Number.isFinite(step) || step <= 0) {
    throw new ValidationError('step must be a positive number', { step });
  }
  return roundCents(value / step, mode) * step;
}
