import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  THRESHOLDS,
  URGENT_MULTIPLIER,
  MONITOR_BAND,
  stageFor,
  thresholdFor,
  thresholdOn,
  actionFor,
  needsTreatment,
  isBlocked,
  describeAction,
} from '../../src/health/threshold.js';
import { SEASON_STAGES } from '../../src/movement/weight.js';

describe('stageFor', () => {
  it('puts November through January in winter', () => {
    expect(stageFor('2024-11-15')).toBe('winter');
    expect(stageFor('2024-12-31')).toBe('winter');
    expect(stageFor('2025-01-04')).toBe('winter');
  });

  it('puts February and March in bloom', () => {
    expect(stageFor('2025-02-14')).toBe('bloom');
    expect(stageFor('2025-03-31')).toBe('bloom');
  });

  it('puts April through July on the flow', () => {
    expect(stageFor('2025-04-01')).toBe('flow');
    expect(stageFor('2025-07-31')).toBe('flow');
  });

  it('puts August through October in fall', () => {
    expect(stageFor('2025-08-14')).toBe('fall');
    expect(stageFor('2025-10-31')).toBe('fall');
  });

  it('names a stage the weight table also knows for every month', () => {
    for (let month = 1; month <= 12; month += 1) {
      const date = `2025-${String(month).padStart(2, '0')}-15`;
      expect(SEASON_STAGES).toContain(stageFor(date));
    }
  });
});

describe('thresholdFor and thresholdOn', () => {
  it('has a threshold for every stage', () => {
    for (const stage of SEASON_STAGES) {
      expect(thresholdFor(stage)).toBe(THRESHOLDS[stage]);
    }
  });

  it('is tightest going into bloom and into winter bees', () => {
    expect(thresholdFor('bloom')).toBeLessThan(thresholdFor('flow'));
    expect(thresholdFor('fall')).toBeLessThan(thresholdFor('winter'));
  });

  it('reads the stage off a date', () => {
    expect(thresholdOn('2025-02-14')).toBe(2);
    expect(thresholdOn('2025-05-14')).toBe(3);
  });

  it('refuses a stage nobody names', () => {
    expect(() => thresholdFor('spring')).toThrow(/must be one of/);
  });
});

describe('actionFor', () => {
  it('says nothing on a clean yard', () => {
    expect(actionFor(0.5, '2025-05-14').action).toBe('none');
  });

  it('says monitor just under the threshold', () => {
    expect(actionFor(2.6, '2025-05-14').action).toBe('monitor');
    expect(actionFor(2.4, '2025-05-14').action).toBe('none');
    expect(MONITOR_BAND).toBe(0.5);
  });

  it('says treat on the threshold itself', () => {
    expect(actionFor(3, '2025-05-14').action).toBe('treat');
  });

  it('says urgent at twice the threshold', () => {
    expect(actionFor(6, '2025-05-14').action).toBe('urgent');
    expect(actionFor(5.9, '2025-05-14').action).toBe('treat');
    expect(URGENT_MULTIPLIER).toBe(2);
  });

  it('calls the same rate differently in different months', () => {
    expect(actionFor(2.5, '2025-05-14').action).toBe('monitor');
    expect(actionFor(2.5, '2025-02-14').action).toBe('treat');
    expect(actionFor(2.5, '2025-09-14').action).toBe('treat');
  });

  it('reports how far over the yard is', () => {
    expect(actionFor(4.5, '2025-05-14').over).toBe(1.5);
    expect(actionFor(2.5, '2025-05-14').over).toBe(-0.5);
  });

  it('blocks a treatment call when the supers are on', () => {
    expect(actionFor(4, '2025-05-14', { supersOn: true }).action).toBe(
      'pull supers first'
    );
    expect(actionFor(9, '2025-05-14', { supersOn: true }).action).toBe(
      'pull supers first'
    );
  });

  it('leaves monitor and none alone when the supers are on', () => {
    expect(actionFor(2.6, '2025-05-14', { supersOn: true }).action).toBe('monitor');
    expect(actionFor(0.5, '2025-05-14', { supersOn: true }).action).toBe('none');
  });

  it('still reports the stage and the overage when it blocks', () => {
    const outcome = actionFor(9, '2025-05-14', { supersOn: true });
    expect(outcome.stage).toBe('flow');
    expect(outcome.over).toBe(6);
    expect(outcome.supersOn).toBe(true);
  });

  it('only ever returns an action from the published list', () => {
    for (const rate of [0, 1.5, 2.6, 3, 6, 20]) {
      for (const supersOn of [true, false]) {
        expect(ACTIONS).toContain(actionFor(rate, '2025-05-14', { supersOn }).action);
      }
    }
  });

  it('refuses a rate that is not a rate', () => {
    expect(() => actionFor(-1, '2025-05-14')).toThrow(/at least 0/);
    expect(() => actionFor(200, '2025-05-14')).toThrow(/at most 100/);
  });
});

describe('needsTreatment and isBlocked', () => {
  it('agree on a straightforward call', () => {
    const outcome = actionFor(4, '2025-05-14');
    expect(needsTreatment(outcome)).toBe(true);
    expect(isBlocked(outcome)).toBe(false);
  });

  it('report a blocked yard as blocked rather than as needing treatment', () => {
    const outcome = actionFor(4, '2025-05-14', { supersOn: true });
    expect(needsTreatment(outcome)).toBe(false);
    expect(isBlocked(outcome)).toBe(true);
  });
});

describe('describeAction', () => {
  it('reads like the note in the health book', () => {
    expect(describeAction(actionFor(4.5, '2025-05-14'))).toBe(
      '4.5 per hundred in flow, 1.5 over the 3 threshold: treat'
    );
  });

  it('says under when the yard is clean', () => {
    expect(describeAction(actionFor(2, '2025-05-14'))).toContain(
      '1 under the 3 threshold'
    );
  });
});
