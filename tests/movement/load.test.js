import { describe, it, expect } from 'vitest';
import {
  TRUCK_KINDS,
  LOAD_STATES,
  makeLoad,
  palletCount,
  coloniesAboard,
  isDelivered,
  nightsInTransit,
  advanceLoad,
  requirePalletsAvailable,
} from '../../src/movement/load.js';
import { aPallet } from '../helpers/records.js';

const base = {
  id: 'LD-2025-0143',
  truck: { unit: 'bh-7', kind: 'semi', plate: '4xy1234' },
  driver: 'D Rasmussen',
  originYardId: 'YD-2025-0004',
  destination: { kind: 'drop', id: 'DR-2025-0004' },
  pallets: ['PL-2025-0031', 'PL-2025-0032'],
};

const load = (overrides = {}) => makeLoad({ ...base, ...overrides });

describe('makeLoad', () => {
  it('uppercases the unit and the plate', () => {
    const built = load();
    expect(built.truck.unit).toBe('BH-7');
    expect(built.truck.plate).toBe('4XY1234');
  });

  it('starts planned', () => {
    expect(load().state).toBe('planned');
  });

  it('takes every truck kind on the yard', () => {
    for (const kind of TRUCK_KINDS) {
      expect(load({ truck: { unit: 'bh-7', kind } }).truck.kind).toBe(kind);
    }
  });

  it('takes a drop or a yard as the destination', () => {
    expect(
      load({ destination: { kind: 'yard', id: 'YD-2025-0009' } }).destination.kind
    ).toBe('yard');
  });

  it('refuses a destination identifier of the wrong kind', () => {
    expect(() => load({ destination: { kind: 'yard', id: 'DR-2025-0004' } })).toThrow(
      /expected a yard identifier/
    );
  });

  it('refuses an empty manifest', () => {
    expect(() => load({ pallets: [] })).toThrow(/at least 1 entries/);
  });

  it('refuses the same pallet twice on one trailer', () => {
    expect(() => load({ pallets: ['PL-2025-0031', 'PL-2025-0031'] })).toThrow(
      /is on the load twice/
    );
  });

  it('refuses something on the manifest that is not a pallet', () => {
    expect(() => load({ pallets: ['CY-2025-0011'] })).toThrow(
      /load.pallets\[0\] is not a pallet identifier/
    );
  });

  it('refuses an arrival with no departure', () => {
    expect(() => load({ deliveredOn: '2025-02-04' })).toThrow(
      /cannot arrive before it was loaded/
    );
  });

  it('refuses an arrival before the departure', () => {
    expect(() => load({ loadedOn: '2025-02-04', deliveredOn: '2025-02-03' })).toThrow(
      /arrived before it left/
    );
  });

  it('refuses a delivered load with no delivery date', () => {
    expect(() => load({ state: 'delivered', loadedOn: '2025-02-03' })).toThrow(
      /needs a delivery date/
    );
  });

  it('refuses a loaded truck with no loading date', () => {
    expect(() => load({ state: 'loaded' })).toThrow(/needs a loading date/);
  });

  it('refuses an unknown key', () => {
    expect(() => makeLoad({ ...base, fuel: 140 })).toThrow(
      /load has unknown keys: fuel/
    );
  });
});

describe('palletCount and coloniesAboard', () => {
  it('counts the pallets on the manifest', () => {
    expect(palletCount(load())).toBe(2);
  });

  it('counts the colonies off the pallets rather than assuming they are full', () => {
    const pallets = new Map([
      [
        'PL-2025-0031',
        aPallet({
          sequence: 31,
          positions: ['CY-2025-0011', 'CY-2025-0012', null, null],
        }),
      ],
      [
        'PL-2025-0032',
        aPallet({
          sequence: 32,
          positions: ['CY-2025-0013', 'CY-2025-0014', 'CY-2025-0015', 'CY-2025-0016'],
        }),
      ],
    ]);
    expect(coloniesAboard(load(), pallets)).toBe(6);
  });

  it('refuses a manifest naming a pallet that is not on file', () => {
    expect(() => coloniesAboard(load(), new Map())).toThrow(/which is not on file/);
  });
});

describe('isDelivered and nightsInTransit', () => {
  it('knows a delivered load', () => {
    const done = load({
      state: 'delivered',
      loadedOn: '2025-02-03',
      deliveredOn: '2025-02-04',
    });
    expect(isDelivered(done)).toBe(true);
    expect(isDelivered(load())).toBe(false);
  });

  it('counts the nights on the road', () => {
    const done = load({
      state: 'delivered',
      loadedOn: '2025-02-03',
      deliveredOn: '2025-02-05',
    });
    expect(nightsInTransit(done)).toBe(2);
  });

  it('is nothing when the load has not moved', () => {
    expect(nightsInTransit(load())).toBe(0);
  });

  it('is nothing for a load out and back the same night', () => {
    const short = load({
      state: 'delivered',
      loadedOn: '2025-02-03',
      deliveredOn: '2025-02-03',
    });
    expect(nightsInTransit(short)).toBe(0);
  });
});

describe('advanceLoad', () => {
  it('walks a load from planned to delivered', () => {
    const loaded = advanceLoad(load(), 'loaded', '2025-02-03');
    expect(loaded.state).toBe('loaded');
    expect(loaded.loadedOn).toBe('2025-02-03');
    const delivered = advanceLoad(loaded, 'delivered', '2025-02-04');
    expect(delivered.state).toBe('delivered');
    expect(delivered.deliveredOn).toBe('2025-02-04');
  });

  it('can cancel from planned or loaded', () => {
    expect(advanceLoad(load(), 'cancelled', '2025-02-03').state).toBe('cancelled');
    const loaded = advanceLoad(load(), 'loaded', '2025-02-03');
    expect(advanceLoad(loaded, 'cancelled', '2025-02-03').state).toBe('cancelled');
  });

  it('refuses to deliver a load that never left', () => {
    expect(() => advanceLoad(load(), 'delivered', '2025-02-04')).toThrow(
      /a planned load cannot become delivered/
    );
  });

  it('refuses to move a delivered or cancelled load', () => {
    const loaded = advanceLoad(load(), 'loaded', '2025-02-03');
    const delivered = advanceLoad(loaded, 'delivered', '2025-02-04');
    expect(() => advanceLoad(delivered, 'cancelled', '2025-02-05')).toThrow(
      /a delivered load cannot become cancelled/
    );
  });

  it('has a rule for every state the record allows', () => {
    for (const state of LOAD_STATES) {
      expect(() =>
        advanceLoad({ ...load(), state }, 'delivered', '2025-02-04')
      ).toBeTypeOf('function');
    }
  });

  it('leaves the original load alone', () => {
    const original = load();
    advanceLoad(original, 'loaded', '2025-02-03');
    expect(original.state).toBe('planned');
  });
});

describe('requirePalletsAvailable', () => {
  it('passes when nothing else has the pallets', () => {
    expect(requirePalletsAvailable(load(), new Set())).toBe(2);
  });

  it('refuses a pallet already on another load', () => {
    expect(() => requirePalletsAvailable(load(), new Set(['PL-2025-0032']))).toThrow(
      /already on another load tonight/
    );
  });
});
