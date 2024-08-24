import { ValidationError } from '../core/errors.js';
import {
  requireArray,
  requireInteger,
  requireNumber,
  requireOneOf,
} from '../core/validate.js';
import { sortBy } from '../core/collections.js';
import { METHODS } from './conditions.js';

/**
 * How many colonies get opened, and which ones.
 *
 * The contract says a percentage. The manual puts a floor under it so a small
 * drop is not graded off two hives, a ceiling over it so a thousand hive
 * almond set does not take a week, and a rule that a drop under the census
 * threshold is graded whole. On top of that, a cluster count carries a
 * multiplier: it is a coarser read, so it needs more of them before the
 * average means anything.
 *
 * Selection is a stride rather than a shuffle. The grower and the grader both
 * get the same list from the same inputs, which is the only way an argument
 * about which hives were opened ever gets settled.
 */

export const SAMPLE_FLOOR = 4;
export const SAMPLE_CEILING = 30;
export const CENSUS_THRESHOLD = 8;

/** A cluster count reads coarse, so the manual asks for half again as many. */
export const METHOD_MULTIPLIERS = {
  frame: 1,
  cluster: 1.5,
};

export function methodMultiplier(method) {
  requireOneOf(method, 'method', METHODS);
  return METHOD_MULTIPLIERS[method];
}

/**
 * Sample size for a population, before any colony is chosen.
 *
 * The census rule wins outright: under the threshold every colony is opened
 * and the percentage never gets consulted. Above it the percentage applies,
 * then the multiplier, then the floor and ceiling in that order, and the
 * result can never exceed the population.
 */
export function sampleSize(population, percent, method = 'frame') {
  const count = requireInteger(population, 'population', { min: 0 });
  const share = requireNumber(percent, 'percent', { min: 1, max: 100 });
  const multiplier = methodMultiplier(method);
  if (count === 0) return 0;
  if (count <= CENSUS_THRESHOLD) return count;
  const proportional = Math.ceil((count * share) / 100);
  const adjusted = Math.ceil(proportional * multiplier);
  const floored = Math.max(SAMPLE_FLOOR, adjusted);
  const capped = Math.min(SAMPLE_CEILING, floored);
  return Math.min(count, capped);
}

/** A small integer derived from a string, used to start the stride. */
export function seedFrom(text) {
  let seed = 7;
  for (const character of String(text)) {
    seed = (seed * 31 + character.charCodeAt(0)) % 100003;
  }
  return seed;
}

/**
 * Choose `size` colonies out of `colonies` by walking a stride through the
 * list, sorted by brand so the order does not depend on how the register
 * happened to be built.
 */
export function chooseSample(colonies, size, seed) {
  const population = requireArray(colonies, 'colonies');
  const wanted = requireInteger(size, 'size', { min: 0 });
  if (wanted > population.length) {
    throw new ValidationError(
      `cannot take ${wanted} colonies out of ${population.length}`,
      { wanted, population: population.length }
    );
  }
  if (wanted === 0) return [];
  const sorted = sortBy(population, (colony) => colony.brand);
  if (wanted === sorted.length) return sorted;
  const start = seedFrom(seed) % sorted.length;
  const stride = Math.max(1, Math.floor(sorted.length / wanted));
  const chosen = [];
  const taken = new Set();
  let at = start;
  while (chosen.length < wanted) {
    if (!taken.has(at)) {
      taken.add(at);
      chosen.push(sorted[at]);
      at = (at + stride) % sorted.length;
    } else {
      at = (at + 1) % sorted.length;
    }
  }
  return sortBy(chosen, (colony) => colony.brand);
}

export function describeSample(population, percent, method) {
  const size = sampleSize(population, percent, method);
  if (population <= CENSUS_THRESHOLD) {
    return `census, all ${population} colonies`;
  }
  return `${size} of ${population} by ${method} count at ${percent} percent`;
}
