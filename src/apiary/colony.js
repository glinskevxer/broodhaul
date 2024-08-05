import { StateError, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { compareDates, parseDate } from '../core/dates.js';
import { parseId } from '../core/ids.js';

/**
 * A colony is one hive of bees with a brand burned into the bottom board.
 *
 * The brand is what the state inspector reads and what a load sheet is checked
 * against, so it stays with the woodenware even when the bees in it die and
 * the box is refilled the following spring. The colony record is therefore
 * about the bees, not the box, and it ends when the bees do.
 */

export const COLONY_STATUSES = ['active', 'dead', 'combined', 'sold', 'split'];

export const QUEEN_RACES = ['italian', 'carniolan', 'russian', 'caucasian', 'mixed'];

const TRANSITIONS = {
  active: ['dead', 'combined', 'sold', 'split'],
  dead: [],
  combined: [],
  sold: [],
  split: ['active', 'dead'],
};

const COLONY_KEYS = [
  'id',
  'brand',
  'yardId',
  'installedOn',
  'queen',
  'boxes',
  'status',
  'statusOn',
  'notes',
];

function parseQueen(value) {
  const queen = requireObject(value, 'queen');
  rejectUnknownKeys(queen, 'queen', ['source', 'race', 'installedOn', 'marked']);
  return {
    source: requireString(queen.source, 'queen.source', { max: 60 }),
    race: requireOneOf(queen.race, 'queen.race', QUEEN_RACES),
    installedOn: parseDate(queen.installedOn, 'queen.installedOn'),
    marked: optional(queen.marked, (marked) =>
      requireOneOf(marked, 'queen.marked', ['white', 'yellow', 'red', 'green', 'blue'])
    ),
  };
}

function parseBoxes(value) {
  const boxes = requireObject(value, 'boxes');
  rejectUnknownKeys(boxes, 'boxes', ['deeps', 'mediums']);
  const deeps = requireInteger(boxes.deeps, 'boxes.deeps', { min: 0, max: 4 });
  const mediums = requireInteger(boxes.mediums, 'boxes.mediums', { min: 0, max: 6 });
  if (deeps === 0 && mediums === 0) {
    throw new ValidationError('a colony needs at least one box', { deeps, mediums });
  }
  return { deeps, mediums };
}

export function makeColony(input) {
  const raw = requireObject(input, 'colony');
  rejectUnknownKeys(raw, 'colony', COLONY_KEYS);
  const installedOn = parseDate(raw.installedOn, 'colony.installedOn');
  const queen = parseQueen(raw.queen);
  if (compareDates(queen.installedOn, installedOn) < 0) {
    throw new ValidationError('the queen went in before the colony existed', {
      installedOn,
      queenInstalledOn: queen.installedOn,
    });
  }
  const status = requireOneOf(raw.status ?? 'active', 'colony.status', COLONY_STATUSES);
  const statusOn = raw.statusOn
    ? parseDate(raw.statusOn, 'colony.statusOn')
    : installedOn;
  if (compareDates(statusOn, installedOn) < 0) {
    throw new ValidationError('a colony cannot change status before it exists', {
      installedOn,
      statusOn,
    });
  }
  return {
    id: parseId(raw.id, 'colony').id,
    brand: requireString(raw.brand, 'colony.brand', { min: 3, max: 12 }).toUpperCase(),
    yardId: parseId(raw.yardId, 'yard').id,
    installedOn,
    queen,
    boxes: parseBoxes(raw.boxes),
    status,
    statusOn,
    notes: optional(raw.notes, (note) =>
      requireString(note, 'colony.notes', { max: 300 })
    ),
  };
}

export function colonyLabel(colony) {
  return `${colony.brand} (${colony.id})`;
}

export function boxCount(colony) {
  return colony.boxes.deeps + colony.boxes.mediums;
}

/** A colony that can be graded, hauled and rented out. */
export function isProductive(colony) {
  return colony.status === 'active';
}

export function allowedTransitions(status) {
  const allowed = TRANSITIONS[status];
  if (!allowed) {
    throw new ValidationError(`unknown colony status ${status}`, { status });
  }
  return [...allowed];
}

export function transitionColony(colony, status, date) {
  const target = requireOneOf(status, 'status', COLONY_STATUSES);
  const day = parseDate(date, 'status date');
  if (!allowedTransitions(colony.status).includes(target)) {
    throw new StateError(`a ${colony.status} colony cannot become ${target}`, {
      colony: colony.id,
      from: colony.status,
      to: target,
    });
  }
  if (compareDates(day, colony.statusOn) < 0) {
    throw new StateError('a colony cannot change status backwards in time', {
      colony: colony.id,
      statusOn: colony.statusOn,
      date: day,
    });
  }
  return { ...colony, status: target, statusOn: day };
}

export function requeen(colony, queen, date) {
  if (!isProductive(colony)) {
    throw new StateError(`cannot requeen a ${colony.status} colony`, {
      colony: colony.id,
    });
  }
  const day = parseDate(date, 'requeen date');
  const next = parseQueen({ ...queen, installedOn: day });
  return { ...colony, queen: next };
}
