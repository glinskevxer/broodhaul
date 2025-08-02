import { addDays, compareDates, diffDays } from '../core/dates.js';
import { sortBy } from '../core/collections.js';
import { correctedRate, washesForYard, yardRate } from './wash.js';
import { actionFor } from './threshold.js';
import {
  dueOffOn,
  isOnHives,
  isOverdue,
  lastTreatmentFor,
  withdrawalEndsOn,
} from './treatment.js';
import { holdSpan, isHeldOn, latestInspection } from './inspection.js';

/**
 * The health book, a row per yard.
 *
 * The office wants one page that says, for every yard, when it was last
 * sampled, what it read, what is on it now and when the state last looked at
 * it. Every one of those lives in a different record, and until this existed
 * the answer came from four screens and a memory.
 */

export const SAMPLE_INTERVAL_DAYS = 42;

export function lastWashFor(washes, yardId, onOrBefore) {
  const found = washesForYard(washes, yardId).filter(
    (wash) => compareDates(wash.date, onOrBefore) <= 0
  );
  return found[found.length - 1];
}

export function sampleDue(washes, yardId, today) {
  const last = lastWashFor(washes, yardId, today);
  if (!last) return { due: true, lastOn: null, daysSince: null, nextOn: today };
  const daysSince = diffDays(last.date, today);
  return {
    due: daysSince >= SAMPLE_INTERVAL_DAYS,
    lastOn: last.date,
    daysSince,
    nextOn: addDays(last.date, SAMPLE_INTERVAL_DAYS),
  };
}

export function yardRow({ yardId, washes, treatments, inspections, today }) {
  const forYard = washesForYard(washes, yardId).filter(
    (wash) => compareDates(wash.date, today) <= 0
  );
  const sampling = sampleDue(washes, yardId, today);
  const rate =
    forYard.length === 0
      ? null
      : yardRate(
          forYard.filter((wash) => wash.date === forYard[forYard.length - 1].date)
        );
  const onHives = treatments.filter(
    (treatment) => treatment.yardId === yardId && isOnHives(treatment)
  );
  const previous = lastTreatmentFor(treatments, yardId, today);
  const inspection = latestInspection(inspections, yardId, today);
  return {
    yardId,
    sampledOn: sampling.lastOn,
    sampleDue: sampling.due,
    nextSampleOn: sampling.nextOn,
    rate,
    action: rate === null ? 'no samples' : actionFor(rate, today).action,
    onHives: onHives.map((treatment) => treatment.product),
    overdue: onHives
      .filter((treatment) => isOverdue(treatment, today))
      .map((entry) => entry.id),
    lastProduct: previous ? previous.product : null,
    withdrawalUntil: previous ? withdrawalEndsOn(previous) : null,
    inspectedOn: inspection ? inspection.date : null,
    held: inspection ? isHeldOn(inspection, today) : false,
    heldUntil: inspection && holdSpan(inspection) ? holdSpan(inspection).end : null,
  };
}

export function healthRegister({
  yardIds,
  washes = [],
  treatments = [],
  inspections = [],
  today,
}) {
  const rows = yardIds.map((yardId) =>
    yardRow({ yardId, washes, treatments, inspections, today })
  );
  return sortBy(rows, (row) => row.yardId);
}

export function yardsDueSampling(register) {
  return register.filter((row) => row.sampleDue);
}

export function yardsHeld(register) {
  return register.filter((row) => row.held);
}

export function yardsWithOverdueTreatments(register) {
  return register.filter((row) => row.overdue.length > 0);
}

/** The worst yards by mite rate, which is the order the crew wants them in. */
export function worstYards(register, count = 5) {
  return sortBy(
    register.filter((row) => row.rate !== null),
    (row) => -row.rate,
    (row) => row.yardId
  ).slice(0, count);
}

export function describeRow(row) {
  const sampled =
    row.sampledOn === null
      ? 'never sampled'
      : `sampled ${row.sampledOn}, ${row.rate} per hundred`;
  const on =
    row.onHives.length === 0 ? 'nothing on' : `${row.onHives.join(' and ')} on`;
  const held = row.held ? `, held to ${row.heldUntil}` : '';
  return `${row.yardId}: ${sampled}, ${on}${held}`;
}

export function treatmentDueOff(treatments, today) {
  return sortBy(
    treatments.filter((treatment) => isOnHives(treatment)),
    (treatment) => dueOffOn(treatment),
    (treatment) => treatment.id
  ).map((treatment) => ({
    id: treatment.id,
    yardId: treatment.yardId,
    product: treatment.product,
    dueOff: dueOffOn(treatment),
    overdue: isOverdue(treatment, today),
  }));
}

export function highestReading(washes) {
  if (washes.length === 0) return null;
  return sortBy(
    washes,
    (wash) => -correctedRate(wash),
    (wash) => wash.colonyId
  )[0];
}
