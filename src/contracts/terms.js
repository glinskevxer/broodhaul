import { ValidationError } from '../core/errors.js';
import {
  rejectUnknownKeys,
  requireArray,
  requireInteger,
  requireNumber,
  requireObject,
  requireOneOf,
} from '../core/validate.js';

/**
 * The grading terms inside a pollination contract.
 *
 * Two clauses do most of the work and they interact. `gradeBy` says whether
 * the strength tier is read off the run average or off each colony on its own,
 * and `shortfall` says what happens when the drop comes in under the minimum.
 * A contract that grades by colony and prorates a shortfall behaves nothing
 * like one that grades by average and rejects, even with identical rates and
 * identical bees, and that is the whole argument every February.
 */

export const GRADE_BASES = ['average', 'colony'];
export const SHORTFALL_RULES = ['prorate', 'reject', 'tier'];

const TERMS_KEYS = [
  'minimumAverage',
  'samplePercent',
  'tiers',
  'gradeBy',
  'shortfall',
  'regradeWithinDays',
];

function parseTiers(value) {
  const tiers = requireArray(value, 'terms.tiers', { min: 1, max: 6 }).map(
    (entry, at) => {
      const tier = requireObject(entry, `terms.tiers[${at}]`);
      rejectUnknownKeys(tier, `terms.tiers[${at}]`, ['atLeast', 'adjustmentCents']);
      return {
        atLeast: requireNumber(tier.atLeast, `terms.tiers[${at}].atLeast`, {
          min: 0,
          max: 20,
        }),
        adjustmentCents: requireInteger(
          tier.adjustmentCents,
          `terms.tiers[${at}].adjustmentCents`,
          { min: -50000, max: 50000 }
        ),
      };
    }
  );
  for (let at = 1; at < tiers.length; at += 1) {
    if (tiers[at].atLeast >= tiers[at - 1].atLeast) {
      throw new ValidationError('tiers must be written strongest first', {
        at,
        atLeast: tiers[at].atLeast,
        previous: tiers[at - 1].atLeast,
      });
    }
  }
  return tiers;
}

export function makeTerms(input) {
  const raw = requireObject(input, 'terms');
  rejectUnknownKeys(raw, 'terms', TERMS_KEYS);
  const tiers = parseTiers(raw.tiers);
  const minimumAverage = requireNumber(raw.minimumAverage, 'terms.minimumAverage', {
    min: 0,
    max: 20,
  });
  const weakest = tiers[tiers.length - 1].atLeast;
  if (minimumAverage < weakest) {
    throw new ValidationError(
      'the minimum average sits below the weakest tier, so the tiers can never bite',
      { minimumAverage, weakest }
    );
  }
  return {
    minimumAverage,
    samplePercent: requireNumber(raw.samplePercent, 'terms.samplePercent', {
      min: 1,
      max: 100,
    }),
    tiers,
    gradeBy: requireOneOf(raw.gradeBy ?? 'average', 'terms.gradeBy', GRADE_BASES),
    shortfall: requireOneOf(
      raw.shortfall ?? 'prorate',
      'terms.shortfall',
      SHORTFALL_RULES
    ),
    regradeWithinDays: requireInteger(
      raw.regradeWithinDays ?? 0,
      'terms.regradeWithinDays',
      { min: 0, max: 30 }
    ),
  };
}

/** The tier a strength falls in, or nothing when it is under every tier. */
export function tierFor(terms, frames) {
  const strength = requireNumber(frames, 'frames', { min: 0 });
  return terms.tiers.find((tier) => strength >= tier.atLeast);
}

export function adjustmentFor(terms, frames) {
  const tier = tierFor(terms, frames);
  return tier ? tier.adjustmentCents : 0;
}

export function meetsMinimum(terms, average) {
  return requireNumber(average, 'average', { min: 0 }) >= terms.minimumAverage;
}

export function allowsRegrade(terms) {
  return terms.regradeWithinDays > 0;
}

/** The strength each clause is read against, which is the composition in one line. */
export function strengthsToTier(terms, run, frameFn) {
  if (terms.gradeBy === 'average') return [frameFn(run)];
  return run.readings.map((reading) => frameFn(run, reading));
}

export function describeTerms(terms) {
  const tiers = terms.tiers
    .map((tier) => `${tier.atLeast}+ at ${tier.adjustmentCents}`)
    .join(', ');
  return [
    `minimum ${terms.minimumAverage} frames, graded by ${terms.gradeBy}`,
    `sample ${terms.samplePercent} percent`,
    `tiers ${tiers}`,
    `shortfall ${terms.shortfall}`,
    terms.regradeWithinDays === 0
      ? 'no regrade'
      : `regrade within ${terms.regradeWithinDays} days`,
  ].join('\n');
}
