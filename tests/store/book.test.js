import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openBook,
  byId,
  byStateAndYear,
  byYardAndSeason,
} from '../../src/store/book.js';
import { ValidationError } from '../../src/core/errors.js';

let root;

const parse = (entry) => {
  if (typeof entry.id !== 'string') {
    throw new ValidationError('an entry needs an id', {});
  }
  return { id: entry.id.toUpperCase(), value: entry.value ?? 0 };
};

const book = () => openBook(root, 'side/things.json', parse);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-book-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('openBook', () => {
  it('refuses a book with no directory', () => {
    expect(() => openBook('', 'x.json', parse)).toThrow(/needs a record directory/);
  });

  it('names its file under the record directory', () => {
    expect(book().file).toBe(join(root, 'side/things.json'));
  });

  it('reads empty before anything is written', () => {
    expect(book().read()).toEqual([]);
    expect(existsSync(book().file)).toBe(false);
  });
});

describe('write and read', () => {
  it('round trips through the parser', () => {
    book().write([{ id: 'a', value: 1 }]);
    expect(book().read()).toEqual([{ id: 'A', value: 1 }]);
  });

  it('refuses an entry the parser will not take', () => {
    expect(() => book().write([{ value: 1 }])).toThrow(/needs an id/);
  });

  it('leaves nothing behind when it refuses', () => {
    try {
      book().write([{ value: 1 }]);
    } catch {
      // expected
    }
    expect(book().read()).toEqual([]);
  });
});

describe('upsert', () => {
  it('adds an entry', () => {
    const outcome = book().upsert({ id: 'a', value: 1 }, byId);
    expect(outcome.entry).toEqual({ id: 'A', value: 1 });
    expect(outcome.entries).toHaveLength(1);
  });

  it('replaces one with the same key rather than doubling it', () => {
    book().upsert({ id: 'a', value: 1 }, byId);
    const outcome = book().upsert({ id: 'a', value: 2 }, byId);
    expect(outcome.entries).toHaveLength(1);
    expect(outcome.entries[0].value).toBe(2);
  });

  it('keeps entries with other keys', () => {
    book().upsert({ id: 'a', value: 1 }, byId);
    const outcome = book().upsert({ id: 'b', value: 2 }, byId);
    expect(outcome.entries.map((entry) => entry.id)).toEqual(['A', 'B']);
  });
});

describe('append', () => {
  it('adds an entry that is not there', () => {
    expect(book().append({ id: 'a' }, byId).entries).toHaveLength(1);
  });

  it('refuses one that is', () => {
    book().append({ id: 'a' }, byId);
    expect(() => book().append({ id: 'a' }, byId)).toThrow(/A is already in/);
  });
});

describe('replace', () => {
  it('replaces an entry that is there', () => {
    book().append({ id: 'a', value: 1 }, byId);
    expect(book().replace({ id: 'a', value: 5 }, byId).entries[0].value).toBe(5);
  });

  it('refuses one that is not', () => {
    expect(() => book().replace({ id: 'a' }, byId)).toThrow(/A is not in/);
  });
});

describe('find', () => {
  it('finds by key', () => {
    book().append({ id: 'a', value: 1 }, byId);
    expect(book().find(byId, 'A').value).toBe(1);
  });

  it('finds nothing when there is nothing', () => {
    expect(book().find(byId, 'A')).toBeUndefined();
  });
});

describe('the key functions', () => {
  it('key a record by identifier', () => {
    expect(byId({ id: 'A' })).toBe('A');
  });

  it('key a registration by state and year', () => {
    expect(byStateAndYear({ state: 'CA', year: 2025 })).toBe('CA-2025');
  });

  it('key a crop by yard and season', () => {
    expect(byYardAndSeason({ yardId: 'YD-2025-0001', season: 2025 })).toBe(
      'YD-2025-0001-2025'
    );
  });
});
