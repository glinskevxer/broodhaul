import { describe, it, expect } from 'vitest';
import {
  MAX_FRAMES,
  FRAME_STEP,
  clusterToFrames,
  temperatureCorrection,
  makeReading,
  readingFrames,
  isBroodless,
  describeReading,
} from '../../src/grading/frames.js';

const at = (temperatureF) => ({ temperatureF });

describe('clusterToFrames', () => {
  it('reads nothing below the smallest cluster on the table', () => {
    expect(clusterToFrames(3.9)).toBe(0);
    expect(clusterToFrames(0)).toBe(0);
  });

  it('reads the table exactly at its points', () => {
    expect(clusterToFrames(4)).toBe(2);
    expect(clusterToFrames(10)).toBe(6);
    expect(clusterToFrames(12)).toBe(7.5);
  });

  it('interpolates between two points', () => {
    expect(clusterToFrames(11)).toBe(6.75);
    expect(clusterToFrames(5)).toBe(2.75);
  });

  it('lands on a quarter frame', () => {
    for (const inches of [4.3, 7.1, 9.9, 13.7, 17.2]) {
      const frames = clusterToFrames(inches);
      expect(frames % FRAME_STEP).toBeCloseTo(0, 9);
    }
  });

  it('tops out at the widest cluster the table knows', () => {
    expect(clusterToFrames(18)).toBe(12);
    expect(clusterToFrames(22)).toBe(12);
  });

  it('rises with the width', () => {
    let previous = -1;
    for (let inches = 4; inches <= 18; inches += 0.5) {
      const frames = clusterToFrames(inches);
      expect(frames).toBeGreaterThanOrEqual(previous);
      previous = frames;
    }
  });

  it('refuses a cluster wider than a hive body', () => {
    expect(() => clusterToFrames(25)).toThrow(/at most 24/);
  });
});

describe('temperatureCorrection', () => {
  it('leaves a warm count alone', () => {
    expect(temperatureCorrection(70)).toBe(1);
    expect(temperatureCorrection(65)).toBe(1);
  });

  it('takes a percent per degree below sixty five', () => {
    expect(temperatureCorrection(60)).toBeCloseTo(0.95, 10);
    expect(temperatureCorrection(64)).toBeCloseTo(0.99, 10);
  });

  it('stops taking at fifteen percent', () => {
    expect(temperatureCorrection(50)).toBeCloseTo(0.85, 10);
    expect(temperatureCorrection(30)).toBeCloseTo(0.85, 10);
  });

  it('never corrects upward', () => {
    for (const degrees of [40, 55, 65, 80, 105]) {
      expect(temperatureCorrection(degrees)).toBeLessThanOrEqual(1);
    }
  });
});

describe('makeReading', () => {
  it('takes a frame count', () => {
    const reading = makeReading({ colonyId: 'CY-2025-0011', frames: 8.25 });
    expect(reading.frames).toBe(8.25);
    expect(reading.clusterInches).toBeUndefined();
  });

  it('takes a cluster width', () => {
    const reading = makeReading({ colonyId: 'CY-2025-0011', clusterInches: 10 });
    expect(reading.clusterInches).toBe(10);
    expect(reading.frames).toBeUndefined();
  });

  it('refuses both at once', () => {
    expect(() =>
      makeReading({ colonyId: 'CY-2025-0011', frames: 8, clusterInches: 10 })
    ).toThrow(/either frames or a cluster width/);
  });

  it('refuses neither', () => {
    expect(() => makeReading({ colonyId: 'CY-2025-0011' })).toThrow(
      /either frames or a cluster width/
    );
  });

  it('refuses frames called finer than a quarter', () => {
    expect(() => makeReading({ colonyId: 'CY-2025-0011', frames: 8.1 })).toThrow(
      /called to the quarter/
    );
  });

  it('refuses more frames than fit in the boxes', () => {
    expect(() =>
      makeReading({ colonyId: 'CY-2025-0011', frames: MAX_FRAMES + 1 })
    ).toThrow(/at most 20/);
  });

  it('assumes queenright with brood unless told otherwise', () => {
    const reading = makeReading({ colonyId: 'CY-2025-0011', frames: 8 });
    expect(reading.queenright).toBe(true);
    expect(reading.brood).toBe(true);
  });

  it('takes the flags when they are given', () => {
    const reading = makeReading({
      colonyId: 'CY-2025-0011',
      frames: 4,
      queenright: false,
      brood: false,
      notes: 'laying worker',
    });
    expect(reading.queenright).toBe(false);
    expect(reading.notes).toBe('laying worker');
  });

  it('refuses an unknown key', () => {
    expect(() =>
      makeReading({ colonyId: 'CY-2025-0011', frames: 8, mites: 3 })
    ).toThrow(/reading has unknown keys: mites/);
  });
});

describe('readingFrames', () => {
  const reading = (overrides) =>
    makeReading({ colonyId: 'CY-2025-0011', ...overrides });

  it('passes a warm frame count straight through', () => {
    expect(readingFrames(reading({ frames: 8 }), at(70))).toBe(8);
  });

  it('takes the correction off a cool count', () => {
    expect(readingFrames(reading({ frames: 8 }), at(60))).toBe(7.5);
  });

  it('rounds down to the quarter after correcting', () => {
    expect(readingFrames(reading({ frames: 9 }), at(62))).toBe(8.5);
  });

  it('converts a cluster width and then corrects it', () => {
    expect(readingFrames(reading({ clusterInches: 10 }), at(52))).toBe(5);
  });

  it('scores a queenless colony at nothing however many bees are in it', () => {
    expect(readingFrames(reading({ frames: 10, queenright: false }), at(70))).toBe(0);
  });

  it('still counts a broodless colony', () => {
    expect(readingFrames(reading({ frames: 6, brood: false }), at(70))).toBe(6);
  });

  it('never reads above the raw count', () => {
    for (const degrees of [45, 55, 60, 65, 75]) {
      expect(readingFrames(reading({ frames: 8 }), at(degrees))).toBeLessThanOrEqual(8);
    }
  });
});

describe('isBroodless', () => {
  it('is true only for a queenright colony with no brood', () => {
    const base = { colonyId: 'CY-2025-0011', frames: 6 };
    expect(isBroodless(makeReading({ ...base, brood: false }))).toBe(true);
    expect(isBroodless(makeReading(base))).toBe(false);
    expect(isBroodless(makeReading({ ...base, queenright: false, brood: false }))).toBe(
      false
    );
  });
});

describe('describeReading', () => {
  it('names the measure', () => {
    expect(describeReading(makeReading({ colonyId: 'CY-2025-0011', frames: 8 }))).toBe(
      'CY-2025-0011 8 frames'
    );
    expect(
      describeReading(makeReading({ colonyId: 'CY-2025-0011', clusterInches: 10 }))
    ).toBe('CY-2025-0011 10 inch cluster');
  });

  it('adds the flags in brackets', () => {
    const reading = makeReading({
      colonyId: 'CY-2025-0011',
      frames: 4,
      queenright: false,
    });
    expect(describeReading(reading)).toBe('CY-2025-0011 4 frames (queenless)');
  });

  it('names a broodless colony', () => {
    const reading = makeReading({ colonyId: 'CY-2025-0011', frames: 4, brood: false });
    expect(describeReading(reading)).toBe('CY-2025-0011 4 frames (no brood)');
  });
});
