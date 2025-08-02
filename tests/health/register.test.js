import { describe, it, expect } from 'vitest';
import {
  SAMPLE_INTERVAL_DAYS,
  lastWashFor,
  sampleDue,
  yardRow,
  healthRegister,
  yardsDueSampling,
  yardsHeld,
  yardsWithOverdueTreatments,
  worstYards,
  describeRow,
  treatmentDueOff,
  highestReading,
} from '../../src/health/register.js';
import { makeWash } from '../../src/health/wash.js';
import { makeTreatment } from '../../src/health/treatment.js';
import { makeInspection } from '../../src/health/inspection.js';

const wash = (yardId, colonySequence, mites, date = '2025-08-14') =>
  makeWash({
    colonyId: `CY-2025-${String(colonySequence).padStart(4, '0')}`,
    yardId,
    date,
    mites,
  });

const treatment = (overrides = {}) =>
  makeTreatment({
    id: 'TR-2025-0021',
    yardId: 'YD-2025-0001',
    colonies: ['CY-2025-0011'],
    product: 'apivar',
    appliedOn: '2025-08-20',
    temperatureF: 80,
    applicator: 'M Ojeda',
    units: 2,
    ...overrides,
  });

const inspection = (overrides = {}) =>
  makeInspection({
    id: 'IS-2025-0003',
    yardId: 'YD-2025-0001',
    date: '2025-08-12',
    inspector: 'L Prentice',
    coloniesOpened: 4,
    ...overrides,
  });

const today = '2025-09-01';
const yards = ['YD-2025-0001', 'YD-2025-0002'];

describe('lastWashFor and sampleDue', () => {
  const washes = [
    wash('YD-2025-0001', 11, 6, '2025-06-14'),
    wash('YD-2025-0001', 11, 9, '2025-08-14'),
    wash('YD-2025-0002', 21, 3, '2025-08-14'),
  ];

  it('finds the most recent wash on a yard', () => {
    expect(lastWashFor(washes, 'YD-2025-0001', today).date).toBe('2025-08-14');
  });

  it('ignores anything after the day asked about', () => {
    expect(lastWashFor(washes, 'YD-2025-0001', '2025-07-01').date).toBe('2025-06-14');
  });

  it('finds nothing on a yard nobody sampled', () => {
    expect(lastWashFor(washes, 'YD-2025-0009', today)).toBeUndefined();
  });

  it('says a never sampled yard is due today', () => {
    expect(sampleDue(washes, 'YD-2025-0009', today)).toEqual({
      due: true,
      lastOn: null,
      daysSince: null,
      nextOn: today,
    });
  });

  it('counts the days since the last sample', () => {
    const due = sampleDue(washes, 'YD-2025-0001', today);
    expect(due.daysSince).toBe(18);
    expect(due.due).toBe(false);
    expect(due.nextOn).toBe('2025-09-25');
  });

  it('is due once the interval has run', () => {
    const late = sampleDue(washes, 'YD-2025-0001', '2025-09-26');
    expect(late.daysSince).toBeGreaterThanOrEqual(SAMPLE_INTERVAL_DAYS);
    expect(late.due).toBe(true);
  });
});

describe('yardRow', () => {
  const base = {
    yardId: 'YD-2025-0001',
    washes: [wash('YD-2025-0001', 11, 9), wash('YD-2025-0001', 12, 21)],
    treatments: [treatment()],
    inspections: [inspection()],
    today,
  };

  it('reads the latest sampling and calls it', () => {
    const row = yardRow(base);
    expect(row.sampledOn).toBe('2025-08-14');
    expect(row.rate).toBe(5);
    expect(row.action).toBe('urgent');
  });

  it('names what is still on the hives', () => {
    expect(yardRow(base).onHives).toEqual(['apivar']);
  });

  it('names nothing when everything has been pulled', () => {
    const pulled = { ...base, treatments: [treatment({ removedOn: '2025-08-30' })] };
    expect(yardRow(pulled).onHives).toEqual([]);
  });

  it('flags an overdue treatment', () => {
    const old = { ...base, treatments: [treatment({ appliedOn: '2025-01-04' })] };
    expect(yardRow(old).overdue).toEqual(['TR-2025-0021']);
  });

  it('carries the withdrawal date forward', () => {
    expect(yardRow(base).withdrawalUntil).toBe('2025-10-15');
  });

  it('reports a hold from an inspection', () => {
    const held = {
      ...base,
      inspections: [inspection({ findings: ['afb'], coloniesAffected: 1 })],
    };
    const row = yardRow(held);
    expect(row.held).toBe(true);
    expect(row.heldUntil).toBe('2025-09-11');
  });

  it('says no samples on a yard nobody has been to', () => {
    const row = yardRow({ ...base, washes: [] });
    expect(row.rate).toBeNull();
    expect(row.action).toBe('no samples');
  });
});

