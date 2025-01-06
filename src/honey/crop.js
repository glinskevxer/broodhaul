import { ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber } from '../core/validate.js';
import { roundTo } from '../core/rounding.js';
import { groupBy, sortBy, sumBy } from '../core/collections.js';
import { multiplyMoney } from '../core/money.js';
import { netLb } from './drum.js';
import { lotDrums, lotGrade } from './lot.js';

/**
 * What the crop came to, per colony and per yard.
 *
 * The number the operation lives on is pounds per colony, and it is easy to
 * flatter. Dividing the crop by the colonies standing at extraction counts the
 * splits that were made in May and produced nothing, and dividing by the
 * colonies that went into the yard in March ignores the ones that died. The
 * yield here is worked against the colonies that were in the yard for the
 * whole flow, which is the only figure two seasons can be compared on.
 */

export function makeYardCrop(input) {
  const yardId = input.yardId;
  if (typeof yardId !== 'string' || yardId.length === 0) {
    throw new ValidationError('a yard crop needs a yard', {});
  }
  const coloniesAtStart = requireInteger(input.coloniesAtStart, 'coloniesAtStart', {
    min: 0,
    max: 2000,
  });
  const coloniesAtEnd = requireInteger(input.coloniesAtEnd, 'coloniesAtEnd', {
    min: 0,
    max: 2000,
  });
  if (coloniesAtEnd > coloniesAtStart) {
    throw new ValidationError(
      'a yard cannot end the flow with more colonies than it started',
      {
        coloniesAtStart,
        coloniesAtEnd,
      }
    );
  }
  return {
    yardId,
    season: requireInteger(input.season, 'season', { min: 2000, max: 2999 }),
    coloniesAtStart,
    coloniesAtEnd,
    netLb: roundTo(requireNumber(input.netLb, 'netLb', { min: 0, max: 500000 }), 1),
  };
}

/** Colonies that stood the whole flow, which is what the yield divides by. */
export function standingColonies(crop) {
  return crop.coloniesAtEnd;
}

export function lbPerColony(crop) {
  const standing = standingColonies(crop);
  if (standing === 0) return 0;
  return roundTo(crop.netLb / standing, 1);
}

/** The flattering figure, kept so a report can show both and name the difference. */
export function lbPerColonyAtStart(crop) {
  if (crop.coloniesAtStart === 0) return 0;
  return roundTo(crop.netLb / crop.coloniesAtStart, 1);
}

export function winterLoss(crop) {
  if (crop.coloniesAtStart === 0) return 0;
  return roundTo(
    ((crop.coloniesAtStart - crop.coloniesAtEnd) / crop.coloniesAtStart) * 100,
    1
  );
}

export function seasonTotal(crops, season) {
  const inSeason = crops.filter((crop) => crop.season === season);
  return {
    season,
    yards: inSeason.length,
    netLb: roundTo(
      sumBy(inSeason, (crop) => crop.netLb),
      1
    ),
    colonies: sumBy(inSeason, standingColonies),
    lbPerColony:
      sumBy(inSeason, standingColonies) === 0
        ? 0
        : roundTo(
            sumBy(inSeason, (crop) => crop.netLb) / sumBy(inSeason, standingColonies),
            1
          ),
  };
}

export function bestYards(crops, season, count = 3) {
  const inSeason = crops.filter((crop) => crop.season === season);
  return sortBy(
    inSeason,
    (crop) => -lbPerColony(crop),
    (crop) => crop.yardId
  ).slice(0, requireInteger(count, 'count', { min: 1, max: 100 }));
}

export function seasonOverSeason(crops, from, to) {
  const before = seasonTotal(crops, from);
  const after = seasonTotal(crops, to);
  return {
    from: before,
    to: after,
    netLbChange: roundTo(after.netLb - before.netLb, 1),
    perColonyChange: roundTo(after.lbPerColony - before.lbPerColony, 1),
  };
}

/** Crop value, priced by lot grade because a blend does not fetch a varietal price. */
export function cropValueCents(lots, drumsById, pricesByGrade) {
  let total = 0;
  for (const lot of lots) {
    const grade = lotGrade(lot, drumsById);
    const price = pricesByGrade[grade];
    if (price === undefined) {
      throw new ValidationError(`no price for grade ${grade}`, { grade });
    }
    const pounds = sumBy(lotDrums(lot, drumsById), netLb);
    total += multiplyMoney(price, pounds);
  }
  return total;
}

export function cropByYard(crops) {
  const groups = groupBy(crops, (crop) => crop.yardId);
  return sortBy(
    [...groups.entries()].map(([yardId, entries]) => ({
      yardId,
      seasons: entries.length,
      netLb: roundTo(
        sumBy(entries, (crop) => crop.netLb),
        1
      ),
    })),
    (row) => row.yardId
  );
}
