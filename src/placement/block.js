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
import { roundTo } from '../core/rounding.js';
import { parseId } from '../core/ids.js';
import { CROPS } from '../contracts/contract.js';

/**
 * An orchard block: the piece of ground the hives actually go on.
 *
 * The variety mix is the part that matters to us rather than to the grower. A
 * solid block of one almond variety sets nothing without a pollinizer, so a
 * block with a thin pollinizer share needs more hives per acre to move the
 * pollen the same distance. Self fertile plantings turn that on its head and
 * need fewer. The block record carries the mix so the density rule can read it
 * instead of somebody remembering which ranch is which.
 */

const BLOCK_KEYS = [
  'id',
  'name',
  'crop',
  'acres',
  'varieties',
  'plantedYear',
  'rowSpacingFt',
  'treeSpacingFt',
  'location',
  'notes',
];

function parseVarieties(value) {
  const varieties = requireArray(value, 'block.varieties', { min: 1, max: 8 }).map(
    (entry, at) => {
      const variety = requireObject(entry, `block.varieties[${at}]`);
      rejectUnknownKeys(variety, `block.varieties[${at}]`, [
        'name',
        'share',
        'selfFertile',
      ]);
      return {
        name: requireString(variety.name, `block.varieties[${at}].name`, { max: 40 }),
        share: requireNumber(variety.share, `block.varieties[${at}].share`, {
          min: 0.01,
          max: 1,
        }),
        selfFertile: Boolean(variety.selfFertile),
      };
    }
  );
  const total = roundTo(
    varieties.reduce((sum, variety) => sum + variety.share, 0),
    4
  );
  if (total !== 1) {
    throw new ValidationError(`variety shares add to ${total}, they must add to 1`, {
      total,
    });
  }
  const names = varieties.map((variety) => variety.name);
  const repeated = names.find((name, at) => names.indexOf(name) !== at);
  if (repeated) {
    throw new ValidationError(`variety ${repeated} is listed twice`, {
      variety: repeated,
    });
  }
  return varieties;
}

export function makeBlock(input) {
  const raw = requireObject(input, 'block');
  rejectUnknownKeys(raw, 'block', BLOCK_KEYS);
  const location = requireObject(raw.location, 'block.location');
  rejectUnknownKeys(location, 'block.location', ['latitude', 'longitude']);
  return {
    id: parseId(raw.id, 'block').id,
    name: requireString(raw.name, 'block.name', { max: 60 }),
    crop: requireOneOf(raw.crop, 'block.crop', CROPS),
    acres: requireNumber(raw.acres, 'block.acres', { min: 0.25, max: 2000 }),
    varieties: parseVarieties(raw.varieties),
    plantedYear: requireInteger(raw.plantedYear, 'block.plantedYear', {
      min: 1950,
      max: 2100,
    }),
    rowSpacingFt: requireNumber(raw.rowSpacingFt, 'block.rowSpacingFt', {
      min: 8,
      max: 40,
    }),
    treeSpacingFt: requireNumber(raw.treeSpacingFt, 'block.treeSpacingFt', {
      min: 4,
      max: 40,
    }),
    location: {
      latitude: requireNumber(location.latitude, 'block.location.latitude', {
        min: -90,
        max: 90,
      }),
      longitude: requireNumber(location.longitude, 'block.location.longitude', {
        min: -180,
        max: 180,
      }),
    },
    notes: optional(raw.notes, (note) =>
      requireString(note, 'block.notes', { max: 300 })
    ),
  };
}

const SQUARE_FEET_PER_ACRE = 43560;

export function treesPerAcre(block) {
  return Math.floor(SQUARE_FEET_PER_ACRE / (block.rowSpacingFt * block.treeSpacingFt));
}

export function blockTrees(block) {
  return Math.floor(treesPerAcre(block) * block.acres);
}

export function blockAge(block, season) {
  return season - block.plantedYear;
}

/** True while the planting is too young to be worth setting bees on. */
export function isYoungPlanting(block, season) {
  return blockAge(block, season) < 3;
}

export function mainVariety(block) {
  return block.varieties.reduce((best, variety) =>
    variety.share > best.share ? variety : best
  );
}

/** The share of the block that is not the main variety, which is what carries pollen. */
export function pollinizerShare(block) {
  return roundTo(1 - mainVariety(block).share, 4);
}

export function isSelfFertile(block) {
  return block.varieties.every((variety) => variety.selfFertile);
}

export function describeBlock(block) {
  const mix = block.varieties
    .map((variety) => `${variety.name} ${Math.round(variety.share * 100)}%`)
    .join(', ');
  return `${block.name} (${block.id}) ${block.acres} acres of ${block.crop}: ${mix}`;
}
