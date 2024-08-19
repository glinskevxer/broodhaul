import { describe, it, expect } from 'vitest';
import {
  METHODS,
  PRECIPITATION,
  FRAME_LIMITS,
  CLUSTER_LIMITS,
  parseTimeOfDay,
  makeConditions,
  methodBlockers,
  methodAllowed,
  methodFor,
  describeConditions,
} from '../../src/grading/conditions.js';

const base = {
  date: '2025-02-14',
  time: '11:30',
  temperatureF: 62,
  windMph: 6,
  precipitation: 'none',
};

const conditions = (overrides = {}) => makeConditions({ ...base, ...overrides });

describe('parseTimeOfDay', () => {
  it('reads a 24 hour time', () => {
    expect(parseTimeOfDay('14:05')).toEqual({ hour: 14, minute: 5, text: '14:05' });
  });

  it('accepts both ends of the day', () => {
    expect(parseTimeOfDay('00:00').hour).toBe(0);
    expect(parseTimeOfDay('23:59').minute).toBe(59);
  });

  it('refuses an hour or minute that does not exist', () => {
    expect(() => parseTimeOfDay('24:00')).toThrow(/24 hour HH:MM/);
    expect(() => parseTimeOfDay('12:60')).toThrow(/24 hour HH:MM/);
  });

  it('refuses a time that is not five characters', () => {
    expect(() => parseTimeOfDay('9:30')).toThrow(/at least 5 characters/);
  });
});

describe('makeConditions', () => {
  it('keeps what it was given', () => {
    expect(conditions()).toEqual(base);
  });

  it('defaults the precipitation to none', () => {
    const built = makeConditions({
      date: '2025-02-14',
      time: '11:30',
      temperatureF: 62,
      windMph: 6,
    });
    expect(built.precipitation).toBe('none');
  });

  it('refuses a temperature nobody in the valley has seen', () => {
    expect(() => conditions({ temperatureF: 200 })).toThrow(/at most 130/);
  });

  it('refuses a negative wind', () => {
    expect(() => conditions({ windMph: -1 })).toThrow(/at least 0/);
  });

  it('refuses a precipitation the sheet does not have a box for', () => {
    expect(() => conditions({ precipitation: 'hail' })).toThrow(/must be one of/);
  });

  it('refuses an unknown key', () => {
    expect(() => makeConditions({ ...base, humidity: 40 })).toThrow(
      /conditions has unknown keys: humidity/
    );
  });
});

describe('methodBlockers for a frame count', () => {
  it('is empty on a good afternoon', () => {
    expect(methodBlockers(conditions(), 'frame')).toEqual([]);
  });

  it('blocks below the temperature floor', () => {
    expect(methodBlockers(conditions({ temperatureF: 54 }), 'frame')).toEqual([
      'below 55F',
    ]);
  });

  it('allows the floor itself', () => {
    expect(methodBlockers(conditions({ temperatureF: 55 }), 'frame')).toEqual([]);
  });

  it('blocks wind over the limit but not at it', () => {
    expect(methodBlockers(conditions({ windMph: 15 }), 'frame')).toEqual([]);
    expect(methodBlockers(conditions({ windMph: 16 }), 'frame')).toEqual([
      'wind over 15 mph',
    ]);
  });

  it('blocks outside the middle of the day', () => {
    expect(methodBlockers(conditions({ time: '09:59' }), 'frame')).toEqual([
      'outside 10:00 to 16:00',
    ]);
    expect(methodBlockers(conditions({ time: '16:01' }), 'frame')).toEqual([
      'outside 10:00 to 16:00',
    ]);
  });

  it('allows both ends of the window exactly', () => {
    expect(methodBlockers(conditions({ time: '10:00' }), 'frame')).toEqual([]);
    expect(methodBlockers(conditions({ time: '16:00' }), 'frame')).toEqual([]);
  });

  it('blocks any precipitation at all', () => {
    expect(methodBlockers(conditions({ precipitation: 'drizzle' }), 'frame')).toEqual([
      'drizzle falling',
    ]);
  });

  it('lists every blocker in manual order', () => {
    const bad = conditions({
      temperatureF: 44,
      windMph: 30,
      time: '06:00',
      precipitation: 'rain',
    });
    expect(methodBlockers(bad, 'frame')).toEqual([
      'below 55F',
      'wind over 15 mph',
      'outside 10:00 to 16:00',
      'rain falling',
    ]);
  });
});

