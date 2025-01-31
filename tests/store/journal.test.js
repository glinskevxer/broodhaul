import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACTIONS,
  JOURNAL_FILE,
  makeEntry,
  openJournal,
  entriesFor,
  entriesOn,
  entriesSince,
  actors,
  latestState,
  reconcile,
  describeEntry,
} from '../../src/store/journal.js';
import { openStore } from '../../src/store/repository.js';
import { fixedClock } from '../../src/core/clock.js';
import { aYard } from '../helpers/records.js';

let root;
let store;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-journal-'));
  store = openStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const journalAt = (date) => openJournal(root, fixedClock(date));

describe('makeEntry', () => {
  const base = {
    at: '2025-02-14T12:00:00Z',
    actor: 'M Ojeda',
    action: 'insert',
    collection: 'yards',
    id: 'YD-2025-0001',
    record: { id: 'YD-2025-0001' },
  };

  it('keeps the record on an insert', () => {
    expect(makeEntry(base).record).toEqual({ id: 'YD-2025-0001' });
  });

  it('drops the record on a removal', () => {
    expect(makeEntry({ ...base, action: 'remove' }).record).toBeUndefined();
  });

  it('refuses an action nobody logs', () => {
    expect(() => makeEntry({ ...base, action: 'archive' })).toThrow(/must be one of/);
  });

  it('refuses a collection the store does not keep', () => {
    expect(() => makeEntry({ ...base, collection: 'trucks' })).toThrow(
      /must be one of/
    );
  });

  it('refuses a timestamp that does not start with a date', () => {
    expect(() => makeEntry({ ...base, at: 'yesterday at ten' })).toThrow(
      /at must look like/
    );
  });

  it('has an entry shape for every action', () => {
    for (const action of ACTIONS) {
      expect(makeEntry({ ...base, action }).action).toBe(action);
    }
  });
});

describe('openJournal', () => {
  it('refuses a journal with no directory', () => {
    expect(() => openJournal('', fixedClock('2025-02-14'))).toThrow(
      /needs a directory/
    );
  });

  it('names its file next to the records', () => {
    expect(journalAt('2025-02-14').path).toBe(`${root}/${JOURNAL_FILE}`);
  });

  it('reads empty before anything is written', () => {
    expect(journalAt('2025-02-14').read()).toEqual([]);
  });

  it('stamps each entry off the clock', () => {
    const journal = journalAt('2025-02-14');
    const entry = journal.append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: { id: 'YD-2025-0001' },
    });
    expect(entry.at).toBe('2025-02-14T12:00:00Z');
  });

  it('appends rather than overwriting', () => {
    journalAt('2025-02-14').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: { id: 'YD-2025-0001' },
    });
    journalAt('2025-02-15').append({
      actor: 'D Rasmussen',
      action: 'update',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: { id: 'YD-2025-0001', capacity: 48 },
    });
    expect(journalAt('2025-02-16').read()).toHaveLength(2);
  });
});

describe('reading the journal back', () => {
  const write = () => {
    journalAt('2025-02-14').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: { id: 'YD-2025-0001', capacity: 96 },
    });
    journalAt('2025-02-20').append({
      actor: 'D Rasmussen',
      action: 'update',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: { id: 'YD-2025-0001', capacity: 48 },
    });
    journalAt('2025-02-20').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'colonies',
      id: 'CY-2025-0011',
      record: { id: 'CY-2025-0011' },
    });
    return journalAt('2025-03-01').read();
  };

  it('filters to one record', () => {
    const entries = write();
    expect(entriesFor(entries, 'yards', 'YD-2025-0001')).toHaveLength(2);
    expect(entriesFor(entries, 'yards', 'YD-2025-0099')).toEqual([]);
  });

  it('filters to one day', () => {
    expect(entriesOn(write(), '2025-02-20')).toHaveLength(2);
  });

  it('filters from a day onward', () => {
    const entries = write();
    expect(entriesSince(entries, '2025-02-20')).toHaveLength(2);
    expect(entriesSince(entries, '2025-02-14')).toHaveLength(3);
  });

  it('lists who touched anything', () => {
    expect(actors(write())).toEqual(['D Rasmussen', 'M Ojeda']);
  });

  it('finds the last state of a record', () => {
    expect(latestState(write(), 'yards', 'YD-2025-0001').capacity).toBe(48);
  });

  it('finds nothing for a record that was removed', () => {
    write();
    journalAt('2025-03-02').append({
      actor: 'M Ojeda',
      action: 'remove',
      collection: 'yards',
      id: 'YD-2025-0001',
    });
    expect(
      latestState(journalAt('2025-03-03').read(), 'yards', 'YD-2025-0001')
    ).toBeUndefined();
  });

  it('finds nothing for a record the journal never saw', () => {
    expect(latestState(write(), 'yards', 'YD-2025-0099')).toBeUndefined();
  });
});

describe('reconcile', () => {
  const yard = aYard({ sequence: 1, capacity: 96 });

  it('is quiet when the store and the journal agree', () => {
    store.put('yards', yard);
    journalAt('2025-02-14').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: yard.id,
      record: yard,
    });
    expect(reconcile(journalAt('2025-02-15').read(), store, 'yards')).toEqual({
      collection: 'yards',
      missing: [],
      unlogged: [],
      stale: [],
    });
  });

  it('reports a record the journal has and the store does not', () => {
    journalAt('2025-02-14').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: yard.id,
      record: yard,
    });
    expect(reconcile(journalAt('2025-02-15').read(), store, 'yards').missing).toEqual([
      'YD-2025-0001',
    ]);
  });

  it('reports a record written without a journal entry', () => {
    store.put('yards', yard);
    expect(reconcile([], store, 'yards').unlogged).toEqual(['YD-2025-0001']);
  });

  it('reports a record the store has moved on from', () => {
    store.put('yards', yard);
    journalAt('2025-02-14').append({
      actor: 'M Ojeda',
      action: 'insert',
      collection: 'yards',
      id: yard.id,
      record: yard,
    });
    store.update('yards', yard.id, { capacity: 48 });
    expect(reconcile(journalAt('2025-02-15').read(), store, 'yards').stale).toEqual([
      'YD-2025-0001',
    ]);
  });
});

describe('describeEntry', () => {
  it('reads like a line in a log', () => {
    const entry = makeEntry({
      at: '2025-02-14T12:00:00Z',
      actor: 'M Ojeda',
      action: 'update',
      collection: 'yards',
      id: 'YD-2025-0001',
      record: {},
    });
    expect(describeEntry(entry)).toBe(
      '2025-02-14T12:00:00Z M Ojeda update yards YD-2025-0001'
    );
  });
});
