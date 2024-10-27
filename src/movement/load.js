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
import { compareDates, parseDate } from '../core/dates.js';
import { isId, parseId } from '../core/ids.js';

/**
 * A load is one truck of bees between two places on one night.
 *
 * Bees move after dark with the entrances stapled or netted, so a load has a
 * loading date and an unloading date and they are usually not the same day.
 * The manifest lists pallets rather than colonies, because that is what the
 * forklift counts and what the brand inspector reads off the trailer.
 */

export const TRUCK_KINDS = ['semi', 'bobtail', 'flatbed'];
export const LOAD_STATES = ['planned', 'loaded', 'delivered', 'cancelled'];

const LOAD_KEYS = [
  'id',
  'truck',
  'driver',
  'originYardId',
  'destination',
  'pallets',
  'loadedOn',
  'deliveredOn',
  'state',
  'permit',
  'notes',
];

function parseTruck(value) {
  const truck = requireObject(value, 'truck');
  rejectUnknownKeys(truck, 'truck', ['unit', 'kind', 'plate']);
  return {
    unit: requireString(truck.unit, 'truck.unit', { max: 12 }).toUpperCase(),
    kind: requireOneOf(truck.kind, 'truck.kind', TRUCK_KINDS),
    plate: optional(truck.plate, (plate) =>
      requireString(plate, 'truck.plate', { max: 10 }).toUpperCase()
    ),
  };
}

function parseDestination(value) {
  const destination = requireObject(value, 'destination');
  rejectUnknownKeys(destination, 'destination', ['kind', 'id']);
  const kind = requireOneOf(destination.kind, 'destination.kind', ['yard', 'drop']);
  return { kind, id: parseId(destination.id, kind).id };
}

function parsePallets(value) {
  const pallets = requireArray(value, 'load.pallets', { min: 1, max: 60 }).map(
    (entry, at) => {
      if (!isId(entry, 'pallet')) {
        throw new ValidationError(`load.pallets[${at}] is not a pallet identifier`, {
          at,
          got: entry,
        });
      }
      return parseId(entry, 'pallet').id;
    }
  );
  const repeated = pallets.find((id, at) => pallets.indexOf(id) !== at);
  if (repeated) {
    throw new ConflictError(`pallet ${repeated} is on the load twice`, {
      pallet: repeated,
    });
  }
  return pallets;
}

export function makeLoad(input) {
  const raw = requireObject(input, 'load');
  rejectUnknownKeys(raw, 'load', LOAD_KEYS);
  const loadedOn = optional(raw.loadedOn, (date) => parseDate(date, 'load.loadedOn'));
  const deliveredOn = optional(raw.deliveredOn, (date) =>
    parseDate(date, 'load.deliveredOn')
  );
  if (deliveredOn && !loadedOn) {
    throw new ValidationError('a load cannot arrive before it was loaded', {
      load: raw.id,
    });
  }
  if (loadedOn && deliveredOn && compareDates(loadedOn, deliveredOn) > 0) {
    throw new ValidationError('a load arrived before it left', {
      loadedOn,
      deliveredOn,
    });
  }
  const state = requireOneOf(raw.state ?? 'planned', 'load.state', LOAD_STATES);
  if (state === 'delivered' && !deliveredOn) {
    throw new ValidationError('a delivered load needs a delivery date', {
      load: raw.id,
    });
  }
  if (state === 'loaded' && !loadedOn) {
    throw new ValidationError('a loaded truck needs a loading date', { load: raw.id });
  }
  return {
    id: parseId(raw.id, 'load').id,
    truck: parseTruck(raw.truck),
    driver: requireString(raw.driver, 'load.driver', { max: 60 }),
    originYardId: parseId(raw.originYardId, 'yard').id,
    destination: parseDestination(raw.destination),
    pallets: parsePallets(raw.pallets),
    loadedOn,
    deliveredOn,
    state,
    permit: optional(raw.permit, (permit) =>
      requireString(permit, 'load.permit', { max: 30 }).toUpperCase()
    ),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'load.notes', { max: 200 })
    ),
  };
}

export function palletCount(load) {
  return load.pallets.length;
}

/** Colonies actually aboard, counted off the pallets rather than assumed full. */
export function coloniesAboard(load, palletsById) {
  let total = 0;
  for (const palletId of load.pallets) {
    const pallet = palletsById.get(palletId);
    if (!pallet) {
      throw new ValidationError(
        `load ${load.id} names pallet ${palletId}, which is not on file`,
        {
          load: load.id,
          pallet: palletId,
        }
      );
    }
    total += pallet.positions.filter((entry) => entry !== null).length;
  }
  return total;
}

export function isDelivered(load) {
  return load.state === 'delivered';
}

export function nightsInTransit(load) {
  if (!load.loadedOn || !load.deliveredOn) return 0;
  const from = new Date(`${load.loadedOn}T00:00:00Z`).getTime();
  const to = new Date(`${load.deliveredOn}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

const NEXT_STATES = {
  planned: ['loaded', 'cancelled'],
  loaded: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function advanceLoad(load, state, date) {
  const target = requireOneOf(state, 'state', LOAD_STATES);
  if (!NEXT_STATES[load.state].includes(target)) {
    throw new StateError(`a ${load.state} load cannot become ${target}`, {
      load: load.id,
      from: load.state,
      to: target,
    });
  }
  const day = parseDate(date, 'state date');
  if (target === 'loaded') return makeLoad({ ...load, state: target, loadedOn: day });
  if (target === 'delivered')
    return makeLoad({ ...load, state: target, deliveredOn: day });
  return makeLoad({ ...load, state: target });
}

export function requirePalletsAvailable(load, alreadyLoaded) {
  const clash = load.pallets.find((palletId) => alreadyLoaded.has(palletId));
  if (clash) {
    throw new ConflictError(`pallet ${clash} is already on another load tonight`, {
      pallet: clash,
      load: load.id,
    });
  }
  return requireInteger(load.pallets.length, 'pallets', { min: 1 });
}
