import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { addDays, compareDates, parseDate } from '../core/dates.js';
import { allocate, basisPoints, multiplyMoney, sumMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';
import { contractValueCents } from './contract.js';

/**
 * Deposits and the payment schedule.
 *
 * Almond money moves late. The operation feeds and hauls all winter and the
 * grower pays in March, so most contracts carry a deposit in the autumn and
 * the balance after removal. A grower who will not put a deposit down is a
 * grower who has not decided, and the yards they were promised go to somebody
 * who has.
 */

export const SCHEDULES = ['on removal', 'half and half', 'thirds'];
export const DEFAULT_DEPOSIT_BPS = 2500;
export const LATE_INTEREST_BPS_PER_MONTH = 150;

export function depositCents(contract, bps = DEFAULT_DEPOSIT_BPS) {
  const share = requireNumber(bps, 'bps', { min: 0, max: 10000 });
  return basisPoints(contractValueCents(contract), share);
}

/**
 * The instalments a schedule breaks a contract into. The parts always add back
 * to the contract value, because a schedule that loses a cent to rounding
 * turns into a phone call in April.
 */
export function instalments(
  contract,
  schedule,
  { depositBps = DEFAULT_DEPOSIT_BPS } = {}
) {
  requireOneOf(schedule, 'schedule', SCHEDULES);
  const total = contractValueCents(contract);
  const removalDay = contract.removal.end;
  if (schedule === 'on removal') {
    return [{ due: removalDay, amountCents: total, name: 'balance' }];
  }
  if (schedule === 'half and half') {
    const parts = allocate(total, [1, 1]);
    return [
      { due: contract.signedOn, amountCents: parts[0], name: 'deposit' },
      { due: removalDay, amountCents: parts[1], name: 'balance' },
    ];
  }
  const deposit = depositCents(contract, depositBps);
  const rest = allocate(total - deposit, [1, 1]);
  return [
    { due: contract.signedOn, amountCents: deposit, name: 'deposit' },
    { due: contract.delivery.end, amountCents: rest[0], name: 'on delivery' },
    { due: removalDay, amountCents: rest[1], name: 'balance' },
  ];
}

export function scheduleTotal(schedule) {
  return sumMoney(schedule.map((entry) => entry.amountCents));
}

export function checkSchedule(contract, schedule) {
  const total = scheduleTotal(schedule);
  if (total !== contractValueCents(contract)) {
    throw new ValidationError('the instalments do not add to the contract value', {
      total,
      value: contractValueCents(contract),
    });
  }
  return true;
}

export function instalmentsDue(schedule, asOf) {
  const day = parseDate(asOf, 'asOf');
  return sortBy(
    schedule.filter((entry) => compareDates(entry.due, day) <= 0),
    (entry) => entry.due
  );
}

export function outstandingCents(schedule, paidCents, asOf) {
  const due = scheduleTotal(instalmentsDue(schedule, asOf));
  return Math.max(0, due - requireInteger(paidCents, 'paidCents', { min: 0 }));
}

/** Interest on a late instalment, charged whole months at the contract rate. */
export function lateInterestCents(
  amountCents,
  dueOn,
  paidOn,
  bpsPerMonth = LATE_INTEREST_BPS_PER_MONTH
) {
  const due = parseDate(dueOn, 'dueOn');
  const paid = parseDate(paidOn, 'paidOn');
  if (compareDates(paid, due) <= 0) return 0;
  let months = 0;
  let cursor = due;
  while (compareDates(addDays(cursor, 30), paid) <= 0) {
    cursor = addDays(cursor, 30);
    months += 1;
  }
  if (months === 0) return 0;
  return multiplyMoney(basisPoints(amountCents, bpsPerMonth), months);
}

export function checkDepositTaken(contract, schedule, paidCents, asOf) {
  const deposit = schedule.find((entry) => entry.name === 'deposit');
  if (!deposit) return true;
  if (compareDates(parseDate(asOf), deposit.due) < 0) return true;
  if (paidCents < deposit.amountCents) {
    throw new RuleViolation(
      'DP-2',
      `contract ${contract.id} has no deposit and the yards are being held`,
      { contract: contract.id, wanted: deposit.amountCents, paid: paidCents }
    );
  }
  return true;
}

export function describeSchedule(schedule) {
  return schedule
    .map((entry) => `${entry.name} ${entry.amountCents} due ${entry.due}`)
    .join('\n');
}
