import { describe, it, expect } from 'vitest';
import {
  makeTreatment,
  treatmentSeason,
  isOnHives,
  dueOffOn,
  isOverdue,
  withdrawalEndsOn,
  supersMayReturnOn,
  inWithdrawal,
  treatmentSpan,
  checkLabel,
  treatmentsInSeason,
  checkSeasonCap,
  checkRotation,
  lastTreatmentFor,
} from '../../src/health/treatment.js';

const base = {
  id: 'TR-2025-0021',
  yardId: 'YD-2025-0004',
  colonies: ['CY-2025-0011', 'CY-2025-0012'],
  product: 'apivar',
  appliedOn: '2025-08-14',
  temperatureF: 88,
  applicator: 'M Ojeda',
  units: 4,
};

const treatment = (overrides = {}) => makeTreatment({ ...base, ...overrides });

describe('makeTreatment', () => {
  it('keeps the product code from the catalogue', () => {
    expect(treatment().product).toBe('apivar');
  });

  it('refuses a product the shed does not carry', () => {
    expect(() => treatment({ product: 'checkmite' })).toThrow(/no product with id/);
  });

  it('defaults the supers to off', () => {
    expect(treatment().supersOn).toBe(false);
  });

  it('refuses a removal before the application', () => {
    expect(() => treatment({ removedOn: '2025-08-01' })).toThrow(
      /came off before it went on/
    );
  });

  it('refuses an empty colony list', () => {
    expect(() => treatment({ colonies: [] })).toThrow(/at least 1 entries/);
  });

  it('refuses the same colony twice', () => {
    expect(() => treatment({ colonies: ['CY-2025-0011', 'CY-2025-0011'] })).toThrow(
      /is on the treatment twice/
    );
  });

  it('refuses something in the colony list that is not a colony', () => {
    expect(() => treatment({ colonies: ['YD-2025-0004'] })).toThrow(
      /treatment.colonies\[0\] is not a colony identifier/
    );
  });

  it('refuses an unknown key', () => {
    expect(() => makeTreatment({ ...base, batch: 'A' })).toThrow(
      /treatment has unknown keys: batch/
    );
  });
});

describe('treatmentSeason', () => {
  it('reads the season off the application date', () => {
    expect(treatmentSeason(treatment())).toBe(2025);
    expect(treatmentSeason(treatment({ appliedOn: '2024-11-14' }))).toBe(2025);
  });
});

describe('dates on the hives', () => {
  it('knows a treatment that is still on', () => {
    expect(isOnHives(treatment())).toBe(true);
    expect(isOnHives(treatment({ removedOn: '2025-09-25' }))).toBe(false);
  });

  it('works the due off date from the label duration', () => {
    expect(dueOffOn(treatment())).toBe('2025-09-25');
    expect(dueOffOn(treatment({ product: 'formic-pro' }))).toBe('2025-08-28');
  });

  it('calls a treatment overdue once it is past due and still on', () => {
    expect(isOverdue(treatment(), '2025-09-25')).toBe(false);
    expect(isOverdue(treatment(), '2025-09-26')).toBe(true);
  });

  it('never calls a pulled treatment overdue', () => {
    expect(isOverdue(treatment({ removedOn: '2025-10-30' }), '2025-12-01')).toBe(false);
  });

  it('spans from application to removal, or to the due date when still on', () => {
    expect(treatmentSpan(treatment())).toEqual({
      start: '2025-08-14',
      end: '2025-09-25',
    });
    expect(treatmentSpan(treatment({ removedOn: '2025-09-10' }))).toEqual({
      start: '2025-08-14',
      end: '2025-09-10',
    });
  });
});

describe('withdrawal', () => {
  it('runs the label days from the day it came off', () => {
    expect(withdrawalEndsOn(treatment({ removedOn: '2025-09-10' }))).toBe('2025-09-24');
  });

  it('runs from the due date when nobody has pulled it', () => {
    expect(withdrawalEndsOn(treatment())).toBe('2025-10-09');
  });

  it('lets supers back the day after it ends', () => {
    expect(supersMayReturnOn(treatment({ removedOn: '2025-09-10' }))).toBe(
      '2025-09-25'
    );
  });

  it('knows which days fall inside the withdrawal', () => {
    const pulled = treatment({ removedOn: '2025-09-10' });
    expect(inWithdrawal(pulled, '2025-09-10')).toBe(true);
    expect(inWithdrawal(pulled, '2025-09-24')).toBe(true);
    expect(inWithdrawal(pulled, '2025-09-25')).toBe(false);
  });

  it('has no withdrawal at all on a product with none', () => {
    const formic = treatment({ product: 'formic-pro', removedOn: '2025-08-28' });
    expect(withdrawalEndsOn(formic)).toBe('2025-08-28');
    expect(inWithdrawal(formic, '2025-08-28')).toBe(false);
  });
});

