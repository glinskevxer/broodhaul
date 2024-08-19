import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  rejectUnknownKeys,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';

/**
 * Whether the weather lets a grading happen at all, and by which method.
 *
 * This is the rule that decides what the other rules measure. A frame count
 * only means anything when the field bees are out of the hive, so it needs
 * warmth and a calm afternoon; below that the grader opens nothing and counts
 * the cluster through the top bars instead, which reads differently and gets
 * converted. Get the method wrong and every number downstream is wrong with
 * it, and the grower is entitled to say so.
 */

export const METHODS = ['frame', 'cluster'];

export const PRECIPITATION = ['none', 'drizzle', 'rain'];

/** Frame counting needs the bees flying: warm, calm, dry, and in the middle of the day. */
export const FRAME_LIMITS = {
  minimumTemperatureF: 55,
  maximumWindMph: 15,
  earliestHour: 10,
  latestHour: 16,
};

/** A cluster count is taken cold, so it tolerates more, but not everything. */
export const CLUSTER_LIMITS = {
  minimumTemperatureF: 50,
  maximumWindMph: 20,
  earliestHour: 7,
  latestHour: 17,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(value, field = 'time') {
  const text = requireString(value, field, { min: 5, max: 5 });
  const match = TIME_PATTERN.exec(text);
  if (!match) {
    throw new ValidationError(`${field} must be a 24 hour HH:MM time, got ${value}`, {
      field,
      got: value,
    });
  }
  return { hour: Number(match[1]), minute: Number(match[2]), text };
}

export function makeConditions(input) {
  const raw = requireObject(input, 'conditions');
  rejectUnknownKeys(raw, 'conditions', [
    'date',
    'time',
    'temperatureF',
    'windMph',
    'precipitation',
  ]);
  return {
    date: parseDate(raw.date, 'conditions.date'),
    time: parseTimeOfDay(raw.time, 'conditions.time').text,
    temperatureF: requireNumber(raw.temperatureF, 'conditions.temperatureF', {
      min: -40,
      max: 130,
    }),
    windMph: requireNumber(raw.windMph, 'conditions.windMph', { min: 0, max: 100 }),
    precipitation: requireOneOf(
      raw.precipitation ?? 'none',
      'conditions.precipitation',
      PRECIPITATION
    ),
  };
}

function withinHours(conditions, limits) {
  const { hour, minute } = parseTimeOfDay(conditions.time);
  const minutes = hour * 60 + minute;
  return minutes >= limits.earliestHour * 60 && minutes <= limits.latestHour * 60;
}

/** Reasons this method cannot be used, in the order the manual lists them. */
export function methodBlockers(conditions, method) {
  const which = requireOneOf(method, 'method', METHODS);
  const limits = which === 'frame' ? FRAME_LIMITS : CLUSTER_LIMITS;
  const blockers = [];
  if (conditions.temperatureF < limits.minimumTemperatureF) {
    blockers.push(`below ${limits.minimumTemperatureF}F`);
  }
  if (conditions.windMph > limits.maximumWindMph) {
    blockers.push(`wind over ${limits.maximumWindMph} mph`);
  }
  if (!withinHours(conditions, limits)) {
    blockers.push(`outside ${limits.earliestHour}:00 to ${limits.latestHour}:00`);
  }
  if (which === 'frame' && conditions.precipitation !== 'none') {
    blockers.push(`${conditions.precipitation} falling`);
  }
  if (which === 'cluster' && conditions.precipitation === 'rain') {
    blockers.push('rain falling');
  }
  return blockers;
}

export function methodAllowed(conditions, method) {
  return methodBlockers(conditions, method).length === 0;
}

/**
 * The method the conditions call for. Frame counting is preferred whenever it
 * is available, because a cluster count is an estimate and the contract knows
 * it. Neither one being available is a real answer and the caller has to
 * handle it, so it throws rather than returning null.
 */
export function methodFor(conditions) {
  if (methodAllowed(conditions, 'frame')) return 'frame';
  if (methodAllowed(conditions, 'cluster')) return 'cluster';
  throw new RuleViolation(
    'GC-1',
    'conditions do not allow a grading by either method',
    {
      date: conditions.date,
      time: conditions.time,
      temperatureF: conditions.temperatureF,
      frame: methodBlockers(conditions, 'frame'),
      cluster: methodBlockers(conditions, 'cluster'),
    }
  );
}

export function describeConditions(conditions) {
  return [
    `${conditions.date} ${conditions.time}`,
    `${conditions.temperatureF}F`,
    `wind ${conditions.windMph} mph`,
    conditions.precipitation === 'none' ? 'dry' : conditions.precipitation,
  ].join(', ');
}
