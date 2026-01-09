import { ValidationError } from './core/errors.js';
import { requireOneOf, requireString } from './core/validate.js';
import { systemClock } from './core/clock.js';
import { sortBy } from './core/collections.js';
import { openStore } from './store/repository.js';
import { openJournal, reconcile } from './store/journal.js';
import { buildRegister, registerProblems } from './apiary/register.js';
import { separationBreaches } from './apiary/geo.js';
import { checkPullInWindow, checkSetInWindow } from './placement/drop.js';
import { isOverdue } from './health/treatment.js';
import { isHeldOn } from './health/inspection.js';

/**
 * The desk: the store, the journal and the checks that read across them.
 *
 * Everything the CLI does goes through here, so there is exactly one place
 * that knows a write has to be journalled and exactly one place that knows
 * what a consistent set of records looks like. The alternative, which this
 * replaced, was every command remembering to append its own journal line, and
 * two of them did not.
 */

export const MINIMUM_YARD_SEPARATION_MILES = 0.5;

/**
 * Every kind of problem the desk can report.
 *
 * Written down rather than derived, because the point of the list is to catch
 * a name that is no longer produced. A kind that is removed from a check and
 * left here fails its own test; a kind added to a check and not listed fails
 * the same one. Both have happened.
 */
export const PROBLEM_KINDS = [
  'colony_yard_missing',
  'dead_colony_on_pallet',
  'drop_contract_missing',
  'drop_outside_window',
  'load_out_of_held_yard',
  'pallet_colony_missing',
  'pallet_yard_missing',
  'record_ahead_of_journal',
  'record_missing_from_store',
  'treatment_overdue',
  'yard_disagreement',
  'yard_over_capacity',
  'yards_too_close',
];

export function requireProblemKind(kind) {
  return requireOneOf(kind, 'kind', PROBLEM_KINDS);
}

export function openDesk({ root, actor, clock = systemClock() } = {}) {
  const directory = requireString(root, 'root', { max: 400 });
  const who = requireString(actor, 'actor', { max: 60 });
  const store = openStore(directory);
  const journal = openJournal(directory, clock);

  function save(collection, record) {
    const existed = store.has(collection, record.id);
    const saved = store.put(collection, record);
    journal.append({
      actor: who,
      action: existed ? 'update' : 'insert',
      collection,
      id: saved.id,
      record: saved,
    });
    return saved;
  }

  function remove(collection, id) {
    const removed = store.remove(collection, id);
    if (removed) {
      journal.append({ actor: who, action: 'remove', collection, id });
    }
    return removed;
  }

  function register() {
    return buildRegister({
      yards: store.list('yards'),
      pallets: store.list('pallets'),
      colonies: store.list('colonies'),
    });
  }

  return { root: directory, actor: who, clock, store, journal, save, remove, register };
}

/** Every yard pair sitting closer than the county registration allows. */
export function separationProblems(desk) {
  return separationBreaches(
    desk.store.list('yards'),
    MINIMUM_YARD_SEPARATION_MILES
  ).map((breach) => ({ kind: 'yards_too_close', ...breach }));
}

export function dropWindowProblems(desk) {
  const contracts = new Map(
    desk.store.list('contracts').map((entry) => [entry.id, entry])
  );
  const problems = [];
  for (const drop of desk.store.list('drops')) {
    const contract = contracts.get(drop.contractId);
    if (!contract) {
      problems.push({
        kind: 'drop_contract_missing',
        drop: drop.id,
        contract: drop.contractId,
      });
      continue;
    }
    for (const check of [checkSetInWindow, checkPullInWindow]) {
      try {
        check(contract, drop);
      } catch (err) {
        problems.push({
          kind: 'drop_outside_window',
          drop: drop.id,
          rule: err.rule,
          message: err.message,
        });
      }
    }
  }
  return problems;
}

export function treatmentProblems(desk) {
  const today = desk.clock.today();
  return desk.store
    .list('treatments')
    .filter((treatment) => isOverdue(treatment, today))
    .map((treatment) => ({
      kind: 'treatment_overdue',
      treatment: treatment.id,
      product: treatment.product,
      appliedOn: treatment.appliedOn,
    }));
}

export function holdProblems(desk) {
  const today = desk.clock.today();
  const held = desk.store
    .list('inspections')
    .filter((inspection) => isHeldOn(inspection, today));
  const loads = desk.store.list('loads').filter((load) => load.state !== 'delivered');
  const problems = [];
  for (const inspection of held) {
    for (const load of loads) {
      if (load.originYardId === inspection.yardId) {
        problems.push({
          kind: 'load_out_of_held_yard',
          load: load.id,
          yard: inspection.yardId,
          inspection: inspection.id,
        });
      }
    }
  }
  return problems;
}

export function journalProblems(desk) {
  const entries = desk.journal.read();
  const problems = [];
  for (const collection of ['yards', 'colonies', 'pallets']) {
    const outcome = reconcile(entries, desk.store, collection);
    for (const id of outcome.missing) {
      problems.push({ kind: 'record_missing_from_store', collection, id });
    }
    for (const id of outcome.stale) {
      problems.push({ kind: 'record_ahead_of_journal', collection, id });
    }
  }
  return problems;
}

/**
 * Everything wrong with the desk, in one list. The nightly job prints this and
 * the office works down it, so the order is stable and the shapes are flat.
 */
export function problems(desk) {
  const found = [
    ...registerProblems(desk.register()),
    ...separationProblems(desk),
    ...dropWindowProblems(desk),
    ...treatmentProblems(desk),
    ...holdProblems(desk),
    ...journalProblems(desk),
  ];
  return sortBy(
    found,
    (problem) => problem.kind,
    (problem) => JSON.stringify(problem)
  );
}

export function problemCounts(desk) {
  const counts = new Map();
  for (const problem of problems(desk)) {
    counts.set(problem.kind, (counts.get(problem.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
}

export function requireClean(desk) {
  const found = problems(desk);
  if (found.length > 0) {
    throw new ValidationError(`the desk has ${found.length} problems`, {
      problems: found.slice(0, 5),
    });
  }
  return true;
}
