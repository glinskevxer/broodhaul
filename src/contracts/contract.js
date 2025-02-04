import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireInteger,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { compareDates, parseDate, seasonOf } from '../core/dates.js';
import { makeSpan, spanContains, spansOverlap } from '../core/span.js';
import { parseId } from '../core/ids.js';
import { multiplyMoney, sumMoney } from '../core/money.js';
import { makeTerms } from './terms.js';

/**
 * A pollination contract: somebody's orchard, a number of hives per acre, a
 * rate per hive, a window to get them in and a window to get them out.
 *
 * The hive count is derived from the blocks rather than typed in. Growers add
 * and drop blocks right up to bloom and a typed total goes stale the first
 * time they do, which is how an outfit ends up hauling four hundred hives to a
 * block that was pulled out of the contract in December.
 */

export const CROPS = [
  'almond',
  'cherry',
  'apple',
  'blueberry',
  'melon',
  'seed alfalfa',
  'sunflower',
];

const CONTRACT_KEYS = [
  'id',
  'season',
  'grower',
  'crop',
  'blocks',
  'rateCents',
  'terms',
  'delivery',
  'removal',
  'broker',
  'signedOn',
  'notes',
];

function parseGrower(value) {
  const grower = requireObject(value, 'grower');
  rejectUnknownKeys(grower, 'grower', ['name', 'ranch', 'county']);
  return {
    name: requireString(grower.name, 'grower.name', { max: 80 }),
    ranch: optional(grower.ranch, (ranch) =>
      requireString(ranch, 'grower.ranch', { max: 80 })
    ),
    county: requireString(grower.county, 'grower.county', { max: 40 }),
  };
}

function parseBlocks(value) {
  const blocks = requireArray(value, 'contract.blocks', { min: 1, max: 60 }).map(
    (entry, at) => {
      const block = requireObject(entry, `contract.blocks[${at}]`);
      rejectUnknownKeys(block, `contract.blocks[${at}]`, [
        'blockId',
        'acres',
        'hivesPerAcre',
      ]);
      return {
        blockId: parseId(block.blockId, 'block').id,
        acres: requireNumber(block.acres, `contract.blocks[${at}].acres`, {
          min: 0.25,
          max: 2000,
        }),
        hivesPerAcre: requireNumber(
          block.hivesPerAcre,
          `contract.blocks[${at}].hivesPerAcre`,
          { min: 0.25, max: 6 }
        ),
      };
    }
  );
  const ids = blocks.map((block) => block.blockId);
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated) {
    throw new ValidationError(`block ${repeated} is on the contract twice`, {
      block: repeated,
    });
  }
  return blocks;
}

function parseBroker(value) {
  const broker = requireObject(value, 'broker');
  rejectUnknownKeys(broker, 'broker', ['name', 'commissionBps']);
  return {
    name: requireString(broker.name, 'broker.name', { max: 80 }),
    commissionBps: requireInteger(broker.commissionBps, 'broker.commissionBps', {
      min: 0,
      max: 2000,
    }),
  };
}

export function makeContract(input) {
  const raw = requireObject(input, 'contract');
  rejectUnknownKeys(raw, 'contract', CONTRACT_KEYS);
  const delivery = makeSpan(raw.delivery?.start, raw.delivery?.end);
  const removal = makeSpan(raw.removal?.start, raw.removal?.end);
  if (compareDates(removal.start, delivery.start) < 0) {
    throw new ValidationError('removal cannot open before delivery does', {
      delivery: delivery.start,
      removal: removal.start,
    });
  }
  const signedOn = parseDate(raw.signedOn, 'contract.signedOn');
  if (compareDates(signedOn, delivery.end) > 0) {
    throw new ValidationError('the contract was signed after delivery closed', {
      signedOn,
      deliveryEnd: delivery.end,
    });
  }
  const season = seasonOf(delivery.start);
  if (raw.season !== undefined && raw.season !== season) {
    throw new ValidationError(
      `contract season ${raw.season} does not match the delivery window`,
      { season, given: raw.season }
    );
  }
  return {
    id: parseId(raw.id, 'contract').id,
    season,
    grower: parseGrower(raw.grower),
    crop: requireOneOf(raw.crop, 'contract.crop', CROPS),
    blocks: parseBlocks(raw.blocks),
    rateCents: requireInteger(raw.rateCents, 'contract.rateCents', {
      min: 1000,
      max: 100000,
    }),
    terms: makeTerms(raw.terms),
    delivery,
    removal,
    broker: optional(raw.broker, parseBroker),
    signedOn,
    notes: optional(raw.notes, (note) =>
      requireString(note, 'contract.notes', { max: 400 })
    ),
  };
}

/** Hives owed on one block, rounded up because you cannot set two thirds of a hive. */
export function blockHives(block) {
  return Math.ceil(block.acres * block.hivesPerAcre);
}

export function contractedHives(contract) {
  return contract.blocks.reduce((total, block) => total + blockHives(block), 0);
}

export function contractAcres(contract) {
  return (
    Math.round(contract.blocks.reduce((total, block) => total + block.acres, 0) * 100) /
    100
  );
}

export function contractValueCents(contract) {
  return multiplyMoney(contract.rateCents, contractedHives(contract));
}

export function commissionCents(contract) {
  if (!contract.broker) return 0;
  return Math.round(
    (contractValueCents(contract) * contract.broker.commissionBps) / 10000
  );
}

export function netToOperationCents(contract) {
  return sumMoney([contractValueCents(contract), -commissionCents(contract)]);
}

export function deliveryOpen(contract, date) {
  return spanContains(contract.delivery, date);
}

export function removalOpen(contract, date) {
  return spanContains(contract.removal, date);
}

/** Two contracts a crew cannot serve at once, because their delivery windows collide. */
export function windowsCollide(left, right) {
  return spansOverlap(left.delivery, right.delivery);
}
