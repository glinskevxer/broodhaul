import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate, compareDates } from '../core/dates.js';
import { parseId } from '../core/ids.js';

/**
 * A bee yard is a piece of somebody else's ground with a landowner agreement
 * on it, a gate, and a number of pallets it will hold before the neighbours
 * start complaining about bees on the stock tank.
 *
 * Access is the field that decides everything downstream. A yard a semi can
 * back into takes a full load off the truck in one lift; a quad yard is
 * unloaded four pallets at a time off a trailer and costs an extra half day.
 */

export const ACCESS_GRADES = ['semi', 'bobtail', 'quad'];
export const WATER_SOURCES = ['onsite', 'canal', 'hauled'];

const YARD_KEYS = [
  'id',
  'name',
  'county',
  'state',
  'landowner',
  'location',
  'capacity',
  'access',
  'water',
  'registration',
  'notes',
];

function parseLandowner(value) {
  const owner = requireObject(value, 'landowner');
  rejectUnknownKeys(owner, 'landowner', [
    'name',
    'agreementOn',
    'agreementEndsOn',
    'rentCents',
  ]);
  const agreementOn = parseDate(owner.agreementOn, 'landowner.agreementOn');
  const agreementEndsOn = optional(owner.agreementEndsOn, (value) =>
    parseDate(value, 'landowner.agreementEndsOn')
  );
  if (agreementEndsOn && compareDates(agreementOn, agreementEndsOn) > 0) {
    throw new ValidationError('landowner agreement ends before it starts', {
      agreementOn,
      agreementEndsOn,
    });
  }
  return {
    name: requireString(owner.name, 'landowner.name'),
    agreementOn,
    agreementEndsOn,
    rentCents: optional(owner.rentCents, (value) =>
      requireInteger(value, 'landowner.rentCents', { min: 0 })
    ),
  };
}

function parseLocation(value) {
  const location = requireObject(value, 'location');
  rejectUnknownKeys(location, 'location', ['latitude', 'longitude']);
  return {
    latitude: requireNumber(location.latitude, 'location.latitude', {
      min: -90,
      max: 90,
    }),
    longitude: requireNumber(location.longitude, 'location.longitude', {
      min: -180,
      max: 180,
    }),
  };
}

export function makeYard(input) {
  const raw = requireObject(input, 'yard');
  rejectUnknownKeys(raw, 'yard', YARD_KEYS);
  const id = parseId(raw.id, 'yard').id;
  return {
    id,
    name: requireString(raw.name, 'yard.name', { max: 60 }),
    county: requireString(raw.county, 'yard.county', { max: 40 }),
    state: requireString(raw.state, 'yard.state', { min: 2, max: 2 }).toUpperCase(),
    landowner: parseLandowner(raw.landowner),
    location: parseLocation(raw.location),
    capacity: requireInteger(raw.capacity, 'yard.capacity', { min: 1, max: 600 }),
    access: requireOneOf(raw.access, 'yard.access', ACCESS_GRADES),
    water: requireOneOf(raw.water, 'yard.water', WATER_SOURCES),
    registration: optional(raw.registration, (value) =>
      requireString(value, 'yard.registration', { max: 20 })
    ),
    notes: optional(raw.notes, (value) =>
      requireString(value, 'yard.notes', { max: 400 })
    ),
  };
}

export function yardLabel(yard) {
  return `${yard.name} (${yard.id})`;
}

/** True while the landowner agreement covers the given day. */
export function agreementCovers(yard, date) {
  const day = parseDate(date);
  if (compareDates(day, yard.landowner.agreementOn) < 0) return false;
  if (!yard.landowner.agreementEndsOn) return true;
  return compareDates(day, yard.landowner.agreementEndsOn) <= 0;
}

export function capacityLeft(yard, placed) {
  const count = requireInteger(placed, 'placed', { min: 0 });
  return Math.max(0, yard.capacity - count);
}

/** Colonies per pallet a truck of this grade can set, used when planning a haul. */
export function palletsPerLift(yard) {
  if (yard.access === 'semi') return 24;
  if (yard.access === 'bobtail') return 12;
  return 4;
}

export function describeYard(yard) {
  const rent = yard.landowner.rentCents;
  return [
    yardLabel(yard),
    `${yard.county} county, ${yard.state}`,
    `holds ${yard.capacity}, ${yard.access} access, water ${yard.water}`,
    rent === undefined ? 'no yard rent' : `yard rent ${rent} cents a season`,
  ].join('\n');
}
