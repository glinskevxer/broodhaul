import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';

/**
 * Protein feed.
 *
 * Syrup is carbohydrate and it builds nothing on its own. Brood needs pollen,
 * and in the six weeks before almonds there is none in the valley, so the
 * colonies get patties. How much depends on what the colony is being built
 * for: a hive going to almonds needs eight frames of bees in February and gets
 * fed for it, while one going on a summer flow can be left alone.
 *
 * The patties go stale, so a feeding plan that puts six weeks of patties on in
 * one visit wastes most of them. The schedule here works in visits rather than
 * in totals for that reason.
 */

export const RATION_KINDS = ['patty', 'dry sub', 'trapped pollen'];

/** Pounds per colony per visit, and what a pound costs. */
export const RATION_SPEC = {
  patty: { poundsPerVisit: 1, costCentsPerLb: 285, proteinPct: 15 },
  'dry sub': { poundsPerVisit: 2, costCentsPerLb: 165, proteinPct: 12 },
  'trapped pollen': { poundsPerVisit: 0.5, costCentsPerLb: 900, proteinPct: 24 },
};

export const VISIT_INTERVAL_DAYS = 14;

export function specFor(kind) {
  requireOneOf(kind, 'kind', RATION_KINDS);
  return RATION_SPEC[kind];
}

/** Visits needed to carry colonies from a start date to a target date. */
export function visitsBetween(days) {
  const span = requireInteger(days, 'days', { min: 0, max: 365 });
  if (span === 0) return 0;
  return Math.ceil(span / VISIT_INTERVAL_DAYS);
}

export function poundsFor(kind, colonies, visits) {
  const spec = specFor(kind);
  const count = requireInteger(colonies, 'colonies', { min: 0, max: 100000 });
  const rounds = requireInteger(visits, 'visits', { min: 0, max: 40 });
  return roundTo(spec.poundsPerVisit * count * rounds, 1);
}

export function costCentsFor(kind, colonies, visits) {
  const spec = specFor(kind);
  return multiplyMoney(spec.costCentsPerLb, poundsFor(kind, colonies, visits));
}

/**
 * The cheapest ration that carries the protein the build up needs. Protein is
 * per pound, so the dear one can still win when it takes less of it.
 */
export function cheapestForProtein(colonies, visits, proteinLbWanted) {
  const wanted = requireNumber(proteinLbWanted, 'proteinLbWanted', {
    min: 0.01,
    max: 10000,
  });
  const options = RATION_KINDS.map((kind) => {
    const spec = specFor(kind);
    const perVisitProtein =
      spec.poundsPerVisit * (spec.proteinPct / 100) * colonies * visits;
    if (perVisitProtein === 0) return null;
    const multiplier = wanted / perVisitProtein;
    const pounds = roundTo(poundsFor(kind, colonies, visits) * multiplier, 1);
    return {
      kind,
      pounds,
      costCents: multiplyMoney(spec.costCentsPerLb, pounds),
      proteinLb: roundTo(pounds * (spec.proteinPct / 100), 2),
    };
  }).filter((option) => option !== null);
  if (options.length === 0) {
    throw new ValidationError('no ration can carry that protein', { proteinLbWanted });
  }
  return sortBy(
    options,
    (option) => option.costCents,
    (option) => option.kind
  );
}

export function feedingPlan({ kind, colonies, days, startOn }) {
  const visits = visitsBetween(days);
  const spec = specFor(kind);
  return {
    kind,
    colonies,
    visits,
    startOn,
    poundsPerVisit: roundTo(spec.poundsPerVisit * colonies, 1),
    totalPoundsLb: poundsFor(kind, colonies, visits),
    costCents: costCentsFor(kind, colonies, visits),
    intervalDays: VISIT_INTERVAL_DAYS,
  };
}

export function describePlan(plan) {
  if (plan.visits === 0) {
    return `${plan.colonies} colonies, no feeding needed`;
  }
  return `${plan.colonies} colonies, ${plan.visits} visits of ${plan.poundsPerVisit} lb ${plan.kind}, ${plan.totalPoundsLb} lb in all`;
}
