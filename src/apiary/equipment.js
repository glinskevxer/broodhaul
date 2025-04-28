import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney } from '../core/money.js';
import { sortBy, sumBy } from '../core/collections.js';

/**
 * Woodenware.
 *
 * Boxes, lids, bottom boards and frames are the second largest number on the
 * balance sheet after the bees, and unlike the bees they do not replace
 * themselves. Every piece has a life in seasons and a replacement cost, and
 * the question the office asks each autumn is how much of it has to be bought
 * before the splits go out in spring.
 */

export const EQUIPMENT_KINDS = [
  'deep box',
  'medium box',
  'bottom board',
  'lid',
  'frame',
  'excluder',
  'feeder',
];

/** Pieces one colony needs, by kind, for a two deep outfit running four ways. */
export const PER_COLONY = {
  'deep box': 2,
  'medium box': 0,
  'bottom board': 1,
  lid: 1,
  frame: 20,
  excluder: 0,
  feeder: 1,
};

/** Seasons a piece lasts before it goes on the burn pile, and what a new one costs. */
export const EQUIPMENT_LIFE = {
  'deep box': { seasons: 8, replacementCents: 2200 },
  'medium box': { seasons: 8, replacementCents: 1900 },
  'bottom board': { seasons: 6, replacementCents: 1800 },
  lid: { seasons: 6, replacementCents: 2100 },
  frame: { seasons: 4, replacementCents: 190 },
  excluder: { seasons: 10, replacementCents: 900 },
  feeder: { seasons: 5, replacementCents: 1400 },
};

export function requireKind(kind) {
  return requireOneOf(kind, 'kind', EQUIPMENT_KINDS);
}

export function makeHolding(input) {
  const kind = requireKind(input.kind);
  const onHand = requireInteger(input.onHand, 'onHand', { min: 0, max: 500000 });
  const averageAgeSeasons = requireNumber(
    input.averageAgeSeasons ?? 0,
    'averageAgeSeasons',
    {
      min: 0,
      max: 30,
    }
  );
  return { kind, onHand, averageAgeSeasons };
}

export function piecesFor(kind, colonies) {
  requireKind(kind);
  const count = requireInteger(colonies, 'colonies', { min: 0, max: 100000 });
  return PER_COLONY[kind] * count;
}

/** What the whole outfit needs to run a given colony count. */
export function requirementFor(colonies) {
  return EQUIPMENT_KINDS.map((kind) => ({
    kind,
    needed: piecesFor(kind, colonies),
  })).filter((row) => row.needed > 0);
}

/** Pieces expected to fail this season, from the age of what is on hand. */
export function attritionFor(holding) {
  const life = EQUIPMENT_LIFE[holding.kind];
  if (!life) {
    throw new ValidationError(`no life recorded for ${holding.kind}`, {
      kind: holding.kind,
    });
  }
  const share = Math.min(1, holding.averageAgeSeasons / life.seasons);
  return Math.ceil(holding.onHand * share * (1 / life.seasons));
}

export function shortfallFor(holdings, colonies) {
  const byKind = new Map(holdings.map((holding) => [holding.kind, holding]));
  return requirementFor(colonies).map((row) => {
    const holding = byKind.get(row.kind) ?? makeHolding({ kind: row.kind, onHand: 0 });
    const attrition = attritionFor(holding);
    const usable = Math.max(0, holding.onHand - attrition);
    return {
      kind: row.kind,
      needed: row.needed,
      onHand: holding.onHand,
      attrition,
      usable,
      buy: Math.max(0, row.needed - usable),
    };
  });
}

export function purchaseCostCents(shortfall) {
  return sumBy(shortfall, (row) =>
    multiplyMoney(EQUIPMENT_LIFE[row.kind].replacementCents, row.buy)
  );
}

export function replacementValueCents(holdings) {
  return sumBy(holdings, (holding) =>
    multiplyMoney(EQUIPMENT_LIFE[holding.kind].replacementCents, holding.onHand)
  );
}

/** Straight line, floored at nothing, which is how the accountant does it. */
export function depreciatedValueCents(holding) {
  const life = EQUIPMENT_LIFE[holding.kind];
  const remaining = Math.max(0, 1 - holding.averageAgeSeasons / life.seasons);
  return multiplyMoney(
    multiplyMoney(life.replacementCents, holding.onHand),
    roundTo(remaining, 4)
  );
}

export function inventoryReport(holdings, colonies) {
  const shortfall = shortfallFor(holdings, colonies);
  return {
    colonies,
    lines: sortBy(shortfall, (row) => row.kind),
    buyCostCents: purchaseCostCents(shortfall),
    replacementValueCents: replacementValueCents(holdings),
    depreciatedValueCents: sumBy(holdings, depreciatedValueCents),
  };
}
