import { ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf } from '../core/validate.js';
import { allocate } from '../core/money.js';
import { sumBy } from '../core/collections.js';
import { PALLET_PATTERNS, patternPositions } from '../apiary/pallet.js';
import { blockHives } from '../contracts/contract.js';

/**
 * Turn a contract into a set of drops before anything leaves the yard.
 *
 * Two constraints fight here. The agronomy wants the hives spread, so no drop
 * should be bigger than a few dozen and every block gets its own drops. The
 * forklift wants whole pallets, because setting three hives off a four way
 * pallet means the other one rides around the orchard all morning. The plan
 * gives the forklift its way on every drop but the last one in a block, which
 * carries whatever is left over.
 */

export const DEFAULT_MAX_PER_DROP = 48;

export function dropsNeeded(hives, maxPerDrop = DEFAULT_MAX_PER_DROP) {
  const count = requireInteger(hives, 'hives', { min: 0 });
  const cap = requireInteger(maxPerDrop, 'maxPerDrop', { min: 4, max: 200 });
  if (count === 0) return 0;
  return Math.ceil(count / cap);
}

/**
 * Split `hives` into `count` drops, each a whole number of pallets except the
 * last, which takes the remainder.
 */
export function splitIntoDrops(hives, count, pattern = 'four-way') {
  const total = requireInteger(hives, 'hives', { min: 0 });
  const drops = requireInteger(count, 'count', { min: 0 });
  requireOneOf(pattern, 'pattern', Object.keys(PALLET_PATTERNS));
  if (drops === 0) {
    if (total > 0) {
      throw new ValidationError('cannot split hives across no drops', { hives: total });
    }
    return [];
  }
  const positions = patternPositions(pattern);
  const wholePallets = Math.floor(total / positions);
  const remainder = total - wholePallets * positions;
  const shares = allocate(wholePallets, new Array(drops).fill(1)).map(
    (pallets) => pallets * positions
  );
  shares[shares.length - 1] += remainder;
  return shares;
}

/** Drops for one block, sized and named, before anybody picks a spot for them. */
export function planBlockDrops(block, options = {}) {
  const { maxPerDrop = DEFAULT_MAX_PER_DROP, pattern = 'four-way' } = options;
  const hives = blockHives(block);
  const count = dropsNeeded(hives, maxPerDrop);
  return splitIntoDrops(hives, count, pattern).map((ordered, at) => ({
    blockId: block.blockId,
    sequence: at + 1,
    ordered,
  }));
}

export function planContractDrops(contract, options = {}) {
  return contract.blocks.flatMap((block) => planBlockDrops(block, options));
}

export function planTotal(plan) {
  return sumBy(plan, (entry) => entry.ordered);
}

/**
 * What the plan asks the yard for, against what the yard has. A plan that
 * cannot be filled is not an error, it is the reason the dispatcher rings the
 * grower before the truck is loaded rather than after.
 */
export function planShortfall(plan, availableHives) {
  const available = requireInteger(availableHives, 'availableHives', { min: 0 });
  const wanted = planTotal(plan);
  return {
    wanted,
    available,
    short: Math.max(0, wanted - available),
    fillable: available >= wanted,
  };
}

export function planByBlock(plan) {
  const totals = new Map();
  for (const entry of plan) {
    totals.set(entry.blockId, (totals.get(entry.blockId) ?? 0) + entry.ordered);
  }
  return [...totals.entries()]
    .map(([blockId, hives]) => ({ blockId, hives }))
    .sort((left, right) => left.blockId.localeCompare(right.blockId));
}

export function describePlan(plan) {
  return plan
    .map((entry) => `${entry.blockId} drop ${entry.sequence}: ${entry.ordered} hives`)
    .join('\n');
}
