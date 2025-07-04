import { ConflictError, RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireNumber,
  requireObject,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney, sumMoney } from '../core/money.js';
import { sortBy, sumBy } from '../core/collections.js';
import { isSaleable, netLb } from './drum.js';

/**
 * Selling the crop.
 *
 * Honey goes out by the truckload to a packer who pays on net weight against a
 * grade. Two things go wrong and both cost real money. A drum over the moisture
 * limit gets rejected at the far end and comes back with freight both ways, so
 * it never goes on the truck. And a load that is under the minimum weight on
 * the contract gets paid at the small lot rate, which is worth less than the
 * cost of an extra pallet of drums, so the loader is told before it leaves.
 */

export const TRUCKLOAD_DRUMS = 80;
export const MINIMUM_LOAD_LB = 40000;
export const SMALL_LOT_PENALTY_BPS = 400;

const SHIPMENT_KEYS = [
  'id',
  'buyer',
  'drums',
  'shippedOn',
  'priceCentsPerLb',
  'freightCents',
  'notes',
];

export function makeShipment(input, drumsById) {
  const raw = requireObject(input, 'shipment');
  rejectUnknownKeys(raw, 'shipment', SHIPMENT_KEYS);
  const drums = (raw.drums ?? []).map((id, at) =>
    requireString(id, `shipment.drums[${at}]`, { max: 20 }).toUpperCase()
  );
  if (drums.length === 0) {
    throw new ValidationError('a shipment needs at least one drum', {});
  }
  if (drums.length > TRUCKLOAD_DRUMS) {
    throw new ValidationError(`a truck holds ${TRUCKLOAD_DRUMS} drums`, {
      drums: drums.length,
    });
  }
  const repeated = drums.find((id, at) => drums.indexOf(id) !== at);
  if (repeated) {
    throw new ConflictError(`drum ${repeated} is on the shipment twice`, {
      drum: repeated,
    });
  }
  for (const id of drums) {
    if (!drumsById.has(id)) {
      throw new ValidationError(`shipment names drum ${id}, which is not on file`, {
        drum: id,
      });
    }
  }
  return {
    id: requireString(raw.id, 'shipment.id', { max: 20 }).toUpperCase(),
    buyer: requireString(raw.buyer, 'shipment.buyer', { max: 80 }),
    drums: sortBy(drums, (id) => id),
    shippedOn: parseDate(raw.shippedOn, 'shipment.shippedOn'),
    priceCentsPerLb: requireInteger(raw.priceCentsPerLb, 'shipment.priceCentsPerLb', {
      min: 50,
      max: 2000,
    }),
    freightCents: requireInteger(raw.freightCents ?? 0, 'shipment.freightCents', {
      min: 0,
      max: 10000000,
    }),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'shipment.notes', { max: 200 })
    ),
  };
}

export function shipmentDrums(shipment, drumsById) {
  return shipment.drums.map((id) => drumsById.get(id));
}

export function shipmentNetLb(shipment, drumsById) {
  return roundTo(sumBy(shipmentDrums(shipment, drumsById), netLb), 1);
}

/** Drums that would be rejected at the packer, checked before the truck loads. */
export function rejectableDrums(shipment, drumsById) {
  return shipmentDrums(shipment, drumsById).filter((drum) => !isSaleable(drum));
}

export function checkShippable(shipment, drumsById) {
  const rejects = rejectableDrums(shipment, drumsById);
  if (rejects.length > 0) {
    throw new RuleViolation(
      'HP-1',
      `${rejects.length} drums are over the moisture limit and will come back`,
      { drums: rejects.map((drum) => drum.id) }
    );
  }
  return true;
}

export function isSmallLot(shipment, drumsById) {
  return shipmentNetLb(shipment, drumsById) < MINIMUM_LOAD_LB;
}

/** The price actually paid, after the small lot deduction where it applies. */
export function paidPriceCentsPerLb(shipment, drumsById) {
  if (!isSmallLot(shipment, drumsById)) return shipment.priceCentsPerLb;
  return multiplyMoney(shipment.priceCentsPerLb, 1 - SMALL_LOT_PENALTY_BPS / 10000);
}

export function grossCents(shipment, drumsById) {
  return multiplyMoney(
    paidPriceCentsPerLb(shipment, drumsById),
    shipmentNetLb(shipment, drumsById)
  );
}

export function netCents(shipment, drumsById) {
  return sumMoney([grossCents(shipment, drumsById), -shipment.freightCents]);
}

/** Pounds still needed to clear the minimum, which is what the loader asks. */
export function shortOfMinimumLb(shipment, drumsById) {
  const net = shipmentNetLb(shipment, drumsById);
  return net >= MINIMUM_LOAD_LB ? 0 : roundTo(MINIMUM_LOAD_LB - net, 1);
}

export function drumsToAdd(shipment, drumsById, averageDrumLb = 640) {
  const short = shortOfMinimumLb(shipment, drumsById);
  if (short === 0) return 0;
  return Math.ceil(short / requireNumber(averageDrumLb, 'averageDrumLb', { min: 1 }));
}

export function shipmentSummary(shipment, drumsById) {
  return {
    id: shipment.id,
    buyer: shipment.buyer,
    drums: shipment.drums.length,
    netLb: shipmentNetLb(shipment, drumsById),
    smallLot: isSmallLot(shipment, drumsById),
    priceCentsPerLb: paidPriceCentsPerLb(shipment, drumsById),
    grossCents: grossCents(shipment, drumsById),
    freightCents: shipment.freightCents,
    netCents: netCents(shipment, drumsById),
    rejectable: rejectableDrums(shipment, drumsById).length,
  };
}
