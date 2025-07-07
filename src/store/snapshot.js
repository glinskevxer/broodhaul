import { ValidationError } from '../core/errors.js';
import { requireString } from '../core/validate.js';
import { stableStringify } from '../core/serial.js';
import { sortBy } from '../core/collections.js';
import { collectionNames, openStore } from './repository.js';
import { readJson, writeJson } from './files.js';

/**
 * Snapshots.
 *
 * The record directory syncs between two machines and somebody occasionally
 * restores the wrong side of it. A snapshot is one json file holding every
 * record, taken before anything that might go badly, and restoring it is the
 * only operation in the codebase that deliberately overwrites work.
 *
 * It is deliberately not a backup tool. It does not compress, it does not
 * rotate, and it holds no journal. What it does is let somebody say "put it
 * back the way it was at eight this morning" and be believed.
 */

export const SNAPSHOT_VERSION = 1;

export function takeSnapshot(store, { takenAt, note } = {}) {
  const collections = {};
  for (const collection of collectionNames()) {
    collections[collection] = store.list(collection);
  }
  return {
    version: SNAPSHOT_VERSION,
    takenAt: requireString(takenAt, 'takenAt', { min: 10, max: 30 }),
    note: note === undefined ? undefined : requireString(note, 'note', { max: 200 }),
    collections,
  };
}

export function snapshotCounts(snapshot) {
  return sortBy(
    Object.entries(snapshot.collections).map(([collection, records]) => ({
      collection,
      records: records.length,
    })),
    (row) => row.collection
  );
}

export function snapshotTotal(snapshot) {
  return snapshotCounts(snapshot).reduce((total, row) => total + row.records, 0);
}

export function writeSnapshot(path, snapshot) {
  return writeJson(path, snapshot);
}

export function readSnapshot(path) {
  const raw = readJson(path);
  if (raw.version !== SNAPSHOT_VERSION) {
    throw new ValidationError(
      `snapshot is version ${raw.version}, this build reads ${SNAPSHOT_VERSION}`,
      { version: raw.version }
    );
  }
  const unknown = Object.keys(raw.collections ?? {}).filter(
    (collection) => !collectionNames().includes(collection)
  );
  if (unknown.length > 0) {
    throw new ValidationError(
      `snapshot holds unknown collections: ${unknown.join(', ')}`,
      {
        unknown,
      }
    );
  }
  return raw;
}

/**
 * Put a snapshot back. Everything the snapshot names is written; anything in
 * the store that the snapshot does not name is removed, because a restore that
 * leaves yesterday's records behind is worse than no restore at all.
 */
export function restoreSnapshot(store, snapshot) {
  const written = [];
  const removed = [];
  for (const collection of collectionNames()) {
    const records = snapshot.collections[collection] ?? [];
    const wanted = new Set(records.map((record) => record.id));
    for (const existing of store.list(collection)) {
      if (!wanted.has(existing.id)) {
        store.remove(collection, existing.id);
        removed.push({ collection, id: existing.id });
      }
    }
    for (const record of records) {
      store.put(collection, record);
      written.push({ collection, id: record.id });
    }
  }
  return { written: written.length, removed: removed.length };
}

/** True when the store holds exactly what the snapshot does. */
export function matchesSnapshot(store, snapshot) {
  for (const collection of collectionNames()) {
    const records = snapshot.collections[collection] ?? [];
    const live = store.list(collection);
    if (stableStringify(records) !== stableStringify(live)) return false;
  }
  return true;
}

export function differenceFromSnapshot(store, snapshot) {
  const rows = [];
  for (const collection of collectionNames()) {
    const inSnapshot = new Map(
      (snapshot.collections[collection] ?? []).map((record) => [record.id, record])
    );
    const live = new Map(store.list(collection).map((record) => [record.id, record]));
    for (const [id, record] of live.entries()) {
      if (!inSnapshot.has(id)) {
        rows.push({ collection, id, change: 'added' });
      } else if (stableStringify(record) !== stableStringify(inSnapshot.get(id))) {
        rows.push({ collection, id, change: 'changed' });
      }
    }
    for (const id of inSnapshot.keys()) {
      if (!live.has(id)) rows.push({ collection, id, change: 'removed' });
    }
  }
  return sortBy(
    rows,
    (row) => row.collection,
    (row) => row.id
  );
}

export function openSnapshotStore(root) {
  return openStore(requireString(root, 'root', { max: 400 }));
}
