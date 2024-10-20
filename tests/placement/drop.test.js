import { describe, it, expect } from 'vitest';
import {
  DROP_PATTERNS,
  makeDrop,
  isSet,
  isPulled,
  shortBy,
  isShort,
  standingSpan,
  standingOn,
  checkSetInWindow,
  checkPullInWindow,
} from '../../src/placement/drop.js';
import { aContract } from '../helpers/contracts.js';

const base = {
  id: 'DR-2025-0004',
  contractId: 'CT-2025-0007',
  blockId: 'BK-2025-0001',
  location: { latitude: 36.9, longitude: -120.1 },
  ordered: 24,
};

const drop = (overrides = {}) => makeDrop({ ...base, ...overrides });

describe('makeDrop', () => {
  it('defaults the pattern to interior', () => {
    expect(drop().pattern).toBe('interior');
  });

  it('takes every pattern the crew uses', () => {
    for (const pattern of DROP_PATTERNS) {
      expect(drop({ pattern }).pattern).toBe(pattern);
    }
  });

  it('leaves the set count and dates undefined on an unset drop', () => {
    const built = drop();
    expect(built.set).toBeUndefined();
    expect(built.setOn).toBeUndefined();
    expect(built.pulledOn).toBeUndefined();
  });

  it('refuses a set count with no set date', () => {
    expect(() => drop({ set: 24 })).toThrow(/needs a set date/);
  });

  it('accepts a set of nothing on a date, which is a dry run', () => {
    expect(drop({ set: 0, setOn: '2025-02-04' }).set).toBe(0);
  });

  it('refuses a pull with no set', () => {
    expect(() => drop({ pulledOn: '2025-03-10' })).toThrow(
      /cannot be pulled before it was set/
    );
  });

  it('refuses a pull before the set', () => {
    expect(() => drop({ setOn: '2025-02-04', pulledOn: '2025-02-01' })).toThrow(
      /pulled before it was set/
    );
  });

  it('allows a set and pull on the same day', () => {
    const same = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-02-04' });
    expect(same.pulledOn).toBe('2025-02-04');
  });

  it('refuses an ordered count nobody would write', () => {
    expect(() => drop({ ordered: 0 })).toThrow(/at least 1/);
    expect(() => drop({ ordered: 500 })).toThrow(/at most 200/);
  });

  it('refuses an unknown key', () => {
    expect(() => makeDrop({ ...base, forkliftId: 'F-2' })).toThrow(
      /drop has unknown keys: forkliftId/
    );
  });
});

describe('isSet and isPulled', () => {
  it('are both false before the hives go in', () => {
    expect(isSet(drop())).toBe(false);
    expect(isPulled(drop())).toBe(false);
  });

  it('report a standing drop', () => {
    const standing = drop({ set: 24, setOn: '2025-02-04' });
    expect(isSet(standing)).toBe(true);
    expect(isPulled(standing)).toBe(false);
  });

  it('report a pulled drop', () => {
    const gone = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-03-10' });
    expect(isSet(gone)).toBe(false);
    expect(isPulled(gone)).toBe(true);
  });
});

describe('shortBy and isShort', () => {
  it('counts the whole order short before anything is set', () => {
    expect(shortBy(drop())).toBe(24);
    expect(isShort(drop())).toBe(true);
  });

  it('is nothing when the set matches the order', () => {
    const full = drop({ set: 24, setOn: '2025-02-04' });
    expect(shortBy(full)).toBe(0);
    expect(isShort(full)).toBe(false);
  });

  it('counts the gap when the set came up light', () => {
    expect(shortBy(drop({ set: 20, setOn: '2025-02-04' }))).toBe(4);
  });

  it('is nothing rather than negative on an over set', () => {
    expect(shortBy(drop({ set: 28, setOn: '2025-02-04' }))).toBe(0);
  });
});

describe('standingSpan and standingOn', () => {
  it('has no span before the drop is set', () => {
    expect(standingSpan(drop())).toBeNull();
    expect(standingOn(drop(), '2025-02-14')).toBe(false);
  });

  it('runs from the set day to the pull day', () => {
    const gone = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-03-10' });
    expect(standingSpan(gone)).toEqual({ start: '2025-02-04', end: '2025-03-10' });
    expect(standingOn(gone, '2025-02-04')).toBe(true);
    expect(standingOn(gone, '2025-03-10')).toBe(true);
    expect(standingOn(gone, '2025-03-11')).toBe(false);
  });

  it('runs on from the set day while the drop is still out', () => {
    const standing = drop({ set: 24, setOn: '2025-02-04' });
    expect(standingOn(standing, '2025-02-03')).toBe(false);
    expect(standingOn(standing, '2025-02-04')).toBe(true);
    expect(standingOn(standing, '2026-01-01')).toBe(true);
  });
});

describe('checkSetInWindow', () => {
  const contract = aContract();

  it('passes an unset drop', () => {
    expect(checkSetInWindow(contract, drop())).toBe(true);
  });

  it('passes a set inside the delivery window', () => {
    expect(checkSetInWindow(contract, drop({ set: 24, setOn: '2025-02-04' }))).toBe(
      true
    );
  });

  it('refuses a set after the window closed', () => {
    expect(() =>
      checkSetInWindow(contract, drop({ set: 24, setOn: '2025-02-14' }))
    ).toThrow(/outside the delivery window/);
  });

  it('refuses a set before the window opened', () => {
    expect(() =>
      checkSetInWindow(contract, drop({ set: 24, setOn: '2025-01-20' }))
    ).toThrow(/outside the delivery window/);
  });

  it('names the rule it came from', () => {
    try {
      checkSetInWindow(contract, drop({ set: 24, setOn: '2025-02-14' }));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('PL-3');
    }
  });
});

describe('checkPullInWindow', () => {
  const contract = aContract();

  it('passes a drop that is still standing', () => {
    expect(checkPullInWindow(contract, drop({ set: 24, setOn: '2025-02-04' }))).toBe(
      true
    );
  });

  it('passes a pull inside the removal window', () => {
    const gone = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-03-10' });
    expect(checkPullInWindow(contract, gone)).toBe(true);
  });

  it('refuses a pull before removal opened, which is what a nervous grower asks for', () => {
    const early = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-02-25' });
    expect(() => checkPullInWindow(contract, early)).toThrow(
      /outside the removal window/
    );
  });

  it('names the rule it came from', () => {
    const late = drop({ set: 24, setOn: '2025-02-04', pulledOn: '2025-04-01' });
    try {
      checkPullInWindow(contract, late);
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('PL-4');
    }
  });
});
