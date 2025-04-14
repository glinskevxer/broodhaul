import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEASON, loadSeason } from '../../src/examples/season.js';
import { openDesk, problems } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { assessContract } from '../../src/contracts/assessment.js';
import { applyShortfall } from '../../src/contracts/shortfall.js';
import { runMethod, runAverage } from '../../src/grading/run.js';
import { collectionNames } from '../../src/store/repository.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-example-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the worked season', () => {
  it('covers every collection the store keeps', () => {
    expect(Object.keys(SEASON).sort()).toEqual(collectionNames());
  });

  it('has at least one record in each', () => {
    for (const [collection, records] of Object.entries(SEASON)) {
      expect(records.length, collection).toBeGreaterThan(0);
    }
  });

  it('loads without any record being rejected', () => {
    const written = loadSeason(desk);
    expect(written).toHaveLength(
      Object.values(SEASON).reduce((total, records) => total + records.length, 0)
    );
  });

  it('leaves the desk with nothing to report', () => {
    loadSeason(desk);
    expect(problems(desk)).toEqual([]);
  });

  it('journals every write', () => {
    const written = loadSeason(desk);
    expect(desk.journal.read()).toHaveLength(written.length);
  });

  it('is idempotent, so loading it twice is not an error', () => {
    loadSeason(desk);
    loadSeason(desk);
    expect(desk.store.count('yards')).toBe(SEASON.yards.length);
  });
});

describe('what the worked season demonstrates', () => {
  beforeEach(() => loadSeason(desk));

  it('has a drop that came up short', () => {
    const drop = desk.store.get('drops', 'DR-2025-0004');
    expect(drop.ordered - drop.set).toBe(4);
  });

  it('has a grading run taken cool enough to need correcting', () => {
    const run = desk.store.get('gradings', 'GR-2025-0009');
    expect(runMethod(run)).toBe('frame');
    expect(run.conditions.temperatureF).toBeLessThan(65);
    expect(runAverage(run)).toBeLessThan(8);
  });

  it('lands the contract under its minimum', () => {
    const contract = desk.store.get('contracts', 'CT-2025-0007');
    const runs = desk.store.list('gradings');
    const assessment = assessContract(contract, runs);
    expect(assessment.meetsMinimum).toBe(false);
  });

  it('prorates the rate rather than rejecting hives', () => {
    const contract = desk.store.get('contracts', 'CT-2025-0007');
    const runs = desk.store.list('gradings');
    const assessment = assessContract(contract, runs);
    const outcome = applyShortfall(contract, assessment, 44, runs);
    expect(outcome.rule).toBe('prorate');
    expect(outcome.payableHives).toBe(44);
    expect(outcome.rateCents).toBeLessThan(contract.rateCents);
  });

  it('has a queenless colony that scores nothing', () => {
    const run = desk.store.get('gradings', 'GR-2025-0009');
    const queenless = run.readings.filter((reading) => !reading.queenright);
    expect(queenless).toHaveLength(1);
  });

  it('has a treatment that was pulled inside its window', () => {
    const treatment = desk.store.get('treatments', 'TR-2025-0021');
    expect(treatment.removedOn).toBeDefined();
  });

  it('has an inspection finding that carries no hold', () => {
    const inspection = desk.store.get('inspections', 'IS-2025-0003');
    expect(inspection.findings).toEqual(['shb']);
  });

  it('keeps the two yards far enough apart to pass the separation check', () => {
    expect(
      problems(desk).filter((problem) => problem.kind === 'yards_too_close')
    ).toEqual([]);
  });
});
