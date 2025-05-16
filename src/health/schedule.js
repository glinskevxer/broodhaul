import { addDays, compareDates } from '../core/dates.js';
import { sortBy } from '../core/collections.js';
import { availableProducts, getProduct } from './product.js';
import { actionFor, isBlocked, needsTreatment } from './threshold.js';
import { yardRate, washesForYard } from './wash.js';
import {
  checkRotation,
  checkSeasonCap,
  lastTreatmentFor,
  treatmentSeason,
} from './treatment.js';

/**
 * Deciding what goes on which yard, and in what order.
 *
 * The crew treats a run of yards in a day, so the useful output is a list in
 * the order the truck will drive it rather than a yes or no per yard. The
 * order is worst yard first, because if the day runs out the yards that get
 * missed should be the ones that could wait.
 *
 * A yard can want treating and still have nothing to put on it. The product
 * list narrows to what the label allows at that temperature, then narrows
 * again on the season cap and the rotation, and it is perfectly possible for
 * that to come back empty. Saying so is more use than picking something.
 */

export function candidateProducts(
  yardId,
  { temperatureF, supersOn, date },
  treatments
) {
  const previous = lastTreatmentFor(treatments, yardId, date);
  return availableProducts({ temperatureF, supersOn }).filter((product) => {
    const candidate = {
      id: 'TR-0000-0000',
      yardId,
      product: product.code,
      appliedOn: date,
    };
    try {
      checkSeasonCap(treatments, candidate);
      checkRotation(previous, candidate);
      return true;
    } catch {
      return false;
    }
  });
}

export function planYard(
  yardId,
  washes,
  { temperatureF, supersOn = false, date },
  treatments
) {
  const forYard = washesForYard(washes, yardId);
  if (forYard.length === 0) {
    return { yardId, sampled: 0, rate: null, action: 'no samples', products: [] };
  }
  const rate = yardRate(forYard);
  const outcome = actionFor(rate, date, { supersOn });
  const products = needsTreatment(outcome)
    ? candidateProducts(yardId, { temperatureF, supersOn, date }, treatments)
    : [];
  return {
    yardId,
    sampled: forYard.length,
    rate,
    threshold: outcome.threshold,
    over: outcome.over,
    action: outcome.action,
    blocked: isBlocked(outcome),
    products: products.map((product) => product.code),
  };
}

/** Every yard that was sampled, worst first, ties broken on the identifier. */
export function planDay(yardIds, washes, conditions, treatments) {
  const rows = yardIds.map((yardId) =>
    planYard(yardId, washes, conditions, treatments)
  );
  return sortBy(
    rows,
    (row) => (row.rate === null ? 0 : -row.rate),
    (row) => row.yardId
  );
}

export function yardsToTreat(plan) {
  return plan.filter((row) => row.action === 'treat' || row.action === 'urgent');
}

export function yardsBlocked(plan) {
  return plan.filter((row) => row.blocked);
}

export function yardsWithNothingToUse(plan) {
  return yardsToTreat(plan).filter((row) => row.products.length === 0);
}

/**
 * When the supers can go back on a yard, given what is about to go on it.
 * The answer is the day after the withdrawal, and it is the number the honey
 * house cares about far more than the treatment date.
 */
export function supersReturnAfter(productCode, appliedOn) {
  const product = getProduct(productCode);
  const off = addDays(appliedOn, product.durationDays);
  return addDays(off, product.withdrawalDays + 1);
}

/** The latest a treatment can start and still be off before a date. */
export function latestStartFor(productCode, mustBeClearBy) {
  const product = getProduct(productCode);
  return addDays(mustBeClearBy, -(product.durationDays + product.withdrawalDays + 1));
}

export function fitsBeforeBloom(productCode, appliedOn, bloomStarts) {
  return compareDates(supersReturnAfter(productCode, appliedOn), bloomStarts) <= 0;
}

export function describePlanRow(row) {
  if (row.rate === null) return `${row.yardId}: no samples`;
  const tail =
    row.products.length === 0
      ? row.action === 'treat' || row.action === 'urgent'
        ? ', nothing on the shelf fits'
        : ''
      : `, use ${row.products.join(' or ')}`;
  return `${row.yardId}: ${row.rate} per hundred, ${row.action}${tail}`;
}

export function seasonOfPlan(treatments) {
  return [...new Set(treatments.map(treatmentSeason))].sort();
}
