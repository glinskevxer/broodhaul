import { ConflictError, RuleViolation } from '../core/errors.js';
import { requireArray, requireInteger, requireString } from '../core/validate.js';
import { addDays, compareDates, parseDate } from '../core/dates.js';
import { groupBy, sortBy, sumBy } from '../core/collections.js';
import { palletCount } from './load.js';

/**
 * Getting the loads onto nights and trucks.
 *
 * The constraint that actually binds is not the trucks, it is the forklift and
 * the two people running it: a crew can load and set about three loads a night
 * and no amount of trucks changes that. So dispatch works in nights, fills each
 * one to the crew's capacity, and refuses to put the same pallet on two loads
 * the same night however far apart they are.
 */

export const LOADS_PER_NIGHT = 3;

export function makeDispatchNight(date, loads = []) {
  return { date: parseDate(date, 'night'), loads: sortBy(loads, (load) => load.id) };
}

export function checkNight(night) {
  if (night.loads.length > LOADS_PER_NIGHT) {
    throw new RuleViolation(
      'DP-1',
      `${night.date} has ${night.loads.length} loads, the crew does ${LOADS_PER_NIGHT}`,
      { date: night.date, loads: night.loads.length, limit: LOADS_PER_NIGHT }
    );
  }
  const pallets = night.loads.flatMap((load) => load.pallets);
  const repeated = pallets.find((pallet, at) => pallets.indexOf(pallet) !== at);
  if (repeated) {
    throw new ConflictError(`pallet ${repeated} is on two loads on ${night.date}`, {
      pallet: repeated,
      date: night.date,
    });
  }
  return true;
}

/**
 * Fill nights in order, starting from `from`, taking loads in the order given.
 * A load that cannot share a night with what is already there rolls to the
 * next one rather than being dropped.
 */
export function scheduleLoads(loads, from) {
  requireArray(loads, 'loads');
  const start = parseDate(from, 'from');
  const nights = [];
  const placed = new Map();
  for (const load of loads) {
    let offset = 0;
    for (;;) {
      const date = addDays(start, offset);
      let night = nights.find((entry) => entry.date === date);
      if (!night) {
        night = { date, loads: [] };
        nights.push(night);
      }
      const clash = load.pallets.some((pallet) =>
        night.loads.some((other) => other.pallets.includes(pallet))
      );
      if (night.loads.length < LOADS_PER_NIGHT && !clash) {
        night.loads.push(load);
        placed.set(load.id, date);
        break;
      }
      offset += 1;
    }
  }
  return {
    nights: sortBy(nights, (night) => night.date).map((night) =>
      makeDispatchNight(night.date, night.loads)
    ),
    placed,
  };
}

export function nightsNeeded(loads) {
  return Math.ceil(requireArray(loads, 'loads').length / LOADS_PER_NIGHT);
}

export function palletsPerNight(schedule) {
  return schedule.nights.map((night) => ({
    date: night.date,
    loads: night.loads.length,
    pallets: sumBy(night.loads, palletCount),
  }));
}

export function scheduleSpan(schedule) {
  if (schedule.nights.length === 0) return null;
  const dates = schedule.nights.map((night) => night.date);
  return { start: dates[0], end: dates[dates.length - 1] };
}

/** Loads that have to move before a deadline and are scheduled after it. */
export function lateLoads(schedule, deadlines) {
  const late = [];
  for (const [loadId, date] of schedule.placed.entries()) {
    const due = deadlines[loadId];
    if (due !== undefined && compareDates(date, due) > 0) {
      late.push({ load: loadId, scheduled: date, due });
    }
  }
  return sortBy(late, (entry) => entry.load);
}

export function byTruck(loads) {
  const groups = groupBy(loads, (load) => load.truck.unit);
  return sortBy(
    [...groups.entries()].map(([unit, entries]) => ({
      unit,
      loads: entries.length,
      pallets: sumBy(entries, palletCount),
    })),
    (row) => row.unit
  );
}

export function describeNight(night) {
  const units = night.loads
    .map((load) => `${load.id} on ${load.truck.unit}`)
    .join(', ');
  return `${night.date}: ${requireInteger(night.loads.length, 'loads', { min: 0 })} loads${units === '' ? '' : `, ${units}`}`;
}

export function describeSchedule(schedule) {
  return schedule.nights.map(describeNight).join('\n');
}

export function loadNight(schedule, loadId) {
  return schedule.placed.get(requireString(loadId, 'loadId', { max: 40 }));
}
