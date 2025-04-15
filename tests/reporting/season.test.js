import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  seasonContracts,
  seasonDrops,
  seasonGradings,
  seasonTreatments,
  colonyCount,
  contractRows,
  seasonSummary,
  renderSeason,
} from '../../src/reporting/season.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-season-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('gathering a season', () => {
  it('finds the contracts', () => {
    expect(seasonContracts(desk, 2025).map((entry) => entry.id)).toEqual([
      'CT-2025-0007',
    ]);
    expect(seasonContracts(desk, 2024)).toEqual([]);
  });

  it('finds the drops that were set inside the season', () => {
    expect(seasonDrops(desk, 2025).map((entry) => entry.id)).toEqual(['DR-2025-0004']);
  });

  it('leaves out a drop that was never set', () => {
    desk.save('drops', {
      id: 'DR-2025-0005',
      contractId: 'CT-2025-0007',
      blockId: 'BK-2025-0001',
      location: { latitude: 36.9, longitude: -120.1 },
      ordered: 12,
    });
    expect(seasonDrops(desk, 2025)).toHaveLength(1);
  });

  it('finds the grading runs by the day they were taken', () => {
    expect(seasonGradings(desk, 2025).map((entry) => entry.id)).toEqual([
      'GR-2025-0009',
    ]);
  });

  it('finds the treatments by season, which starts in November', () => {
    expect(seasonTreatments(desk, 2025).map((entry) => entry.id)).toEqual([
      'TR-2025-0021',
    ]);
    expect(seasonTreatments(desk, 2024)).toEqual([]);
  });

  it('counts the productive colonies', () => {
    expect(colonyCount(desk)).toBe(12);
  });
});

describe('contractRows', () => {
  it('gives one row per contract with the grading on it', () => {
    const rows = contractRows(desk, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contract: 'CT-2025-0007',
      grower: 'Wilkins Farming',
      crop: 'almond',
      ordered: 48,
      set: 44,
      short: 4,
      graded: 1,
      meetsMinimum: false,
    });
  });

  it('leaves the average undefined on a contract nobody graded', () => {
    const contract = desk.store.get('contracts', 'CT-2025-0007');
    desk.save('contracts', { ...contract, id: 'CT-2025-0008' });
    const rows = contractRows(desk, 2025);
    const ungraded = rows.find((row) => row.contract === 'CT-2025-0008');
    expect(ungraded.average).toBeUndefined();
    expect(ungraded.graded).toBe(0);
  });
});

describe('seasonSummary', () => {
  it('adds the season up', () => {
    expect(seasonSummary(desk, 2025)).toEqual({
      season: 2025,
      contracts: 1,
      growers: 1,
      hivesOrdered: 48,
      hivesSet: 44,
      hivesShort: 4,
      gradingRuns: 1,
      coloniesRead: 8,
      treatments: 1,
      colonies: 12,
      valueCents: 984000,
    });
  });

  it('is empty for a season with nothing in it', () => {
    const summary = seasonSummary(desk, 2023);
    expect(summary.contracts).toBe(0);
    expect(summary.hivesOrdered).toBe(0);
    expect(summary.valueCents).toBe(0);
  });
});

describe('renderSeason', () => {
  const text = () => renderSeason(desk, 2025);

  it('heads with the season', () => {
    expect(text().split('\n')[0]).toBe('season 2025');
  });

  it('shows the totals in the detail block', () => {
    expect(text()).toMatch(/hives ordered {10}48/);
    expect(text()).toMatch(/hives short {12}4/);
  });

  it('prints the money as money', () => {
    expect(text()).toContain('$9,840.00');
  });

  it('shows a row per contract underneath', () => {
    expect(text()).toContain('CT-2025-0007');
    expect(text()).toContain('Wilkins Farming');
  });

  it('never leaves a trailing space on a line', () => {
    for (const line of text().split('\n')) {
      expect(line).toBe(line.replace(/\s+$/, ''));
    }
  });
});
