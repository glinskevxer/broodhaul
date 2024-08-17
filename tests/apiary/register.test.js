import { describe, it, expect } from 'vitest';
import {
  buildRegister,
  getYard,
  getColony,
  getPallet,
  coloniesInYard,
  palletsInYard,
  palletFor,
  looseColonies,
  yardOccupancy,
  registerProblems,
} from '../../src/apiary/register.js';
import { transitionColony } from '../../src/apiary/colony.js';
import { aYard, aColony, aPallet } from '../helpers/records.js';

const homeYard = aYard({ sequence: 1, name: 'home place', capacity: 8 });
const riverYard = aYard({ sequence: 2, name: 'river bottom', capacity: 96 });
const first = aColony({ sequence: 11, yardId: 'YD-2025-0001' });
const second = aColony({ sequence: 12, yardId: 'YD-2025-0001' });
const across = aColony({ sequence: 13, yardId: 'YD-2025-0002' });
const loaded = aPallet({
  sequence: 21,
  yardId: 'YD-2025-0001',
  positions: ['CY-2025-0011', 'CY-2025-0012', null, null],
});

const register = () =>
  buildRegister({
    yards: [homeYard, riverYard],
    pallets: [loaded],
    colonies: [first, second, across],
  });

describe('buildRegister', () => {
  it('indexes each kind', () => {
    const built = register();
    expect(built.yards.size).toBe(2);
    expect(built.pallets.size).toBe(1);
    expect(built.colonies.size).toBe(3);
  });

  it('builds the colony to pallet map', () => {
    expect(register().palletOf.get('CY-2025-0011')).toBe('PL-2025-0021');
  });

  it('takes nothing at all', () => {
    expect(buildRegister().colonies.size).toBe(0);
  });

  it('refuses two records sharing an identifier', () => {
    expect(() => buildRegister({ yards: [homeYard, homeYard] })).toThrow(
      /two yard entries share the key/
    );
  });
});

describe('lookups', () => {
  it('find what is there', () => {
    const built = register();
    expect(getYard(built, 'YD-2025-0001').name).toBe('home place');
    expect(getColony(built, 'CY-2025-0011').id).toBe('CY-2025-0011');
    expect(getPallet(built, 'PL-2025-0021').pattern).toBe('four-way');
  });

  it('say what is missing', () => {
    const built = register();
    expect(() => getYard(built, 'YD-2025-0099')).toThrow(
      /no yard with id YD-2025-0099/
    );
    expect(() => getColony(built, 'CY-2025-0099')).toThrow(/no colony with id/);
    expect(() => getPallet(built, 'PL-2025-0099')).toThrow(/no pallet with id/);
  });
});

describe('coloniesInYard', () => {
  it('returns the colonies in one yard, sorted', () => {
    const found = coloniesInYard(register(), 'YD-2025-0001');
    expect(found.map((colony) => colony.id)).toEqual(['CY-2025-0011', 'CY-2025-0012']);
  });

  it('can leave out the ones that are not productive', () => {
    const dead = transitionColony(second, 'dead', '2025-01-04');
    const built = buildRegister({
      yards: [homeYard],
      colonies: [first, dead],
    });
    expect(
      coloniesInYard(built, 'YD-2025-0001', { productiveOnly: true })
    ).toHaveLength(1);
    expect(coloniesInYard(built, 'YD-2025-0001')).toHaveLength(2);
  });

  it('refuses a yard that is not in the register', () => {
    expect(() => coloniesInYard(register(), 'YD-2025-0099')).toThrow(/no yard with id/);
  });
});

describe('palletsInYard and palletFor', () => {
  it('lists the pallets in a yard', () => {
    expect(
      palletsInYard(register(), 'YD-2025-0001').map((pallet) => pallet.id)
    ).toEqual(['PL-2025-0021']);
    expect(palletsInYard(register(), 'YD-2025-0002')).toEqual([]);
  });

  it('finds the pallet a colony is on', () => {
    expect(palletFor(register(), 'CY-2025-0011')).toBe('PL-2025-0021');
  });

  it('returns nothing for a colony sitting on the ground', () => {
    expect(palletFor(register(), 'CY-2025-0013')).toBeUndefined();
  });

  it('refuses a colony that is not in the register', () => {
    expect(() => palletFor(register(), 'CY-2025-0099')).toThrow(/no colony with id/);
  });
});

