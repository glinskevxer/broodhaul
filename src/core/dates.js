import { ValidationError } from './errors.js';

/**
 * Calendar arithmetic on plain `YYYY-MM-DD` strings.
 *
 * Everything here is timezone free on purpose. A grading date is a day in an
 * orchard, not an instant, and the desk has been bitten before by a machine in
 * Modesto and a machine in a datacentre disagreeing about which day a load
 * moved. Only `clock.js` is allowed to know what time it is now.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

export function parseDate(text, field = 'date') {
  if (typeof text !== 'string') {
    throw new ValidationError(`${field} must be a YYYY-MM-DD string`, { field });
  }
  const match = DATE_PATTERN.exec(text.trim());
  if (!match) {
    throw new ValidationError(`${field} must look like YYYY-MM-DD, got ${text}`, {
      field,
      got: text,
    });
  }
  const [, year, month, day] = match.map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(stamp);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new ValidationError(`${field} is not a real date: ${text}`, {
      field,
      got: text,
    });
  }
  return text.trim();
}

export function toStamp(date) {
  const [year, month, day] = parseDate(date).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function fromStamp(stamp) {
  return new Date(stamp).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  if (!Number.isInteger(days)) {
    throw new ValidationError('days must be a whole number', { days });
  }
  return fromStamp(toStamp(date) + days * MS_PER_DAY);
}

export function diffDays(from, to) {
  return Math.round((toStamp(to) - toStamp(from)) / MS_PER_DAY);
}

export function compareDates(left, right) {
  const a = toStamp(left);
  const b = toStamp(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function earliest(dates) {
  if (dates.length === 0) throw new ValidationError('no dates given', {});
  return dates.reduce((best, date) => (compareDates(date, best) < 0 ? date : best));
}

export function latest(dates) {
  if (dates.length === 0) throw new ValidationError('no dates given', {});
  return dates.reduce((best, date) => (compareDates(date, best) > 0 ? date : best));
}

export function dayOfWeek(date) {
  return new Date(toStamp(date)).getUTCDay();
}

export function isWeekend(date) {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

/**
 * The operating season runs from the first of November to the end of October,
 * so almond bloom and the summer honey flow that follows it land in the same
 * season rather than being split across two calendar years.
 */
export function seasonOf(date) {
  const [year, month] = parseDate(date).split('-').map(Number);
  return month >= 11 ? year + 1 : year;
}

export function seasonBounds(season) {
  if (!Number.isInteger(season)) {
    throw new ValidationError('season must be a whole year', { season });
  }
  return { start: `${season - 1}-11-01`, end: `${season}-10-31` };
}

export function monthName(date) {
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return names[Number(parseDate(date).slice(5, 7)) - 1];
}

export function eachDay(from, to) {
  const span = diffDays(from, to);
  if (span < 0) {
    throw new ValidationError('range runs backwards', { from, to });
  }
  const days = [];
  for (let offset = 0; offset <= span; offset += 1) {
    days.push(addDays(from, offset));
  }
  return days;
}
