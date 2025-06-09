import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { addDays, compareDates, diffDays } from '../core/dates.js';
import { roundToStep } from '../core/quantity.js';
import { sortBy, sumBy } from '../core/collections.js';

/**
 * Making increase.
 *
 * A split takes frames of brood and bees out of a strong colony and makes a
 * new one. The arithmetic is easy and the timing is not: a split needs a queen
 * and then needs to build, and a colony that is still four frames in December
 * is worth nothing in an almond orchard. Everything here is about whether a
 * split made on a given day will be worth renting by bloom.
 */

export const QUEEN_SOURCES = ['cell', 'mated queen', 'walk away'];

/** Days from making the split to a laying queen, by how it was queened. */
export const QUEEN_DELAY_DAYS = {
  cell: 14,
  'mated queen': 2,
  'walk away': 28,
};

/** Frames of bees a split gains a week once the queen is laying. */
export const BUILD_RATE_FRAMES_PER_WEEK = 0.75;

export const MINIMUM_DONOR_FRAMES = 8;
export const MINIMUM_SPLIT_FRAMES = 2;
export const MAXIMUM_TAKE_FRAMES = 4;
/** Frames the donor has to keep, or it will not make the next contract. */
export const MINIMUM_DONOR_REMAINDER = 5;

export function checkDonor(donorFrames, takeFrames) {
  const donor = requireNumber(donorFrames, 'donorFrames', { min: 0, max: 20 });
  const take = requireNumber(takeFrames, 'takeFrames', {
    min: 0.5,
    max: MAXIMUM_TAKE_FRAMES,
  });
  if (donor < MINIMUM_DONOR_FRAMES) {
    throw new RuleViolation(
      'SP-1',
      `a donor needs ${MINIMUM_DONOR_FRAMES} frames, this one has ${donor}`,
      { donorFrames: donor }
    );
  }
  if (donor - take < MINIMUM_DONOR_REMAINDER) {
    throw new RuleViolation('SP-2', 'taking that many frames guts the donor', {
      donorFrames: donor,
      takeFrames: take,
    });
  }
  if (take < MINIMUM_SPLIT_FRAMES) {
    throw new RuleViolation(
      'SP-3',
      `a split needs ${MINIMUM_SPLIT_FRAMES} frames to hold together`,
      { takeFrames: take }
    );
  }
  return true;
}

export function makeSplit(input) {
  const takeFrames = requireNumber(input.takeFrames, 'takeFrames', {
    min: 0.5,
    max: MAXIMUM_TAKE_FRAMES,
  });
  if (roundToStep(takeFrames, 0.5) !== takeFrames) {
    throw new ValidationError('frames are taken to the half', { takeFrames });
  }
  return {
    donorId: input.donorId,
    takeFrames,
    queenedBy: requireOneOf(input.queenedBy ?? 'cell', 'queenedBy', QUEEN_SOURCES),
    madeOn: input.madeOn,
  };
}

export function layingOn(split) {
  return addDays(split.madeOn, QUEEN_DELAY_DAYS[split.queenedBy]);
}

/** Frames the split is expected to hold on a given day. */
export function projectedFrames(split, onDate) {
  const laying = layingOn(split);
  if (compareDates(onDate, laying) < 0) return split.takeFrames;
  const weeks = diffDays(laying, onDate) / 7;
  return roundToStep(
    split.takeFrames + weeks * BUILD_RATE_FRAMES_PER_WEEK,
    0.25,
    'down'
  );
}

export function donorAfter(donorFrames, split) {
  return roundToStep(donorFrames - split.takeFrames, 0.25);
}

/** The last day a split can be made and still reach a target by a date. */
export function latestMakeDate(
  target,
  byDate,
  { takeFrames = 2, queenedBy = 'cell' } = {}
) {
  const wanted = requireNumber(target, 'target', {
    min: MINIMUM_SPLIT_FRAMES,
    max: 20,
  });
  const growth = wanted - takeFrames;
  if (growth <= 0) return byDate;
  const weeks = growth / BUILD_RATE_FRAMES_PER_WEEK;
  const days = Math.ceil(weeks * 7) + QUEEN_DELAY_DAYS[queenedBy];
  return addDays(byDate, -days);
}

export function willMakeGrade(split, target, byDate) {
  return projectedFrames(split, byDate) >= target;
}

/**
 * How many splits a set of colonies can carry, taking from the strongest
 * first and never pulling one below the floor.
 */
export function planIncrease(colonies, { takeFrames = 2, wanted = Infinity } = {}) {
  const donors = sortBy(
    colonies.filter((colony) => colony.frames >= MINIMUM_DONOR_FRAMES),
    (colony) => -colony.frames,
    (colony) => colony.id
  );
  const made = [];
  for (const donor of donors) {
    if (made.length >= wanted) break;
    let frames = donor.frames;
    while (frames - takeFrames >= MINIMUM_DONOR_REMAINDER && made.length < wanted) {
      made.push({
        donorId: donor.id,
        takeFrames,
        donorLeft: roundToStep(frames - takeFrames, 0.25),
      });
      frames -= takeFrames;
    }
  }
  return made;
}

export function increaseSummary(plan, colonies) {
  return {
    splits: plan.length,
    donors: new Set(plan.map((entry) => entry.donorId)).size,
    framesTaken: roundToStep(
      sumBy(plan, (entry) => entry.takeFrames),
      0.25
    ),
    coloniesAfter:
      requireInteger(colonies.length, 'colonies', { min: 0 }) + plan.length,
  };
}
