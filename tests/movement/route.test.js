import { describe, it, expect } from 'vitest';
import {
  MAX_DRIVING_HOURS,
  MAX_DUTY_HOURS,
  STOP_MINUTES,
  STOP_KINDS,
  AVERAGE_SPEED_MPH,
  makeStop,
  makeRoute,
  routeMiles,
  drivingHours,
  stopHours,
  elapsedHours,
  restsNeeded,
  isSingleShift,
  checkHours,
  summariseRoute,
} from '../../src/movement/route.js';

const home = { latitude: 36.5, longitude: -119.4 };
const northOf = (miles) => ({ latitude: 36.5 + miles / 69.0972, longitude: -119.4 });

const route = (miles, stops = [], speedMph) =>
  makeRoute({ points: [home, northOf(miles)], stops, speedMph });

const stop = (kind) => ({ kind, at: home });

describe('makeStop', () => {
  it('takes every stop kind the log has a box for', () => {
    for (const kind of STOP_KINDS) {
      expect(makeStop(stop(kind)).kind).toBe(kind);
    }
  });

  it('refuses a kind nobody logs', () => {
    expect(() => makeStop(stop('lunch'))).toThrow(/stop kind must be one of/);
  });

  it('refuses a stop off the planet', () => {
    expect(() =>
      makeStop({ kind: 'fuel', at: { latitude: 200, longitude: 0 } })
    ).toThrow(/at most 90/);
  });

  it('takes a note', () => {
    expect(makeStop({ ...stop('fuel'), note: 'Kettleman' }).note).toBe('Kettleman');
  });
});

describe('makeRoute', () => {
  it('needs at least two points', () => {
    expect(() => makeRoute({ points: [home] })).toThrow(/at least 2 entries/);
  });

  it('defaults the speed to the yard average', () => {
    expect(route(100).speedMph).toBe(AVERAGE_SPEED_MPH);
  });

  it('refuses a speed nobody drives a bee load at', () => {
    expect(() => route(100, [], 90)).toThrow(/at most 70/);
  });

  it('takes no stops at all', () => {
    expect(route(100).stops).toEqual([]);
  });
});

describe('routeMiles and hours', () => {
  it('adds the legs', () => {
    const long = makeRoute({ points: [home, northOf(100), northOf(300)] });
    expect(routeMiles(long)).toBeCloseTo(300, 0);
  });

  it('works the driving hours off the speed', () => {
    expect(drivingHours(route(520))).toBeCloseTo(10, 1);
    expect(drivingHours(route(520, [], 65))).toBeCloseTo(8, 1);
  });

  it('adds the stop time separately', () => {
    const withStops = route(100, [stop('fuel'), stop('scale')]);
    expect(stopHours(withStops)).toBeCloseTo((25 + 15) / 60, 2);
    expect(elapsedHours(withStops)).toBeCloseTo(
      drivingHours(withStops) + stopHours(withStops),
      2
    );
  });

  it('counts a rest as ten hours', () => {
    expect(stopHours(route(100, [stop('rest')]))).toBe(10);
    expect(STOP_MINUTES.rest).toBe(600);
  });

  it('is nothing on a route with no stops', () => {
    expect(stopHours(route(100))).toBe(0);
  });
});

describe('restsNeeded', () => {
  it('is nothing on a short run', () => {
    expect(restsNeeded(route(300))).toBe(0);
  });

  it('needs one rest once the driving passes the limit', () => {
    expect(drivingHours(route(700))).toBeGreaterThan(MAX_DRIVING_HOURS);
    expect(restsNeeded(route(700))).toBe(1);
  });

  it('needs two on a run to the northern plains', () => {
    expect(restsNeeded(route(1600))).toBe(2);
  });

  it('counts the rests already planned', () => {
    expect(restsNeeded(route(700, [stop('rest')]))).toBe(0);
    expect(restsNeeded(route(1600, [stop('rest')]))).toBe(1);
  });
});

describe('isSingleShift', () => {
  it('is true for a night run down the valley', () => {
    expect(isSingleShift(route(300, [stop('fuel')]))).toBe(true);
  });

  it('is false once the driving passes the limit', () => {
    expect(isSingleShift(route(700))).toBe(false);
  });

  it('is false when the stops push the day past the duty window', () => {
    const busy = route(520, [
      stop('inspection'),
      stop('inspection'),
      stop('inspection'),
    ]);
    expect(drivingHours(busy)).toBeLessThan(MAX_DRIVING_HOURS);
    expect(elapsedHours(busy)).toBeGreaterThan(MAX_DUTY_HOURS - 3);
    expect(isSingleShift(busy)).toBe(true);
  });
});

describe('checkHours', () => {
  it('passes a run that fits', () => {
    expect(checkHours(route(300, [stop('fuel')]))).toBe(true);
  });

  it('refuses a run with too few rests and says how many are missing', () => {
    expect(() => checkHours(route(1600))).toThrow(/needs 2 more rest stop/);
  });

  it('passes once the rests are planned', () => {
    expect(checkHours(route(1600, [stop('rest'), stop('rest')]))).toBe(true);
  });

  it('names the rule', () => {
    try {
      checkHours(route(700));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('RT-1');
      expect(err.details.missing).toBe(1);
    }
  });
});

describe('summariseRoute', () => {
  it('gives one flat row', () => {
    const summary = summariseRoute(route(300, [stop('fuel')]));
    expect(summary.stops).toBe(1);
    expect(summary.singleShift).toBe(true);
    expect(summary.restsNeeded).toBe(0);
    expect(summary.miles).toBeCloseTo(300, 0);
  });

  it('reports a long haul honestly', () => {
    const summary = summariseRoute(route(1600));
    expect(summary.singleShift).toBe(false);
    expect(summary.restsNeeded).toBe(2);
  });
});
