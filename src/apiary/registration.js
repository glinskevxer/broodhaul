import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf, requireString } from '../core/validate.js';
import { addDays, compareDates, parseDate, seasonOf } from '../core/dates.js';
import { makeSpan, spanContains } from '../core/span.js';
import { sortBy, sumBy } from '../core/collections.js';
import { multiplyMoney } from '../core/money.js';

/**
 * Hive registration.
 *
 * Every state this outfit works in wants the colonies registered, and every
 * one of them wants it differently: a different date, a different fee, and a
 * different idea of what a colony is. California counts hives on the first of
 * January and charges by the apiary. North Dakota registers apiary locations
 * and charges by the location. Idaho charges a flat brand fee and then a rate
 * per hive over a threshold.
 *
 * Getting this wrong is not a fine, it is a truck turned around at the state
 * line in February with a load of bees on it, which is why the dates are here
 * rather than in somebody's diary.
 */

export const STATES = ['CA', 'ND', 'ID', 'OR', 'WA'];

export const RULES = {
  CA: {
    countOn: '01-01',
    dueOn: '01-31',
    perApiaryCents: 1000,
    perHiveCents: 0,
    freeHives: 0,
  },
  ND: {
    countOn: '05-01',
    dueOn: '05-31',
    perApiaryCents: 2500,
    perHiveCents: 0,
    freeHives: 0,
  },
  ID: {
    countOn: '04-01',
    dueOn: '04-30',
    perApiaryCents: 0,
    perHiveCents: 15,
    freeHives: 25,
  },
  OR: {
    countOn: '06-01',
    dueOn: '06-30',
    perApiaryCents: 0,
    perHiveCents: 12,
    freeHives: 5,
  },
  WA: {
    countOn: '04-01',
    dueOn: '04-30',
    perApiaryCents: 500,
    perHiveCents: 8,
    freeHives: 0,
  },
};

export const GRACE_DAYS = 15;

export function ruleFor(state) {
  const code = requireOneOf(
    requireString(state, 'state', { min: 2, max: 2 }).toUpperCase(),
    'state',
    STATES
  );
  return RULES[code];
}

export function countDateFor(state, year) {
  const rule = ruleFor(state);
  return parseDate(
    `${requireInteger(year, 'year', { min: 2000, max: 2999 })}-${rule.countOn}`
  );
}

export function dueDateFor(state, year) {
  const rule = ruleFor(state);
  return parseDate(
    `${requireInteger(year, 'year', { min: 2000, max: 2999 })}-${rule.dueOn}`
  );
}

export function graceEndsOn(state, year) {
  return addDays(dueDateFor(state, year), GRACE_DAYS);
}

export function feeCents(state, { hives, apiaries }) {
  const rule = ruleFor(state);
  const count = requireInteger(hives, 'hives', { min: 0, max: 100000 });
  const yards = requireInteger(apiaries, 'apiaries', { min: 0, max: 5000 });
  const chargeable = Math.max(0, count - rule.freeHives);
  return (
    multiplyMoney(rule.perApiaryCents, yards) +
    multiplyMoney(rule.perHiveCents, chargeable)
  );
}

export function makeRegistration(input) {
  const state = requireOneOf(
    requireString(input.state, 'state', { min: 2, max: 2 }).toUpperCase(),
    'state',
    STATES
  );
  const year = requireInteger(input.year, 'year', { min: 2000, max: 2999 });
  const filedOn =
    input.filedOn === undefined ? undefined : parseDate(input.filedOn, 'filedOn');
  return {
    state,
    year,
    number:
      input.number === undefined
        ? undefined
        : requireString(input.number, 'number', { max: 24 }).toUpperCase(),
    hives: requireInteger(input.hives, 'hives', { min: 0, max: 100000 }),
    apiaries: requireInteger(input.apiaries, 'apiaries', { min: 0, max: 5000 }),
    filedOn,
    feeCents: feeCents(state, { hives: input.hives, apiaries: input.apiaries }),
  };
}

export function isFiled(registration) {
  return registration.filedOn !== undefined;
}

export function isLate(registration) {
  if (!isFiled(registration)) return false;
  return (
    compareDates(
      registration.filedOn,
      dueDateFor(registration.state, registration.year)
    ) > 0
  );
}

export function isInGrace(registration) {
  if (!isLate(registration)) return false;
  const span = makeSpan(
    addDays(dueDateFor(registration.state, registration.year), 1),
    graceEndsOn(registration.state, registration.year)
  );
  return spanContains(span, registration.filedOn);
}

export function checkFiledInTime(registration) {
  if (!isFiled(registration)) {
    throw new RuleViolation(
      'RG-7',
      `${registration.state} ${registration.year} is not filed`,
      {
        state: registration.state,
        year: registration.year,
      }
    );
  }
  if (isLate(registration) && !isInGrace(registration)) {
    throw new RuleViolation(
      'RG-8',
      `${registration.state} ${registration.year} was filed after the grace period`,
      {
        state: registration.state,
        year: registration.year,
        dueOn: dueDateFor(registration.state, registration.year),
        filedOn: registration.filedOn,
      }
    );
  }
  return true;
}

/** What is due, and by when, for the states an operation works in. */
export function calendarFor(states, year) {
  return sortBy(
    states.map((state) => ({
      state: requireString(state, 'state', { min: 2, max: 2 }).toUpperCase(),
      countOn: countDateFor(state, year),
      dueOn: dueDateFor(state, year),
      graceEndsOn: graceEndsOn(state, year),
      season: seasonOf(countDateFor(state, year)),
    })),
    (row) => row.dueOn,
    (row) => row.state
  );
}

export function outstanding(registrations, states, year, today) {
  const filed = new Set(
    registrations
      .filter((entry) => entry.year === year && isFiled(entry))
      .map((entry) => entry.state)
  );
  return calendarFor(states, year)
    .filter((row) => !filed.has(row.state))
    .map((row) => ({
      ...row,
      overdue: compareDates(parseDate(today), row.dueOn) > 0,
    }));
}

export function totalFeeCents(registrations) {
  return sumBy(registrations, (registration) => registration.feeCents);
}

export function describeRegistration(registration) {
  if (!STATES.includes(registration.state)) {
    throw new ValidationError('unknown state on a registration', {
      state: registration.state,
    });
  }
  const filed = isFiled(registration)
    ? `filed ${registration.filedOn}${isLate(registration) ? ' late' : ''}`
    : 'not filed';
  return `${registration.state} ${registration.year}: ${registration.hives} hives on ${registration.apiaries} apiaries, ${filed}`;
}
