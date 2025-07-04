import { describe, it, expect } from 'vitest';
import {
  TRUCKLOAD_DRUMS,
  MINIMUM_LOAD_LB,
  SMALL_LOT_PENALTY_BPS,
  makeShipment,
  shipmentDrums,
  shipmentNetLb,
  rejectableDrums,
  checkShippable,
  isSmallLot,
  paidPriceCentsPerLb,
  grossCents,
  netCents,
  shortOfMinimumLb,
  drumsToAdd,
  shipmentSummary,
} from '../../src/honey/pack.js';
import { makeDrum } from '../../src/honey/drum.js';

const aDrum = (id, overrides = {}) =>
  makeDrum({
    id,
    grossLb: 690,
    tareLb: 50,
    moisturePct: 17.4,
    floralSource: 'orange blossom',
    filledOn: '2025-05-22',
    ...overrides,
  });

const many = (count, overrides = {}) =>
  Array.from({ length: count }, (_unused, at) => aDrum(`D-${at + 1}`, overrides));

const index = (drums) => new Map(drums.map((drum) => [drum.id, drum]));

const shipment = (drums, overrides = {}) =>
  makeShipment(
    {
      id: 's-1',
      buyer: 'Sioux Honey',
      drums: drums.map((drum) => drum.id),
      shippedOn: '2025-07-02',
      priceCentsPerLb: 285,
      ...overrides,
    },
    index(drums)
  );

describe('makeShipment', () => {
  it('uppercases and sorts the drum numbers', () => {
    const drums = [aDrum('D-2'), aDrum('D-1')];
    expect(shipment(drums).drums).toEqual(['D-1', 'D-2']);
  });

  it('refuses an empty shipment', () => {
    expect(() =>
      makeShipment(
        {
          id: 's',
          buyer: 'b',
          drums: [],
          shippedOn: '2025-07-02',
          priceCentsPerLb: 285,
        },
        new Map()
      )
    ).toThrow(/at least one drum/);
  });

  it('refuses more drums than a truck holds', () => {
    const drums = many(TRUCKLOAD_DRUMS + 1);
    expect(() => shipment(drums)).toThrow(/a truck holds 80 drums/);
  });

  it('refuses the same drum twice', () => {
    const drums = [aDrum('D-1')];
    expect(() =>
      makeShipment(
        {
          id: 's-1',
          buyer: 'Sioux Honey',
          drums: ['D-1', 'D-1'],
          shippedOn: '2025-07-02',
          priceCentsPerLb: 285,
        },
        index(drums)
      )
    ).toThrow(/is on the shipment twice/);
  });

  it('refuses a drum that is not on file', () => {
    expect(() =>
      makeShipment(
        {
          id: 's-1',
          buyer: 'Sioux Honey',
          drums: ['D-9'],
          shippedOn: '2025-07-02',
          priceCentsPerLb: 285,
        },
        new Map()
      )
    ).toThrow(/which is not on file/);
  });

  it('refuses a price nobody pays', () => {
    expect(() => shipment([aDrum('D-1')], { priceCentsPerLb: 20 })).toThrow(
      /at least 50/
    );
  });

  it('defaults the freight to nothing', () => {
    expect(shipment([aDrum('D-1')]).freightCents).toBe(0);
  });
});

describe('weights', () => {
  it('adds the net weight of the drums', () => {
    const drums = many(3);
    expect(shipmentNetLb(shipment(drums), index(drums))).toBe(1920);
  });

  it('hands the drums back', () => {
    const drums = many(2);
    expect(shipmentDrums(shipment(drums), index(drums)).map((drum) => drum.id)).toEqual(
      ['D-1', 'D-2']
    );
  });
});

describe('rejectableDrums and checkShippable', () => {
  it('passes a clean shipment', () => {
    const drums = many(3);
    expect(checkShippable(shipment(drums), index(drums))).toBe(true);
    expect(rejectableDrums(shipment(drums), index(drums))).toEqual([]);
  });

  it('names the wet drums and refuses to load them', () => {
    const drums = [aDrum('D-1'), aDrum('D-2', { moisturePct: 19.2 })];
    expect(
      rejectableDrums(shipment(drums), index(drums)).map((drum) => drum.id)
    ).toEqual(['D-2']);
    expect(() => checkShippable(shipment(drums), index(drums))).toThrow(
      /1 drums are over the moisture limit/
    );
  });

  it('names the rule', () => {
    const drums = [aDrum('D-1', { moisturePct: 19.2 })];
    try {
      checkShippable(shipment(drums), index(drums));
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('HP-1');
      expect(err.details.drums).toEqual(['D-1']);
    }
  });
});

describe('small lots', () => {
  it('calls a part load small', () => {
    const drums = many(10);
    expect(isSmallLot(shipment(drums), index(drums))).toBe(true);
    expect(shipmentNetLb(shipment(drums), index(drums))).toBeLessThan(MINIMUM_LOAD_LB);
  });

  it('calls a full load full', () => {
    const drums = many(70);
    expect(isSmallLot(shipment(drums), index(drums))).toBe(false);
  });

  it('takes the deduction off a small lot price', () => {
    const drums = many(10);
    expect(paidPriceCentsPerLb(shipment(drums), index(drums))).toBe(
      Math.round(285 * (1 - SMALL_LOT_PENALTY_BPS / 10000))
    );
  });

  it('pays the full price on a full load', () => {
    const drums = many(70);
    expect(paidPriceCentsPerLb(shipment(drums), index(drums))).toBe(285);
  });

  it('says how far short a load is and how many drums would fix it', () => {
    const drums = many(10);
    expect(shortOfMinimumLb(shipment(drums), index(drums))).toBe(33600);
    expect(drumsToAdd(shipment(drums), index(drums))).toBe(53);
  });

  it('asks for nothing once the load is over the minimum', () => {
    const drums = many(70);
    expect(shortOfMinimumLb(shipment(drums), index(drums))).toBe(0);
    expect(drumsToAdd(shipment(drums), index(drums))).toBe(0);
  });
});

describe('money', () => {
  it('prices the net weight', () => {
    const drums = many(70);
    expect(grossCents(shipment(drums), index(drums))).toBe(285 * 44800);
  });

  it('takes the freight off', () => {
    const drums = many(70);
    const withFreight = shipment(drums, { freightCents: 320000 });
    expect(netCents(withFreight, index(drums))).toBe(285 * 44800 - 320000);
  });

  it('earns less per pound on a small lot', () => {
    const small = many(10);
    const full = many(70);
    expect(
      grossCents(shipment(small), index(small)) /
        shipmentNetLb(shipment(small), index(small))
    ).toBeLessThan(
      grossCents(shipment(full), index(full)) /
        shipmentNetLb(shipment(full), index(full))
    );
  });
});

describe('shipmentSummary', () => {
  it('gives one flat row', () => {
    const drums = many(70);
    const summary = shipmentSummary(
      shipment(drums, { freightCents: 320000 }),
      index(drums)
    );
    expect(summary).toMatchObject({
      id: 'S-1',
      buyer: 'Sioux Honey',
      drums: 70,
      netLb: 44800,
      smallLot: false,
      priceCentsPerLb: 285,
      rejectable: 0,
    });
    expect(summary.netCents).toBe(summary.grossCents - 320000);
  });

  it('flags a small lot with wet drums in it', () => {
    const drums = [aDrum('D-1'), aDrum('D-2', { moisturePct: 19.4 })];
    const summary = shipmentSummary(shipment(drums), index(drums));
    expect(summary.smallLot).toBe(true);
    expect(summary.rejectable).toBe(1);
  });
});
