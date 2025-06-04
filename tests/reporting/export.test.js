import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exportNames,
  exportColumns,
  exportRows,
  exportCsv,
  exportAll,
} from '../../src/reporting/export.js';
import { parseCsvRecords } from '../../src/core/csv.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';
import { collectionNames } from '../../src/store/repository.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-export-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the export list', () => {
  it('is sorted', () => {
    expect(exportNames()).toEqual([...exportNames()].sort());
  });

  it('covers most of what the store keeps', () => {
    for (const name of exportNames()) {
      expect(collectionNames()).toContain(name);
    }
  });

  it('refuses an export nobody asked for', () => {
    expect(() => exportColumns('trucks')).toThrow(/no export called trucks/);
    expect(() => exportRows(desk, 'trucks')).toThrow(/no export called trucks/);
  });

  it('hands back a copy of the columns', () => {
    exportColumns('yards').push('secret');
    expect(exportColumns('yards')).not.toContain('secret');
  });
});

describe('exportRows', () => {
  it('sorts by identifier', () => {
    const ids = exportRows(desk, 'colonies').map((row) => row.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('flattens the nested fields a spreadsheet cannot hold', () => {
    const colony = exportRows(desk, 'colonies')[0];
    expect(colony.queenSource).toBe('Koehnen');
    expect(typeof colony.boxes).toBe('number');
  });

  it('works the derived columns out', () => {
    const drop = exportRows(desk, 'drops')[0];
    expect(drop.short).toBe(4);
  });

  it('names the grower rather than the grower object', () => {
    expect(exportRows(desk, 'contracts')[0].grower).toBe('Wilkins Farming');
  });

  it('joins the findings into one cell', () => {
    expect(exportRows(desk, 'inspections')[0].findings).toBe('shb');
  });
});

describe('exportCsv', () => {
  it('writes a header and a row per record', () => {
    const csv = exportCsv(desk, 'yards');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,name,county,state,access,water,capacity,registration');
    expect(lines).toHaveLength(3);
  });

  it('reads back through the csv parser', () => {
    const records = parseCsvRecords(exportCsv(desk, 'yards'));
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('YD-2025-0001');
  });

  it('leaves a missing optional field blank', () => {
    const records = parseCsvRecords(exportCsv(desk, 'yards'));
    expect(records[1].registration).toBe('');
  });

  it('writes money as money', () => {
    const records = parseCsvRecords(exportCsv(desk, 'contracts'));
    expect(records[0].rate).toBe('$205.00');
    expect(records[0].value).toBe('$9,840.00');
  });

  it('quotes a field holding a comma', () => {
    desk.save('yards', {
      ...desk.store.get('yards', 'YD-2025-0001'),
      name: 'Dinuba, home place',
    });
    expect(exportCsv(desk, 'yards')).toContain('"Dinuba, home place"');
  });

  it('is a bare header when the collection is empty', () => {
    const empty = openDesk({
      root: join(root, 'empty'),
      actor: 'M Ojeda',
      clock: fixedClock('2025-03-20'),
    });
    expect(exportCsv(empty, 'yards').split('\n')).toHaveLength(1);
  });
});

describe('exportAll', () => {
  it('covers every export and counts the rows', () => {
    const all = exportAll(desk);
    expect(all.map((entry) => entry.name)).toEqual(exportNames());
    expect(all.find((entry) => entry.name === 'colonies').rows).toBe(12);
  });

  it('gives each one its own csv', () => {
    for (const entry of exportAll(desk)) {
      expect(entry.csv.split('\n')[0]).toBe(exportColumns(entry.name).join(','));
    }
  });
});
