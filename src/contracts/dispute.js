import { RuleViolation, StateError, ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf, requireString } from '../core/validate.js';
import { addDays, compareDates, diffDays, parseDate } from '../core/dates.js';
import { formatMoney, sumMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';

/**
 * When a grower will not pay the statement.
 *
 * Almost every dispute is one of four things and each has a different answer.
 * A grading dispute goes to a regrade if the window is still open and nowhere
 * if it is not. A count dispute is settled off the load sheets. A damage claim
 * is the landowner's insurer's problem more often than ours. A rate dispute is
 * a contract that was signed and there is nothing to discuss.
 *
 * The point of writing it down is the clock. A dispute nobody answered for six
 * weeks becomes a receivable nobody collects, so the record carries the day it
 * was raised and the day it has to be answered by.
 */

export const GROUNDS = ['grading', 'count', 'damage', 'rate'];
export const STATES = ['open', 'answered', 'settled', 'withdrawn'];

/** Days the office has to answer, by what the dispute is about. */
export const ANSWER_DAYS = {
  grading: 5,
  count: 10,
  damage: 21,
  rate: 10,
};

const NEXT_STATES = {
  open: ['answered', 'withdrawn'],
  answered: ['settled', 'withdrawn'],
  settled: [],
  withdrawn: [],
};

export function makeDispute(input) {
  const grounds = requireOneOf(input.grounds, 'grounds', GROUNDS);
  const raisedOn = parseDate(input.raisedOn, 'raisedOn');
  const state = requireOneOf(input.state ?? 'open', 'state', STATES);
  const amountCents = requireInteger(input.amountCents, 'amountCents', {
    min: 0,
    max: 100000000,
  });
  const settledCents =
    input.settledCents === undefined
      ? undefined
      : requireInteger(input.settledCents, 'settledCents', { min: 0, max: 100000000 });
  if (settledCents !== undefined && settledCents > amountCents) {
    throw new ValidationError('a dispute cannot settle for more than it claimed', {
      amountCents,
      settledCents,
    });
  }
  if (state === 'settled' && settledCents === undefined) {
    throw new ValidationError('a settled dispute needs a settled amount', {});
  }
  return {
    id: requireString(input.id, 'dispute.id', { max: 20 }).toUpperCase(),
    contractId: requireString(input.contractId, 'dispute.contractId', { max: 40 }),
    grounds,
    raisedOn,
    amountCents,
    state,
    settledCents,
    note:
      input.note === undefined
        ? undefined
        : requireString(input.note, 'note', { max: 300 }),
  };
}

export function answerBy(dispute) {
  return addDays(dispute.raisedOn, ANSWER_DAYS[dispute.grounds]);
}

export function isOverdue(dispute, today) {
  if (dispute.state !== 'open') return false;
  return compareDates(parseDate(today), answerBy(dispute)) > 0;
}

export function daysOpen(dispute, today) {
  return Math.max(0, diffDays(dispute.raisedOn, today));
}

export function advance(dispute, state, { settledCents } = {}) {
  const target = requireOneOf(state, 'state', STATES);
  if (!NEXT_STATES[dispute.state].includes(target)) {
    throw new StateError(`cannot move a dispute from ${dispute.state} to ${target}`, {
      dispute: dispute.id,
      from: dispute.state,
      to: target,
    });
  }
  return makeDispute({ ...dispute, state: target, settledCents });
}

/**
 * What a dispute on this ground can lead to. The grading route is the only one
 * that can change a number by itself; the others end in a credit or in nothing.
 */
export function remedyFor(dispute, { regradeOpen = false } = {}) {
  if (dispute.grounds === 'grading') {
    return regradeOpen ? 'regrade' : 'no remedy, the regrade window closed';
  }
  if (dispute.grounds === 'count') return 'settle off the load sheets';
  if (dispute.grounds === 'damage') return 'refer to the landowner insurer';
  return 'no remedy, the rate is signed';
}

export function checkAnswerable(dispute, today) {
  if (dispute.state !== 'open') {
    throw new StateError(`dispute ${dispute.id} is ${dispute.state}`, {
      dispute: dispute.id,
    });
  }
  if (isOverdue(dispute, today)) {
    throw new RuleViolation(
      'DS-1',
      `dispute ${dispute.id} should have been answered by ${answerBy(dispute)}`,
      {
        dispute: dispute.id,
        answerBy: answerBy(dispute),
      }
    );
  }
  return true;
}

export function openDisputes(disputes, today) {
  return sortBy(
    disputes.filter((dispute) => dispute.state === 'open'),
    (dispute) => answerBy(dispute),
    (dispute) => dispute.id
  ).map((dispute) => ({
    id: dispute.id,
    contractId: dispute.contractId,
    grounds: dispute.grounds,
    amountCents: dispute.amountCents,
    answerBy: answerBy(dispute),
    overdue: isOverdue(dispute, today),
    daysOpen: daysOpen(dispute, today),
  }));
}

export function exposureCents(disputes) {
  return sumMoney(
    disputes
      .filter((dispute) => dispute.state === 'open' || dispute.state === 'answered')
      .map((dispute) => dispute.amountCents)
  );
}

export function settledCents(disputes) {
  return sumMoney(
    disputes
      .filter((dispute) => dispute.state === 'settled')
      .map((dispute) => dispute.settledCents ?? 0)
  );
}

export function describeDispute(dispute, today) {
  const tail = isOverdue(dispute, today) ? ', overdue' : '';
  return `${dispute.id} ${dispute.grounds} for ${formatMoney(dispute.amountCents)}, answer by ${answerBy(dispute)}${tail}`;
}
