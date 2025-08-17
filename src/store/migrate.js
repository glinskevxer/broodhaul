import { ValidationError } from '../core/errors.js';
import { requireInteger } from '../core/validate.js';
import { sortBy } from '../core/collections.js';
import { collectionNames, COLLECTIONS } from './repository.js';
import { readJson, writeJson } from './files.js';

/**
 * Moving old records forward.
 *
 * The store parses every record on the way out, so a record written by an
 * older build either parses or stops the program. That is the right trade for
 * a desk this size, but it means a change to a record shape has to come with
 * a way of bringing the old ones along, and that has to be replayable because
 * the two offices sync and one of them will always run it twice.
 *
 * A migration is a version number, a note and a function per collection.
 * Running them is idempotent: the file records the version it is at, and a
 * migration that has already run is skipped rather than reapplied.
 */

export const VERSION_FILE = 'version.json';
export const INITIAL_VERSION = 1;

const MIGRATIONS = [
  {
    version: 2,
    note: 'yards carry a water source, older ones were all on a canal',
    collections: {
      yards: (record) => ({ water: 'canal', ...record }),
    },
  },
  {
    version: 3,
    note: 'colonies carry a status, older ones were all active',
    collections: {
      colonies: (record) => ({
        status: 'active',
        statusOn: record.installedOn,
        ...record,
      }),
    },
  },
];

export function latestVersion() {
  return MIGRATIONS.reduce(
    (highest, entry) => Math.max(highest, entry.version),
    INITIAL_VERSION
  );
}

export function migrationsAfter(version) {
  const from = requireInteger(version, 'version', { min: 1, max: 1000 });
  return sortBy(
    MIGRATIONS.filter((entry) => entry.version > from),
    (entry) => entry.version
  );
}

export function readVersion(root) {
  const record = readJson(`${root}/${VERSION_FILE}`, { missing: null });
  if (record === null) return INITIAL_VERSION;
  if (!Number.isInteger(record.version)) {
    throw new ValidationError('the version file does not hold a version', { record });
  }
  return record.version;
}

export function writeVersion(root, version, { at } = {}) {
  return writeJson(`${root}/${VERSION_FILE}`, {
    version: requireInteger(version, 'version', { min: 1, max: 1000 }),
    at,
  });
}

/** What running the migrations would do, without doing any of it. */
export function planMigration(store, root) {
  const from = readVersion(root);
  const steps = migrationsAfter(from).map((entry) => ({
    version: entry.version,
    note: entry.note,
    collections: Object.keys(entry.collections).sort(),
    records: Object.keys(entry.collections).reduce(
      (total, collection) => total + store.count(collection),
      0
    ),
  }));
  return { from, to: latestVersion(), steps };
}

export function runMigrations(store, root, { at } = {}) {
  const plan = planMigration(store, root);
  const changed = [];
  for (const entry of migrationsAfter(plan.from)) {
    for (const [collection, migrate] of Object.entries(entry.collections)) {
      if (!collectionNames().includes(collection)) {
        throw new ValidationError(
          `migration ${entry.version} names unknown ${collection}`,
          {
            collection,
          }
        );
      }
      for (const record of store.list(collection)) {
        const next = COLLECTIONS[collection].parse(migrate(record));
        store.put(collection, next);
        changed.push({ version: entry.version, collection, id: record.id });
      }
    }
  }
  writeVersion(root, plan.to, { at });
  return {
    from: plan.from,
    to: plan.to,
    steps: plan.steps.length,
    records: changed.length,
  };
}

export function isUpToDate(root) {
  return readVersion(root) === latestVersion();
}

export function describePlan(plan) {
  if (plan.steps.length === 0) {
    return `records are at version ${plan.from}, nothing to do`;
  }
  const lines = [`version ${plan.from} to ${plan.to}`];
  for (const step of plan.steps) {
    lines.push(`  ${step.version}: ${step.note} (${step.records} records)`);
  }
  return lines.join('\n');
}