describe('looseColonies', () => {
  it('finds the productive colonies that are on no pallet', () => {
    expect(looseColonies(register()).map((colony) => colony.id)).toEqual([
      'CY-2025-0013',
    ]);
  });

  it('does not count a dead colony as loose', () => {
    const dead = transitionColony(across, 'dead', '2025-01-04');
    const built = buildRegister({
      yards: [homeYard, riverYard],
      pallets: [loaded],
      colonies: [first, second, dead],
    });
    expect(looseColonies(built)).toEqual([]);
  });
});

describe('yardOccupancy', () => {
  it('reports a row per yard, sorted by identifier', () => {
    const rows = yardOccupancy(register());
    expect(rows.map((row) => row.yardId)).toEqual(['YD-2025-0001', 'YD-2025-0002']);
  });

  it('counts colonies, pallets and pallet positions', () => {
    const [home] = yardOccupancy(register());
    expect(home.colonies).toBe(2);
    expect(home.pallets).toBe(1);
    expect(home.positions).toBe(4);
  });

  it('reports headroom against the yard capacity', () => {
    const [home, river] = yardOccupancy(register());
    expect(home.headroom).toBe(6);
    expect(river.headroom).toBe(95);
  });
});

describe('registerProblems', () => {
  it('is quiet when everything agrees', () => {
    expect(registerProblems(register())).toEqual([]);
  });

  it('reports a pallet pointing at a yard that is gone', () => {
    const built = buildRegister({
      yards: [riverYard],
      pallets: [loaded],
      colonies: [across],
    });
    const kinds = registerProblems(built).map((problem) => problem.kind);
    expect(kinds).toContain('pallet_yard_missing');
  });

  it('reports a colony on a pallet that the register has never seen', () => {
    const built = buildRegister({ yards: [homeYard], pallets: [loaded], colonies: [] });
    const problem = registerProblems(built).find(
      (entry) => entry.kind === 'pallet_colony_missing'
    );
    expect(problem.colony).toBe('CY-2025-0011');
  });

  it('reports a colony whose yard disagrees with its pallet', () => {
    const moved = aColony({ sequence: 11, yardId: 'YD-2025-0002' });
    const built = buildRegister({
      yards: [homeYard, riverYard],
      pallets: [loaded],
      colonies: [moved, second],
    });
    const problem = registerProblems(built).find(
      (entry) => entry.kind === 'yard_disagreement'
    );
    expect(problem).toEqual({
      kind: 'yard_disagreement',
      colony: 'CY-2025-0011',
      colonyYard: 'YD-2025-0002',
      palletYard: 'YD-2025-0001',
      pallet: 'PL-2025-0021',
    });
  });

  it('reports a dead colony still sitting on a pallet', () => {
    const dead = transitionColony(first, 'dead', '2025-01-04');
    const built = buildRegister({
      yards: [homeYard],
      pallets: [loaded],
      colonies: [dead, second],
    });
    const problem = registerProblems(built).find(
      (entry) => entry.kind === 'dead_colony_on_pallet'
    );
    expect(problem.status).toBe('dead');
  });

  it('reports a colony pointing at a yard that is gone', () => {
    const built = buildRegister({ yards: [homeYard], colonies: [across] });
    const kinds = registerProblems(built).map((problem) => problem.kind);
    expect(kinds).toEqual(['colony_yard_missing']);
  });

  it('reports a yard holding more colonies than it can', () => {
    const crowded = aYard({ sequence: 1, capacity: 1 });
    const built = buildRegister({ yards: [crowded], colonies: [first, second] });
    const problem = registerProblems(built).find(
      (entry) => entry.kind === 'yard_over_capacity'
    );
    expect(problem).toEqual({
      kind: 'yard_over_capacity',
      yard: 'YD-2025-0001',
      colonies: 2,
      capacity: 1,
    });
  });
});
