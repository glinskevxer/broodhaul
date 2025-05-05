import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireArray, requireNumber, requireString } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { sumBy } from '../core/collections.js';
import { distanceMiles } from '../apiary/geo.js';

/**
 * Getting a load from one place to another.
 *
 * Bees ride netted and they cook if the truck sits in the sun, so a long haul
 * runs at night and the stops matter as much as the miles. On top of that the
 * driver has hours: eleven driving inside a fourteen hour window, then ten off.
 * A route that ignores either one is a route that ends with a dead load in a
 * rest area outside Winnemucca.
 */

export const MAX_DRIVING_HOURS = 11;
export const MAX_DUTY_HOURS = 14;
export const REQUIRED_REST_HOURS = 10;
export const AVERAGE_SPEED_MPH = 52;

/** Minutes lost at each stop, over and above the driving. */
export const STOP_MINUTES = {
  fuel: 25,
  scale: 15,
  inspection: 45,
  water: 30,
  rest: REQUIRED_REST_HOURS * 60,
};

export const STOP_KINDS = Object.keys(STOP_MINUTES);

export function makeStop(input) {
  const kind = requireString(input.kind, 'stop.kind', { max: 20 });
  if (!STOP_KINDS.includes(kind)) {
    throw new ValidationError(`stop kind must be one of ${STOP_KINDS.join(', ')}`, {
      kind,
    });
  }
  return {
    kind,
    at: {
      latitude: requireNumber(input.at?.latitude, 'stop.at.latitude', {
        min: -90,
        max: 90,
      }),
      longitude: requireNumber(input.at?.longitude, 'stop.at.longitude', {
        min: -180,
        max: 180,
      }),
    },
    note:
      input.note === undefined
        ? undefined
        : requireString(input.note, 'stop.note', { max: 120 }),
  };
}

export function makeRoute(input) {
  const points = requireArray(input.points, 'route.points', { min: 2, max: 40 }).map(
    (point, at) => ({
      latitude: requireNumber(point.latitude, `route.points[${at}].latitude`, {
        min: -90,
        max: 90,
      }),
      longitude: requireNumber(point.longitude, `route.points[${at}].longitude`, {
        min: -180,
        max: 180,
      }),
    })
  );
  const stops = requireArray(input.stops ?? [], 'route.stops', { max: 40 }).map(
    makeStop
  );
  return {
    points,
    stops,
    speedMph: requireNumber(input.speedMph ?? AVERAGE_SPEED_MPH, 'route.speedMph', {
      min: 20,
      max: 70,
    }),
  };
}

export function routeMiles(route) {
  let total = 0;
  for (let at = 1; at < route.points.length; at += 1) {
    total += distanceMiles(route.points[at - 1], route.points[at]);
  }
  return roundTo(total, 1);
}

export function drivingHours(route) {
  return roundTo(routeMiles(route) / route.speedMph, 2);
}

export function stopHours(route) {
  return roundTo(sumBy(route.stops, (stop) => STOP_MINUTES[stop.kind]) / 60, 2);
}

export function elapsedHours(route) {
  return roundTo(drivingHours(route) + stopHours(route), 2);
}

/** Rest stops the hours rule needs, over and above whatever was planned. */
export function restsNeeded(route) {
  const driving = drivingHours(route);
  const planned = route.stops.filter((stop) => stop.kind === 'rest').length;
  const required = Math.max(0, Math.ceil(driving / MAX_DRIVING_HOURS) - 1);
  return Math.max(0, required - planned);
}

export function isSingleShift(route) {
  const working = drivingHours(route) + stopHours(route);
  return drivingHours(route) <= MAX_DRIVING_HOURS && working <= MAX_DUTY_HOURS;
}

export function checkHours(route) {
  const missing = restsNeeded(route);
  if (missing > 0) {
    throw new RuleViolation(
      'RT-1',
      `${drivingHours(route)} driving hours needs ${missing} more rest stop`,
      { drivingHours: drivingHours(route), missing }
    );
  }
  if (!isSingleShift(route) && route.stops.every((stop) => stop.kind !== 'rest')) {
    throw new RuleViolation(
      'RT-2',
      'the run does not fit in one duty window and plans no rest',
      {
        elapsedHours: elapsedHours(route),
        maxDutyHours: MAX_DUTY_HOURS,
      }
    );
  }
  return true;
}

export function summariseRoute(route) {
  return {
    miles: routeMiles(route),
    drivingHours: drivingHours(route),
    stopHours: stopHours(route),
    elapsedHours: elapsedHours(route),
    stops: route.stops.length,
    singleShift: isSingleShift(route),
    restsNeeded: restsNeeded(route),
  };
}
