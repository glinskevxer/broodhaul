import { ValidationError } from '../core/errors.js';
import { requireOneOf, requireString } from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { sortBy } from '../core/collections.js';
import { sameRecord } from '../core/serial.js';
import { appendNdjson, readNdjson } from './files.js';
import { collectionNames } from './repository.js';

/**
 * The journal: what changed, who changed it and when.
 *
 * The office is two people and a laptop in a shop, and the question that comes
 * up is never "what does the database think" but "who moved that pallet on
 * Thursday". So every write goes in an append only file next to the records,
 * one line per change, and nothing ever edits a line that is already there.
 *
 * A journal entry holds the record after the change rather than a diff. Diffs
 * are smaller and nobody can read one at seven in the morning.
 */

export const ACTIONS = ['insert', 'update', 'remove'];

export const JOURNAL_FILE = 'journal.ndjson';

export function makeEntry({ at, actor, action, collection, id, record }) {
  const stamp = requireString(at, 'at', { min: 10, max: 30 });
  parseDate(stamp.slice(0, 10), 'at');
  return {
    at: stamp,
    actor: requireString(actor, 'actor', { max: 60 }),
    action: requireOneOf(action, 'action', ACTIONS),
    collection: requireOneOf(collection, 'collection', collectionNames()),
    id: requireString(id, 'id', { max: 40 }),
    record: action === 'remove' ? undefined : record,
  };
}

export function openJournal(root, clock) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new ValidationError('a journal needs a directory', {});
  }
  const path = `${root}/${JOURNAL_FILE}`;

  function append(entry) {
    const built = makeEntry({ at: clock.now(), ...entry });
    appendNdjson(path, built);
    return built;
  }

  function read() {
    return readNdjson(path, { tolerateTail: true }).map((entry) => makeEntry(entry));
  }

  return { path, append, read };
}

export function entriesFor(entries, collection, id) {
  return entries.filter((entry) => entry.collection === collection && entry.id === id);
}

export function entriesOn(entries, date) {
  const day = parseDate(date);
  return entries.filter((entry) => entry.at.slice(0, 10) === day);
}

export function entriesSince(entries, date) {
  const day = parseDate(date);
  return entries.filter((entry) => entry.at.slice(0, 10) >= day);
}

export function actors(entries) {
  return [...new Set(entries.map((entry) => entry.actor))].sort();
}

/** The last state the journal saw for a record, which is what a rebuild reads. */
export function latestState(entries, collection, id) {
  const history = entriesFor(entries, collection, id);
  const last = history[history.length - 1];
  if (!last || last.action === 'remove') return undefined;
  return last.record;
}

/**
 * Records the journal holds that the store does not, and the other way round.
 * A store restored from a backup and a journal that kept running will disagree
 * here, and the office needs to be told rather than have one quietly win.
 */
export function reconcile(entries, store, collection) {
  const journalIds = new Set(
    entries.filter((entry) => entry.collection === collection).map((entry) => entry.id)
  );
  const live = new Set(store.list(collection).map((record) => record.id));
  const missing = [...journalIds].filter(
    (id) => !live.has(id) && latestState(entries, collection, id) !== undefined
  );
  const unlogged = [...live].filter((id) => !journalIds.has(id));
  const stale = [...live].filter((id) => {
    const state = latestState(entries, collection, id);
    return state !== undefined && !sameRecord(state, store.get(collection, id));
  });
  return {
    collection,
    missing: sortBy(missing, (id) => id),
    unlogged: sortBy(unlogged, (id) => id),
    stale: sortBy(stale, (id) => id),
  };
}

export function describeEntry(entry) {
  return `${entry.at} ${entry.actor} ${entry.action} ${entry.collection} ${entry.id}`;
}
