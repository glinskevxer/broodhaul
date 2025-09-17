import { RuleViolation } from '../core/errors.js';
import {
  requireInteger,
  requireNumber,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { addDays, compareDates, parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { sortBy, sumBy } from '../core/collections.js';

/**
 * Raising queens.
 *
 * A graft is a batch of larvae moved into cell cups on one morning. Ten days
 * later the cells go into mating nucs, and about three weeks after that the
 * queens that took are laying. Every number in that sentence is a date the
 * crew has to be somewhere, and every one of them is worked out here rather
 * than from a calendar on the wall with the wrong year on it.
 *
 * The take rates are this outfit's own, three seasons of them. They are lower
 * than the numbers in the books, which is what happens when grafting is done
 * by whoever is free rather than by somebody who is good at it.
 */

export const CELL_STAGES = ['grafted', 'capped', 'in nucs', 'laying'];

export const DAYS_TO_CAPPED = 5;
export const DAYS_TO_CELLS_OUT = 10;
export const DAYS_TO_LAYING = 31;

/** Share of grafts that take, by who did the grafting. */
export const GRAFT_TAKE = {
  experienced: 0.7,
  learning: 0.45,
};

/** Share of cells that produce a laying queen once they are in a nuc. */
export const MATING_SUCCESS = 0.75;

export const CELL_BUILDER_CAPACITY = 45;

export function makeGraft(input) {
  const grafted = requireInteger(input.grafted, 'grafted', { min: 1, max: 500 });
  const grafter = requireOneOf(
    input.grafter ?? 'experienced',
    'grafter',
    Object.keys(GRAFT_TAKE)
  );
  return {
    id: requireString(input.id, 'graft.id', { max: 20 }).toUpperCase(),
    graftedOn: parseDate(input.graftedOn, 'graftedOn'),
    grafted,
    grafter,
    builderId: requireString(input.builderId, 'builderId', { max: 20 }),
  };
}

export function checkBuilderCapacity(graft, alreadyIn = 0) {
  const inBuilder = requireInteger(alreadyIn, 'alreadyIn', { min: 0, max: 1000 });
  if (graft.grafted + inBuilder > CELL_BUILDER_CAPACITY) {
    throw new RuleViolation(
      'QN-1',
      `builder ${graft.builderId} holds ${CELL_BUILDER_CAPACITY} cells, this makes ${graft.grafted + inBuilder}`,
      {
        builder: graft.builderId,
        wanted: graft.grafted + inBuilder,
        capacity: CELL_BUILDER_CAPACITY,
      }
    );
  }
  return true;
}

export function cappedOn(graft) {
  return addDays(graft.graftedOn, DAYS_TO_CAPPED);
}

export function cellsOutOn(graft) {
  return addDays(graft.graftedOn, DAYS_TO_CELLS_OUT);
}

export function layingByOn(graft) {
  return addDays(graft.graftedOn, DAYS_TO_LAYING);
}

export function stageOn(graft, date) {
  const day = parseDate(date);
  if (compareDates(day, cappedOn(graft)) < 0) return 'grafted';
  if (compareDates(day, cellsOutOn(graft)) < 0) return 'capped';
  if (compareDates(day, layingByOn(graft)) < 0) return 'in nucs';
  return 'laying';
}

export function expectedCells(graft) {
  return Math.floor(graft.grafted * GRAFT_TAKE[graft.grafter]);
}

export function expectedQueens(graft, matingSuccess = MATING_SUCCESS) {
  const rate = requireNumber(matingSuccess, 'matingSuccess', { min: 0, max: 1 });
  return Math.floor(expectedCells(graft) * rate);
}

/** Grafts needed to end with a wanted number of laying queens. */
export function graftsNeeded(
  wanted,
  { grafter = 'experienced', matingSuccess = MATING_SUCCESS } = {}
) {
  const target = requireInteger(wanted, 'wanted', { min: 1, max: 5000 });
  const take = GRAFT_TAKE[requireOneOf(grafter, 'grafter', Object.keys(GRAFT_TAKE))];
  const rate = requireNumber(matingSuccess, 'matingSuccess', { min: 0.01, max: 1 });
  return Math.ceil(target / (take * rate));
}

export function batchesNeeded(wanted, options = {}) {
  return Math.ceil(graftsNeeded(wanted, options) / CELL_BUILDER_CAPACITY);
}

/** The latest a graft can be made and still have queens laying by a date. */
export function latestGraftDate(byDate) {
  return addDays(parseDate(byDate, 'byDate'), -DAYS_TO_LAYING);
}

export function scheduleFor(graft) {
  return [
    { stage: 'grafted', on: graft.graftedOn },
    { stage: 'capped', on: cappedOn(graft) },
    { stage: 'in nucs', on: cellsOutOn(graft) },
    { stage: 'laying', on: layingByOn(graft) },
  ];
}

export function graftBook(grafts, date) {
  if (grafts.length === 0) return { grafts: 0, cells: 0, queens: 0, stages: [] };
  const rows = sortBy(
    grafts,
    (graft) => graft.graftedOn,
    (graft) => graft.id
  ).map((graft) => ({
    id: graft.id,
    graftedOn: graft.graftedOn,
    stage: stageOn(graft, date),
    grafted: graft.grafted,
    cells: expectedCells(graft),
    queens: expectedQueens(graft),
  }));
  return {
    grafts: rows.length,
    cells: sumBy(rows, (row) => row.cells),
    queens: sumBy(rows, (row) => row.queens),
    stages: rows,
  };
}

export function takeRate(grafted, laying) {
  const count = requireInteger(grafted, 'grafted', { min: 1 });
  return roundTo(requireInteger(laying, 'laying', { min: 0 }) / count, 3);
}

export function describeGraft(graft) {
  return `${graft.id}: ${graft.grafted} grafted ${graft.graftedOn}, cells out ${cellsOutOn(graft)}, laying by ${layingByOn(graft)}`;
}
