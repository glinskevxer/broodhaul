import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activityByActor,
  activityByDay,
  activityByCollection,
  historyOf,
  changedFields,
  reworked,
  auditSummary,
  busiestDay,
  writesOn,
  removedRecords,
} from '../../src/reporting/audit.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { aYard } from '../helpers/records.js';
import { collectionNames } from '../../src/store/repository.js';

let root;

const deskAt = (date, actor = 'M Ojeda') =>
  openDesk({ root, actor, clock: fixedClock(date) });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-audit-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const write = () => {
  deskAt('2025-03-01').save('yards', aYard({ sequence: 1, capacity: 96 }));
  deskAt('2025-03-02').save('yards', aYard({ sequence: 1, capacity: 64 }));
  deskAt('2025-03-02', 'D Rasmussen').save('yards', aYard({ sequence: 2 }));
  deskAt('2025-03-05', 'D Rasmussen').save(
    'yards',
    aYard({ sequence: 1, capacity: 48 })
  );
  deskAt('2025-03-06').remove('yards', 'YD-2025-0002');
  return deskAt('2025-03-10').journal.read();
};

describe('activityByActor', () => {
  it('counts what each person did', () => {
    const rows = activityByActor(write());
    expect(rows.map((row) => row.actor)).toEqual(['D Rasmussen', 'M Ojeda']);
    const ojeda = rows.find((row) => row.actor === 'M Ojeda');
    expect(ojeda.writes).toBe(3);
    expect(ojeda.inserts).toBe(1);
    expect(ojeda.updates).toBe(1);
    expect(ojeda.removes).toBe(1);
  });

  it('reports the first and last day each was active', () => {
    const ojeda = activityByActor(write()).find((row) => row.actor === 'M Ojeda');
    expect(ojeda.firstOn).toBe('2025-03-01');
    expect(ojeda.lastOn).toBe('2025-03-06');
  });

  it('is empty on an empty journal', () => {
    expect(activityByActor([])).toEqual([]);
  });
});

describe('activityByDay', () => {
  it('counts the writes and the people on each day', () => {
    const rows = activityByDay(write());
    expect(rows.map((row) => row.day)).toEqual([
      '2025-03-01',
      '2025-03-02',
      '2025-03-05',
      '2025-03-06',
    ]);
    expect(rows[1]).toEqual({ day: '2025-03-02', writes: 2, actors: 2 });
  });

  it('finds the busiest day', () => {
    expect(busiestDay(write()).day).toBe('2025-03-02');
    expect(busiestDay([])).toBeNull();
  });

  it('counts the writes on one day', () => {
    expect(writesOn(write(), '2025-03-02')).toBe(2);
    expect(writesOn(write(), '2025-03-03')).toBe(0);
  });
});

describe('activityByCollection', () => {
  it('reports a row for every collection, busy or not', () => {
    const rows = activityByCollection(write());
    expect(rows).toHaveLength(collectionNames().length);
    expect(rows.find((row) => row.collection === 'yards').writes).toBe(5);
    expect(rows.find((row) => row.collection === 'loads').writes).toBe(0);
  });
});

describe('historyOf and changedFields', () => {
  it('walks a record forward', () => {
    const history = historyOf(write(), 'yards', 'YD-2025-0001');
    expect(history.map((entry) => entry.action)).toEqual([
      'insert',
      'update',
      'update',
    ]);
    expect(history[0].changed).toEqual([]);
    expect(history[1].changed).toEqual(['capacity']);
  });

  it('names who made each change', () => {
    const history = historyOf(write(), 'yards', 'YD-2025-0001');
    expect(history[2].actor).toBe('D Rasmussen');
  });

  it('is empty for a record nobody touched', () => {
    expect(historyOf(write(), 'yards', 'YD-2025-0099')).toEqual([]);
  });

  it('names the fields that moved between two versions', () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    expect(changedFields({ a: 1 }, { a: 1, b: 2 })).toEqual(['b']);
    expect(changedFields({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('names nothing changed on a removal', () => {
    const history = historyOf(write(), 'yards', 'YD-2025-0002');
    expect(history[history.length - 1].action).toBe('remove');
    expect(history[history.length - 1].changed).toEqual([]);
  });
});

describe('reworked', () => {
  it('names the records touched more than a few times', () => {
    const rows = reworked(write());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collection: 'yards',
      id: 'YD-2025-0001',
      writes: 3,
    });
  });

  it('names everyone who touched them', () => {
    expect(reworked(write())[0].actors).toEqual(['D Rasmussen', 'M Ojeda']);
  });

  it('takes a lower threshold', () => {
    expect(reworked(write(), { atLeast: 2 })).toHaveLength(2);
  });

  it('is empty when nothing was reworked', () => {
    expect(reworked(write(), { atLeast: 9 })).toEqual([]);
  });
});

describe('auditSummary', () => {
  it('adds the journal up', () => {
    expect(auditSummary(write())).toEqual({
      writes: 5,
      actors: 2,
      days: 4,
      collections: 1,
      removals: 1,
    });
  });

  it('narrows to a window', () => {
    expect(auditSummary(write(), { since: '2025-03-05' }).writes).toBe(2);
  });
});

describe('removedRecords', () => {
  it('names what was removed and by whom', () => {
    const rows = removedRecords(write());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collection: 'yards',
      id: 'YD-2025-0002',
      removedOn: '2025-03-06',
      by: 'M Ojeda',
    });
  });

  it('leaves the last state undefined for a removal', () => {
    expect(removedRecords(write())[0].lastState).toBeUndefined();
  });

  it('is empty when nothing was removed', () => {
    deskAt('2025-03-01').save('yards', aYard({ sequence: 1 }));
    expect(removedRecords(deskAt('2025-03-02').journal.read())).toEqual([]);
  });
});
