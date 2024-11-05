import { describe, it, expect } from 'vitest';
import {
  SEASON_STAGES,
  COLONY_WEIGHT_LB,
  GROSS_LIMIT_LB,
  NET_WRAP_LB,
  colonyWeightLb,
  grossLimitLb,
  palletWeightLb,
  loadWeightLb,
  overweightBy,
  isLegal,
  maxPallets,
  palletsToShed,
  averagePalletLb,
} from '../../src/movement/weight.js';
import { makeLoad } from '../../src/movement/load.js';
import { aPallet } from '../helpers/records.js';

const full = (sequence) =>
  aPallet({
    sequence,
    positions: [
      `CY-2025-${String(sequence * 10 + 1).padStart(4, '0')}`,
      `CY-2025-${String(sequence * 10 + 2).padStart(4, '0')}`,
      `CY-2025-${String(sequence * 10 + 3).padStart(4, '0')}`,
      `CY-2025-${String(sequence * 10 + 4).padStart(4, '0')}`,
    ],
  });

const palletsById = new Map([
  ['PL-2025-0031', full(31)],
  ['PL-2025-0032', full(32)],
]);

const load = makeLoad({
  id: 'LD-2025-0143',
  truck: { unit: 'BH-7', kind: 'semi' },
  driver: 'D Rasmussen',
  originYardId: 'YD-2025-0004',
  destination: { kind: 'drop', id: 'DR-2025-0004' },
  pallets: ['PL-2025-0031', 'PL-2025-0032'],
});

describe('colonyWeightLb', () => {
  it('knows a weight for every stage', () => {
    for (const stage of SEASON_STAGES) {
      expect(colonyWeightLb(stage)).toBe(COLONY_WEIGHT_LB[stage]);
    }
  });

  it('is heaviest on the flow and lightest in winter', () => {
    expect(colonyWeightLb('flow')).toBeGreaterThan(colonyWeightLb('fall'));
    expect(colonyWeightLb('winter')).toBeLessThan(colonyWeightLb('bloom'));
  });

  it('refuses a stage nobody names', () => {
    expect(() => colonyWeightLb('spring')).toThrow(/must be one of/);
  });
});

describe('grossLimitLb', () => {
  it('knows a limit for every truck kind', () => {
    expect(grossLimitLb('semi')).toBe(GROSS_LIMIT_LB.semi);
    expect(grossLimitLb('bobtail')).toBe(26000);
  });

  it('refuses a truck kind nobody runs', () => {
    expect(() => grossLimitLb('pickup')).toThrow(/must be one of/);
  });
});

describe('palletWeightLb', () => {
  it('adds the tare, the colonies and the net', () => {
    expect(palletWeightLb(full(31), 'bloom')).toBe(62 + 4 * 110 + NET_WRAP_LB);
  });

  it('rises with the season', () => {
    expect(palletWeightLb(full(31), 'flow')).toBe(808);
    expect(palletWeightLb(full(31), 'winter')).toBe(448);
  });

  it('counts only the positions that are filled', () => {
    const half = aPallet({
      sequence: 33,
      positions: ['CY-2025-0331', null, null, null],
    });
    expect(palletWeightLb(half, 'bloom')).toBe(62 + 110 + NET_WRAP_LB);
  });

  it('is the bare tare and net on an empty pallet', () => {
    expect(palletWeightLb(aPallet({ sequence: 34 }), 'bloom')).toBe(68);
  });
});

describe('loadWeightLb', () => {
  it('adds the payload to the empty truck', () => {
    expect(loadWeightLb(load, palletsById, 'bloom', 32000)).toEqual({
      payloadLb: 1016,
      tareLb: 32000,
      grossLb: 33016,
    });
  });

  it('refuses a truck tare nobody weighs', () => {
    expect(() => loadWeightLb(load, palletsById, 'bloom', 500)).toThrow(
      /at least 8000/
    );
  });

  it('refuses a manifest naming a pallet that is not on file', () => {
    expect(() => loadWeightLb(load, new Map(), 'bloom', 32000)).toThrow(/not on file/);
  });
});

describe('overweightBy and isLegal', () => {
  it('is legal with two pallets on a semi', () => {
    const weights = loadWeightLb(load, palletsById, 'bloom', 32000);
    expect(overweightBy(weights, 'semi')).toBe(0);
    expect(isLegal(weights, 'semi')).toBe(true);
  });

  it('is over on a bobtail with the same load', () => {
    const weights = { payloadLb: 1016, tareLb: 32000, grossLb: 33016 };
    expect(overweightBy(weights, 'bobtail')).toBe(7016);
    expect(isLegal(weights, 'bobtail')).toBe(false);
  });

  it('treats a load sitting exactly on the limit as legal', () => {
    const weights = { payloadLb: 48000, tareLb: 32000, grossLb: 80000 };
    expect(isLegal(weights, 'semi')).toBe(true);
  });
});

describe('maxPallets', () => {
  it('fills a semi at bloom weight', () => {
    expect(maxPallets('semi', 508, 32000)).toBe(94);
  });

  it('carries fewer on the flow', () => {
    expect(maxPallets('semi', 808, 32000)).toBe(59);
  });

  it('carries far fewer on a bobtail', () => {
    expect(maxPallets('bobtail', 508, 16000)).toBe(19);
  });

  it('is nothing when the truck is already at the limit empty', () => {
    expect(maxPallets('bobtail', 508, 26000)).toBe(0);
    expect(maxPallets('bobtail', 508, 30000)).toBe(0);
  });
});

describe('palletsToShed', () => {
  it('is nothing on a legal load', () => {
    const weights = loadWeightLb(load, palletsById, 'bloom', 32000);
    expect(palletsToShed(weights, 'semi', 508)).toBe(0);
  });

  it('rounds up to a whole pallet', () => {
    const weights = { payloadLb: 48480, tareLb: 32000, grossLb: 80480 };
    expect(palletsToShed(weights, 'semi', 808)).toBe(1);
  });

  it('sheds several when the truck is well over', () => {
    const weights = { payloadLb: 52000, tareLb: 32000, grossLb: 84000 };
    expect(palletsToShed(weights, 'semi', 808)).toBe(5);
  });
});

describe('averagePalletLb', () => {
  it('averages the pallets on the manifest', () => {
    expect(averagePalletLb(load, palletsById, 'bloom')).toBe(508);
  });

  it('reports to a tenth of a pound', () => {
    const mixed = new Map([
      ['PL-2025-0031', full(31)],
      [
        'PL-2025-0032',
        aPallet({ sequence: 32, positions: ['CY-2025-0321', null, null, null] }),
      ],
    ]);
    expect(averagePalletLb(load, mixed, 'bloom')).toBe(343);
  });
});
