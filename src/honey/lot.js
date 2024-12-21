import { ConflictError, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireObject,
  requireString,
} from '../core/validate.js';
import { compareDates, parseDate } from '../core/dates.js';
import { makeSpan } from '../core/span.js';
import { parseId } from '../core/ids.js';
import { countBy, sortBy } from '../core/collections.js';
import { averageMoisture, isSaleable, netLb, totalNetLb } from './drum.js';

/**
 * An extraction lot: the drums that came off one run of the extractor.
 *
 * A lot is what the buyer buys and what a recall would follow, so it has to
 * name the yards the supers came off and the days the extractor ran. Mixing
 * two floral sources into one lot is allowed and common, but the lot then
 * grades as the weaker of them and sells as wildflower, which is worth a good
 * deal less. The lot record therefore works out its own grade rather than
 * letting somebody type in the one they were hoping for.
 */

export const LOT_GRADES = ['single source', 'blend', 'wildflower'];

const LOT_KEYS = ['id', 'drums', 'yardIds', 'extractedFrom', 'extractedTo', 'notes'];

export function makeLot(input, drumsById) {
  const raw = requireObject(input, 'lot');
  rejectUnknownKeys(raw, 'lot', LOT_KEYS);
  const drumIds = requireArray(raw.drums, 'lot.drums', { min: 1, max: 200 }).map(
    (id, at) => requireString(id, `lot.drums[${at}]`, { max: 20 }).toUpperCase()
  );
  const repeated = drumIds.find((id, at) => drumIds.indexOf(id) !== at);
  if (repeated) {
    throw new ConflictError(`drum ${repeated} is in the lot twice`, { drum: repeated });
  }
  for (const id of drumIds) {
    if (!drumsById.has(id)) {
      throw new ValidationError(`lot names drum ${id}, which is not on file`, {
        drum: id,
      });
    }
  }
  const extractedFrom = parseDate(raw.extractedFrom, 'lot.extractedFrom');
  const extractedTo = parseDate(raw.extractedTo, 'lot.extractedTo');
  if (compareDates(extractedFrom, extractedTo) > 0) {
    throw new ValidationError('a lot cannot finish before it started', {
      extractedFrom,
      extractedTo,
    });
  }
  const yardIds = requireArray(raw.yardIds, 'lot.yardIds', { min: 1, max: 60 }).map(
    (id) => parseId(id, 'yard').id
  );
  return {
    id: parseId(raw.id, 'lot').id,
    drums: sortBy(drumIds, (id) => id),
    yardIds: sortBy([...new Set(yardIds)], (id) => id),
    extractedFrom,
    extractedTo,
    notes: optional(raw.notes, (note) =>
      requireString(note, 'lot.notes', { max: 300 })
    ),
  };
}

export function lotDrums(lot, drumsById) {
  return lot.drums.map((id) => drumsById.get(id));
}

export function lotSpan(lot) {
  return makeSpan(lot.extractedFrom, lot.extractedTo);
}

export function lotNetLb(lot, drumsById) {
  return totalNetLb(lotDrums(lot, drumsById));
}

export function lotMoisture(lot, drumsById) {
  return averageMoisture(lotDrums(lot, drumsById));
}

/** Floral sources in the lot, with the net pounds of each, heaviest first. */
export function lotSources(lot, drumsById) {
  const totals = new Map();
  for (const drum of lotDrums(lot, drumsById)) {
    totals.set(drum.floralSource, (totals.get(drum.floralSource) ?? 0) + netLb(drum));
  }
  return sortBy(
    [...totals.entries()].map(([source, lb]) => ({ source, lb })),
    (row) => -row.lb,
    (row) => row.source
  );
}

/**
 * A lot of one source sells as that source. Two sells as a blend of the
 * heavier one. Three or more is wildflower whatever went into it.
 */
export function lotGrade(lot, drumsById) {
  const sources = lotSources(lot, drumsById);
  if (sources.length === 1) return 'single source';
  if (sources.length === 2) return 'blend';
  return 'wildflower';
}

export function lotLabel(lot, drumsById) {
  const grade = lotGrade(lot, drumsById);
  const sources = lotSources(lot, drumsById);
  if (grade === 'wildflower') return 'wildflower';
  if (grade === 'blend') return `${sources[0].source} blend`;
  return sources[0].source;
}

export function unsaleableDrums(lot, drumsById) {
  return lotDrums(lot, drumsById).filter((drum) => !isSaleable(drum));
}

export function lotSummary(lot, drumsById) {
  const drums = lotDrums(lot, drumsById);
  return {
    id: lot.id,
    drums: drums.length,
    netLb: lotNetLb(lot, drumsById),
    moisturePct: lotMoisture(lot, drumsById),
    grade: lotGrade(lot, drumsById),
    label: lotLabel(lot, drumsById),
    yards: lot.yardIds.length,
    unsaleable: unsaleableDrums(lot, drumsById).length,
    sources: countBy(drums, (drum) => drum.floralSource).size,
  };
}
