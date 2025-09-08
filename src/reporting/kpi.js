import { roundTo } from '../core/rounding.js';
import { sumBy } from '../core/collections.js';
import { formatMoney } from '../core/money.js';
import { isProductive } from '../apiary/colony.js';
import { contractValueCents, contractedHives } from '../contracts/contract.js';
import { coloniesMeetingMinimum, pooledReadings } from '../contracts/assessment.js';
import { shortBy } from '../placement/drop.js';
import {
  seasonContracts,
  seasonDrops,
  seasonGradings,
  seasonTreatments,
} from './season.js';

/**
 * The half dozen numbers the operation is actually judged on.
 *
 * Everything else in the reporting folder answers a question somebody asked.
 * These are the ones asked every year, by the bank in January and by whoever
 * is thinking about buying the outfit. They are deliberately few, and each one
 * is defined here rather than being worked out on a napkin differently every
 * time.
 */

/** Colonies that made the contract minimum, over colonies graded. */
export function gradePassRate(desk, season) {
  let read = 0;
  let made = 0;
  for (const contract of seasonContracts(desk, season)) {
    const runs = seasonGradings(desk, season).filter(
      (run) => run.contractId === contract.id
    );
    if (runs.length === 0) continue;
    read += pooledReadings(contract, runs).length;
    made += coloniesMeetingMinimum(contract, runs);
  }
  return { read, made, rate: read === 0 ? 0 : roundTo(made / read, 3) };
}

/** Hives set against hives ordered, which is the one the growers feel. */
export function fillRate(desk, season) {
  const contracts = seasonContracts(desk, season);
  const drops = seasonDrops(desk, season);
  const ordered = sumBy(contracts, contractedHives);
  const set = sumBy(drops, (drop) => drop.set ?? 0);
  return {
    ordered,
    set,
    short: sumBy(drops, shortBy),
    rate: ordered === 0 ? 0 : roundTo(set / ordered, 3),
  };
}

/** Contract value over colonies on the books, the number the bank asks for. */
export function revenuePerColony(desk, season) {
  const contracts = seasonContracts(desk, season);
  const colonies = desk.store.list('colonies').filter(isProductive).length;
  const valueCents = sumBy(contracts, contractValueCents);
  return {
    colonies,
    valueCents,
    perColonyCents: colonies === 0 ? 0 : Math.round(valueCents / colonies),
  };
}

export function gradingCoverage(desk, season) {
  const drops = seasonDrops(desk, season);
  const graded = new Set(seasonGradings(desk, season).map((run) => run.dropId));
  return {
    drops: drops.length,
    graded: drops.filter((drop) => graded.has(drop.id)).length,
    rate:
      drops.length === 0
        ? 0
        : roundTo(drops.filter((drop) => graded.has(drop.id)).length / drops.length, 3),
  };
}

export function treatmentsPerColony(desk, season) {
  const colonies = desk.store.list('colonies').filter(isProductive).length;
  const treated = sumBy(
    seasonTreatments(desk, season),
    (treatment) => treatment.colonies.length
  );
  return {
    colonies,
    applications: treated,
    perColony: colonies === 0 ? 0 : roundTo(treated / colonies, 2),
  };
}

export function kpis(desk, season) {
  return {
    season,
    fill: fillRate(desk, season),
    grade: gradePassRate(desk, season),
    revenue: revenuePerColony(desk, season),
    coverage: gradingCoverage(desk, season),
    treatments: treatmentsPerColony(desk, season),
  };
}

export function kpiRows(desk, season) {
  const all = kpis(desk, season);
  return [
    {
      name: 'hives set',
      value: `${all.fill.set} of ${all.fill.ordered}`,
      rate: all.fill.rate,
    },
    {
      name: 'graded at or over minimum',
      value: `${all.grade.made} of ${all.grade.read}`,
      rate: all.grade.rate,
    },
    {
      name: 'drops graded',
      value: `${all.coverage.graded} of ${all.coverage.drops}`,
      rate: all.coverage.rate,
    },
    {
      name: 'contract value per colony',
      value: formatMoney(all.revenue.perColonyCents),
      rate: null,
    },
    {
      name: 'treatments per colony',
      value: String(all.treatments.perColony),
      rate: null,
    },
  ];
}
