import { describe, it, expect } from 'vitest';
import {
  SCHEDULES,
  DEFAULT_DEPOSIT_BPS,
  LATE_INTEREST_BPS_PER_MONTH,
  depositCents,
  instalments,
  scheduleTotal,
  checkSchedule,
  instalmentsDue,
  outstandingCents,
  lateInterestCents,
  checkDepositTaken,
  describeSchedule,
} from '../../src/contracts/deposit.js';
import { contractValueCents } from '../../src/contracts/contract.js';
import { aContract } from '../helpers/contracts.js';

const contract = aContract();
const value = contractValueCents(contract);

describe('depositCents', () => {
  it('is a quarter by default', () => {
    expect(depositCents(contract)).toBe(Math.round(value * 0.25));
    expect(DEFAULT_DEPOSIT_BPS).toBe(2500);
  });

  it('takes another share', () => {
    expect(depositCents(contract, 1000)).toBe(Math.round(value * 0.1));
  });

  it('is nothing at zero', () => {
    expect(depositCents(contract, 0)).toBe(0);
  });

  it('refuses a share over the whole thing', () => {
    expect(() => depositCents(contract, 20000)).toThrow(/at most 10000/);
  });
});

describe('instalments', () => {
  it('is one payment on removal', () => {
    const schedule = instalments(contract, 'on removal');
    expect(schedule).toEqual([
      { due: '2025-03-18', amountCents: value, name: 'balance' },
    ]);
  });

  it('splits half and half', () => {
    const schedule = instalments(contract, 'half and half');
    expect(schedule).toHaveLength(2);
    expect(schedule[0].name).toBe('deposit');
    expect(schedule[0].due).toBe('2024-09-14');
  });

  it('splits thirds into a deposit, delivery and balance', () => {
    const schedule = instalments(contract, 'thirds');
    expect(schedule.map((entry) => entry.name)).toEqual([
      'deposit',
      'on delivery',
      'balance',
    ]);
    expect(schedule[1].due).toBe('2025-02-10');
  });

  it('always adds back to the contract value', () => {
    for (const schedule of SCHEDULES) {
      expect(scheduleTotal(instalments(contract, schedule))).toBe(value);
      expect(checkSchedule(contract, instalments(contract, schedule))).toBe(true);
    }
  });

  it('takes another deposit share on thirds', () => {
    const schedule = instalments(contract, 'thirds', { depositBps: 1000 });
    expect(schedule[0].amountCents).toBe(depositCents(contract, 1000));
    expect(scheduleTotal(schedule)).toBe(value);
  });

  it('refuses a schedule nobody signs', () => {
    expect(() => instalments(contract, 'quarterly')).toThrow(/must be one of/);
  });
});

describe('checkSchedule', () => {
  it('refuses a schedule that does not add up', () => {
    const schedule = [{ due: '2025-03-18', amountCents: 1, name: 'balance' }];
    expect(() => checkSchedule(contract, schedule)).toThrow(
      /do not add to the contract value/
    );
  });
});

describe('instalmentsDue and outstandingCents', () => {
  const schedule = instalments(contract, 'thirds');

  it('is only the deposit in October', () => {
    expect(instalmentsDue(schedule, '2024-10-01')).toHaveLength(1);
  });

  it('is everything after removal', () => {
    expect(instalmentsDue(schedule, '2025-04-01')).toHaveLength(3);
  });

  it('reports what is outstanding against what has been paid', () => {
    expect(outstandingCents(schedule, 0, '2024-10-01')).toBe(schedule[0].amountCents);
    expect(outstandingCents(schedule, schedule[0].amountCents, '2024-10-01')).toBe(0);
  });

  it('never goes negative when a grower pays ahead', () => {
    expect(outstandingCents(schedule, value, '2024-10-01')).toBe(0);
  });
});

describe('lateInterestCents', () => {
  it('is nothing when paid on time', () => {
    expect(lateInterestCents(100000, '2025-03-18', '2025-03-18')).toBe(0);
    expect(lateInterestCents(100000, '2025-03-18', '2025-03-01')).toBe(0);
  });

  it('is nothing inside the first month', () => {
    expect(lateInterestCents(100000, '2025-03-18', '2025-04-10')).toBe(0);
  });

  it('charges a whole month once one has passed', () => {
    expect(lateInterestCents(100000, '2025-03-18', '2025-04-17')).toBe(1500);
    expect(LATE_INTEREST_BPS_PER_MONTH).toBe(150);
  });

  it('charges two months at sixty days', () => {
    expect(lateInterestCents(100000, '2025-03-18', '2025-05-17')).toBe(3000);
  });

  it('takes another rate', () => {
    expect(lateInterestCents(100000, '2025-03-18', '2025-04-17', 300)).toBe(3000);
  });
});

describe('checkDepositTaken', () => {
  const schedule = instalments(contract, 'thirds');

  it('passes before the deposit is due', () => {
    expect(checkDepositTaken(contract, schedule, 0, '2024-09-01')).toBe(true);
  });

  it('passes once it has been paid', () => {
    expect(
      checkDepositTaken(contract, schedule, schedule[0].amountCents, '2024-12-01')
    ).toBe(true);
  });

  it('refuses when it is due and short', () => {
    expect(() => checkDepositTaken(contract, schedule, 100, '2024-12-01')).toThrow(
      /has no deposit and the yards are being held/
    );
  });

  it('passes a schedule with no deposit in it', () => {
    expect(
      checkDepositTaken(contract, instalments(contract, 'on removal'), 0, '2025-04-01')
    ).toBe(true);
  });

  it('names the rule', () => {
    try {
      checkDepositTaken(contract, schedule, 0, '2024-12-01');
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('DP-2');
    }
  });
});

describe('describeSchedule', () => {
  it('gives a line per instalment', () => {
    expect(describeSchedule(instalments(contract, 'thirds')).split('\n')).toHaveLength(
      3
    );
  });
});
