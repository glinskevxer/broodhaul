import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireOneOf } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { TRUCK_KINDS } from './load.js';

/**
 * What a load weighs, and whether the scale house is going to mind.
 *
 * A hive is not one weight. In February it is a two deep colony with a few
 * frames of honey and it goes about a hundred and ten pounds; coming off a
 * summer flow the same box is nearer two hundred and the truck that carried
 * twenty two pallets in the spring carries fourteen. The season stage is
 * therefore an input to every weight question here, and leaving it out is how
 * an outfit gets a ticket on the Grapevine.
 */

export const SEASON_STAGES = ['winter', 'bloom', 'flow', 'fall'];

/** Pounds for one colony, by stage, measured on this outfit's own scale. */
export const COLONY_WEIGHT_LB = {
  winter: 95,
  bloom: 110,
  flow: 185,
  fall: 140,
};

/** Legal gross by truck kind, in pounds, before any permit. */
export const GROSS_LIMIT_LB = {
  semi: 80000,
  bobtail: 26000,
  flatbed: 33000,
};

export const NET_WRAP_LB = 6;

export function colonyWeightLb(stage) {
  requireOneOf(stage, 'stage', SEASON_STAGES);
  return COLONY_WEIGHT_LB[stage];
}

export function grossLimitLb(kind) {
  requireOneOf(kind, 'kind', TRUCK_KINDS);
  return GROSS_LIMIT_LB[kind];
}

/** One pallet, loaded: its own tare, the colonies on it, and the net over the top. */
export function palletWeightLb(pallet, stage) {
  const colonies = pallet.positions.filter((entry) => entry !== null).length;
  return pallet.tareLb + colonies * colonyWeightLb(stage) + NET_WRAP_LB;
}

export function loadWeightLb(load, palletsById, stage, tareLb) {
  const empty = requireNumber(tareLb, 'tareLb', { min: 8000, max: 40000 });
  let payload = 0;
  for (const palletId of load.pallets) {
    const pallet = palletsById.get(palletId);
    if (!pallet) {
      throw new ValidationError(
        `load ${load.id} names pallet ${palletId}, which is not on file`,
        {
          load: load.id,
          pallet: palletId,
        }
      );
    }
    payload += palletWeightLb(pallet, stage);
  }
  return { payloadLb: payload, tareLb: empty, grossLb: payload + empty };
}

export function overweightBy(weights, kind) {
  const limit = grossLimitLb(kind);
  return Math.max(0, weights.grossLb - limit);
}

export function isLegal(weights, kind) {
  return overweightBy(weights, kind) === 0;
}

/** How many pallets of a given weight the truck can legally take. */
export function maxPallets(kind, palletLb, tareLb) {
  const limit = grossLimitLb(kind);
  const each = requireNumber(palletLb, 'palletLb', { min: 1 });
  const empty = requireNumber(tareLb, 'tareLb', { min: 0 });
  if (empty >= limit) return 0;
  return Math.floor((limit - empty) / each);
}

/**
 * The pallets that have to come off, given what is aboard. Reported as a count
 * rather than a list, because which ones come off is the loader's call and
 * depends on what is going where.
 */
export function palletsToShed(weights, kind, palletLb) {
  const over = overweightBy(weights, kind);
  if (over === 0) return 0;
  return Math.ceil(over / requireNumber(palletLb, 'palletLb', { min: 1 }));
}

export function averagePalletLb(load, palletsById, stage) {
  const count = requireInteger(load.pallets.length, 'pallets', { min: 1 });
  const total = load.pallets.reduce(
    (sum, palletId) => sum + palletWeightLb(palletsById.get(palletId), stage),
    0
  );
  return roundTo(total / count, 1);
}
