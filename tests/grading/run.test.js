import { describe, it, expect } from 'vitest';
import {
  makeGradingRun,
  runMethod,
  correctedFrames,
  runAverage,
  runTotalFrames,
  runDistribution,
  runFlags,
  countAtOrAbove,
  shareAtOrAbove,
  checkSampleSize,
  summariseRun,
  totalReadings,
} from '../../src/grading/run.js';

const warm = {
  date: '2025-02-14',
  time: '11:30',
  temperatureF: 68,
  windMph: 5,
  precipitation: 'none',
};

const cold = { ...warm, temperatureF: 52, time: '08:30' };

const reading = (sequence, frames, extra = {}) => ({
  colonyId: `CY-2025-${String(sequence).padStart(4, '0')}`,
  frames,
  ...extra,
});

const base = {
  id: 'GR-2025-0009',
  contractId: 'CT-2025-0007',
  dropId: 'DR-2025-0004',
  grader: 'M Ojeda',
  conditions: warm,
  readings: [reading(11, 8), reading(12, 6), reading(13, 10), reading(14, 4)],
};

const run = (overrides = {}) => makeGradingRun({ ...base, ...overrides });

describe('makeGradingRun', () => {
  it('keeps the identifiers and the grader', () => {
    const built = run();
    expect(built.id).toBe('GR-2025-0009');
    expect(built.contractId).toBe('CT-2025-0007');
    expect(built.grader).toBe('M Ojeda');
  });

  it('refuses a run that opened nothing', () => {
    expect(() => run({ readings: [] })).toThrow(/at least 1 entries/);
  });

  it('refuses the same colony read twice', () => {
    expect(() => run({ readings: [reading(11, 8), reading(11, 6)] })).toThrow(
      /was read twice in one run/
    );
  });

  it('refuses a contract identifier of the wrong kind', () => {
    expect(() => run({ contractId: 'DR-2025-0007' })).toThrow(
      /expected a contract identifier/
    );
  });

  it('takes an optional witness', () => {
    expect(run({ witness: 'grower foreman' }).witness).toBe('grower foreman');
    expect(run().witness).toBeUndefined();
  });

  it('refuses an unknown key', () => {
    expect(() => makeGradingRun({ ...base, weather: 'nice' })).toThrow(
      /grading run has unknown keys: weather/
    );
  });
});

describe('runMethod', () => {
  it('reads the method off the conditions', () => {
    expect(runMethod(run())).toBe('frame');
    expect(runMethod(run({ conditions: cold }))).toBe('cluster');
  });
});

describe('correctedFrames', () => {
  it('leaves a warm run alone', () => {
    expect(correctedFrames(run())).toEqual([8, 6, 10, 4]);
  });

  it('corrects a cool run down', () => {
    const cool = run({ conditions: { ...warm, temperatureF: 60 } });
    expect(correctedFrames(cool)).toEqual([7.5, 5.5, 9.5, 3.75]);
  });

  it('keeps the order the readings were called in', () => {
    const mixed = run({ readings: [reading(13, 10), reading(11, 8)] });
    expect(correctedFrames(mixed)).toEqual([10, 8]);
  });
});

describe('runAverage and runTotalFrames', () => {
  it('average the corrected figures', () => {
    expect(runAverage(run())).toBe(7);
    expect(runTotalFrames(run())).toBe(28);
  });

  it('round the average to two places', () => {
    const three = run({
      readings: [reading(11, 8), reading(12, 6), reading(13, 7.25)],
    });
    expect(runAverage(three)).toBe(7.08);
  });

  it('drop with the correction', () => {
    const cool = run({ conditions: { ...warm, temperatureF: 60 } });
    expect(runAverage(cool)).toBe(6.56);
  });
});

describe('runDistribution', () => {
  it('buckets by whole frames, ascending', () => {
    expect(runDistribution(run())).toEqual([
      { frames: 4, colonies: 1 },
      { frames: 6, colonies: 1 },
      { frames: 8, colonies: 1 },
      { frames: 10, colonies: 1 },
    ]);
  });

  it('puts a quarter frame in the bucket below', () => {
    const uneven = run({ readings: [reading(11, 6.75), reading(12, 6.25)] });
    expect(runDistribution(uneven)).toEqual([{ frames: 6, colonies: 2 }]);
  });
});

describe('runFlags', () => {
  it('counts what was read and what was wrong with it', () => {
    const flagged = run({
      readings: [
        reading(11, 8),
        reading(12, 6, { brood: false }),
        reading(13, 5, { queenright: false }),
        reading(14, 0),
      ],
    });
    expect(runFlags(flagged)).toEqual({
      read: 4,
      queenless: 1,
      broodless: 1,
      empty: 2,
    });
  });

  it('counts nothing wrong on a clean run', () => {
    expect(runFlags(run())).toEqual({ read: 4, queenless: 0, broodless: 0, empty: 0 });
  });
});

describe('countAtOrAbove and shareAtOrAbove', () => {
  it('count the colonies that make a threshold', () => {
    expect(countAtOrAbove(run(), 6)).toBe(3);
    expect(countAtOrAbove(run(), 10)).toBe(1);
    expect(countAtOrAbove(run(), 11)).toBe(0);
  });

  it('include a colony sitting exactly on the threshold', () => {
    expect(countAtOrAbove(run(), 8)).toBe(2);
  });

  it('report the share to four places', () => {
    expect(shareAtOrAbove(run(), 6)).toBe(0.75);
    expect(
      shareAtOrAbove(
        run({ readings: [reading(11, 8), reading(12, 4), reading(13, 4)] }),
        6
      )
    ).toBe(0.3333);
  });
});

describe('checkSampleSize', () => {
  it('passes when enough hives were opened', () => {
    expect(checkSampleSize(run(), 40, 10)).toBe(4);
  });

  it('refuses when too few were opened', () => {
    expect(() => checkSampleSize(run(), 100, 10)).toThrow(
      /opened 4 colonies, terms ask for 10/
    );
  });

  it('asks for more on a cold run than a warm one', () => {
    const cool = makeGradingRun({
      ...base,
      conditions: cold,
      readings: Array.from({ length: 15 }, (_unused, at) => reading(20 + at, 6)),
    });
    expect(checkSampleSize(cool, 100, 10)).toBe(15);
    expect(() => checkSampleSize(cool, 200, 10)).toThrow(/terms ask for 30/);
  });

  it('names the rule it came from', () => {
    try {
      checkSampleSize(run(), 100, 10);
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('GR-2');
      expect(err.details.opened).toBe(4);
    }
  });
});

describe('summariseRun', () => {
  it('gives one flat row per run', () => {
    expect(summariseRun(run())).toEqual({
      id: 'GR-2025-0009',
      contractId: 'CT-2025-0007',
      dropId: 'DR-2025-0004',
      date: '2025-02-14',
      method: 'frame',
      grader: 'M Ojeda',
      read: 4,
      average: 7,
      total: 28,
      queenless: 0,
      broodless: 0,
    });
  });
});

describe('totalReadings', () => {
  it('adds the hives opened across several runs', () => {
    expect(totalReadings([run(), run()])).toBe(8);
  });

  it('is zero across no runs', () => {
    expect(totalReadings([])).toBe(0);
  });
});
