import { ValidationError } from '../core/errors.js';
import { requireNumber, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney } from '../core/money.js';

/**
 * Sugar syrup, mixed by weight.
 *
 * Two ratios are in use and they are not interchangeable. One to one is thin,
 * goes on in spring, and the bees read it as a nectar flow and start raising
 * brood. Two to one is heavy, goes on in autumn, and the bees store it rather
 * than build on it. Feeding the wrong one at the wrong time is a real mistake
 * with a real cost: thin syrup in October gets stored wet and ferments in the
 * comb over winter.
 *
 * The ratios are by weight, so a gallon of each weighs a different amount and
 * carries a different amount of sugar. Everything here works from that rather
 * than from a rule of thumb about pounds per gallon.
 */

export const RATIOS = ['1:1', '2:1'];

/** Pounds a gallon of finished syrup weighs, measured on the mixing tank scale. */
export const SYRUP_LB_PER_GALLON = {
  '1:1': 10,
  '2:1': 11.3,
};

/** Sugar as a share of the finished weight. */
export const SUGAR_SHARE = {
  '1:1': 0.5,
  '2:1': 2 / 3,
};

export const WATER_LB_PER_GALLON = 8.34;

export function ratioFor(stage) {
  requireOneOf(stage, 'stage', ['winter', 'bloom', 'flow', 'fall']);
  return stage === 'fall' || stage === 'winter' ? '2:1' : '1:1';
}

export function makeBatch(input) {
  const ratio = requireOneOf(input.ratio, 'batch.ratio', RATIOS);
  const gallons = requireNumber(input.gallons, 'batch.gallons', { min: 1, max: 5000 });
  return { ratio, gallons: roundTo(gallons, 1) };
}

export function batchWeightLb(batch) {
  return roundTo(batch.gallons * SYRUP_LB_PER_GALLON[batch.ratio], 1);
}

export function sugarLb(batch) {
  return roundTo(batchWeightLb(batch) * SUGAR_SHARE[batch.ratio], 1);
}

export function waterGallons(batch) {
  const waterLb = batchWeightLb(batch) - sugarLb(batch);
  return roundTo(waterLb / WATER_LB_PER_GALLON, 2);
}

/** Sugar bags of a given weight, rounded up because you cannot buy half a bag. */
export function bagsNeeded(batch, bagLb = 50) {
  const size = requireNumber(bagLb, 'bagLb', { min: 1, max: 2000 });
  return Math.ceil(sugarLb(batch) / size);
}

export function batchCostCents(batch, sugarCentsPerLb) {
  const price = requireNumber(sugarCentsPerLb, 'sugarCentsPerLb', { min: 1, max: 500 });
  return multiplyMoney(Math.round(sugarLb(batch)), price);
}

/** Gallons one colony is fed at a given stage, per feeding. */
export const GALLONS_PER_COLONY = {
  winter: 0,
  bloom: 0.5,
  flow: 0,
  fall: 2,
};

export function gallonsPerColony(stage) {
  requireOneOf(stage, 'stage', Object.keys(GALLONS_PER_COLONY));
  return GALLONS_PER_COLONY[stage];
}

export function coloniesFed(batch, stage) {
  const each = gallonsPerColony(stage);
  if (each === 0) {
    throw new ValidationError(`no syrup is fed in ${stage}`, { stage });
  }
  return Math.floor(batch.gallons / each);
}

export function batchForColonies(colonies, stage) {
  const each = gallonsPerColony(stage);
  if (each === 0) {
    throw new ValidationError(`no syrup is fed in ${stage}`, { stage });
  }
  const count = requireNumber(colonies, 'colonies', { min: 1, max: 20000 });
  return makeBatch({ ratio: ratioFor(stage), gallons: roundTo(count * each, 1) });
}

export function describeBatch(batch) {
  return `${batch.gallons} gallons of ${batch.ratio}: ${sugarLb(batch)} lb sugar to ${waterGallons(batch)} gallons water`;
}
