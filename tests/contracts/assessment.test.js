import { describe, it, expect } from 'vitest';
import {
  pooledReadings,
  pooledAverage,
  assessContract,
  coloniesMeetingMinimum,
  assessmentShortfall,
} from '../../src/contracts/assessment.js';
import { aContract, aRun, COLD } from '../helpers/contracts.js';

const contract = aContract();
const run = aRun();

describe('pooledReadings', () => {
  it('flattens the runs into one list sorted by colony', () => {
    const pooled = pooledReadings(contract, [run]);
    expect(pooled.map((entry) => entry.colonyId)).toEqual([
      'CY-2025-0011',
      'CY-2025-0012',
      'CY-2025-0013',
      'CY-2025-0014',
    ]);
    expect(pooled[0]).toEqual({
      runId: 'GR-2025-0009',
      dropId: 'DR-2025-0004',
      colonyId: 'CY-2025-0011',
      frames: 8,
    });
  });

  it('pools several runs together', () => {
    const second = aRun({ id: 'GR-2025-0010', frames: [7, 7], dropId: 'DR-2025-0005' });
    expect(pooledReadings(contract, [run, second])).toHaveLength(6);
  });

  it('carries the correction through from a cold run', () => {
    const cold = aRun({ conditions: COLD, frames: [8] });
    expect(pooledReadings(contract, [cold])[0].frames).toBe(6.75);
  });

  it('refuses a run belonging to another contract', () => {
    const stray = aRun({ contractId: 'CT-2025-0099' });
    expect(() => pooledReadings(contract, [stray])).toThrow(
      /is not on contract CT-2025-0007/
    );
  });
});

describe('pooledAverage', () => {
  it('averages every reading on the contract', () => {
    expect(pooledAverage(contract, [run])).toBe(7);
  });

  it('weights by readings rather than by run', () => {
    const small = aRun({ id: 'GR-2025-0010', frames: [12], dropId: 'DR-2025-0005' });
    expect(pooledAverage(contract, [run, small])).toBe(8);
  });

  it('refuses a contract with nothing graded', () => {
    expect(() => pooledAverage(contract, [])).toThrow(/has no grading readings/);
  });
});

describe('assessContract graded by average', () => {
  it('reads one tier off the pooled average', () => {
    const assessment = assessContract(contract, [run]);
    expect(assessment.average).toBe(7);
    expect(assessment.perHiveAdjustmentCents).toBe(-2500);
    expect(assessment.colonyAdjustments).toEqual([]);
  });

  it('reports the run identifiers and the methods used', () => {
    const assessment = assessContract(contract, [run]);
    expect(assessment.runIds).toEqual(['GR-2025-0009']);
    expect(assessment.methods).toEqual(['frame']);
  });

  it('reports both methods when a contract was graded twice in different weather', () => {
    const cold = aRun({ id: 'GR-2025-0010', conditions: COLD, frames: [9, 9] });
    expect(assessContract(contract, [run, cold]).methods).toEqual(['cluster', 'frame']);
  });

  it('flags a drop under the minimum', () => {
    expect(assessContract(contract, [run]).meetsMinimum).toBe(false);
  });

  it('is content with a drop on the minimum', () => {
    const strong = aRun({ frames: [8, 8, 8, 8] });
    const assessment = assessContract(contract, [strong]);
    expect(assessment.meetsMinimum).toBe(true);
    expect(assessment.perHiveAdjustmentCents).toBe(0);
  });

  it('pays the top tier on a strong drop', () => {
    const strong = aRun({ frames: [11, 10, 12, 10] });
    expect(assessContract(contract, [strong]).perHiveAdjustmentCents).toBe(2500);
  });

  it('counts the colonies read', () => {
    expect(assessContract(contract, [run]).coloniesRead).toBe(4);
  });

  it('refuses an assessment with no runs at all', () => {
    expect(() => assessContract(contract, [])).toThrow(/at least 1 entries/);
  });
});

describe('assessContract graded by colony', () => {
  const byColony = aContract({ terms: { gradeBy: 'colony' } });

  it('tiers each opened hive on its own', () => {
    const assessment = assessContract(byColony, [run]);
    expect(assessment.colonyAdjustments.map((entry) => entry.adjustmentCents)).toEqual([
      0, -2500, 2500, 0,
    ]);
  });

  it('names the tier each hive landed in', () => {
    const assessment = assessContract(byColony, [run]);
    expect(assessment.colonyAdjustments.map((entry) => entry.tier)).toEqual([
      8,
      6,
      10,
      undefined,
    ]);
  });

  it('averages the sampled adjustments into a per hive figure', () => {
    expect(assessContract(byColony, [run]).perHiveAdjustmentCents).toBe(0);
  });

  it('disagrees with the average route on the same bees, which is the point', () => {
    const byAverage = assessContract(contract, [run]);
    const perColony = assessContract(byColony, [run]);
    expect(byAverage.average).toBe(perColony.average);
    expect(byAverage.perHiveAdjustmentCents).not.toBe(perColony.perHiveAdjustmentCents);
  });

  it('agrees with the average route when every hive is the same', () => {
    const even = aRun({ frames: [7, 7, 7, 7] });
    expect(assessContract(byColony, [even]).perHiveAdjustmentCents).toBe(
      assessContract(contract, [even]).perHiveAdjustmentCents
    );
  });

  it('rounds the mean adjustment to the cent', () => {
    const three = aRun({ frames: [11, 7, 8] });
    expect(assessContract(byColony, [three]).perHiveAdjustmentCents).toBe(0);
  });

  it('still reports the pooled average alongside', () => {
    expect(assessContract(byColony, [run]).average).toBe(7);
  });
});

describe('coloniesMeetingMinimum', () => {
  it('counts the hives at or above the contract minimum', () => {
    expect(coloniesMeetingMinimum(contract, [run])).toBe(2);
  });

  it('counts none when the whole drop is light', () => {
    expect(coloniesMeetingMinimum(contract, [aRun({ frames: [4, 5, 6] })])).toBe(0);
  });
});

describe('assessmentShortfall', () => {
  it('is the gap to the minimum', () => {
    expect(assessmentShortfall(contract, assessContract(contract, [run]))).toBe(1);
  });

  it('is nothing when the minimum is met', () => {
    const strong = aRun({ frames: [9, 9, 9, 9] });
    expect(assessmentShortfall(contract, assessContract(contract, [strong]))).toBe(0);
  });

  it('reports to two places', () => {
    const light = aRun({ frames: [7.25, 7.25, 7.5] });
    expect(assessmentShortfall(contract, assessContract(contract, [light]))).toBe(0.67);
  });
});
