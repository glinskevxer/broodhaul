import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COLLECTIONS,
  collectionNames,
  openStore,
  storeCounts,
} from '../../src/store/repository.js';
import { aYard, aColony, aPallet } from '../helpers/records.js';

let root;
let store;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-store-'));
  store = openStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('collections', () => {
  it('names every collection it knows, sorted', () => {
    expect(collectionNames()).toEqual([
      'blocks',
      'colonies',
      'contracts',
      'drops',
      'gradings',
      'inspections',
      'loads',
      'pallets',
      'treatments',
      'yards',
    ]);
  });

  it('gives every collection a kind and a parser', () => {
    for (const name of collectionNames()) {
      expect(typeof COLLECTIONS[name].parse).toBe('function');
      expect(typeof COLLECTIONS[name].kind).toBe('string');
    }
  });
});

describe('openStore', () => {
  it('refuses a store with no directory', () => {
    expect(() => openStore('')).toThrow(/needs a directory/);
  });

  it('keeps the root it was given', () => {
    expect(store.root).toBe(root);
  });
});

describe('put and get', () => {
  it('round trips a record through the constructor', () => {
    const yard = aYard({ sequence: 1 });
    store.put('yards', yard);
    expect(store.get('yards', yard.id)).toEqual(yard);
  });

  it('parses on the way in, so a bad record never lands', () => {
    expect(() => store.put('yards', { id: 'YD-2025-0001' })).toThrow(
      /yard.name must be a string/
    );
  });

  it('says what is missing', () => {
    expect(() => store.get('yards', 'YD-2025-0099')).toThrow(
      /no yard with id YD-2025-0099/
    );
  });

  it('refuses a collection it does not keep', () => {
    expect(() => store.get('trucks', 'x')).toThrow(/unknown collection trucks/);
  });

  it('overwrites on a second put', () => {
    store.put('yards', aYard({ sequence: 1, capacity: 96 }));
    store.put('yards', aYard({ sequence: 1, capacity: 48 }));
    expect(store.get('yards', 'YD-2025-0001').capacity).toBe(48);
    expect(store.count('yards')).toBe(1);
  });
});

describe('has and count', () => {
  it('answers before anything is written', () => {
    expect(store.has('yards', 'YD-2025-0001')).toBe(false);
    expect(store.count('yards')).toBe(0);
  });

  it('answers after', () => {
    store.put('yards', aYard({ sequence: 1 }));
    expect(store.has('yards', 'YD-2025-0001')).toBe(true);
    expect(store.count('yards')).toBe(1);
  });
});

describe('insert', () => {
  it('writes a record that is not there', () => {
    const yard = store.insert('yards', aYard({ sequence: 1 }));
    expect(yard.id).toBe('YD-2025-0001');
  });

  it('refuses to write over one that is', () => {
    store.insert('yards', aYard({ sequence: 1 }));
    expect(() => store.insert('yards', aYard({ sequence: 1 }))).toThrow(
      /yard YD-2025-0001 is already on file/
    );
  });
});

describe('update', () => {
  beforeEach(() => {
    store.put('yards', aYard({ sequence: 1, capacity: 96 }));
  });

  it('merges a patch', () => {
    expect(store.update('yards', 'YD-2025-0001', { capacity: 48 }).capacity).toBe(48);
  });

  it('takes a function', () => {
    const updated = store.update('yards', 'YD-2025-0001', (yard) => ({
      ...yard,
      capacity: yard.capacity + 4,
    }));
    expect(updated.capacity).toBe(100);
  });

  it('refuses an update that renames the record', () => {
    expect(() => store.update('yards', 'YD-2025-0001', { id: 'YD-2025-0002' })).toThrow(
      /cannot change a record identifier/
    );
  });

  it('refuses to update something that is not there', () => {
    expect(() => store.update('yards', 'YD-2025-0099', {})).toThrow(/no yard with id/);
  });

  it('still parses the result', () => {
    expect(() => store.update('yards', 'YD-2025-0001', { capacity: 0 })).toThrow(
      /at least 1/
    );
  });
});

describe('list', () => {
  it('is empty on a fresh store', () => {
    expect(store.list('yards')).toEqual([]);
  });

  it('comes back sorted by identifier whatever order it was written', () => {
    store.put('yards', aYard({ sequence: 3 }));
    store.put('yards', aYard({ sequence: 1 }));
    store.put('yards', aYard({ sequence: 2 }));
    expect(store.list('yards').map((yard) => yard.id)).toEqual([
      'YD-2025-0001',
      'YD-2025-0002',
      'YD-2025-0003',
    ]);
  });

  it('keeps collections apart', () => {
    store.put('yards', aYard({ sequence: 1 }));
    store.put('colonies', aColony({ sequence: 11 }));
    store.put('pallets', aPallet({ sequence: 21 }));
    expect(store.list('yards')).toHaveLength(1);
    expect(store.list('colonies')).toHaveLength(1);
    expect(store.list('pallets')).toHaveLength(1);
  });
});

describe('remove', () => {
  it('removes a record and says whether there was one', () => {
    store.put('yards', aYard({ sequence: 1 }));
    expect(store.remove('yards', 'YD-2025-0001')).toBe(true);
    expect(store.remove('yards', 'YD-2025-0001')).toBe(false);
    expect(store.has('yards', 'YD-2025-0001')).toBe(false);
  });
});

describe('verify', () => {
  it('is true for a record that landed unchanged', () => {
    const yard = aYard({ sequence: 1 });
    store.put('yards', yard);
    expect(store.verify('yards', yard)).toBe(true);
  });

  it('is false once the record on disk moves on', () => {
    const yard = aYard({ sequence: 1, capacity: 96 });
    store.put('yards', yard);
    store.update('yards', yard.id, { capacity: 48 });
    expect(store.verify('yards', yard)).toBe(false);
  });
});

describe('storeCounts', () => {
  it('reports every collection even when empty', () => {
    const counts = storeCounts(store);
    expect(counts).toHaveLength(collectionNames().length);
    expect(counts.every((row) => row.records === 0)).toBe(true);
  });

  it('counts what is there', () => {
    store.put('yards', aYard({ sequence: 1 }));
    store.put('yards', aYard({ sequence: 2 }));
    const counts = storeCounts(store);
    expect(counts.find((row) => row.collection === 'yards').records).toBe(2);
  });
});
