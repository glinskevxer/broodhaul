import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  gradePassRate,
  fillRate,
  revenuePerColony,
  gradingCoverage,
  treatmentsPerColony,
  kpis,
  kpiRows,
} from '../../src/reporting/kpi.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-kpi-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('fillRate', () => {
  it('measures hives set against hives ordered', () => {
    expect(fillRate(desk, 2025)).toEqual({
      ordered: 48,
      set: 44,
      short: 4,
      rate: 0.917,
    });
  });

  it('is zero for a season with no contracts', () => {
    expect(fillRate(desk, 2023).rate).toBe(0);
  });

  it('reaches one once the drop is filled', () => {
    const drop = desk.store.get('drops', 'DR-2025-0004');
    desk.save('drops', { ...drop, set: drop.ordered });
    expect(fillRate(desk, 2025)).toEqual({ ordered: 48, set: 48, short: 0, rate: 1 });
  });
});

describe('gradePassRate', () => {
  it('counts the colonies at or over the contract minimum', () => {
    const rate = gradePassRate(desk, 2025);
    expect(rate.read).toBe(8);
    expect(rate.made).toBeGreaterThan(0);
    expect(rate.made).toBeLessThan(rate.read);
  });

  it('is a share to three places', () => {
    expect(gradePassRate(desk, 2025).rate).toBe(
      Math.round((gradePassRate(desk, 2025).made / 8) * 1000) / 1000
    );
  });

  it('is zero when nothing was graded', () => {
    expect(gradePassRate(desk, 2023)).toEqual({ read: 0, made: 0, rate: 0 });
  });

  it('reaches one when every hive makes weight', () => {
    const run = desk.store.get('gradings', 'GR-2025-0009');
    desk.save('gradings', {
      ...run,
      readings: run.readings.map((reading) => ({
        colonyId: reading.colonyId,
        frames: 12,
      })),
    });
    expect(gradePassRate(desk, 2025).rate).toBe(1);
  });
});

describe('revenuePerColony', () => {
  it('divides the contract value by the colonies on the books', () => {
    const revenue = revenuePerColony(desk, 2025);
    expect(revenue.colonies).toBe(12);
    expect(revenue.valueCents).toBe(984000);
    expect(revenue.perColonyCents).toBe(82000);
  });

  it('is zero with no colonies', () => {
    for (const colony of desk.store.list('colonies')) {
      desk.store.remove('colonies', colony.id);
    }
    expect(revenuePerColony(desk, 2025).perColonyCents).toBe(0);
  });

  it('leaves dead colonies out of the divisor', () => {
    const colony = desk.store.get('colonies', 'CY-2025-0011');
    desk.save('colonies', { ...colony, status: 'dead', statusOn: '2025-01-04' });
    expect(revenuePerColony(desk, 2025).colonies).toBe(11);
  });
});

describe('gradingCoverage', () => {
  it('measures the drops that were graded', () => {
    expect(gradingCoverage(desk, 2025)).toEqual({ drops: 1, graded: 1, rate: 1 });
  });

  it('falls when a drop is never opened', () => {
    desk.save('drops', {
      id: 'DR-2025-0005',
      contractId: 'CT-2025-0007',
      blockId: 'BK-2025-0001',
      location: { latitude: 36.9, longitude: -120.1 },
      ordered: 12,
      set: 12,
      setOn: '2025-02-04',
    });
    expect(gradingCoverage(desk, 2025).rate).toBe(0.5);
  });

  it('is zero for a season with no drops', () => {
    expect(gradingCoverage(desk, 2023).rate).toBe(0);
  });
});

describe('treatmentsPerColony', () => {
  it('counts applications against colonies', () => {
    const rate = treatmentsPerColony(desk, 2025);
    expect(rate.applications).toBe(4);
    expect(rate.colonies).toBe(12);
    expect(rate.perColony).toBe(0.33);
  });

  it('is zero with no colonies', () => {
    for (const colony of desk.store.list('colonies')) {
      desk.store.remove('colonies', colony.id);
    }
    expect(treatmentsPerColony(desk, 2025).perColony).toBe(0);
  });
});

describe('kpis and kpiRows', () => {
  it('gathers every measure', () => {
    expect(Object.keys(kpis(desk, 2025)).sort()).toEqual([
      'coverage',
      'fill',
      'grade',
      'revenue',
      'season',
      'treatments',
    ]);
  });

  it('gives a row per measure', () => {
    const rows = kpiRows(desk, 2025);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ name: 'hives set', value: '44 of 48', rate: 0.917 });
  });

  it('leaves the rate off the measures that are not a share', () => {
    const rows = kpiRows(desk, 2025);
    expect(
      rows.find((row) => row.name === 'contract value per colony').rate
    ).toBeNull();
  });

  it('prints the money measure as money', () => {
    const rows = kpiRows(desk, 2025);
    expect(rows.find((row) => row.name === 'contract value per colony').value).toBe(
      '$820.00'
    );
  });
});
