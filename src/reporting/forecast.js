import { ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { sortBy } from '../core/collections.js';
import { SEASON_STAGES } from '../movement/weight.js';
import { planIncrease, MINIMUM_DONOR_FRAMES } from '../apiary/split.js';

/**
 * How many colonies there will be.
 *
 * This is the question the whole business turns on, and it is answered badly
 * everywhere: an outfit that runs four thousand hives and contracts four
 * thousand hives is an outfit that will be short in February. Losses happen in
 * a shape, not evenly, and splits made in September are not hives in
 * February, they are hives in April.
 *
 * The loss rates are this outfit's, five seasons of them.
 */

/** Share of colonies lost in each stage, from this outfit's own record. */
export const STAGE_LOSS = {
  fall: 0.06,
  winter: 0.14,
  bloom: 0.03,
  flow: 0.04,
};

/** Share of a split made in a stage that is a rentable colony by the next bloom. */
export const SPLIT_MATURITY = {
  fall: 0.55,
  winter: 0,
  bloom: 0.25,
  flow: 0.8,
};

export function lossFor(stage) {
  requireOneOf(stage, 'stage', SEASON_STAGES);
  return STAGE_LOSS[stage];
}

export function survivorsAfter(colonies, stage) {
  const count = requireInteger(colonies, 'colonies', { min: 0, max: 200000 });
  return Math.floor(count * (1 - lossFor(stage)));
}

/**
 * Walk a colony count through a run of stages. The stages are given in the
 * order they happen, because a forecast that starts in the wrong stage is
 * wrong by more than the rounding.
 */
export function walkStages(colonies, stages) {
  let running = requireInteger(colonies, 'colonies', { min: 0, max: 200000 });
  const rows = [];
  for (const stage of stages) {
    const before = running;
    running = survivorsAfter(running, stage);
    rows.push({ stage, before, lost: before - running, after: running });
  }
  return rows;
}

export function forecastToBloom(
  colonies,
  { from = 'fall', splits = 0, splitStage = 'fall' } = {}
) {
  requireOneOf(from, 'from', SEASON_STAGES);
  requireOneOf(splitStage, 'splitStage', SEASON_STAGES);
  const order = ['fall', 'winter', 'bloom'];
  const start = order.indexOf(from);
  if (start === -1) {
    throw new ValidationError('a forecast to bloom starts in fall or winter', { from });
  }
  const stages = order.slice(start, order.indexOf('bloom'));
  const walk = walkStages(colonies, stages);
  const survived = walk.length === 0 ? colonies : walk[walk.length - 1].after;
  const matured = Math.floor(
    requireInteger(splits, 'splits', { min: 0, max: 200000 }) *
      SPLIT_MATURITY[splitStage]
  );
  return {
    from,
    startedWith: colonies,
    stages: walk,
    survived,
    splits,
    maturedSplits: matured,
    atBloom: survived + matured,
    lossRate: colonies === 0 ? 0 : roundTo((colonies - survived) / colonies, 3),
  };
}

/** Splits needed now to reach a target at bloom, given the losses in between. */
export function splitsNeededFor(target, colonies, options = {}) {
  const wanted = requireInteger(target, 'target', { min: 0, max: 200000 });
  const base = forecastToBloom(colonies, { ...options, splits: 0 });
  const shortfall = Math.max(0, wanted - base.atBloom);
  if (shortfall === 0) return 0;
  const maturity = SPLIT_MATURITY[options.splitStage ?? 'fall'];
  if (maturity === 0) {
    throw new ValidationError('splits made then will not be ready by bloom', {
      splitStage: options.splitStage,
    });
  }
  return Math.ceil(shortfall / maturity);
}

/** Whether the yards can carry the splits the forecast asks for. */
export function increaseFeasible(strengths, wanted, options = {}) {
  const plan = planIncrease(strengths, { ...options, wanted });
  return {
    wanted,
    possible: plan.length,
    short: Math.max(0, wanted - plan.length),
    donors: new Set(plan.map((entry) => entry.donorId)).size,
    eligible: strengths.filter((colony) => colony.frames >= MINIMUM_DONOR_FRAMES)
      .length,
  };
}

export function contractCoverage(atBloom, contractedHives) {
  const contracted = requireInteger(contractedHives, 'contractedHives', {
    min: 0,
    max: 200000,
  });
  return {
    atBloom,
    contracted,
    spare: atBloom - contracted,
    covered: atBloom >= contracted,
    rate: contracted === 0 ? 1 : roundTo(atBloom / contracted, 3),
  };
}

export function describeForecast(forecast) {
  const lines = [`start ${forecast.startedWith} colonies in ${forecast.from}`];
  for (const row of forecast.stages) {
    lines.push(`${row.stage}: lose ${row.lost}, ${row.after} left`);
  }
  if (forecast.splits > 0) {
    lines.push(`${forecast.splits} splits give ${forecast.maturedSplits} by bloom`);
  }
  lines.push(`${forecast.atBloom} at bloom`);
  return lines.join('\n');
}

export function lossTable() {
  return sortBy(
    SEASON_STAGES.map((stage) => ({
      stage,
      loss: STAGE_LOSS[stage],
      splitMaturity: SPLIT_MATURITY[stage],
    })),
    (row) => row.stage
  );
}
