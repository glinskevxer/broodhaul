import { describe, it, expect } from 'vitest';
import {
  TOLERANCE_FRAMES,
  REGRADE_COST_PER_COLONY_CENTS,
  regradeDeadline,
  daysLeftToAsk,
  checkRegradeAllowed,
  measuredValue,
  regradeOutcome,
  governingRun,
  describeRegrade,
} from '../../src/grading/regrade.js';
import { aContract, aRun, WARM } from '../helpers/contracts.js';

const contract = aContract({ terms: { regradeWithinDays: 3 } });
const original = aRun();

const second = (overrides = {}) =>
  aRun({
    id: 'GR-2025-0010',
    grader: 'T Boyle',
    witness: 'Wilkins foreman',
    conditions: { ...WARM, date: '2025-02-16' },
    ...overrides,
  });

describe('regradeDeadline and daysLeftToAsk', () => {
  it('has no deadline without a clause', () => {
    expect(regradeDeadline(aContract(), original)).toBeUndefined();
    expect(daysLeftToAsk(aContract(), original, '2025-02-15')).toBe(0);
  });

  it('runs the window from the day of the run', () => {
    expect(regradeDeadline(contract, original)).toBe('2025-02-17');
  });

  it('counts down and stops at nothing', () => {
    expect(daysLeftToAsk(contract, original, '2025-02-14')).toBe(3);
    expect(daysLeftToAsk(contract, original, '2025-02-16')).toBe(1);
    expect(daysLeftToAsk(contract, original, '2025-02-17')).toBe(0);
    expect(daysLeftToAsk(contract, original, '2025-03-01')).toBe(0);
  });
});

describe('checkRegradeAllowed', () => {
  it('passes a proper regrade', () => {
    expect(checkRegradeAllowed(contract, original, second())).toBe(true);
  });

  it('refuses one on a contract with no clause', () => {
    expect(() => checkRegradeAllowed(aContract(), original, second())).toThrow(
      /has no regrade clause/
    );
  });

  it('refuses one of a different drop', () => {
    expect(() =>
      checkRegradeAllowed(contract, original, second({ dropId: 'DR-2025-0009' }))
    ).toThrow(/the same drop/);
  });

  it('refuses one dated before the run it questions', () => {
    const early = second({ conditions: { ...WARM, date: '2025-02-13' } });
    expect(() => checkRegradeAllowed(contract, original, early)).toThrow(
      /cannot predate/
    );
  });

  it('allows one on the last day of the window', () => {
    const last = second({ conditions: { ...WARM, date: '2025-02-17' } });
    expect(checkRegradeAllowed(contract, original, last)).toBe(true);
  });

  it('refuses one a day late', () => {
    const late = second({ conditions: { ...WARM, date: '2025-02-18' } });
    expect(() => checkRegradeAllowed(contract, original, late)).toThrow(
      /window closed after 3 days/
    );
  });

  it('refuses the same grader', () => {
    expect(() =>
      checkRegradeAllowed(contract, original, second({ grader: 'M Ojeda' }))
    ).toThrow(/different grader/);
  });

  it('refuses one with no witness', () => {
    expect(() =>
      checkRegradeAllowed(contract, original, second({ witness: undefined }))
    ).toThrow(/needs a witness/);
  });

  it('names a rule on every refusal', () => {
    const cases = [
      [aContract(), original, second(), 'RG-1'],
      [contract, original, second({ dropId: 'DR-2025-0009' }), 'RG-2'],
      [
        contract,
        original,
        second({ conditions: { ...WARM, date: '2025-02-13' } }),
        'RG-3',
      ],
      [
        contract,
        original,
        second({ conditions: { ...WARM, date: '2025-02-20' } }),
        'RG-4',
      ],
      [contract, original, second({ grader: 'M Ojeda' }), 'RG-5'],
      [contract, original, second({ witness: undefined }), 'RG-6'],
    ];
    for (const [terms, first, again, rule] of cases) {
      try {
        checkRegradeAllowed(terms, first, again);
        throw new Error(`expected ${rule}`);
      } catch (err) {
        expect(err.rule).toBe(rule);
      }
    }
  });
});

describe('measuredValue', () => {
  it('is the run average on an average contract', () => {
    expect(measuredValue(contract, original)).toBe(7);
  });

  it('is the per hive adjustment in dollars on a colony contract', () => {
    const byColony = aContract({ terms: { gradeBy: 'colony', regradeWithinDays: 3 } });
    expect(measuredValue(byColony, original)).toBe(0);
  });
});

describe('regradeOutcome', () => {
  it('lets the original stand when nothing moved', () => {
    const outcome = regradeOutcome(contract, original, second());
    expect(outcome.movement).toBe(0);
    expect(outcome.governing).toBe('GR-2025-0009');
    expect(outcome.payer).toBe('grower');
  });

  it('lets the original stand inside the tolerance', () => {
    const close = second({ frames: [8, 6, 10, 6] });
    const outcome = regradeOutcome(contract, original, close);
    expect(outcome.movement).toBe(0.5);
    expect(outcome.governing).toBe('GR-2025-0009');
    expect(TOLERANCE_FRAMES).toBe(0.5);
  });

  it('replaces the original once the tolerance is passed', () => {
    const better = second({ frames: [9, 8, 11, 6] });
    const outcome = regradeOutcome(contract, original, better);
    expect(outcome.movement).toBe(1.5);
    expect(outcome.governing).toBe('GR-2025-0010');
    expect(outcome.payer).toBe('operation');
  });

  it('replaces it downward as well', () => {
    const worse = second({ frames: [6, 4, 8, 2] });
    const outcome = regradeOutcome(contract, original, worse);
    expect(outcome.movement).toBe(-2);
    expect(outcome.governing).toBe('GR-2025-0010');
  });

  it('prices the second opening per colony', () => {
    const outcome = regradeOutcome(contract, original, second());
    expect(outcome.costCents).toBe(REGRADE_COST_PER_COLONY_CENTS * 4);
  });

  it('reads the movement against the paying number on a colony contract', () => {
    const byColony = aContract({ terms: { gradeBy: 'colony', regradeWithinDays: 3 } });
    const stronger = second({ frames: [11, 11, 11, 11] });
    const outcome = regradeOutcome(byColony, original, stronger);
    expect(outcome.before).toBe(0);
    expect(outcome.after).toBe(25);
    expect(outcome.governing).toBe('GR-2025-0010');
  });

  it('refuses to work out an outcome for a regrade that is not allowed', () => {
    expect(() =>
      regradeOutcome(contract, original, second({ grader: 'M Ojeda' }))
    ).toThrow(/different grader/);
  });
});

describe('governingRun', () => {
  it('hands back the run that governs', () => {
    expect(governingRun(contract, original, second()).id).toBe('GR-2025-0009');
    const better = second({ frames: [9, 8, 11, 6] });
    expect(governingRun(contract, original, better).id).toBe('GR-2025-0010');
  });
});

describe('describeRegrade', () => {
  it('says what happened in one line', () => {
    expect(describeRegrade(regradeOutcome(contract, original, second()))).toBe(
      'GR-2025-0010 against GR-2025-0009: no movement, GR-2025-0009 governs, grower pays'
    );
  });

  it('says which way it moved', () => {
    const better = second({ frames: [9, 8, 11, 6] });
    expect(describeRegrade(regradeOutcome(contract, original, better))).toContain(
      'moved 1.5'
    );
  });
});
