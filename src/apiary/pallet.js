import { ConflictError, StateError, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireInteger,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { isId, parseId } from '../core/ids.js';

/**
 * Colonies travel on pallets and a forklift never handles a single hive.
 *
 * Two patterns are in the yard: the four way pallet everybody runs, and a
 * six way that fits more bees on a trailer but will not go through the older
 * orchard gates. The pattern decides how many positions exist and, further
 * downstream, how many hives a drop of a given size can actually be made of.
 */

export const PALLET_PATTERNS = {
  'four-way': 4,
  'six-way': 6,
};

const PALLET_KEYS = [
  'id',
  'pattern',
  'yardId',
  'tareLb',
  'positions',
  'builtOn',
  'notes',
];

export function patternPositions(pattern) {
  const positions = PALLET_PATTERNS[pattern];
  if (!positions) {
    throw new ValidationError(`unknown pallet pattern ${pattern}`, {
      pattern,
      known: Object.keys(PALLET_PATTERNS),
    });
  }
  return positions;
}

function parsePositions(value, pattern) {
  const size = patternPositions(pattern);
  const positions = requireArray(value ?? new Array(size).fill(null), 'positions', {
    min: size,
    max: size,
  });
  const filled = positions.map((entry, at) => {
    if (entry === null || entry === undefined) return null;
    if (!isId(entry, 'colony')) {
      throw new ValidationError(
        `position ${at + 1} does not hold a colony identifier`,
        {
          position: at + 1,
          got: entry,
        }
      );
    }
    return parseId(entry, 'colony').id;
  });
  const occupied = filled.filter((entry) => entry !== null);
  const repeated = occupied.find((entry, at) => occupied.indexOf(entry) !== at);
  if (repeated) {
    throw new ConflictError(`colony ${repeated} is on the pallet twice`, {
      colony: repeated,
    });
  }
  return filled;
}

export function makePallet(input) {
  const raw = requireObject(input, 'pallet');
  rejectUnknownKeys(raw, 'pallet', PALLET_KEYS);
  const pattern = requireOneOf(
    raw.pattern,
    'pallet.pattern',
    Object.keys(PALLET_PATTERNS)
  );
  return {
    id: parseId(raw.id, 'pallet').id,
    pattern,
    yardId: parseId(raw.yardId, 'yard').id,
    tareLb: requireInteger(raw.tareLb, 'pallet.tareLb', { min: 20, max: 200 }),
    positions: parsePositions(raw.positions, pattern),
    builtOn: parseDate(raw.builtOn, 'pallet.builtOn'),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'pallet.notes', { max: 200 })
    ),
  };
}

export function palletCapacity(pallet) {
  return patternPositions(pallet.pattern);
}

export function occupiedCount(pallet) {
  return pallet.positions.filter((entry) => entry !== null).length;
}

export function isFull(pallet) {
  return occupiedCount(pallet) === palletCapacity(pallet);
}

export function coloniesOn(pallet) {
  return pallet.positions.filter((entry) => entry !== null);
}

export function positionOf(pallet, colonyId) {
  const at = pallet.positions.indexOf(colonyId);
  return at === -1 ? undefined : at + 1;
}

/** Put a colony on the pallet, either in a named position or the first free one. */
export function setColony(pallet, colonyId, position) {
  const id = parseId(colonyId, 'colony').id;
  if (positionOf(pallet, id) !== undefined) {
    throw new ConflictError(`colony ${id} is already on pallet ${pallet.id}`, {
      pallet: pallet.id,
      colony: id,
    });
  }
  const positions = [...pallet.positions];
  let index;
  if (position === undefined) {
    index = positions.indexOf(null);
    if (index === -1) {
      throw new StateError(`pallet ${pallet.id} is full`, { pallet: pallet.id });
    }
  } else {
    index = requireInteger(position, 'position', { min: 1, max: positions.length }) - 1;
    if (positions[index] !== null) {
      throw new ConflictError(`position ${position} on ${pallet.id} is taken`, {
        pallet: pallet.id,
        position,
        colony: positions[index],
      });
    }
  }
  positions[index] = id;
  return { ...pallet, positions };
}

export function clearPosition(pallet, position) {
  const index =
    requireInteger(position, 'position', { min: 1, max: pallet.positions.length }) - 1;
  if (pallet.positions[index] === null) {
    throw new StateError(`position ${position} on ${pallet.id} is already empty`, {
      pallet: pallet.id,
      position,
    });
  }
  const positions = [...pallet.positions];
  positions[index] = null;
  return { ...pallet, positions };
}

export function removeColony(pallet, colonyId) {
  const at = positionOf(pallet, colonyId);
  if (at === undefined) {
    throw new StateError(`colony ${colonyId} is not on pallet ${pallet.id}`, {
      pallet: pallet.id,
      colony: colonyId,
    });
  }
  return clearPosition(pallet, at);
}