describe('healthRegister', () => {
  const register = () =>
    healthRegister({
      yardIds: yards,
      washes: [wash('YD-2025-0001', 11, 21), wash('YD-2025-0002', 21, 3, '2025-06-01')],
      treatments: [treatment({ appliedOn: '2025-01-04' })],
      inspections: [inspection({ findings: ['afb'], coloniesAffected: 1 })],
      today,
    });

  it('gives a row per yard, sorted', () => {
    expect(register().map((row) => row.yardId)).toEqual(yards);
  });

  it('names the yards due a sample', () => {
    expect(yardsDueSampling(register()).map((row) => row.yardId)).toEqual([
      'YD-2025-0002',
    ]);
  });

  it('names the held yards', () => {
    expect(yardsHeld(register()).map((row) => row.yardId)).toEqual(['YD-2025-0001']);
  });

  it('names the yards with a treatment left on too long', () => {
    expect(yardsWithOverdueTreatments(register()).map((row) => row.yardId)).toEqual([
      'YD-2025-0001',
    ]);
  });

  it('ranks the yards worst first', () => {
    expect(worstYards(register()).map((row) => row.yardId)).toEqual([
      'YD-2025-0001',
      'YD-2025-0002',
    ]);
  });

  it('takes only the count asked for', () => {
    expect(worstYards(register(), 1)).toHaveLength(1);
  });
});

describe('describeRow', () => {
  it('reads like a line in the health book', () => {
    const row = yardRow({
      yardId: 'YD-2025-0001',
      washes: [wash('YD-2025-0001', 11, 9)],
      treatments: [treatment()],
      inspections: [],
      today,
    });
    expect(describeRow(row)).toBe(
      'YD-2025-0001: sampled 2025-08-14, 3 per hundred, apivar on'
    );
  });

  it('says never sampled when nobody has been', () => {
    const row = yardRow({
      yardId: 'YD-2025-0009',
      washes: [],
      treatments: [],
      inspections: [],
      today,
    });
    expect(describeRow(row)).toBe('YD-2025-0009: never sampled, nothing on');
  });

  it('says when a yard is held', () => {
    const row = yardRow({
      yardId: 'YD-2025-0001',
      washes: [],
      treatments: [],
      inspections: [inspection({ findings: ['afb'], coloniesAffected: 1 })],
      today,
    });
    expect(describeRow(row)).toContain('held to 2025-09-11');
  });
});

describe('treatmentDueOff', () => {
  it('lists what is still on, soonest first', () => {
    const rows = treatmentDueOff(
      [treatment(), treatment({ id: 'TR-2025-0022', appliedOn: '2025-01-04' })],
      today
    );
    expect(rows.map((row) => row.id)).toEqual(['TR-2025-0022', 'TR-2025-0021']);
    expect(rows[0].overdue).toBe(true);
    expect(rows[1].overdue).toBe(false);
  });

  it('leaves out what has been pulled', () => {
    expect(treatmentDueOff([treatment({ removedOn: '2025-08-30' })], today)).toEqual(
      []
    );
  });
});

describe('highestReading', () => {
  it('finds the worst colony', () => {
    const washes = [wash('YD-2025-0001', 11, 9), wash('YD-2025-0001', 12, 21)];
    expect(highestReading(washes).colonyId).toBe('CY-2025-0012');
  });

  it('is nothing for no washes', () => {
    expect(highestReading([])).toBeNull();
  });
});
