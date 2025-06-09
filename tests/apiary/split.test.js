import { describe, it, expect } from 'vitest';
import {
  QUEEN_SOURCES,
  QUEEN_DELAY_DAYS,
  BUILD_RATE_FRAMES_PER_WEEK,
  MINIMUM_DONOR_FRAMES,
  MINIMUM_SPLIT_FRAMES,
  MINIMUM_DONOR_REMAINDER,
  checkDonor,
  makeSplit,
  layingOn,
  projectedFrames,
  donorAfter,
  latestMakeDate,
  willMakeGrade,
  planIncrease,
  increaseSummary,
} from '../../src/apiary/split.js';

const split = (overrides = {}) =>
  makeSplit({
    donorId: 'CY-2025-0011',
    takeFrames: 2,
    madeOn: '2025-06-01',
    ...overrides,
  });

const colony = (id, frames) => ({ id, frames });

describe('checkDonor', () => {
  it('passes a strong donor giving up two frames', () => {
    expect(checkDonor(10, 2)).toBe(true);
  });

  it('refuses a donor that is too light to give anything', () => {
    expect(() => checkDonor(6, 2)).toThrow(/a donor needs 8 frames, this one has 6/);
  });

  it('refuses a take that guts the donor', () => {
    expect(() => checkDonor(8, 4)).toThrow(/guts the donor/);
    expect(checkDonor(9, 4)).toBe(true);
  });

  it('refuses a split too small to hold together', () => {
    expect(() => checkDonor(12, 1)).toThrow(/needs 2 frames to hold together/);
  });

  it('refuses a take bigger than anybody makes', () => {
    expect(() => checkDonor(20, 6)).toThrow(/at most 4/);
  });

  it('names the rule on each refusal', () => {
    const cases = [
      [[6, 2], 'SP-1'],
      [[8, 4], 'SP-2'],
      [[12, 1], 'SP-3'],
    ];
    for (const [args, rule] of cases) {
      try {
        checkDonor(...args);
        throw new Error(`expected ${rule}`);
      } catch (err) {
        expect(err.rule).toBe(rule);
      }
    }
  });

  it('agrees with the published floors', () => {
    expect(MINIMUM_DONOR_FRAMES).toBe(8);
    expect(MINIMUM_SPLIT_FRAMES).toBe(2);
    expect(MINIMUM_DONOR_REMAINDER).toBe(5);
  });
});

describe('makeSplit', () => {
  it('defaults to a queen cell', () => {
    expect(split().queenedBy).toBe('cell');
  });

  it('takes every way of queening a split', () => {
    for (const queenedBy of QUEEN_SOURCES) {
      expect(split({ queenedBy }).queenedBy).toBe(queenedBy);
    }
  });

  it('refuses frames finer than a half', () => {
    expect(() => split({ takeFrames: 2.25 })).toThrow(/taken to the half/);
  });

  it('refuses a way of queening nobody uses', () => {
    expect(() => split({ queenedBy: 'hope' })).toThrow(/must be one of/);
  });
});

describe('layingOn', () => {
  it('waits longest for a walk away split', () => {
    expect(layingOn(split({ queenedBy: 'walk away' }))).toBe('2025-06-29');
    expect(layingOn(split({ queenedBy: 'mated queen' }))).toBe('2025-06-03');
    expect(QUEEN_DELAY_DAYS.cell).toBe(14);
  });
});

describe('projectedFrames', () => {
  it('does not build before the queen is laying', () => {
    expect(projectedFrames(split(), '2025-06-10')).toBe(2);
  });

  it('builds at the published rate afterwards', () => {
    expect(projectedFrames(split(), '2025-06-22')).toBe(2.75);
    expect(BUILD_RATE_FRAMES_PER_WEEK).toBe(0.75);
  });

  it('rounds down to the quarter frame', () => {
    expect(projectedFrames(split(), '2025-06-20')).toBe(2.5);
  });

  it('builds further given longer', () => {
    expect(projectedFrames(split(), '2025-09-01')).toBeGreaterThan(
      projectedFrames(split(), '2025-08-01')
    );
  });

  it('is behind a mated queen split at every date', () => {
    const cell = split({ queenedBy: 'cell' });
    const mated = split({ queenedBy: 'mated queen' });
    expect(projectedFrames(cell, '2025-09-01')).toBeLessThan(
      projectedFrames(mated, '2025-09-01')
    );
  });
});

