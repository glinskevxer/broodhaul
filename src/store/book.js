import { join } from 'node:path';
import { ValidationError } from '../core/errors.js';
import { readJson, writeJson } from './files.js';

/**
 * The side books.
 *
 * Four things the office keeps are not records about bees: the honey house
 * book, the crop book, the receivables ledger and the compliance file. They do
 * not belong in the record store, because they have no identifier series, no
 * journal and no cross checks, and putting them there would mean pretending
 * they do.
 *
 * They were each being read and written by hand in their own command module,
 * three slightly different ways, and one of them dropped an entry when two
 * were written on the same day. This is that code, once.
 */

export function openBook(root, path, parse) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new ValidationError('a book needs a record directory', {});
  }
  const file = join(root, path);

  function read() {
    return readJson(file, { missing: [] }).map((entry) => parse(entry));
  }

  function write(entries) {
    const parsed = entries.map((entry) => parse(entry));
    writeJson(file, parsed);
    return parsed;
  }

  /** Add an entry, replacing anything the key function says is the same one. */
  function upsert(entry, keyOf) {
    const parsed = parse(entry);
    const key = keyOf(parsed);
    const kept = read().filter((existing) => keyOf(existing) !== key);
    return { entries: write([...kept, parsed]), entry: parsed };
  }

  /** Add an entry and refuse a key that is already there. */
  function append(entry, keyOf) {
    const parsed = parse(entry);
    const key = keyOf(parsed);
    const entries = read();
    if (entries.some((existing) => keyOf(existing) === key)) {
      throw new ValidationError(`${key} is already in ${path}`, { key, path });
    }
    return { entries: write([...entries, parsed]), entry: parsed };
  }

  function replace(entry, keyOf) {
    const parsed = parse(entry);
    const key = keyOf(parsed);
    const entries = read();
    if (!entries.some((existing) => keyOf(existing) === key)) {
      throw new ValidationError(`${key} is not in ${path}`, { key, path });
    }
    return {
      entries: write(
        entries.map((existing) => (keyOf(existing) === key ? parsed : existing))
      ),
      entry: parsed,
    };
  }

  function find(keyOf, key) {
    return read().find((entry) => keyOf(entry) === key);
  }

  return { file, read, write, upsert, append, replace, find };
}

export const byId = (entry) => entry.id;
export const byStateAndYear = (entry) => `${entry.state}-${entry.year}`;
export const byYardAndSeason = (entry) => `${entry.yardId}-${entry.season}`;
