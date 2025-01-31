import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { sortBy } from '../core/collections.js';
import { sameRecord } from '../core/serial.js';
import {
  collectionPath,
  listJsonFiles,
  readJson,
  recordPath,
  removeFile,
  writeJson,
} from './files.js';
import { makeYard } from '../apiary/yard.js';
import { makeColony } from '../apiary/colony.js';
import { makePallet } from '../apiary/pallet.js';
import { makeContract } from '../contracts/contract.js';
import { makeBlock } from '../placement/block.js';
import { makeDrop } from '../placement/drop.js';
import { makeLoad } from '../movement/load.js';
import { makeGradingRun } from '../grading/run.js';
import { makeTreatment } from '../health/treatment.js';
import { makeInspection } from '../health/inspection.js';

/**
 * The record store.
 *
 * One directory per kind, one file per record, named by the identifier. It is
 * not a database and does not pretend to be one; the whole outfit runs about
 * four thousand records a season and the office wants to be able to open one
 * in a text editor when the software is wrong.
 *
 * Everything goes back through its own constructor on the way in and on the
 * way out. A record that was written by an older version and no longer parses
 * is a loud failure at read time rather than a quiet wrong answer three
 * screens later.
 */

export const COLLECTIONS = {
  yards: { kind: 'yard', parse: makeYard },
  colonies: { kind: 'colony', parse: makeColony },
  pallets: { kind: 'pallet', parse: makePallet },
  blocks: { kind: 'block', parse: makeBlock },
  contracts: { kind: 'contract', parse: makeContract },
  drops: { kind: 'drop', parse: makeDrop },
  loads: { kind: 'load', parse: makeLoad },
  gradings: { kind: 'grading', parse: makeGradingRun },
  treatments: { kind: 'treatment', parse: makeTreatment },
  inspections: { kind: 'inspection', parse: makeInspection },
};

export function collectionNames() {
  return Object.keys(COLLECTIONS).sort();
}

function definitionFor(collection) {
  const definition = COLLECTIONS[collection];
  if (!definition) {
    throw new ValidationError(`unknown collection ${collection}`, {
      collection,
      known: collectionNames(),
    });
  }
  return definition;
}

export function openStore(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new ValidationError('a store needs a directory', {});
  }

  function get(collection, id) {
    const definition = definitionFor(collection);
    const raw = readJson(recordPath(root, collection, id), { missing: null });
    if (raw === null) throw new NotFoundError(definition.kind, id);
    return definition.parse(raw);
  }

  function has(collection, id) {
    definitionFor(collection);
    return readJson(recordPath(root, collection, id), { missing: null }) !== null;
  }

  function put(collection, record) {
    const definition = definitionFor(collection);
    const parsed = definition.parse(record);
    writeJson(recordPath(root, collection, parsed.id), parsed);
    return parsed;
  }

  function insert(collection, record) {
    const definition = definitionFor(collection);
    const parsed = definition.parse(record);
    if (has(collection, parsed.id)) {
      throw new ConflictError(`${definition.kind} ${parsed.id} is already on file`, {
        collection,
        id: parsed.id,
      });
    }
    return put(collection, parsed);
  }

  function update(collection, id, change) {
    const current = get(collection, id);
    const next =
      typeof change === 'function' ? change(current) : { ...current, ...change };
    if (next.id !== id) {
      throw new ValidationError('an update cannot change a record identifier', {
        from: id,
        to: next.id,
      });
    }
    return put(collection, next);
  }

  function list(collection) {
    const definition = definitionFor(collection);
    const files = listJsonFiles(collectionPath(root, collection));
    const records = files.map((name) =>
      definition.parse(
        readJson(recordPath(root, collection, name.replace(/\.json$/, '')))
      )
    );
    return sortBy(records, (record) => record.id);
  }

  function remove(collection, id) {
    definitionFor(collection);
    return removeFile(recordPath(root, collection, id));
  }

  function count(collection) {
    definitionFor(collection);
    return listJsonFiles(collectionPath(root, collection)).length;
  }

  /** True when what is on disk parses back to exactly what was handed in. */
  function verify(collection, record) {
    const definition = definitionFor(collection);
    const parsed = definition.parse(record);
    return sameRecord(parsed, get(collection, parsed.id));
  }

  return { root, get, has, put, insert, update, list, remove, count, verify };
}

export function storeCounts(store) {
  return collectionNames().map((collection) => ({
    collection,
    records: store.count(collection),
  }));
}