describe('donorAfter', () => {
  it('takes the frames off the donor', () => {
    expect(donorAfter(10, split())).toBe(8);
    expect(donorAfter(10, split({ takeFrames: 3.5 }))).toBe(6.5);
  });
});

describe('latestMakeDate and willMakeGrade', () => {
  it('is the target date itself when nothing has to be built', () => {
    expect(latestMakeDate(2, '2026-02-01')).toBe('2026-02-01');
  });

  it('backs off the build time and the queen delay', () => {
    expect(latestMakeDate(8, '2026-02-01')).toBe('2025-11-23');
  });

  it('leaves more time for a walk away split', () => {
    const cell = latestMakeDate(8, '2026-02-01', { queenedBy: 'cell' });
    const walk = latestMakeDate(8, '2026-02-01', { queenedBy: 'walk away' });
    expect(walk < cell).toBe(true);
  });

  it('agrees with the projection at the boundary', () => {
    const made = latestMakeDate(8, '2026-02-01');
    expect(willMakeGrade(split({ madeOn: made }), 8, '2026-02-01')).toBe(true);
  });

  it('says no for a split made too late', () => {
    expect(willMakeGrade(split({ madeOn: '2025-12-01' }), 8, '2026-02-01')).toBe(false);
  });

  it('refuses a target below what a split even starts at', () => {
    expect(() => latestMakeDate(1, '2026-02-01')).toThrow(/at least 2/);
  });
});

describe('planIncrease', () => {
  const colonies = [
    colony('CY-2025-0011', 12),
    colony('CY-2025-0012', 9),
    colony('CY-2025-0013', 6),
  ];

  it('leaves the light colonies alone', () => {
    const plan = planIncrease(colonies);
    expect(plan.every((entry) => entry.donorId !== 'CY-2025-0013')).toBe(true);
  });

  it('takes from the strongest first', () => {
    expect(planIncrease(colonies)[0].donorId).toBe('CY-2025-0011');
  });

  it('takes more than one split off a very strong colony', () => {
    const plan = planIncrease(colonies);
    const fromStrongest = plan.filter((entry) => entry.donorId === 'CY-2025-0011');
    expect(fromStrongest).toHaveLength(3);
    expect(fromStrongest[2].donorLeft).toBe(6);
  });

  it('never pulls a donor below the remainder', () => {
    for (const entry of planIncrease(colonies)) {
      expect(entry.donorLeft).toBeGreaterThanOrEqual(MINIMUM_DONOR_REMAINDER);
    }
  });

  it('stops at the number wanted', () => {
    expect(planIncrease(colonies, { wanted: 2 })).toHaveLength(2);
  });

  it('is empty when nothing is strong enough', () => {
    expect(planIncrease([colony('CY-2025-0013', 6)])).toEqual([]);
  });

  it('takes fewer splits at a bigger take', () => {
    expect(planIncrease(colonies, { takeFrames: 4 }).length).toBeLessThan(
      planIncrease(colonies).length
    );
  });
});

describe('increaseSummary', () => {
  const colonies = [colony('CY-2025-0011', 12), colony('CY-2025-0012', 9)];

  it('counts the splits, the donors and the frames', () => {
    const plan = planIncrease(colonies);
    expect(increaseSummary(plan, colonies)).toEqual({
      splits: 5,
      donors: 2,
      framesTaken: 10,
      coloniesAfter: 7,
    });
  });

  it('is quiet on an empty plan', () => {
    expect(increaseSummary([], colonies)).toEqual({
      splits: 0,
      donors: 0,
      framesTaken: 0,
      coloniesAfter: 2,
    });
  });
});
