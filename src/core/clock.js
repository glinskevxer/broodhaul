/**
 * The only place in the codebase allowed to read the wall clock.
 *
 * Every command takes a clock, so a test can hand it a fixed day and a nightly
 * report can be re-run for a date in the past without lying about it.
 */

import { parseDate } from './dates.js';

export function systemClock() {
  return {
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
  };
}

export function fixedClock(date, time = '12:00:00') {
  const day = parseDate(date, 'clock date');
  return {
    today: () => day,
    now: () => `${day}T${time}Z`,
  };
}
