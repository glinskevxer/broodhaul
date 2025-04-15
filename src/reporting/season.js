import { seasonBounds, seasonOf } from '../core/dates.js';
import { spanContains } from '../core/span.js';
import { sortBy, sumBy } from '../core/collections.js';
import { formatMoney } from '../core/money.js';
import { renderDetail, renderHeading, renderTable } from '../core/table.js';
import { contractedHives, contractValueCents } from '../contracts/contract.js';
import { assessContract } from '../contracts/assessment.js';
import { shortBy } from '../placement/drop.js';
import { isProductive } from '../apiary/colony.js';
import { treatmentSeason } from '../health/treatment.js';

/**
 * The season on one page.
 *
 * Everything here is derived from the records rather than accumulated as the
 * season goes, so a correction made in April changes the February numbers the
 * way it should. The report is slow and nobody cares, because it gets run
 * about four times a year.
 */

export function seasonContracts(desk, season) {
  return sortBy(
    desk.store.list('contracts').filter((contract) => contract.season === season),
    (contract) => contract.id
  );
}

export function seasonDrops(desk, season) {
  const bounds = seasonBounds(season);
  return desk.store
    .list('drops')
    .filter((drop) => drop.setOn !== undefined && spanContains(bounds, drop.setOn));
}

export function seasonGradings(desk, season) {
  return desk.store
    .list('gradings')
    .filter((run) => seasonOf(run.conditions.date) === season);
}

export function seasonTreatments(desk, season) {
  return desk.store
    .list('treatments')
    .filter((treatment) => treatmentSeason(treatment) === season);
}

export function colonyCount(desk) {
  return desk.store.list('colonies').filter(isProductive).length;
}

/** One row per contract: what was owed, what was set, and how the grading went. */
export function contractRows(desk, season) {
  return seasonContracts(desk, season).map((contract) => {
    const runs = seasonGradings(desk, season).filter(
      (run) => run.contractId === contract.id
    );
    const drops = desk.store
      .list('drops')
      .filter((drop) => drop.contractId === contract.id);
    const set = sumBy(drops, (drop) => drop.set ?? 0);
    const assessment = runs.length > 0 ? assessContract(contract, runs) : undefined;
    return {
      contract: contract.id,
      grower: contract.grower.name,
      crop: contract.crop,
      ordered: contractedHives(contract),
      set,
      short: sumBy(drops, shortBy),
      graded: runs.length,
      average: assessment ? assessment.average : undefined,
      meetsMinimum: assessment ? assessment.meetsMinimum : undefined,
      valueCents: contractValueCents(contract),
    };
  });
}

export function seasonSummary(desk, season) {
  const rows = contractRows(desk, season);
  const gradings = seasonGradings(desk, season);
  return {
    season,
    contracts: rows.length,
    growers: new Set(rows.map((row) => row.grower)).size,
    hivesOrdered: sumBy(rows, (row) => row.ordered),
    hivesSet: sumBy(rows, (row) => row.set),
    hivesShort: sumBy(rows, (row) => row.short),
    gradingRuns: gradings.length,
    coloniesRead: sumBy(gradings, (run) => run.readings.length),
    treatments: seasonTreatments(desk, season).length,
    colonies: colonyCount(desk),
    valueCents: sumBy(rows, (row) => row.valueCents),
  };
}

const CONTRACT_COLUMNS = [
  { header: 'contract', key: 'contract' },
  { header: 'grower', key: 'grower' },
  { header: 'ordered', key: 'ordered', align: 'right' },
  { header: 'set', key: 'set', align: 'right' },
  { header: 'short', key: 'short', align: 'right' },
  { header: 'graded', key: 'graded', align: 'right' },
  { header: 'average', key: 'average', align: 'right' },
  {
    header: 'value',
    key: 'valueCents',
    align: 'right',
    format: (cents) => formatMoney(cents),
  },
];

export function renderSeason(desk, season) {
  const summary = seasonSummary(desk, season);
  const parts = [
    renderHeading(`season ${season}`),
    renderDetail([
      ['contracts', `${summary.contracts} for ${summary.growers} growers`],
      ['hives ordered', String(summary.hivesOrdered)],
      ['hives set', String(summary.hivesSet)],
      ['hives short', String(summary.hivesShort)],
      ['grading runs', `${summary.gradingRuns} over ${summary.coloniesRead} colonies`],
      ['treatments', String(summary.treatments)],
      ['colonies on the books', String(summary.colonies)],
      ['contract value', formatMoney(summary.valueCents)],
    ]),
    '',
    renderTable(CONTRACT_COLUMNS, contractRows(desk, season)),
  ];
  return parts.join('\n');
}
