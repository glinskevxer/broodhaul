import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { compareDates, parseDate } from '../core/dates.js';
import { makeSpan, spanContains } from '../core/span.js';
import { parseId } from '../core/ids.js';

/**
 * A drop is a set point: the place inside a block where the forklift puts a
 * run of pallets down, and the count that goes there.
 *
 * Drops are what the grader grades and what the load sheet delivers to, so a
 * drop that says twenty hives and holds sixteen is the single most common
 * cause of an argument at settlement. The record therefore carries both the
 * ordered count and the count actually set, and refuses to pretend they are
 * the same field.
 */

export const DROP_PATTERNS = ['perimeter', 'interior', 'road', 'corner'];

const DROP_KEYS = [
  'id',
  'contractId',
  'blockId',
  'location',
  'ordered',
  'set',
  'pattern',
  'setOn',
  'pulledOn',
  'notes',
];

export function makeDrop(input) {
  const raw = requireObject(input, 'drop');
  rejectUnknownKeys(raw, 'drop', DROP_KEYS);
  const location = requireObject(raw.location, 'drop.location');
  rejectUnknownKeys(location, 'drop.location', ['latitude', 'longitude']);
  const setOn = optional(raw.setOn, (date) => parseDate(date, 'drop.setOn'));
  const pulledOn = optional(raw.pulledOn, (date) => parseDate(date, 'drop.pulledOn'));
  if (pulledOn && !setOn) {
    throw new ValidationError('a drop cannot be pulled before it was set', {
      drop: raw.id,
    });
  }
  if (setOn && pulledOn && compareDates(setOn, pulledOn) > 0) {
    throw new ValidationError('a drop was pulled before it was set', {
      setOn,
      pulledOn,
    });
  }
  const set = optional(raw.set, (count) =>
    requireInteger(count, 'drop.set', { min: 0, max: 200 })
  );
  if (set !== undefined && !setOn) {
    throw new ValidationError('a drop with hives on it needs a set date', {
      drop: raw.id,
    });
  }
  return {
    id: parseId(raw.id, 'drop').id,
    contractId: parseId(raw.contractId, 'contract').id,
    blockId: parseId(raw.blockId, 'block').id,
    location: {
      latitude: requireNumber(location.latitude, 'drop.location.latitude', {
        min: -90,
        max: 90,
      }),
      longitude: requireNumber(location.longitude, 'drop.location.longitude', {
        min: -180,
        max: 180,
      }),
    },
    ordered: requireInteger(raw.ordered, 'drop.ordered', { min: 1, max: 200 }),
    set,
    pattern: requireOneOf(raw.pattern ?? 'interior', 'drop.pattern', DROP_PATTERNS),
    setOn,
    pulledOn,
    notes: optional(raw.notes, (note) =>
      requireString(note, 'drop.notes', { max: 200 })
    ),
  };
}

export function isSet(drop) {
  return drop.setOn !== undefined && drop.pulledOn === undefined;
}

export function isPulled(drop) {
  return drop.pulledOn !== undefined;
}

export function shortBy(drop) {
  if (drop.set === undefined) return drop.ordered;
  return Math.max(0, drop.ordered - drop.set);
}

export function isShort(drop) {
  return shortBy(drop) > 0;
}

/** The days the drop was standing in the orchard, both ends counted. */
export function standingSpan(drop) {
  if (!drop.setOn) return null;
  return makeSpan(drop.setOn, drop.pulledOn ?? drop.setOn);
}

export function standingOn(drop, date) {
  const span = standingSpan(drop);
  if (!span) return false;
  if (!drop.pulledOn) return compareDates(parseDate(date), drop.setOn) >= 0;
  return spanContains(span, date);
}

/** The set has to land inside the contract's delivery window, and it often does not. */
export function checkSetInWindow(contract, drop) {
  if (!drop.setOn) return true;
  if (!spanContains(contract.delivery, drop.setOn)) {
    throw new RuleViolation(
      'PL-3',
      `drop ${drop.id} was set on ${drop.setOn}, outside the delivery window`,
      {
        drop: drop.id,
        setOn: drop.setOn,
        delivery: contract.delivery,
      }
    );
  }
  return true;
}

export function checkPullInWindow(contract, drop) {
  if (!drop.pulledOn) return true;
  if (!spanContains(contract.removal, drop.pulledOn)) {
    throw new RuleViolation(
      'PL-4',
      `drop ${drop.id} was pulled on ${drop.pulledOn}, outside the removal window`,
      { drop: drop.id, pulledOn: drop.pulledOn, removal: contract.removal }
    );
  }
  return true;
}
