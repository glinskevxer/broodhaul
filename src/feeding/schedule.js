import { ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf } from '../core/validate.js';
import { addDays, compareDates, diffDays } from '../core/dates.js';
import { sortBy, sumBy } from '../core/collections.js';
import { formatMoney } from '../core/money.js';
import {
  batchForColonies,
  coloniesFed,
  gallonsPerColony,
  ratioFor,
  batchCostCents,
} from './syrup.js';
import { VISIT_INTERVAL_DAYS, costCentsFor, specFor, visitsBetween } from './ration.js';

/**
 * The feeding run.
 *
 * A crew feeds a string of yards on one loop, and the loop is set by the tank
 * on the truck rather than by the yards. Six hundred gallons is one fill, so a
 * plan that says "feed everything on Tuesday" is a plan that has the driver
 * back at the shop twice, and that is the difference between one day and two.
 */

export const TANK_GALLONS = 600;
export const YARDS_PER_DAY = 8;

export function syrupRunFor(yards, stage) {
  requireOneOf(stage, 'stage', ['winter', 'bloom', 'flow', 'fall']);
  const perColony = gallonsPerColony(stage);
  if (perColony === 0) {
    throw new ValidationError(`no syrup is fed in ${stage}`, { stage });
  }
  const rows = sortBy(yards, (yard) => yard.yardId).map((yard) => ({
    yardId: yard.yardId,
    colonies: requireInteger(yard.colonies, 'colonies', { min: 0, max: 5000 }),
    gallons: Math.round(yard.colonies * perColony * 10) / 10,
  }));
  return {
    stage,
    ratio: ratioFor(stage),
    rows,
    gallons: Math.round(sumBy(rows, (row) => row.gallons) * 10) / 10,
    colonies: sumBy(rows, (row) => row.colonies),
  };
}

/** Tank fills the run takes, which is what decides how many days it is. */
export function fillsNeeded(run, tankGallons = TANK_GALLONS) {
  const tank = requireInteger(tankGallons, 'tankGallons', { min: 50, max: 5000 });
  if (run.gallons === 0) return 0;
  return Math.ceil(run.gallons / tank);
}

export function daysNeeded(
  run,
  { tankGallons = TANK_GALLONS, yardsPerDay = YARDS_PER_DAY } = {}
) {
  const byTank = fillsNeeded(run, tankGallons);
  const byYards = Math.ceil(
    run.rows.length / requireInteger(yardsPerDay, 'yardsPerDay', { min: 1, max: 40 })
  );
  return Math.max(byTank, byYards);
}

export function runCostCents(run, sugarCentsPerLb) {
  const batch = batchForColonies(run.colonies, run.stage);
  return batchCostCents(batch, sugarCentsPerLb);
}

/** Split the run into days, filling each day to the tank and the yard limit. */
export function splitIntoDays(run, from, options = {}) {
  const { tankGallons = TANK_GALLONS, yardsPerDay = YARDS_PER_DAY } = options;
  const days = [];
  let current = { date: from, rows: [], gallons: 0 };
  for (const row of run.rows) {
    const wouldOverfill = current.gallons + row.gallons > tankGallons;
    const wouldOvershoot = current.rows.length >= yardsPerDay;
    if (current.rows.length > 0 && (wouldOverfill || wouldOvershoot)) {
      days.push(current);
      current = { date: addDays(current.date, 1), rows: [], gallons: 0 };
    }
    current.rows.push(row);
    current.gallons = Math.round((current.gallons + row.gallons) * 10) / 10;
  }
  if (current.rows.length > 0) days.push(current);
  return days;
}

export function proteinRunFor(yards, kind, days) {
  const spec = specFor(kind);
  const visits = visitsBetween(days);
  const colonies = sumBy(yards, (yard) => yard.colonies);
  return {
    kind,
    visits,
    colonies,
    poundsPerVisit: Math.round(spec.poundsPerVisit * colonies * 10) / 10,
    costCents: costCentsFor(kind, colonies, visits),
    intervalDays: VISIT_INTERVAL_DAYS,
  };
}

/** Visit dates for a protein run, so the crew can put them on the wall. */
export function visitDates(from, days) {
  const visits = visitsBetween(days);
  return Array.from({ length: visits }, (_unused, at) =>
    addDays(from, at * VISIT_INTERVAL_DAYS)
  );
}

export function nextVisitAfter(from, days, today) {
  const dates = visitDates(from, days);
  return dates.find((date) => compareDates(date, today) >= 0);
}

export function describeRun(run, from, options = {}) {
  const days = splitIntoDays(run, from, options);
  const lines = [
    `${run.gallons} gallons of ${run.ratio} over ${run.rows.length} yards, ${days.length} days`,
  ];
  for (const day of days) {
    lines.push(`${day.date}: ${day.rows.length} yards, ${day.gallons} gallons`);
  }
  return lines.join('\n');
}

export function describeCost(run, sugarCentsPerLb) {
  return `${formatMoney(runCostCents(run, sugarCentsPerLb))} of sugar, feeding ${coloniesFed(
    batchForColonies(run.colonies, run.stage),
    run.stage
  )} colonies`;
}

export function daysBetweenVisits(from, to) {
  return diffDays(from, to);
}
