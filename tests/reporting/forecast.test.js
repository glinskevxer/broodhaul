import { describe, it, expect } from 'vitest';
import {
  STAGE_LOSS,
  SPLIT_MATURITY,
  lossFor,
  survivorsAfter,
  walkStages,
  forecastToBloom,
  splitsNeededFor,
  increaseFeasible,
  contractCoverage,
  describeForecast,
  lossTable,
} from '../../src/reporting/forecast.js';
import { SEASON_STAGES } from '../../src/movement/weight.js';

const strengths = [
  { id: 'CY-2025-0011', frames: 12 },
  { id: 'CY-2025-0012', frames: 10 },
  { id: 'CY-2025-0013', frames: 6 },
];

describe('lossFor and survivorsAfter', () => {
  it('has a loss rate for every stage', () => {
    for (const stage of SEASON_STAGES) {
      expect(lossFor(stage)).toBe(STAGE_LOSS[stage]);
      expect(lossFor(stage)).toBeGreaterThan(0);
      expect(lossFor(stage)).toBeLessThan(1);
    }
  });

  it('loses most over winter', () => {
    expect(lossFor('winter')).toBeGreaterThan(lossFor('fall'));
    expect(lossFor('winter')).toBeGreaterThan(lossFor('bloom'));
  });

  it('rounds a part colony away', () => {
    expect(survivorsAfter(100, 'winter')).toBe(86);
    expect(survivorsAfter(1, 'winter')).toBe(0);
  });

  it('is nothing from nothing', () => {
    expect(survivorsAfter(0, 'winter')).toBe(0);
  });

  it('refuses a stage nobody names', () => {
    expect(() => lossFor('spring')).toThrow(/must be one of/);
  });
});

describe('walkStages', () => {
  it('reports a row per stage', () => {
    const rows = walkStages(1000, ['fall', 'winter']);
    expect(rows.map((row) => row.stage)).toEqual(['fall', 'winter']);
    expect(rows[0].after).toBe(940);
    expect(rows[1].before).toBe(940);
  });

  it('adds the losses to the difference', () => {
    for (const row of walkStages(1000, ['fall', 'winter', 'bloom'])) {
      expect(row.before - row.lost).toBe(row.after);
    }
  });

  it('walks nowhere with no stages', () => {
    expect(walkStages(1000, [])).toEqual([]);
  });
});

describe('forecastToBloom', () => {
  it('walks fall and winter by default', () => {
    const forecast = forecastToBloom(1000);
    expect(forecast.stages.map((row) => row.stage)).toEqual(['fall', 'winter']);
    expect(forecast.survived).toBe(808);
    expect(forecast.atBloom).toBe(808);
  });

  it('starts from winter when asked', () => {
    const forecast = forecastToBloom(1000, { from: 'winter' });
    expect(forecast.stages.map((row) => row.stage)).toEqual(['winter']);
    expect(forecast.survived).toBe(860);
  });

  it('matures the splits at the published rate', () => {
    const forecast = forecastToBloom(1000, { splits: 200 });
    expect(forecast.maturedSplits).toBe(110);
    expect(forecast.atBloom).toBe(918);
  });

  it('gives a winter split nothing by bloom', () => {
    const forecast = forecastToBloom(1000, { splits: 200, splitStage: 'winter' });
    expect(forecast.maturedSplits).toBe(0);
    expect(SPLIT_MATURITY.winter).toBe(0);
  });

  it('reports the loss rate to three places', () => {
    expect(forecastToBloom(1000).lossRate).toBe(0.192);
    expect(forecastToBloom(0).lossRate).toBe(0);
  });

  it('refuses a start it cannot walk from', () => {
    expect(() => forecastToBloom(1000, { from: 'flow' })).toThrow(
      /starts in fall or winter/
    );
  });
});

describe('splitsNeededFor', () => {
  it('is nothing when the forecast already covers it', () => {
    expect(splitsNeededFor(500, 1000)).toBe(0);
  });

  it('works back through the maturity rate', () => {
    expect(splitsNeededFor(1000, 1000)).toBe(350);
  });

  it('needs fewer from a flow split', () => {
    expect(splitsNeededFor(1000, 1000, { splitStage: 'flow' })).toBeLessThan(
      splitsNeededFor(1000, 1000)
    );
  });

  it('refuses a split stage that will never be ready', () => {
    expect(() => splitsNeededFor(1000, 1000, { splitStage: 'winter' })).toThrow(
      /will not be ready by bloom/
    );
  });
});

describe('increaseFeasible', () => {
  it('says how many splits the yards can carry', () => {
    const outcome = increaseFeasible(strengths, 10);
    expect(outcome.eligible).toBe(2);
    expect(outcome.possible).toBeLessThan(10);
    expect(outcome.short).toBe(10 - outcome.possible);
  });

  it('is content when the target is small', () => {
    expect(increaseFeasible(strengths, 2).short).toBe(0);
  });

  it('carries nothing on light colonies', () => {
    expect(increaseFeasible([{ id: 'CY-1', frames: 5 }], 4).possible).toBe(0);
  });
});

describe('contractCoverage', () => {
  it('is covered with spare', () => {
    expect(contractCoverage(918, 800)).toEqual({
      atBloom: 918,
      contracted: 800,
      spare: 118,
      covered: true,
      rate: 1.148,
    });
  });

  it('is short when the contracts are bigger than the outfit', () => {
    const coverage = contractCoverage(808, 1000);
    expect(coverage.covered).toBe(false);
    expect(coverage.spare).toBe(-192);
  });

  it('is covered against no contracts', () => {
    expect(contractCoverage(808, 0).rate).toBe(1);
  });
});

describe('describeForecast and lossTable', () => {
  it('gives a line per stage and a total', () => {
    const lines = describeForecast(forecastToBloom(1000, { splits: 200 })).split('\n');
    expect(lines[0]).toBe('start 1000 colonies in fall');
    expect(lines[1]).toBe('fall: lose 60, 940 left');
    expect(lines.pop()).toBe('918 at bloom');
  });

  it('leaves the split line out when there are none', () => {
    expect(describeForecast(forecastToBloom(1000))).not.toContain('splits give');
  });

  it('publishes a table with a row per stage', () => {
    expect(lossTable()).toHaveLength(SEASON_STAGES.length);
    expect(lossTable()[0].stage).toBe('bloom');
  });
});
