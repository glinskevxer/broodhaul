import { ValidationError } from '../core/errors.js';
import { requireNumber, requireOneOf } from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { SEASON_STAGES } from '../movement/weight.js';

/**
 * When a mite count means somebody has to do something.
 *
 * The threshold is not one number. Going into almonds the colonies have to be
 * clean, because a hive that is loaded in February will be dead in April and
 * the grower has already paid for it. Through the summer flow the same count
 * is tolerable. In August the threshold drops again, because the bees being
 * raised then are the ones that have to live until spring.
 *
 * The supers are the second half of it. Almost nothing on the shelf can go on
 * a hive with honey supers over it, so a yard over threshold with supers on
 * does not get treated, it gets the supers pulled first, and that is a
 * different job with a different crew and a different date.
 */

export const ACTIONS = ['none', 'monitor', 'treat', 'pull supers first', 'urgent'];

/** Mites per hundred bees at which the manual says act, by stage. */
export const THRESHOLDS = {
  winter: 3,
  bloom: 2,
  flow: 3,
  fall: 2,
};

/** Twice the threshold is not twice the problem, it is a different job. */
export const URGENT_MULTIPLIER = 2;

/** Within this much of the threshold, keep watching rather than treating. */
export const MONITOR_BAND = 0.5;

export function stageFor(date) {
  const month = Number(parseDate(date).slice(5, 7));
  if (month >= 11 || month === 1) return 'winter';
  if (month === 2 || month === 3) return 'bloom';
  if (month >= 4 && month <= 7) return 'flow';
  return 'fall';
}

export function thresholdFor(stage) {
  requireOneOf(stage, 'stage', SEASON_STAGES);
  const threshold = THRESHOLDS[stage];
  if (threshold === undefined) {
    throw new ValidationError(`no mite threshold for ${stage}`, { stage });
  }
  return threshold;
}

export function thresholdOn(date) {
  return thresholdFor(stageFor(date));
}

/**
 * What to do about a rate on a day. The supers flag comes last and overrides
 * the treatment call rather than changing the threshold, so the report still
 * shows how far over the yard is.
 */
export function actionFor(rate, date, { supersOn = false } = {}) {
  const reading = requireNumber(rate, 'rate', { min: 0, max: 100 });
  const stage = stageFor(date);
  const threshold = thresholdFor(stage);
  const over = roundTo(reading - threshold, 1);
  let action;
  if (reading >= threshold * URGENT_MULTIPLIER) {
    action = 'urgent';
  } else if (reading >= threshold) {
    action = 'treat';
  } else if (reading >= threshold - MONITOR_BAND) {
    action = 'monitor';
  } else {
    action = 'none';
  }
  if (supersOn && (action === 'treat' || action === 'urgent')) {
    return {
      stage,
      threshold,
      rate: reading,
      over,
      action: 'pull supers first',
      supersOn,
    };
  }
  return { stage, threshold, rate: reading, over, action, supersOn };
}

export function needsTreatment(outcome) {
  return outcome.action === 'treat' || outcome.action === 'urgent';
}

export function isBlocked(outcome) {
  return outcome.action === 'pull supers first';
}

export function describeAction(outcome) {
  const over =
    outcome.over > 0 ? `${outcome.over} over` : `${Math.abs(outcome.over)} under`;
  return `${outcome.rate} per hundred in ${outcome.stage}, ${over} the ${outcome.threshold} threshold: ${outcome.action}`;
}
