import { asNumber, asText, parseIdList, parseList } from '../parse.js';
import {
  makeRoute,
  summariseRoute,
  checkHours,
  STOP_KINDS,
} from '../../movement/route.js';
import {
  scheduleLoads,
  palletsPerNight,
  describeSchedule,
  byTruck,
  lateLoads,
  nightsNeeded,
} from '../../movement/dispatch.js';

/**
 * Haul planning.
 *
 * Two questions, both asked the week before a move. Will this run fit in a
 * driver's day, and how many nights does the whole set take. Neither one needs
 * a record written, so both commands read and print without touching the store.
 */

const POINTS = {
  label: 'points',
  example: '36.5:-119.4,46.8:-100.8',
  fields: [
    { name: 'latitude', convert: asNumber },
    { name: 'longitude', convert: asNumber },
  ],
};

const STOPS = {
  label: 'stops',
  example: 'fuel:36.9:-120.1,rest:40.1:-118.5',
  fields: [
    { name: 'kind', convert: asText },
    { name: 'latitude', convert: asNumber },
    { name: 'longitude', convert: asNumber },
  ],
};

export function registerHaulCommands(program, context) {
  const haul = program.command('haul').description('routes and dispatch nights');

  haul
    .command('route')
    .description('miles, hours and whether it fits in one shift')
    .requiredOption('--points <list>', 'latitude:longitude pairs, comma separated')
    .option('--stops <list>', 'kind:latitude:longitude triples, comma separated')
    .option('--speed <mph>', 'planning speed')
    .option('--check', 'refuse a route that breaks the hours rule')
    .action((options) => {
      const route = makeRoute({
        points: parseList(options.points, POINTS),
        stops: options.stops === undefined ? [] : buildStops(options.stops),
        speedMph: options.speed === undefined ? undefined : Number(options.speed),
      });
      if (options.check) checkHours(route);
      const summary = summariseRoute(route);
      if (context.output.json) {
        context.output.value(summary);
        return;
      }
      context.output.detail([
        ['miles', String(summary.miles)],
        ['driving', `${summary.drivingHours} hours`],
        ['stops', `${summary.stops}, ${summary.stopHours} hours`],
        ['elapsed', `${summary.elapsedHours} hours`],
        ['one shift', summary.singleShift ? 'yes' : 'no'],
        [
          'rests needed',
          summary.restsNeeded === 0 ? 'none' : String(summary.restsNeeded),
        ],
      ]);
    });

  haul
    .command('stops')
    .description('the stop kinds the log has a box for')
    .action(() => {
      context.output.value(STOP_KINDS);
    });

  haul
    .command('dispatch')
    .description('spread the planned loads over nights')
    .requiredOption('--from <date>', 'first night')
    .option('--loads <list>', 'load identifiers, otherwise every planned load')
    .option('--due <list>', 'load:date pairs the move has to beat')
    .action((options) => {
      const desk = context.desk();
      const all = desk.store.list('loads').filter((load) => load.state === 'planned');
      const wanted =
        options.loads === undefined
          ? all
          : parseIdList(options.loads, 'loads').map((id) =>
              desk.store.get('loads', id)
            );
      const schedule = scheduleLoads(wanted, options.from);
      const deadlines = Object.fromEntries(
        (options.due === undefined
          ? []
          : parseList(options.due, {
              label: 'due',
              example: 'LD-2025-0143:2025-02-04',
              fields: [
                { name: 'load', convert: asText },
                { name: 'date', convert: asText },
              ],
            })
        ).map((entry) => [entry.load, entry.date])
      );
      const late = lateLoads(schedule, deadlines);
      if (context.output.json) {
        context.output.value({
          nights: palletsPerNight(schedule),
          nightsNeeded: nightsNeeded(wanted),
          trucks: byTruck(wanted),
          late,
        });
        return;
      }
      context.output.line(describeSchedule(schedule));
      if (late.length > 0) {
        context.output.line();
        for (const entry of late) {
          context.output.line(
            `${entry.load} lands ${entry.scheduled}, wanted by ${entry.due}`
          );
        }
      }
    });

  return haul;
}

function buildStops(text) {
  return parseList(text, STOPS).map((entry) => ({
    kind: entry.kind,
    at: { latitude: entry.latitude, longitude: entry.longitude },
  }));
}
