import { describe, it, expect } from 'vitest';
import {
  ACCESS_GRADES,
  WATER_SOURCES,
  makeYard,
  yardLabel,
  agreementCovers,
  capacityLeft,
  palletsPerLift,
  describeYard,
} from '../../src/apiary/yard.js';

const base = {
  id: 'YD-2025-0004',
  name: 'Dinuba home place',
  county: 'Tulare',
  state: 'ca',
  landowner: { name: 'R Wilkins', agreementOn: '2024-11-01' },
  location: { latitude: 36.5432, longitude: -119.3871 },
  capacity: 96,
  access: 'semi',
  water: 'canal',
};

const yard = (overrides = {}) => makeYard({ ...base, ...overrides });

describe('makeYard', () => {
  it('keeps the fields it was given', () => {
    const built = yard();
    expect(built.id).toBe('YD-2025-0004');
    expect(built.name).toBe('Dinuba home place');
    expect(built.capacity).toBe(96);
  });

  it('uppercases the state code', () => {
    expect(yard().state).toBe('CA');
  });

  it('refuses a state code that is not two letters', () => {
    expect(() => yard({ state: 'calif' })).toThrow(/at most 2 characters/);
  });

  it('refuses an identifier belonging to another kind', () => {
    expect(() => yard({ id: 'CT-2025-0004' })).toThrow(/expected a yard identifier/);
  });

  it('refuses an unknown top level key', () => {
    expect(() => makeYard({ ...base, gate: 'combination 4412' })).toThrow(
      /yard has unknown keys: gate/
    );
  });

  it('refuses an access grade nobody drives', () => {
    expect(() => yard({ access: 'helicopter' })).toThrow(
      /must be one of semi, bobtail, quad/
    );
  });

  it('refuses a water source that is not on the list', () => {
    expect(() => yard({ water: 'rain' })).toThrow(
      /must be one of onsite, canal, hauled/
    );
  });

  it('holds a capacity between one and six hundred', () => {
    expect(() => yard({ capacity: 0 })).toThrow(/at least 1/);
    expect(() => yard({ capacity: 601 })).toThrow(/at most 600/);
    expect(yard({ capacity: 600 }).capacity).toBe(600);
  });

  it('checks the coordinates are on the planet', () => {
    expect(() => yard({ location: { latitude: 96, longitude: 0 } })).toThrow(
      /at most 90/
    );
    expect(() => yard({ location: { latitude: 0, longitude: -200 } })).toThrow(
      /at least -180/
    );
  });

  it('refuses an unknown key inside the location', () => {
    expect(() =>
      yard({ location: { latitude: 1, longitude: 2, altitude: 300 } })
    ).toThrow(/location has unknown keys: altitude/);
  });

  it('takes an optional registration and notes', () => {
    const built = yard({
      registration: 'CA-TUL-2211',
      notes: 'gate is on the canal side',
    });
    expect(built.registration).toBe('CA-TUL-2211');
    expect(built.notes).toBe('gate is on the canal side');
  });

  it('leaves the optional fields undefined when they are absent', () => {
    const built = yard();
    expect(built.registration).toBeUndefined();
    expect(built.notes).toBeUndefined();
    expect(built.landowner.rentCents).toBeUndefined();
  });

  it('refuses a landowner agreement that ends before it starts', () => {
    expect(() =>
      yard({
        landowner: {
          name: 'R Wilkins',
          agreementOn: '2024-11-01',
          agreementEndsOn: '2024-10-01',
        },
      })
    ).toThrow(/ends before it starts/);
  });

  it('refuses a negative yard rent', () => {
    expect(() =>
      yard({
        landowner: { name: 'R Wilkins', agreementOn: '2024-11-01', rentCents: -1 },
      })
    ).toThrow(/at least 0/);
  });
});

describe('yardLabel', () => {
  it('reads the way the dispatcher says it', () => {
    expect(yardLabel(yard())).toBe('Dinuba home place (YD-2025-0004)');
  });
});

describe('agreementCovers', () => {
  it('is false before the agreement starts', () => {
    expect(agreementCovers(yard(), '2024-10-31')).toBe(false);
  });

  it('is true on the first day', () => {
    expect(agreementCovers(yard(), '2024-11-01')).toBe(true);
  });

  it('runs forever when no end date was written down', () => {
    expect(agreementCovers(yard(), '2031-06-01')).toBe(true);
  });

  it('includes the last day and excludes the one after', () => {
    const ending = yard({
      landowner: {
        name: 'R Wilkins',
        agreementOn: '2024-11-01',
        agreementEndsOn: '2025-10-31',
      },
    });
    expect(agreementCovers(ending, '2025-10-31')).toBe(true);
    expect(agreementCovers(ending, '2025-11-01')).toBe(false);
  });
});

describe('capacityLeft', () => {
  it('subtracts what is already there', () => {
    expect(capacityLeft(yard(), 40)).toBe(56);
  });

  it('is zero rather than negative when the yard is overloaded', () => {
    expect(capacityLeft(yard(), 200)).toBe(0);
  });

  it('refuses a negative count', () => {
    expect(() => capacityLeft(yard(), -1)).toThrow(/at least 0/);
  });
});

describe('palletsPerLift', () => {
  it('falls with the access grade', () => {
    expect(palletsPerLift(yard({ access: 'semi' }))).toBe(24);
    expect(palletsPerLift(yard({ access: 'bobtail' }))).toBe(12);
    expect(palletsPerLift(yard({ access: 'quad' }))).toBe(4);
  });

  it('answers for every grade the yard record allows', () => {
    for (const access of ACCESS_GRADES) {
      expect(palletsPerLift(yard({ access }))).toBeGreaterThan(0);
    }
  });
});

describe('describeYard', () => {
  it('prints the four lines the office wants', () => {
    const lines = describeYard(yard()).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('Tulare county, CA');
    expect(lines[3]).toBe('no yard rent');
  });

  it('names the rent when there is one', () => {
    const paying = yard({
      landowner: { name: 'R Wilkins', agreementOn: '2024-11-01', rentCents: 25000 },
    });
    expect(describeYard(paying).split('\n')[3]).toBe('yard rent 25000 cents a season');
  });

  it('covers every water source without complaint', () => {
    for (const water of WATER_SOURCES) {
      expect(describeYard(yard({ water }))).toContain(`water ${water}`);
    }
  });
});
