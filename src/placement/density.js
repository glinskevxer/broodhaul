import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { CROPS } from '../contracts/contract.js';
import { isSelfFertile, isYoungPlanting, pollinizerShare } from './block.js';

/**
 * How many hives an acre of a given block wants.
 *
 * The crop sets a base and then the block argues with it. The order matters
 * and it is not obvious: the self fertile check runs first and, when it fires,
 * the pollinizer rule is skipped entirely rather than applied to a block with
 * no pollinizer in it. Getting that backwards produces the classic mistake of
 * ordering a heavy set for an Independence block on the grounds that it has no
 * pollinizer rows, which is exactly the block that needs the fewest bees.
 */

export const BASE_DENSITY = {
  almond: 2,
  cherry: 2.5,
  apple: 1,
  blueberry: 3,
  melon: 1,
  'seed alfalfa': 1.5,
  sunflower: 0.5,
};

export const SELF_FERTILE_FACTOR = 0.5;
export const THIN_POLLINIZER_FACTOR = 1.25;
export const THIN_POLLINIZER_BELOW = 0.25;
export const YOUNG_PLANTING_FACTOR = 0.75;
export const COOL_BLOOM_FACTOR = 1.2;
export const MAX_DENSITY = 6;

export function baseDensity(crop) {
  requireOneOf(crop, 'crop', CROPS);
  const density = BASE_DENSITY[crop];
  if (density === undefined) {
    throw new ValidationError(`no base density for ${crop}`, { crop });
  }
  return density;
}

/**
 * The multipliers this block earns, in the order the manual applies them.
 * Returned as a list so a set sheet can show the grower the working rather
 * than a number nobody can argue with.
 */
export function densityFactors(block, season, { coolBloom = false } = {}) {
  requireInteger(season, 'season', { min: 2000, max: 2999 });
  const factors = [];
  const selfFertile = isSelfFertile(block);
  if (selfFertile) {
    factors.push({ reason: 'self fertile planting', factor: SELF_FERTILE_FACTOR });
  } else if (pollinizerShare(block) < THIN_POLLINIZER_BELOW) {
    factors.push({ reason: 'thin pollinizer share', factor: THIN_POLLINIZER_FACTOR });
  }
  if (isYoungPlanting(block, season)) {
    factors.push({ reason: 'young planting', factor: YOUNG_PLANTING_FACTOR });
  }
  if (coolBloom) {
    factors.push({ reason: 'cool bloom forecast', factor: COOL_BLOOM_FACTOR });
  }
  return factors;
}

export function recommendedDensity(block, season, options = {}) {
  const base = baseDensity(block.crop);
  const factors = densityFactors(block, season, options);
  const applied = factors.reduce((density, entry) => density * entry.factor, base);
  return Math.min(MAX_DENSITY, roundTo(applied, 2));
}

export function recommendedHives(block, season, options = {}) {
  return Math.ceil(recommendedDensity(block, season, options) * block.acres);
}

/** How far a contracted density sits from what the block asks for. */
export function densityVariance(block, season, contractedPerAcre, options = {}) {
  const wanted = recommendedDensity(block, season, options);
  const contracted = requireNumber(contractedPerAcre, 'contractedPerAcre', {
    min: 0,
    max: MAX_DENSITY,
  });
  return {
    recommended: wanted,
    contracted,
    difference: roundTo(contracted - wanted, 2),
    short: contracted < wanted,
  };
}

export function explainDensity(block, season, options = {}) {
  const base = baseDensity(block.crop);
  const lines = [`${block.crop} base ${base} per acre`];
  for (const entry of densityFactors(block, season, options)) {
    lines.push(`${entry.reason} times ${entry.factor}`);
  }
  lines.push(`recommended ${recommendedDensity(block, season, options)} per acre`);
  return lines.join('\n');
}