describe('checkLabel', () => {
  it('passes an application inside the window', () => {
    expect(checkLabel(treatment())).toBe(true);
  });

  it('refuses one outside the temperature window', () => {
    expect(() =>
      checkLabel(treatment({ product: 'formic-pro', temperatureF: 92 }))
    ).toThrow(/breaks the label: above 85F/);
  });

  it('refuses one put on under supers', () => {
    expect(() => checkLabel(treatment({ supersOn: true }))).toThrow(/honey supers on/);
  });

  it('names the rule', () => {
    try {
      checkLabel(treatment({ supersOn: true }));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('TR-1');
      expect(err.details.blockers).toEqual(['honey supers on']);
    }
  });

  it('passes formic under supers, which is the whole reason it is on the shelf', () => {
    expect(
      checkLabel(treatment({ product: 'formic-pro', temperatureF: 72, supersOn: true }))
    ).toBe(true);
  });
});

describe('treatmentsInSeason and checkSeasonCap', () => {
  const first = treatment({ id: 'TR-2025-0021', appliedOn: '2024-12-01' });
  const second = treatment({ id: 'TR-2025-0022', appliedOn: '2025-08-14' });
  const third = treatment({ id: 'TR-2025-0023', appliedOn: '2025-09-30' });

  it('keeps a season together and sorts it', () => {
    const found = treatmentsInSeason([third, first, second], 2025);
    expect(found.map((entry) => entry.id)).toEqual([
      'TR-2025-0021',
      'TR-2025-0022',
      'TR-2025-0023',
    ]);
  });

  it('leaves other seasons out', () => {
    const older = treatment({ id: 'TR-2024-0001', appliedOn: '2023-12-01' });
    expect(treatmentsInSeason([older, second], 2025).map((entry) => entry.id)).toEqual([
      'TR-2025-0022',
    ]);
  });

  it('allows a product up to its cap', () => {
    expect(checkSeasonCap([first], second)).toBe(2);
  });

  it('refuses the one past the cap', () => {
    expect(() => checkSeasonCap([first, second], third)).toThrow(
      /Apivar is limited to 2 applications a season/
    );
  });

  it('does not count the candidate against itself', () => {
    expect(checkSeasonCap([first, second], second)).toBe(2);
  });

  it('counts each product on its own', () => {
    const formic = treatment({
      id: 'TR-2025-0024',
      product: 'formic-pro',
      temperatureF: 72,
    });
    expect(checkSeasonCap([first, second], formic)).toBe(1);
  });
});

describe('checkRotation', () => {
  it('passes when there is nothing before it', () => {
    expect(checkRotation(undefined, treatment())).toBe(true);
  });

  it('passes a change of chemical class', () => {
    const formic = treatment({
      id: 'TR-2025-0022',
      product: 'formic-pro',
      temperatureF: 72,
    });
    expect(checkRotation(treatment(), formic)).toBe(true);
  });

  it('refuses two organic acids in a row even though they are different products', () => {
    const formic = treatment({
      id: 'TR-2025-0022',
      product: 'formic-pro',
      temperatureF: 72,
    });
    const oxalic = treatment({
      id: 'TR-2025-0023',
      product: 'oxalic-dribble',
      temperatureF: 55,
    });
    expect(() => checkRotation(formic, oxalic)).toThrow(/both are organic acid/);
  });

  it('names the rule', () => {
    try {
      checkRotation(treatment(), treatment({ id: 'TR-2025-0022' }));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('TR-3');
    }
  });
});

describe('lastTreatmentFor', () => {
  const january = treatment({ id: 'TR-2025-0001', appliedOn: '2025-01-10' });
  const august = treatment({ id: 'TR-2025-0021', appliedOn: '2025-08-14' });
  const elsewhere = treatment({
    id: 'TR-2025-0031',
    yardId: 'YD-2025-0009',
    appliedOn: '2025-06-01',
  });

  it('finds the most recent treatment on a yard before a date', () => {
    expect(
      lastTreatmentFor([january, august, elsewhere], 'YD-2025-0004', '2025-09-01').id
    ).toBe('TR-2025-0021');
  });

  it('ignores other yards', () => {
    expect(lastTreatmentFor([elsewhere], 'YD-2025-0004', '2025-09-01')).toBeUndefined();
  });

  it('ignores a treatment on the day itself', () => {
    expect(lastTreatmentFor([august], 'YD-2025-0004', '2025-08-14')).toBeUndefined();
  });
});
