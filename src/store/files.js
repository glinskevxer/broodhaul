import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  appendFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { NotFoundError, ValidationError } from '../core/errors.js';
import {
  decodeNdjson,
  encodeNdjson,
  parseJson,
  stableStringify,
} from '../core/serial.js';

/**
 * Files on disk.
 *
 * The desk keeps its records in a directory that gets synced between the shop
 * office and the house, so a half written file is a real risk rather than a
 * theoretical one. Every write goes to a temporary name and is renamed into
 * place, which is atomic on both platforms this runs on, and readers never see
 * a partial record.
 */

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readText(path, { missing } = {}) {
  if (!existsSync(path)) {
    if (missing !== undefined) return missing;
    throw new NotFoundError('file', path);
  }
  return readFileSync(path, 'utf8');
}

export function writeTextAtomic(path, text) {
  ensureDir(dirname(path));
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, text, 'utf8');
  renameSync(temporary, path);
  return path;
}

export function readJson(path, { missing } = {}) {
  const text = readText(path, { missing: missing === undefined ? undefined : null });
  if (text === null) return missing;
  return parseJson(text, path);
}

export function writeJson(path, value) {
  return writeTextAtomic(path, `${stableStringify(value, { indent: 2 })}\n`);
}

export function readNdjson(path, options = {}) {
  const text = readText(path, { missing: '' });
  return decodeNdjson(text, options);
}

export function writeNdjson(path, records) {
  const body = encodeNdjson(records);
  return writeTextAtomic(path, body === '' ? '' : `${body}\n`);
}

/** Append one record to a journal. Not atomic, and deliberately so. */
export function appendNdjson(path, record) {
  ensureDir(dirname(path));
  appendFileSync(path, `${stableStringify(record)}\n`, 'utf8');
  return path;
}

export function listJsonFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function removeFile(path) {
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/**
 * Records live one file per record under `<root>/<collection>/<id>.json`. The
 * identifier goes straight into a path, so it is checked rather than trusted.
 */
export function recordPath(root, collection, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ValidationError(`identifier ${id} cannot be used as a file name`, { id });
  }
  return join(root, collection, `${id}.json`);
}

export function collectionPath(root, collection) {
  return join(root, collection);
}
