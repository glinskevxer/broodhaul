import { describe, it, expect } from 'vitest';
import {
  STATES,
  RULES,
  GRACE_DAYS,
  ruleFor,
  countDateFor,
  dueDateFor,
  graceEndsOn,
  feeCents,
  makeRegistration,
  isFiled,
  isLate,
  isInGrace,
  checkFiledInTime,
  calendarFor,
  outstanding,
  totalFeeCents,
  describeRegistration,
} from '../../src/apiary/registration.js';

const registration = (overrides = {}) =>
  makeRegistration({
    state: 'ca',
    year: 2025,
    hives: 480,
    apiaries: 12,
    ...overrides,
  });

describe('the state rules', () => {
  it('has a rule for every state on the list', () => {
    for (const state of STATES) {
      expect(ruleFor(state)).toEqual(RULES[state]);
    }
  });

  it('does not care about case', () => {
    expect(ruleFor('ca')).toEqual(RULES.CA);
  });

  it('refuses a state nobody works in', () => {
    expect(() => ruleFor('TX')).toThrow(/must be one of/);
  });

  it('gives every rule a count date before its due date', () => {
    for (const state of STATES) {
      expect(countDateFor(state, 2025) <= dueDateFor(state, 2025)).toBe(true);
    }
  });

  it('puts the grace period after the due date', () => {
    expect(graceEndsOn('CA', 2025)).toBe('2025-02-15');
    expect(GRACE_DAYS).toBe(15);
  });
});

describe('feeCents', () => {
  it('charges California by the apiary', () => {
    expect(feeCents('CA', { hives: 480, apiaries: 12 })).toBe(12000);
  });

  it('charges Idaho by the hive over a threshold', () => {
    expect(feeCents('ID', { hives: 480, apiaries: 12 })).toBe((480 - 25) * 15);
  });

  it('charges nothing in Idaho under the threshold', () => {
    expect(feeCents('ID', { hives: 20, apiaries: 2 })).toBe(0);
  });

  it('charges Washington both ways', () => {
    expect(feeCents('WA', { hives: 100, apiaries: 4 })).toBe(4 * 500 + 100 * 8);
  });

  it('is nothing with nothing registered', () => {
    for (const state of STATES) {
      expect(feeCents(state, { hives: 0, apiaries: 0 })).toBe(0);
    }
  });
});

describe('makeRegistration', () => {
  it('works the fee out as it goes', () => {
    expect(registration().feeCents).toBe(12000);
  });

  it('uppercases the state and the number', () => {
    const built = registration({ number: 'ca-tul-2211' });
    expect(built.state).toBe('CA');
    expect(built.number).toBe('CA-TUL-2211');
  });

  it('starts unfiled', () => {
    expect(isFiled(registration())).toBe(false);
    expect(isLate(registration())).toBe(false);
  });

  it('refuses a hive count nobody registers', () => {
    expect(() => registration({ hives: -1 })).toThrow(/at least 0/);
  });
});

describe('filing dates', () => {
  it('is on time when filed by the due date', () => {
    const filed = registration({ filedOn: '2025-01-31' });
    expect(isFiled(filed)).toBe(true);
    expect(isLate(filed)).toBe(false);
    expect(checkFiledInTime(filed)).toBe(true);
  });

  it('is late but inside the grace period the next day', () => {
    const filed = registration({ filedOn: '2025-02-01' });
    expect(isLate(filed)).toBe(true);
    expect(isInGrace(filed)).toBe(true);
    expect(checkFiledInTime(filed)).toBe(true);
  });

  it('is out of grace after the window', () => {
    const filed = registration({ filedOn: '2025-02-16' });
    expect(isInGrace(filed)).toBe(false);
    expect(() => checkFiledInTime(filed)).toThrow(/after the grace period/);
  });

  it('refuses one that was never filed', () => {
    try {
      checkFiledInTime(registration());
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('RG-7');
    }
  });

  it('names the rule when it is out of grace', () => {
    try {
      checkFiledInTime(registration({ filedOn: '2025-03-01' }));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('RG-8');
      expect(err.details.dueOn).toBe('2025-01-31');
    }
  });
});

describe('calendarFor', () => {
  it('sorts the states by due date', () => {
    const calendar = calendarFor(['ND', 'CA', 'ID'], 2025);
    expect(calendar.map((row) => row.state)).toEqual(['CA', 'ID', 'ND']);
  });

  it('carries the count date and the grace end', () => {
    const [california] = calendarFor(['CA'], 2025);
    expect(california.countOn).toBe('2025-01-01');
    expect(california.dueOn).toBe('2025-01-31');
    expect(california.graceEndsOn).toBe('2025-02-15');
  });

  it('names the season the count falls in', () => {
    expect(calendarFor(['CA'], 2025)[0].season).toBe(2025);
  });
});

describe('outstanding', () => {
  it('names the states with nothing filed', () => {
    const filed = [registration({ state: 'CA', filedOn: '2025-01-20' })];
    const rows = outstanding(filed, ['CA', 'ND', 'ID'], 2025, '2025-05-15');
    expect(rows.map((row) => row.state)).toEqual(['ID', 'ND']);
  });

  it('flags the ones already past their date', () => {
    const rows = outstanding([], ['CA', 'ND'], 2025, '2025-05-15');
    expect(rows.find((row) => row.state === 'CA').overdue).toBe(true);
    expect(rows.find((row) => row.state === 'ND').overdue).toBe(false);
  });

  it('is empty when everything is filed', () => {
    const filed = STATES.map((state) => registration({ state, filedOn: '2025-01-20' }));
    expect(outstanding(filed, STATES, 2025, '2025-12-01')).toEqual([]);
  });
});

describe('totalFeeCents and describeRegistration', () => {
  it('adds the fees', () => {
    expect(totalFeeCents([registration(), registration({ state: 'ND' })])).toBe(
      12000 + 30000
    );
  });

  it('reads like the line in the compliance file', () => {
    expect(describeRegistration(registration())).toBe(
      'CA 2025: 480 hives on 12 apiaries, not filed'
    );
  });

  it('says when a filing was late', () => {
    expect(describeRegistration(registration({ filedOn: '2025-02-05' }))).toContain(
      'filed 2025-02-05 late'
    );
  });

  it('refuses a registration for a state it does not know', () => {
    expect(() => describeRegistration({ ...registration(), state: 'TX' })).toThrow(
      /unknown state/
    );
  });
});
