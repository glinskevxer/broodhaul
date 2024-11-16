import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { parseId } from '../core/ids.js';
import { sortBy } from '../core/collections.js';

/**
 * Alcohol wash mite sampling.
 *
 * Half a cup of bees off a brood frame, shaken in alcohol, mites counted in
 * the bottom of the jar. The number everybody quotes is mites per hundred
 * bees, and the whole thing turns on the bee count in the jar being what the
 * sampler thought it was. Half a cup is three hundred bees when it is level
 * and two hundred and forty when it is not, so the record carries the count
 * that was actually used and the rate is worked from that rather than from an
 * assumed three hundred.
 */

export const SAMPLE_SOURCES = ['brood frame', 'outer frame', 'entrance'];
export const NOMINAL_BEES = 300;

const WASH_KEYS = [
  'colonyId',
  'yardId',
  'date',
  'beesSampled',
  'mites',
  'source',
  'sampler',
];

export function makeWash(input) {
  const raw = requireObject(input, 'wash');
  rejectUnknownKeys(raw, 'wash', WASH_KEYS);
  const beesSampled = requireInteger(
    raw.beesSampled ?? NOMINAL_BEES,
    'wash.beesSampled',
    {
      min: 50,
      max: 600,
    }
  );
  const mites = requireInteger(raw.mites, 'wash.mites', { min: 0, max: 500 });
  if (mites > beesSampled) {
    throw new ValidationError('more mites than bees came out of the jar', {
      mites,
      beesSampled,
    });
  }
  return {
    colonyId: parseId(raw.colonyId, 'colony').id,
    yardId: parseId(raw.yardId, 'yard').id,
    date: parseDate(raw.date, 'wash.date'),
    beesSampled,
    mites,
    source: requireOneOf(raw.source ?? 'brood frame', 'wash.source', SAMPLE_SOURCES),
    sampler: optional(raw.sampler, (name) =>
      requireString(name, 'wash.sampler', { max: 60 })
    ),
  };
}

/** Mites per hundred bees, to one place, which is how the number is quoted. */
export function infestationRate(wash) {
  return roundTo((wash.mites / wash.beesSampled) * 100, 1);
}

/**
 * A wash off an outer frame reads low, because the mites ride on nurse bees.
 * The manual lifts it by a quarter before it is compared to a threshold.
 */
export const SOURCE_FACTORS = {
  'brood frame': 1,
  'outer frame': 1.25,
  entrance: 1.4,
};

export function correctedRate(wash) {
  return roundTo(infestationRate(wash) * SOURCE_FACTORS[wash.source], 1);
}

export function yardRate(washes) {
  if (washes.length === 0) {
    throw new ValidationError('cannot average no washes', {});
  }
  const total = washes.reduce((sum, wash) => sum + correctedRate(wash), 0);
  return roundTo(total / washes.length, 1);
}

/** The worst colony in a set, which is what decides whether a yard gets treated. */
export function worstWash(washes) {
  if (washes.length === 0) return undefined;
  return sortBy(
    washes,
    (wash) => -correctedRate(wash),
    (wash) => wash.colonyId
  )[0];
}

export function washesForYard(washes, yardId) {
  return sortBy(
    washes.filter((wash) => wash.yardId === yardId),
    (wash) => wash.date,
    (wash) => wash.colonyId
  );
}

export function describeWash(wash) {
  const corrected = correctedRate(wash);
  const raw = infestationRate(wash);
  const tail = corrected === raw ? '' : ` (corrected from ${raw})`;
  return `${wash.colonyId} ${wash.date}: ${wash.mites} of ${wash.beesSampled}, ${corrected} per hundred${tail}`;
}