describe('methodBlockers for a cluster count', () => {
  it('tolerates a cold morning a frame count will not', () => {
    const cold = conditions({ temperatureF: 52, time: '08:15' });
    expect(methodBlockers(cold, 'cluster')).toEqual([]);
    expect(methodBlockers(cold, 'frame')).toHaveLength(2);
  });

  it('still stops below fifty', () => {
    expect(methodBlockers(conditions({ temperatureF: 49 }), 'cluster')).toEqual([
      'below 50F',
    ]);
  });

  it('tolerates drizzle but not rain', () => {
    expect(methodBlockers(conditions({ precipitation: 'drizzle' }), 'cluster')).toEqual(
      []
    );
    expect(methodBlockers(conditions({ precipitation: 'rain' }), 'cluster')).toEqual([
      'rain falling',
    ]);
  });

  it('takes more wind than a frame count', () => {
    expect(methodBlockers(conditions({ windMph: 18 }), 'cluster')).toEqual([]);
    expect(methodBlockers(conditions({ windMph: 21 }), 'cluster')).toEqual([
      'wind over 20 mph',
    ]);
  });

  it('refuses a method nobody uses', () => {
    expect(() => methodBlockers(conditions(), 'guess')).toThrow(
      /must be one of frame, cluster/
    );
  });
});

describe('methodAllowed', () => {
  it('agrees with an empty blocker list', () => {
    for (const method of METHODS) {
      expect(methodAllowed(conditions(), method)).toBe(
        methodBlockers(conditions(), method).length === 0
      );
    }
  });
});

describe('methodFor', () => {
  it('prefers a frame count when it can have one', () => {
    expect(methodFor(conditions())).toBe('frame');
  });

  it('falls to a cluster count on a cold morning', () => {
    expect(methodFor(conditions({ temperatureF: 52, time: '08:15' }))).toBe('cluster');
  });

  it('falls to a cluster count in drizzle', () => {
    expect(methodFor(conditions({ precipitation: 'drizzle' }))).toBe('cluster');
  });

  it('refuses when neither method is available', () => {
    expect(() => methodFor(conditions({ temperatureF: 44 }))).toThrow(
      /do not allow a grading by either method/
    );
  });

  it('names both sets of blockers when it refuses', () => {
    try {
      methodFor(conditions({ temperatureF: 44 }));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('GC-1');
      expect(err.details.frame).toContain('below 55F');
      expect(err.details.cluster).toContain('below 50F');
    }
  });

  it('refuses at three in the morning however warm it is', () => {
    expect(() => methodFor(conditions({ time: '03:00', temperatureF: 80 }))).toThrow(
      /either method/
    );
  });
});

describe('the published limits', () => {
  it('let a cluster count run wider than a frame count on every axis', () => {
    expect(CLUSTER_LIMITS.minimumTemperatureF).toBeLessThan(
      FRAME_LIMITS.minimumTemperatureF
    );
    expect(CLUSTER_LIMITS.maximumWindMph).toBeGreaterThan(FRAME_LIMITS.maximumWindMph);
    expect(CLUSTER_LIMITS.earliestHour).toBeLessThan(FRAME_LIMITS.earliestHour);
    expect(CLUSTER_LIMITS.latestHour).toBeGreaterThan(FRAME_LIMITS.latestHour);
  });
});

describe('describeConditions', () => {
  it('reads like the line on the grading sheet', () => {
    expect(describeConditions(conditions())).toBe(
      '2025-02-14 11:30, 62F, wind 6 mph, dry'
    );
  });

  it('names the weather when there is some', () => {
    for (const precipitation of PRECIPITATION.filter((entry) => entry !== 'none')) {
      expect(describeConditions(conditions({ precipitation }))).toContain(
        precipitation
      );
    }
  });
});
