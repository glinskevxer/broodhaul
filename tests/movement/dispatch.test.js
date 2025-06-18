import { describe, it, expect } from 'vitest';
import {
  LOADS_PER_NIGHT,
  makeDispatchNight,
  checkNight,
  scheduleLoads,
  nightsNeeded,
  palletsPerNight,
  scheduleSpan,
  lateLoads,
  byTruck,
  describeNight,
  describeSchedule,
  loadNight,
} from '../../src/movement/dispatch.js';
import { makeLoad } from '../../src/movement/load.js';

const load = (sequence, pallets, unit = 'BH-7') =>
  makeLoad({
    id: `LD-2025-${String(sequence).padStart(4, '0')}`,
    truck: { unit, kind: 'semi' },
    driver: 'D Rasmussen',
    originYardId: 'YD-2025-0001',
    destination: { kind: 'drop', id: 'DR-2025-0004' },
    pallets,
  });

const first = load(1, ['PL-2025-0031', 'PL-2025-0032']);
const second = load(2, ['PL-2025-0033']);
const third = load(3, ['PL-2025-0034']);
const fourth = load(4, ['PL-2025-0035'], 'BH-9');
const clashing = load(5, ['PL-2025-0031']);

describe('makeDispatchNight and checkNight', () => {
  it('sorts the loads on a night', () => {
    const night = makeDispatchNight('2025-02-03', [second, first]);
    expect(night.loads.map((entry) => entry.id)).toEqual([
      'LD-2025-0001',
      'LD-2025-0002',
    ]);
  });

  it('passes a night inside the crew capacity', () => {
    expect(checkNight(makeDispatchNight('2025-02-03', [first, second, third]))).toBe(
      true
    );
  });

  it('refuses a night with more loads than the crew can do', () => {
    const night = makeDispatchNight('2025-02-03', [first, second, third, fourth]);
    expect(() => checkNight(night)).toThrow(/the crew does 3/);
  });

  it('refuses a pallet on two loads the same night', () => {
    const night = makeDispatchNight('2025-02-03', [first, clashing]);
    expect(() => checkNight(night)).toThrow(/is on two loads on 2025-02-03/);
  });

  it('names the rule when the crew is over capacity', () => {
    try {
      checkNight(makeDispatchNight('2025-02-03', [first, second, third, fourth]));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('DP-1');
    }
  });
});

describe('scheduleLoads', () => {
  it('fills the first night to capacity', () => {
    const schedule = scheduleLoads([first, second, third], '2025-02-03');
    expect(schedule.nights).toHaveLength(1);
    expect(schedule.nights[0].loads).toHaveLength(3);
  });

  it('rolls the fourth load to the next night', () => {
    const schedule = scheduleLoads([first, second, third, fourth], '2025-02-03');
    expect(schedule.nights.map((night) => night.date)).toEqual([
      '2025-02-03',
      '2025-02-04',
    ]);
    expect(loadNight(schedule, 'LD-2025-0004')).toBe('2025-02-04');
  });

  it('rolls a load that clashes on pallets even when there is room', () => {
    const schedule = scheduleLoads([first, clashing], '2025-02-03');
    expect(loadNight(schedule, 'LD-2025-0005')).toBe('2025-02-04');
  });

  it('places every load somewhere', () => {
    const loads = [first, second, third, fourth, clashing];
    const schedule = scheduleLoads(loads, '2025-02-03');
    expect(schedule.placed.size).toBe(loads.length);
  });

  it('is empty for no loads', () => {
    const schedule = scheduleLoads([], '2025-02-03');
    expect(schedule.nights).toEqual([]);
    expect(scheduleSpan(schedule)).toBeNull();
  });

  it('leaves every night passing its own check', () => {
    const schedule = scheduleLoads(
      [first, second, third, fourth, clashing],
      '2025-02-03'
    );
    for (const night of schedule.nights) {
      expect(checkNight(night)).toBe(true);
    }
  });
});

describe('nightsNeeded', () => {
  it('divides by the crew capacity and rounds up', () => {
    expect(nightsNeeded([first, second, third])).toBe(1);
    expect(nightsNeeded([first, second, third, fourth])).toBe(2);
    expect(LOADS_PER_NIGHT).toBe(3);
  });

  it('is nothing for no loads', () => {
    expect(nightsNeeded([])).toBe(0);
  });
});

describe('palletsPerNight and scheduleSpan', () => {
  it('counts the pallets the forklift touches each night', () => {
    const schedule = scheduleLoads([first, second, third], '2025-02-03');
    expect(palletsPerNight(schedule)).toEqual([
      { date: '2025-02-03', loads: 3, pallets: 4 },
    ]);
  });

  it('spans the first night to the last', () => {
    const schedule = scheduleLoads([first, second, third, fourth], '2025-02-03');
    expect(scheduleSpan(schedule)).toEqual({ start: '2025-02-03', end: '2025-02-04' });
  });
});

describe('lateLoads', () => {
  it('is empty when everything lands on time', () => {
    const schedule = scheduleLoads([first, second, third], '2025-02-03');
    expect(lateLoads(schedule, { 'LD-2025-0001': '2025-02-04' })).toEqual([]);
  });

  it('names a load scheduled after its deadline', () => {
    const schedule = scheduleLoads([first, second, third, fourth], '2025-02-03');
    expect(lateLoads(schedule, { 'LD-2025-0004': '2025-02-03' })).toEqual([
      { load: 'LD-2025-0004', scheduled: '2025-02-04', due: '2025-02-03' },
    ]);
  });

  it('ignores loads with no deadline', () => {
    const schedule = scheduleLoads([first, second, third, fourth], '2025-02-03');
    expect(lateLoads(schedule, {})).toEqual([]);
  });
});

describe('byTruck', () => {
  it('groups the loads by unit', () => {
    expect(byTruck([first, second, fourth])).toEqual([
      { unit: 'BH-7', loads: 2, pallets: 3 },
      { unit: 'BH-9', loads: 1, pallets: 1 },
    ]);
  });

  it('is empty for no loads', () => {
    expect(byTruck([])).toEqual([]);
  });
});

describe('describeNight and describeSchedule', () => {
  it('names the loads and the trucks', () => {
    const night = makeDispatchNight('2025-02-03', [first]);
    expect(describeNight(night)).toBe('2025-02-03: 1 loads, LD-2025-0001 on BH-7');
  });

  it('says nothing extra on an empty night', () => {
    expect(describeNight(makeDispatchNight('2025-02-03'))).toBe('2025-02-03: 0 loads');
  });

  it('gives a line per night', () => {
    const schedule = scheduleLoads([first, second, third, fourth], '2025-02-03');
    expect(describeSchedule(schedule).split('\n')).toHaveLength(2);
  });
});
