import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerNames,
  registerRows,
  registerColumns,
  renderRegister,
} from '../../src/reporting/registers.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-registers-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the register list', () => {
  it('is sorted', () => {
    expect(registerNames()).toEqual([...registerNames()].sort());
  });

  it('has columns and rows for every name', () => {
    for (const name of registerNames()) {
      expect(registerColumns(name).length).toBeGreaterThan(0);
      expect(Array.isArray(registerRows(desk, name))).toBe(true);
    }
  });

  it('refuses a register nobody keeps', () => {
    expect(() => registerRows(desk, 'trucks')).toThrow(/no register with id trucks/);
    expect(() => registerColumns('trucks')).toThrow(/no register with id trucks/);
    expect(() => renderRegister(desk, 'trucks')).toThrow(/no register with id trucks/);
  });
});

describe('registerRows', () => {
  it('counts the colonies', () => {
    expect(registerRows(desk, 'colonies')).toHaveLength(12);
  });

  it('carries the derived occupancy on the yard register', () => {
    const rows = registerRows(desk, 'yards');
    expect(rows[0]).toMatchObject({ yardId: 'YD-2025-0001', colonies: 8, pallets: 2 });
  });

  it('summarises the grading runs', () => {
    expect(registerRows(desk, 'gradings')[0]).toMatchObject({
      id: 'GR-2025-0009',
      method: 'frame',
    });
  });

  it('reads the health book off the other records', () => {
    const rows = registerRows(desk, 'health');
    expect(rows.map((row) => row.yardId)).toEqual(['YD-2025-0001', 'YD-2025-0002']);
    expect(rows[0].action).toBe('no samples');
  });

  it('sorts by identifier where there is one', () => {
    const ids = registerRows(desk, 'colonies').map((row) => row.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('renderRegister', () => {
  it('heads with the register name', () => {
    expect(renderRegister(desk, 'yards').split('\n')[0]).toBe('yard register');
  });

  it('ends with a row count', () => {
    expect(renderRegister(desk, 'colonies').trim().split('\n').pop()).toBe('12 rows');
  });

  it('prints money as money', () => {
    expect(renderRegister(desk, 'contracts')).toContain('$9,840.00');
  });

  it('shows how full each pallet is', () => {
    expect(renderRegister(desk, 'pallets')).toContain('4 of 4');
  });

  it('shows the drop shortfall', () => {
    expect(renderRegister(desk, 'drops')).toMatch(/48 +44 +4/);
  });

  it('marks a treatment still on the hives', () => {
    const treatment = desk.store.get('treatments', 'TR-2025-0021');
    desk.save('treatments', { ...treatment, removedOn: undefined });
    expect(renderRegister(desk, 'treatments')).toMatch(/yes/);
  });

  it('never leaves a trailing space', () => {
    for (const name of registerNames()) {
      for (const line of renderRegister(desk, name).split('\n')) {
        expect(line).toBe(line.replace(/\s+$/, ''));
      }
    }
  });

  it('prints a header and a zero count on an empty desk', () => {
    const empty = openDesk({
      root: join(root, 'empty'),
      actor: 'M Ojeda',
      clock: fixedClock('2025-03-20'),
    });
    expect(renderRegister(empty, 'colonies').trim().split('\n').pop()).toBe('0 rows');
  });
});
