import { describe, it, expect } from 'vitest';
import {
  PALLET_PATTERNS,
  patternPositions,
  makePallet,
  palletCapacity,
  occupiedCount,
  isFull,
  coloniesOn,
  positionOf,
  setColony,
  clearPosition,
  removeColony,
} from '../../src/apiary/pallet.js';

const base = {
  id: 'PL-2025-0031',
  pattern: 'four-way',
  yardId: 'YD-2025-0004',
  tareLb: 62,
  builtOn: '2024-10-18',
};

const pallet = (overrides = {}) => makePallet({ ...base, ...overrides });

describe('patternPositions', () => {
  it('knows both patterns in the yard', () => {
    expect(patternPositions('four-way')).toBe(4);
    expect(patternPositions('six-way')).toBe(6);
  });

  it('refuses a pattern nobody builds', () => {
    expect(() => patternPositions('eight-way')).toThrow(/unknown pallet pattern/);
  });

  it('agrees with the exported table', () => {
    for (const [pattern, size] of Object.entries(PALLET_PATTERNS)) {
      expect(patternPositions(pattern)).toBe(size);
    }
  });
});

describe('makePallet', () => {
  it('starts empty when no positions are given', () => {
    expect(pallet().positions).toEqual([null, null, null, null]);
  });

  it('sizes the empty pallet to the pattern', () => {
    expect(pallet({ pattern: 'six-way' }).positions).toHaveLength(6);
  });

  it('takes a pallet that is already loaded', () => {
    const loaded = pallet({
      positions: ['CY-2025-0112', null, 'CY-2025-0113', null],
    });
    expect(coloniesOn(loaded)).toEqual(['CY-2025-0112', 'CY-2025-0113']);
  });

  it('refuses a position list the wrong length for the pattern', () => {
    expect(() => pallet({ positions: [null, null] })).toThrow(
      /needs at least 4 entries/
    );
    expect(() =>
      pallet({ pattern: 'four-way', positions: new Array(6).fill(null) })
    ).toThrow(/at most 4 entries/);
  });

  it('refuses something in a position that is not a colony', () => {
    expect(() => pallet({ positions: ['YD-2025-0004', null, null, null] })).toThrow(
      /position 1 does not hold a colony identifier/
    );
  });

  it('refuses the same colony twice on one pallet', () => {
    expect(() =>
      pallet({ positions: ['CY-2025-0112', 'CY-2025-0112', null, null] })
    ).toThrow(/is on the pallet twice/);
  });

  it('holds the tare weight inside what a pallet actually weighs', () => {
    expect(() => pallet({ tareLb: 19 })).toThrow(/at least 20/);
    expect(() => pallet({ tareLb: 201 })).toThrow(/at most 200/);
  });

  it('refuses an unknown key', () => {
    expect(() => makePallet({ ...base, colour: 'blue' })).toThrow(
      /pallet has unknown keys: colour/
    );
  });
});

describe('counting', () => {
  it('reports capacity from the pattern', () => {
    expect(palletCapacity(pallet())).toBe(4);
    expect(palletCapacity(pallet({ pattern: 'six-way' }))).toBe(6);
  });

  it('counts what is on it', () => {
    const loaded = pallet({ positions: ['CY-2025-0112', null, 'CY-2025-0113', null] });
    expect(occupiedCount(loaded)).toBe(2);
    expect(isFull(loaded)).toBe(false);
  });

  it('is full when every position is taken', () => {
    const full = pallet({
      positions: ['CY-2025-0112', 'CY-2025-0113', 'CY-2025-0114', 'CY-2025-0115'],
    });
    expect(isFull(full)).toBe(true);
  });

  it('finds a colony by position, counting from one', () => {
    const loaded = pallet({ positions: [null, 'CY-2025-0113', null, null] });
    expect(positionOf(loaded, 'CY-2025-0113')).toBe(2);
    expect(positionOf(loaded, 'CY-2025-0999')).toBeUndefined();
  });
});

describe('setColony', () => {
  it('fills the first free position when none is named', () => {
    const loaded = setColony(pallet(), 'CY-2025-0112');
    expect(loaded.positions[0]).toBe('CY-2025-0112');
  });

  it('fills the gap left by a removal rather than the end', () => {
    const loaded = pallet({
      positions: ['CY-2025-0112', null, 'CY-2025-0114', 'CY-2025-0115'],
    });
    expect(setColony(loaded, 'CY-2025-0116').positions[1]).toBe('CY-2025-0116');
  });

  it('puts a colony in a named position', () => {
    const loaded = setColony(pallet(), 'CY-2025-0112', 3);
    expect(loaded.positions).toEqual([null, null, 'CY-2025-0112', null]);
  });

  it('leaves the original pallet alone', () => {
    const empty = pallet();
    setColony(empty, 'CY-2025-0112');
    expect(occupiedCount(empty)).toBe(0);
  });

  it('refuses a position outside the pattern', () => {
    expect(() => setColony(pallet(), 'CY-2025-0112', 5)).toThrow(/at most 4/);
    expect(() => setColony(pallet(), 'CY-2025-0112', 0)).toThrow(/at least 1/);
  });

  it('refuses a taken position and names who has it', () => {
    const loaded = setColony(pallet(), 'CY-2025-0112', 2);
    expect(() => setColony(loaded, 'CY-2025-0113', 2)).toThrow(
      /position 2 on PL-2025-0031 is taken/
    );
  });

  it('refuses a colony that is already aboard', () => {
    const loaded = setColony(pallet(), 'CY-2025-0112');
    expect(() => setColony(loaded, 'CY-2025-0112')).toThrow(/is already on pallet/);
  });

  it('refuses to overfill', () => {
    const full = pallet({
      positions: ['CY-2025-0112', 'CY-2025-0113', 'CY-2025-0114', 'CY-2025-0115'],
    });
    expect(() => setColony(full, 'CY-2025-0116')).toThrow(/is full/);
  });
});

describe('clearPosition and removeColony', () => {
  const loaded = pallet({ positions: ['CY-2025-0112', null, 'CY-2025-0114', null] });

  it('empties a named position', () => {
    expect(clearPosition(loaded, 1).positions[0]).toBeNull();
  });

  it('refuses to empty a position that is already empty', () => {
    expect(() => clearPosition(loaded, 2)).toThrow(/is already empty/);
  });

  it('removes a colony wherever it happens to be', () => {
    expect(removeColony(loaded, 'CY-2025-0114').positions[2]).toBeNull();
  });

  it('refuses to remove a colony that is not aboard', () => {
    expect(() => removeColony(loaded, 'CY-2025-0999')).toThrow(/is not on pallet/);
  });

  it('round trips a set and a remove', () => {
    const after = removeColony(setColony(pallet(), 'CY-2025-0112', 4), 'CY-2025-0112');
    expect(after.positions).toEqual(pallet().positions);
  });
});
