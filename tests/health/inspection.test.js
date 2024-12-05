import { describe, it, expect } from 'vitest';
import {
  FINDINGS,
  HOLD_DAYS,
  makeInspection,
  isClean,
  governingFinding,
  holdDays,
  holdSpan,
  isHeldOn,
  requiresDestruction,
  inspectionsForYard,
  checkYardMovable,
  latestInspection,
} from '../../src/health/inspection.js';

const base = {
  id: 'IS-2025-0003',
  yardId: 'YD-2025-0004',
  date: '2025-06-12',
  inspector: 'L Prentice',
  coloniesOpened: 24,
};

const inspection = (overrides = {}) => makeInspection({ ...base, ...overrides });

describe('makeInspection', () => {
  it('defaults to a clean finding with nothing affected', () => {
    const built = inspection();
    expect(built.findings).toEqual(['clean']);
    expect(built.coloniesAffected).toBe(0);
  });

  it('sorts findings into the order the form lists them', () => {
    expect(
      inspection({ findings: ['afb', 'shb'], coloniesAffected: 2 }).findings
    ).toEqual(['shb', 'afb']);
  });

  it('refuses a finding nobody writes on the form', () => {
    expect(() => inspection({ findings: ['varroa'] })).toThrow(/must be one of/);
  });

  it('refuses the same finding twice', () => {
    expect(() => inspection({ findings: ['shb', 'shb'] })).toThrow(/listed twice/);
  });

  it('refuses clean alongside a finding', () => {
    expect(() => inspection({ findings: ['clean', 'shb'] })).toThrow(
      /cannot also carry a finding/
    );
  });

  it('refuses a clean inspection with affected colonies', () => {
    expect(() => inspection({ coloniesAffected: 3 })).toThrow(
      /clean inspection cannot have affected colonies/
    );
  });

  it('refuses more affected than were opened', () => {
    expect(() => inspection({ findings: ['efb'], coloniesAffected: 30 })).toThrow(
      /more colonies affected than were opened/
    );
  });

  it('refuses an unknown key', () => {
    expect(() => makeInspection({ ...base, fee: 0 })).toThrow(
      /inspection has unknown keys: fee/
    );
  });
});

describe('isClean', () => {
  it('is true only for a bare clean finding', () => {
    expect(isClean(inspection())).toBe(true);
    expect(isClean(inspection({ findings: ['shb'], coloniesAffected: 1 }))).toBe(false);
  });
});

describe('governingFinding and holdDays', () => {
  it('is nothing on a clean yard', () => {
    expect(governingFinding(inspection())).toBeUndefined();
    expect(holdDays(inspection())).toBe(0);
    expect(holdSpan(inspection())).toBeNull();
  });

  it('ignores findings that carry no hold', () => {
    const beetles = inspection({ findings: ['shb'], coloniesAffected: 4 });
    expect(governingFinding(beetles)).toBeUndefined();
    expect(holdDays(beetles)).toBe(0);
  });

  it('picks the longest hold when two findings carry one', () => {
    const both = inspection({ findings: ['efb', 'afb'], coloniesAffected: 3 });
    expect(governingFinding(both)).toBe('afb');
    expect(holdDays(both)).toBe(HOLD_DAYS.afb);
  });

  it('holds a foulbrood yard for the label period', () => {
    const afb = inspection({ findings: ['afb'], coloniesAffected: 2 });
    expect(holdSpan(afb)).toEqual({ start: '2025-06-12', end: '2025-07-12' });
  });

  it('has a hold only for the reportable findings', () => {
    for (const finding of FINDINGS) {
      const days = HOLD_DAYS[finding] ?? 0;
      expect(days).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(HOLD_DAYS).sort()).toEqual(['afb', 'efb']);
  });
});

describe('isHeldOn', () => {
  const afb = inspection({ findings: ['afb'], coloniesAffected: 2 });

  it('holds from the inspection day', () => {
    expect(isHeldOn(afb, '2025-06-12')).toBe(true);
  });

  it('holds to the last day and no further', () => {
    expect(isHeldOn(afb, '2025-07-12')).toBe(true);
    expect(isHeldOn(afb, '2025-07-13')).toBe(false);
  });

  it('never holds a clean yard', () => {
    expect(isHeldOn(inspection(), '2025-06-12')).toBe(false);
  });
});

describe('requiresDestruction', () => {
  it('is true for foulbrood and false for everything else', () => {
    expect(
      requiresDestruction(inspection({ findings: ['afb'], coloniesAffected: 1 }))
    ).toBe(true);
    expect(
      requiresDestruction(inspection({ findings: ['efb'], coloniesAffected: 1 }))
    ).toBe(false);
    expect(requiresDestruction(inspection())).toBe(false);
  });
});

describe('inspectionsForYard and latestInspection', () => {
  const june = inspection({ id: 'IS-2025-0003', date: '2025-06-12' });
  const august = inspection({ id: 'IS-2025-0009', date: '2025-08-20' });
  const other = inspection({
    id: 'IS-2025-0011',
    yardId: 'YD-2025-0009',
    date: '2025-07-01',
  });

  it('keeps one yard and sorts by date', () => {
    expect(
      inspectionsForYard([august, other, june], 'YD-2025-0004').map((entry) => entry.id)
    ).toEqual(['IS-2025-0003', 'IS-2025-0009']);
  });

  it('finds the most recent inspection on or before a day', () => {
    expect(latestInspection([june, august], 'YD-2025-0004', '2025-07-01').id).toBe(
      'IS-2025-0003'
    );
    expect(latestInspection([june, august], 'YD-2025-0004', '2025-08-20').id).toBe(
      'IS-2025-0009'
    );
  });

  it('finds nothing before the first inspection', () => {
    expect(latestInspection([june], 'YD-2025-0004', '2025-01-01')).toBeUndefined();
  });
});

describe('checkYardMovable', () => {
  const afb = inspection({ findings: ['afb'], coloniesAffected: 2 });

  it('passes a clean yard', () => {
    expect(checkYardMovable([inspection()], 'YD-2025-0004', '2025-06-20')).toBe(true);
  });

  it('passes a yard with no inspections at all', () => {
    expect(checkYardMovable([], 'YD-2025-0004', '2025-06-20')).toBe(true);
  });

  it('refuses a movement inside the hold', () => {
    expect(() => checkYardMovable([afb], 'YD-2025-0004', '2025-06-20')).toThrow(
      /is held to 2025-07-12 after afb on 2025-06-12/
    );
  });

  it('passes once the hold has run out', () => {
    expect(checkYardMovable([afb], 'YD-2025-0004', '2025-07-13')).toBe(true);
  });

  it('does not hold a different yard', () => {
    expect(checkYardMovable([afb], 'YD-2025-0009', '2025-06-20')).toBe(true);
  });

  it('names the rule and the day the hold ends', () => {
    try {
      checkYardMovable([afb], 'YD-2025-0004', '2025-06-20');
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('HL-1');
      expect(err.details.until).toBe('2025-07-12');
    }
  });
});
