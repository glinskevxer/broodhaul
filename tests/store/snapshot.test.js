import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SNAPSHOT_VERSION,
  takeSnapshot,
  snapshotCounts,
  snapshotTotal,
  writeSnapshot,
  readSnapshot,
  restoreSnapshot,
  matchesSnapshot,
  differenceFromSnapshot,
  openSnapshotStore,
} from '../../src/store/snapshot.js';
import { writeJson } from '../../src/store/files.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';
import { collectionNames } from '../../src/store/repository.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-snapshot-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const snapshot = () => takeSnapshot(desk.store, { takenAt: '2025-03-20T08:00:00Z' });

describe('takeSnapshot', () => {
  it('holds every collection', () => {
    expect(Object.keys(snapshot().collections).sort()).toEqual(collectionNames());
  });

  it('stamps the version and the time', () => {
    expect(snapshot().version).toBe(SNAPSHOT_VERSION);
    expect(snapshot().takenAt).toBe('2025-03-20T08:00:00Z');
  });

  it('takes a note', () => {
    const noted = takeSnapshot(desk.store, {
      takenAt: '2025-03-20T08:00:00Z',
      note: 'before the settlement run',
    });
    expect(noted.note).toBe('before the settlement run');
  });

  it('refuses a snapshot with no timestamp', () => {
    expect(() => takeSnapshot(desk.store, {})).toThrow(/takenAt must be a string/);
  });

  it('counts what it holds', () => {
    expect(snapshotTotal(snapshot())).toBe(24);
    expect(
      snapshotCounts(snapshot()).find((row) => row.collection === 'colonies').records
    ).toBe(12);
  });
});

describe('writeSnapshot and readSnapshot', () => {
  it('round trips through a file', () => {
    const path = join(root, 'snap.json');
    writeSnapshot(path, snapshot());
    expect(snapshotTotal(readSnapshot(path))).toBe(24);
  });

  it('refuses a snapshot from another version', () => {
    const path = join(root, 'old.json');
    writeJson(path, { version: 99, takenAt: '2025-03-20T08:00:00Z', collections: {} });
    expect(() => readSnapshot(path)).toThrow(/snapshot is version 99/);
  });

  it('refuses a snapshot holding a collection this build does not keep', () => {
    const path = join(root, 'odd.json');
    writeJson(path, {
      version: SNAPSHOT_VERSION,
      takenAt: '2025-03-20T08:00:00Z',
      collections: { trucks: [] },
    });
    expect(() => readSnapshot(path)).toThrow(/unknown collections: trucks/);
  });
});

describe('restoreSnapshot', () => {
  it('puts everything back where it was', () => {
    const taken = snapshot();
    desk.store.remove('yards', 'YD-2025-0001');
    desk.store.update('colonies', 'CY-2025-0011', { brand: 'CHANGED' });
    const outcome = restoreSnapshot(desk.store, taken);
    expect(outcome.written).toBe(24);
    expect(desk.store.get('yards', 'YD-2025-0001').name).toBe('Dinuba home place');
    expect(desk.store.get('colonies', 'CY-2025-0011').brand).toBe('BH-0011');
  });

  it('removes records the snapshot does not know about', () => {
    const taken = snapshot();
    desk.store.put('yards', {
      ...desk.store.get('yards', 'YD-2025-0001'),
      id: 'YD-2025-0099',
    });
    const outcome = restoreSnapshot(desk.store, taken);
    expect(outcome.removed).toBe(1);
    expect(desk.store.has('yards', 'YD-2025-0099')).toBe(false);
  });

  it('leaves the store matching afterwards', () => {
    const taken = snapshot();
    desk.store.remove('colonies', 'CY-2025-0011');
    restoreSnapshot(desk.store, taken);
    expect(matchesSnapshot(desk.store, taken)).toBe(true);
  });

  it('restores into an empty store', () => {
    const taken = snapshot();
    const other = openSnapshotStore(join(root, 'other'));
    restoreSnapshot(other, taken);
    expect(other.count('colonies')).toBe(12);
  });
});

describe('matchesSnapshot and differenceFromSnapshot', () => {
  it('matches straight after a snapshot is taken', () => {
    const taken = snapshot();
    expect(matchesSnapshot(desk.store, taken)).toBe(true);
    expect(differenceFromSnapshot(desk.store, taken)).toEqual([]);
  });

  it('names a record that was added', () => {
    const taken = snapshot();
    desk.store.put('yards', {
      ...desk.store.get('yards', 'YD-2025-0001'),
      id: 'YD-2025-0099',
    });
    expect(matchesSnapshot(desk.store, taken)).toBe(false);
    expect(differenceFromSnapshot(desk.store, taken)).toEqual([
      { collection: 'yards', id: 'YD-2025-0099', change: 'added' },
    ]);
  });

  it('names a record that changed', () => {
    const taken = snapshot();
    desk.store.update('yards', 'YD-2025-0001', { capacity: 48 });
    expect(differenceFromSnapshot(desk.store, taken)).toEqual([
      { collection: 'yards', id: 'YD-2025-0001', change: 'changed' },
    ]);
  });

  it('names a record that went missing', () => {
    const taken = snapshot();
    desk.store.remove('yards', 'YD-2025-0001');
    expect(differenceFromSnapshot(desk.store, taken)).toEqual([
      { collection: 'yards', id: 'YD-2025-0001', change: 'removed' },
    ]);
  });

  it('sorts the differences by collection then identifier', () => {
    const taken = snapshot();
    desk.store.remove('yards', 'YD-2025-0001');
    desk.store.remove('colonies', 'CY-2025-0011');
    expect(
      differenceFromSnapshot(desk.store, taken).map((row) => row.collection)
    ).toEqual(['colonies', 'yards']);
  });
});
