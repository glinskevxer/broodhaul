import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureDir,
  readText,
  writeTextAtomic,
  readJson,
  writeJson,
  readNdjson,
  writeNdjson,
  appendNdjson,
  listJsonFiles,
  removeFile,
  recordPath,
  collectionPath,
} from '../../src/store/files.js';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ensureDir', () => {
  it('makes a nested directory and is happy to be called twice', () => {
    const path = join(root, 'a', 'b');
    expect(ensureDir(path)).toBe(path);
    expect(ensureDir(path)).toBe(path);
    expect(existsSync(path)).toBe(true);
  });
});

describe('readText and writeTextAtomic', () => {
  it('round trips', () => {
    const path = join(root, 'notes.txt');
    writeTextAtomic(path, 'gate is on the canal side');
    expect(readText(path)).toBe('gate is on the canal side');
  });

  it('makes the parent directory on the way', () => {
    const path = join(root, 'deep', 'notes.txt');
    writeTextAtomic(path, 'x');
    expect(existsSync(path)).toBe(true);
  });

  it('leaves no temporary file behind', () => {
    const path = join(root, 'notes.txt');
    writeTextAtomic(path, 'x');
    expect(listJsonFiles(root)).toEqual([]);
    expect(existsSync(`${path}.tmp-${process.pid}`)).toBe(false);
  });

  it('says which file is missing', () => {
    expect(() => readText(join(root, 'gone.txt'))).toThrow(/no file with id/);
  });

  it('takes a value to use when the file is not there', () => {
    expect(readText(join(root, 'gone.txt'), { missing: '' })).toBe('');
  });

  it('overwrites an existing file whole', () => {
    const path = join(root, 'notes.txt');
    writeTextAtomic(path, 'first version, quite long');
    writeTextAtomic(path, 'second');
    expect(readFileSync(path, 'utf8')).toBe('second');
  });
});

describe('readJson and writeJson', () => {
  it('round trips an object with sorted keys and a trailing newline', () => {
    const path = join(root, 'yard.json');
    writeJson(path, { name: 'home place', id: 'YD-2025-0001' });
    expect(readFileSync(path, 'utf8')).toBe(
      '{\n  "id": "YD-2025-0001",\n  "name": "home place"\n}\n'
    );
    expect(readJson(path)).toEqual({ id: 'YD-2025-0001', name: 'home place' });
  });

  it('returns the fallback when the file is missing', () => {
    expect(readJson(join(root, 'gone.json'), { missing: null })).toBeNull();
    expect(readJson(join(root, 'gone.json'), { missing: [] })).toEqual([]);
  });

  it('throws when the file is missing and no fallback was given', () => {
    expect(() => readJson(join(root, 'gone.json'))).toThrow(/no file with id/);
  });

  it('names the file when the json is broken', () => {
    const path = join(root, 'broken.json');
    writeFileSync(path, '{oops');
    expect(() => readJson(path)).toThrow(/broken.json is not valid json/);
  });
});

describe('ndjson', () => {
  it('writes and reads a journal', () => {
    const path = join(root, 'journal.ndjson');
    writeNdjson(path, [{ b: 1, a: 2 }, { a: 3 }]);
    expect(readFileSync(path, 'utf8')).toBe('{"a":2,"b":1}\n{"a":3}\n');
    expect(readNdjson(path)).toEqual([{ a: 2, b: 1 }, { a: 3 }]);
  });

  it('writes an empty journal as an empty file', () => {
    const path = join(root, 'journal.ndjson');
    writeNdjson(path, []);
    expect(readFileSync(path, 'utf8')).toBe('');
    expect(readNdjson(path)).toEqual([]);
  });

  it('reads a journal that does not exist yet as empty', () => {
    expect(readNdjson(join(root, 'nothing.ndjson'))).toEqual([]);
  });

  it('appends one record at a time', () => {
    const path = join(root, 'journal.ndjson');
    appendNdjson(path, { at: 1 });
    appendNdjson(path, { at: 2 });
    expect(readNdjson(path)).toEqual([{ at: 1 }, { at: 2 }]);
  });

  it('salvages a torn tail when asked', () => {
    const path = join(root, 'journal.ndjson');
    appendNdjson(path, { at: 1 });
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"at":`, { flag: 'w' });
    expect(() => readNdjson(path)).toThrow(/journal line 2/);
    expect(readNdjson(path, { tolerateTail: true })).toEqual([{ at: 1 }]);
  });
});

describe('listJsonFiles and removeFile', () => {
  it('lists only json, sorted', () => {
    writeJson(join(root, 'b.json'), {});
    writeJson(join(root, 'a.json'), {});
    writeTextAtomic(join(root, 'c.txt'), 'x');
    expect(listJsonFiles(root)).toEqual(['a.json', 'b.json']);
  });

  it('is empty for a directory that is not there', () => {
    expect(listJsonFiles(join(root, 'nope'))).toEqual([]);
  });

  it('removes a file and says whether there was one', () => {
    const path = join(root, 'a.json');
    writeJson(path, {});
    expect(removeFile(path)).toBe(true);
    expect(removeFile(path)).toBe(false);
  });
});

describe('recordPath', () => {
  it('builds a path from the collection and the identifier', () => {
    expect(recordPath(root, 'yards', 'YD-2025-0001')).toBe(
      join(root, 'yards', 'YD-2025-0001.json')
    );
  });

  it('refuses an identifier that would climb out of the directory', () => {
    expect(() => recordPath(root, 'yards', '../../etc/passwd')).toThrow(
      /cannot be used as a file name/
    );
    expect(() => recordPath(root, 'yards', 'a/b')).toThrow(
      /cannot be used as a file name/
    );
  });

  it('refuses an identifier that is not a string', () => {
    expect(() => recordPath(root, 'yards', 7)).toThrow(/cannot be used as a file name/);
  });

  it('builds a collection path', () => {
    expect(collectionPath(root, 'yards')).toBe(join(root, 'yards'));
  });
});
