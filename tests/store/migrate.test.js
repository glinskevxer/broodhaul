import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  VERSION_FILE,
  INITIAL_VERSION,
  latestVersion,
  migrationsAfter,
  readVersion,
  writeVersion,
  planMigration,
  runMigrations,
  isUpToDate,
  describePlan,
} from '../../src/store/migrate.js';
import { writeJson } from '../../src/store/files.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-migrate-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('versions', () => {
  it('starts at the initial version when no file is there', () => {
    expect(readVersion(root)).toBe(INITIAL_VERSION);
  });

  it('reads a version back after writing it', () => {
    writeVersion(root, 3, { at: '2025-03-20T12:00:00Z' });
    expect(readVersion(root)).toBe(3);
  });

  it('refuses a version file holding nonsense', () => {
    writeJson(join(root, VERSION_FILE), { version: 'three' });
    expect(() => readVersion(root)).toThrow(/does not hold a version/);
  });

  it('refuses to write a version that is not one', () => {
    expect(() => writeVersion(root, 0)).toThrow(/at least 1/);
  });

  it('knows the latest', () => {
    expect(latestVersion()).toBeGreaterThan(INITIAL_VERSION);
  });
});

describe('migrationsAfter', () => {
  it('lists everything above a version, in order', () => {
    const steps = migrationsAfter(INITIAL_VERSION);
    expect(steps.map((step) => step.version)).toEqual(
      [...steps.map((step) => step.version)].sort((a, b) => a - b)
    );
    expect(steps.length).toBeGreaterThan(0);
  });

  it('is empty at the latest version', () => {
    expect(migrationsAfter(latestVersion())).toEqual([]);
  });

  it('gives every migration a note and at least one collection', () => {
    for (const step of migrationsAfter(INITIAL_VERSION)) {
      expect(step.note.length).toBeGreaterThan(0);
      expect(Object.keys(step.collections).length).toBeGreaterThan(0);
    }
  });
});

describe('planMigration', () => {
  it('plans from the current version to the latest', () => {
    const plan = planMigration(desk.store, root);
    expect(plan.from).toBe(INITIAL_VERSION);
    expect(plan.to).toBe(latestVersion());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('counts the records each step would touch', () => {
    const plan = planMigration(desk.store, root);
    const colonies = plan.steps.find((step) => step.collections.includes('colonies'));
    expect(colonies.records).toBe(12);
  });

  it('plans nothing once the records are current', () => {
    writeVersion(root, latestVersion());
    expect(planMigration(desk.store, root).steps).toEqual([]);
  });
});

describe('runMigrations', () => {
  it('brings the version forward and reports what it touched', () => {
    const outcome = runMigrations(desk.store, root, { at: '2025-03-20T12:00:00Z' });
    expect(outcome.from).toBe(INITIAL_VERSION);
    expect(outcome.to).toBe(latestVersion());
    expect(outcome.records).toBeGreaterThan(0);
    expect(readVersion(root)).toBe(latestVersion());
  });

  it('leaves the records still parsing afterwards', () => {
    runMigrations(desk.store, root);
    expect(desk.store.list('colonies')).toHaveLength(12);
    expect(desk.store.get('yards', 'YD-2025-0001').water).toBe('canal');
  });

  it('does nothing the second time', () => {
    runMigrations(desk.store, root);
    const again = runMigrations(desk.store, root);
    expect(again.records).toBe(0);
    expect(again.steps).toBe(0);
  });

  it('does not overwrite a value the record already has', () => {
    const before = desk.store.get('yards', 'YD-2025-0002').water;
    runMigrations(desk.store, root);
    expect(desk.store.get('yards', 'YD-2025-0002').water).toBe(before);
  });

  it('reports up to date afterwards', () => {
    expect(isUpToDate(root)).toBe(false);
    runMigrations(desk.store, root);
    expect(isUpToDate(root)).toBe(true);
  });
});

describe('describePlan', () => {
  it('says there is nothing to do when there is not', () => {
    writeVersion(root, latestVersion());
    expect(describePlan(planMigration(desk.store, root))).toBe(
      `records are at version ${latestVersion()}, nothing to do`
    );
  });

  it('gives a line per step', () => {
    const text = describePlan(planMigration(desk.store, root));
    expect(text.split('\n')[0]).toBe(`version 1 to ${latestVersion()}`);
    expect(text).toContain('records)');
  });
});
