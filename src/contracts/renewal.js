import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber } from '../core/validate.js';
import { addDays, seasonOf } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';
import { makeContract, contractedHives } from './contract.js';

/**
 * Rolling a season over.
 *
 * Almond contracts are signed in the autumn for the following February, and
 * most of them are last year's contract with a new rate and the same blocks.
 * Doing that by hand is where the mistakes come from: a block that was pulled
 * out in March reappears, or the delivery window stays on last year's dates
 * and nobody notices until the truck is loaded.
 *
 * A renewal is therefore built from the old contract rather than typed, and
 * the things that must change are the things this file makes you supply.
 */

export const DEFAULT_RATE_MOVE_BPS = 0;

export function rollDates(contract, seasons = 1) {
  const step = requireInteger(seasons, 'seasons', { min: 1, max: 10 });
  const shift = 364 * step;
  return {
    delivery: {
      start: addDays(contract.delivery.start, shift),
      end: addDays(contract.delivery.end, shift),
    },
    removal: {
      start: addDays(contract.removal.start, shift),
      end: addDays(contract.removal.end, shift),
    },
  };
}

export function movedRate(contract, moveBps) {
  const bps = requireNumber(moveBps ?? DEFAULT_RATE_MOVE_BPS, 'moveBps', {
    min: -5000,
    max: 5000,
  });
  return multiplyMoney(contract.rateCents, 1 + bps / 10000);
}

/**
 * Build next season's contract. The identifier and the signing date have to be
 * supplied, because both are facts about the new agreement rather than the old
 * one, and a renewal that reuses last year's number is the single most common
 * filing mistake this office makes.
 */
export function renewContract(
  contract,
  { id, signedOn, moveBps, blocks, seasons = 1 }
) {
  if (!id || id === contract.id) {
    throw new ValidationError('a renewal needs its own identifier', {
      previous: contract.id,
    });
  }
  const dates = rollDates(contract, seasons);
  const next = makeContract({
    id,
    grower: contract.grower,
    crop: contract.crop,
    blocks: blocks ?? contract.blocks,
    rateCents: movedRate(contract, moveBps),
    terms: contract.terms,
    delivery: dates.delivery,
    removal: dates.removal,
    broker: contract.broker,
    signedOn,
    notes: contract.notes,
  });
  if (next.season <= contract.season) {
    throw new ValidationError('a renewal has to land in a later season', {
      from: contract.season,
      to: next.season,
    });
  }
  return next;
}

export function renewalDifference(before, after) {
  return {
    from: before.id,
    to: after.id,
    seasons: [before.season, after.season],
    rateCents: [before.rateCents, after.rateCents],
    rateMoveBps: Math.round(
      ((after.rateCents - before.rateCents) / before.rateCents) * 10000
    ),
    hives: [contractedHives(before), contractedHives(after)],
    blocksAdded: after.blocks
      .filter(
        (block) => !before.blocks.some((entry) => entry.blockId === block.blockId)
      )
      .map((block) => block.blockId),
    blocksDropped: before.blocks
      .filter((block) => !after.blocks.some((entry) => entry.blockId === block.blockId))
      .map((block) => block.blockId),
  };
}

/** Contracts from a season that have not been renewed into the next one. */
export function unrenewed(contracts, season) {
  const previous = contracts.filter((contract) => contract.season === season);
  const next = contracts.filter((contract) => contract.season === season + 1);
  const renewedGrowers = new Set(next.map((contract) => contract.grower.name));
  return sortBy(
    previous.filter((contract) => !renewedGrowers.has(contract.grower.name)),
    (contract) => contract.id
  );
}

export function renewalBook(contracts, season) {
  const previous = contracts.filter((contract) => contract.season === season);
  return {
    season,
    contracts: previous.length,
    hives: previous.reduce((total, contract) => total + contractedHives(contract), 0),
    unrenewed: unrenewed(contracts, season).map((contract) => contract.id),
    renewalRate:
      previous.length === 0
        ? 0
        : roundTo(
            (previous.length - unrenewed(contracts, season).length) / previous.length,
            2
          ),
  };
}

export function seasonOfRenewal(contract) {
  return seasonOf(contract.delivery.start);
}
