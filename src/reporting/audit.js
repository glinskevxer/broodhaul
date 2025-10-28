import { parseDate } from '../core/dates.js';
import { groupBy, sortBy, sumBy } from '../core/collections.js';
import { sameRecord } from '../core/serial.js';
import { collectionNames } from '../store/repository.js';
import { entriesFor, entriesOn, entriesSince, latestState } from '../store/journal.js';

/**
 * Reading the journal back.
 *
 * Two questions come up and neither is answered by the records themselves.
 * Who has been changing things, and what did this record look like before
 * somebody changed it. The journal holds both, but only as a flat list of
 * lines, and reading three thousand of them by eye is not an answer.
 */

export function activityByActor(entries) {
  const groups = groupBy(entries, (entry) => entry.actor);
  return sortBy(
    [...groups.entries()].map(([actor, rows]) => ({
      actor,
      writes: rows.length,
      inserts: rows.filter((row) => row.action === 'insert').length,
      updates: rows.filter((row) => row.action === 'update').length,
      removes: rows.filter((row) => row.action === 'remove').length,
      firstOn: rows[0].at.slice(0, 10),
      lastOn: rows[rows.length - 1].at.slice(0, 10),
    })),
    (row) => row.actor
  );
}

export function activityByDay(entries) {
  const groups = groupBy(entries, (entry) => entry.at.slice(0, 10));
  return sortBy(
    [...groups.entries()].map(([day, rows]) => ({
      day,
      writes: rows.length,
      actors: new Set(rows.map((row) => row.actor)).size,
    })),
    (row) => row.day
  );
}

export function activityByCollection(entries) {
  const groups = groupBy(entries, (entry) => entry.collection);
  const rows = collectionNames().map((collection) => ({
    collection,
    writes: (groups.get(collection) ?? []).length,
  }));
  return sortBy(rows, (row) => row.collection);
}

/** Every version of one record, oldest first, with what changed between them. */
export function historyOf(entries, collection, id) {
  const history = entriesFor(entries, collection, id);
  return history.map((entry, at) => {
    const previous = at === 0 ? undefined : history[at - 1].record;
    return {
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      changed:
        entry.action === 'remove' || previous === undefined
          ? []
          : changedFields(previous, entry.record),
    };
  });
}

export function changedFields(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => !sameRecord(before?.[key], after?.[key])).sort();
}

/** Records touched more than once, which is usually where a mistake lives. */
export function reworked(entries, { atLeast = 3 } = {}) {
  const groups = groupBy(entries, (entry) => `${entry.collection}/${entry.id}`);
  return sortBy(
    [...groups.entries()]
      .filter(([, rows]) => rows.length >= atLeast)
      .map(([key, rows]) => {
        const [collection, id] = key.split('/');
        return {
          collection,
          id,
          writes: rows.length,
          actors: [...new Set(rows.map((row) => row.actor))].sort(),
        };
      }),
    (row) => -row.writes,
    (row) => row.id
  );
}

export function auditSummary(entries, { since } = {}) {
  const rows =
    since === undefined ? entries : entriesSince(entries, parseDate(since, 'since'));
  return {
    writes: rows.length,
    actors: activityByActor(rows).length,
    days: activityByDay(rows).length,
    collections: activityByCollection(rows).filter((row) => row.writes > 0).length,
    removals: rows.filter((row) => row.action === 'remove').length,
  };
}

export function busiestDay(entries) {
  const days = activityByDay(entries);
  if (days.length === 0) return null;
  return sortBy(
    days,
    (row) => -row.writes,
    (row) => row.day
  )[0];
}

export function writesOn(entries, day) {
  return sumBy(entriesOn(entries, day), () => 1);
}

/** Records the journal knows and that no longer exist, from the last action. */
export function removedRecords(entries) {
  const groups = groupBy(entries, (entry) => `${entry.collection}/${entry.id}`);
  return sortBy(
    [...groups.entries()]
      .filter(([, rows]) => rows[rows.length - 1].action === 'remove')
      .map(([key, rows]) => {
        const [collection, id] = key.split('/');
        return {
          collection,
          id,
          removedOn: rows[rows.length - 1].at.slice(0, 10),
          by: rows[rows.length - 1].actor,
          lastState: latestState(entries, collection, id),
        };
      }),
    (row) => row.collection,
    (row) => row.id
  );
}
