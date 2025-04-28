import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_KINDS,
  PER_COLONY,
  EQUIPMENT_LIFE,
  requireKind,
  makeHolding,
  piecesFor,
  requirementFor,
  attritionFor,
  shortfallFor,
  purchaseCostCents,
  replacementValueCents,
  depreciatedValueCents,
  inventoryReport,
} from '../../src/apiary/equipment.js';

const holding = (kind, onHand, averageAgeSeasons = 0) =>
  makeHolding({ kind, onHand, averageAgeSeasons });

describe('the catalogue', () => {
  it('has a per colony figure and a life for every kind', () => {
    for (const kind of EQUIPMENT_KINDS) {
      expect(PER_COLONY[kind]).toBeGreaterThanOrEqual(0);
      expect(EQUIPMENT_LIFE[kind].seasons).toBeGreaterThan(0);
      expect(EQUIPMENT_LIFE[kind].replacementCents).toBeGreaterThan(0);
    }
  });

  it('refuses a kind nobody stocks', () => {
    expect(() => requireKind('nuc box')).toThrow(/must be one of/);
  });

  it('wears frames out faster than boxes', () => {
    expect(EQUIPMENT_LIFE.frame.seasons).toBeLessThan(
      EQUIPMENT_LIFE['deep box'].seasons
    );
  });
});

describe('makeHolding', () => {
  it('defaults the age to nothing', () => {
    expect(holding('deep box', 400).averageAgeSeasons).toBe(0);
  });

  it('refuses a negative count', () => {
    expect(() => holding('deep box', -1)).toThrow(/at least 0/);
  });

  it('refuses an age no woodenware reaches', () => {
    expect(() => holding('deep box', 10, 40)).toThrow(/at most 30/);
  });
});

describe('piecesFor and requirementFor', () => {
  it('scales with the colony count', () => {
    expect(piecesFor('deep box', 100)).toBe(200);
    expect(piecesFor('frame', 100)).toBe(2000);
  });

  it('is nothing for a kind this outfit does not run', () => {
    expect(piecesFor('excluder', 100)).toBe(0);
  });

  it('leaves the unused kinds off the requirement', () => {
    const kinds = requirementFor(100).map((row) => row.kind);
    expect(kinds).not.toContain('excluder');
    expect(kinds).toContain('deep box');
  });

  it('is empty for no colonies', () => {
    expect(requirementFor(0)).toEqual([]);
  });
});

describe('attritionFor', () => {
  it('is nothing on new woodenware', () => {
    expect(attritionFor(holding('deep box', 800, 0))).toBe(0);
  });

  it('rises with the average age', () => {
    const young = attritionFor(holding('deep box', 800, 2));
    const old = attritionFor(holding('deep box', 800, 6));
    expect(old).toBeGreaterThan(young);
  });

  it('tops out once the average age passes the life', () => {
    const atLife = attritionFor(holding('deep box', 800, 8));
    const past = attritionFor(holding('deep box', 800, 20));
    expect(past).toBe(atLife);
  });

  it('rounds a part piece up', () => {
    expect(attritionFor(holding('lid', 10, 3))).toBe(1);
  });
});

describe('shortfallFor', () => {
  it('says to buy everything when nothing is on hand', () => {
    const rows = shortfallFor([], 100);
    expect(rows.find((row) => row.kind === 'deep box')).toEqual({
      kind: 'deep box',
      needed: 200,
      onHand: 0,
      attrition: 0,
      usable: 0,
      buy: 200,
    });
  });

  it('buys nothing when there is plenty of new gear', () => {
    const rows = shortfallFor([holding('deep box', 400)], 100);
    expect(rows.find((row) => row.kind === 'deep box').buy).toBe(0);
  });

  it('takes the attrition off before deciding', () => {
    const rows = shortfallFor([holding('lid', 100, 5)], 100);
    const lids = rows.find((row) => row.kind === 'lid');
    expect(lids.attrition).toBeGreaterThan(0);
    expect(lids.buy).toBe(lids.needed - lids.usable);
  });

  it('covers every kind the requirement names', () => {
    const rows = shortfallFor([], 50);
    expect(rows.map((row) => row.kind).sort()).toEqual(
      requirementFor(50)
        .map((row) => row.kind)
        .sort()
    );
  });
});

describe('costs', () => {
  it('prices what has to be bought', () => {
    const rows = shortfallFor([], 10);
    expect(purchaseCostCents(rows)).toBe(
      20 * 2200 + 10 * 1800 + 10 * 2100 + 200 * 190 + 10 * 1400
    );
  });

  it('is nothing when there is nothing to buy', () => {
    const rows = shortfallFor(
      [
        holding('deep box', 400),
        holding('bottom board', 400),
        holding('lid', 400),
        holding('frame', 4000),
        holding('feeder', 400),
      ],
      100
    );
    expect(purchaseCostCents(rows)).toBe(0);
  });

  it('values what is on hand at replacement', () => {
    expect(replacementValueCents([holding('deep box', 100)])).toBe(220000);
  });

  it('depreciates straight line', () => {
    expect(depreciatedValueCents(holding('deep box', 100, 4))).toBe(110000);
    expect(depreciatedValueCents(holding('deep box', 100, 0))).toBe(220000);
  });

  it('never depreciates below nothing', () => {
    expect(depreciatedValueCents(holding('deep box', 100, 20))).toBe(0);
  });
});

describe('inventoryReport', () => {
  it('puts the lines in kind order', () => {
    const report = inventoryReport([holding('deep box', 100, 2)], 100);
    const kinds = report.lines.map((row) => row.kind);
    expect(kinds).toEqual([...kinds].sort());
  });

  it('carries the three money figures', () => {
    const report = inventoryReport([holding('deep box', 100, 4)], 50);
    expect(report.replacementValueCents).toBe(220000);
    expect(report.depreciatedValueCents).toBe(110000);
    expect(report.buyCostCents).toBeGreaterThan(0);
  });

  it('needs nothing for no colonies', () => {
    const report = inventoryReport([holding('deep box', 100)], 0);
    expect(report.lines).toEqual([]);
    expect(report.buyCostCents).toBe(0);
  });
});
