import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireNumber,
  requireObject,
  requireString,
} from '../core/validate.js';
import { roundToStep } from '../core/quantity.js';
import { parseId } from '../core/ids.js';

/**
 * What one colony reads.
 *
 * A frame count is the grader lifting frames and calling how many are covered
 * with bees, to the quarter frame. A cluster count is the grader looking down
 * through the top bars at a cold hive and calling the cluster width in inches,
 * which converts. Neither number is used raw: bees pull in tight when it is
 * cool, so a count taken at 56F reads higher than the same colony would at 70F
 * and the manual takes that back out before anything is averaged.
 */

export const MAX_FRAMES = 20;
export const FRAME_STEP = 0.25;

/**
 * Cluster width in inches to frames of bees. Measured on this outfit's own
 * equipment over three springs, which is why it is a table and not a formula.
 */
const CLUSTER_TABLE = [
  { inches: 4, frames: 2 },
  { inches: 6, frames: 3.25 },
  { inches: 8, frames: 4.5 },
  { inches: 10, frames: 6 },
  { inches: 12, frames: 7.5 },
  { inches: 14, frames: 9 },
  { inches: 16, frames: 10.5 },
  { inches: 18, frames: 12 },
];

export function clusterToFrames(inches) {
  const width = requireNumber(inches, 'inches', { min: 0, max: 24 });
  if (width < CLUSTER_TABLE[0].inches) return 0;
  const last = CLUSTER_TABLE[CLUSTER_TABLE.length - 1];
  if (width >= last.inches) return last.frames;
  for (let at = 0; at < CLUSTER_TABLE.length - 1; at += 1) {
    const low = CLUSTER_TABLE[at];
    const high = CLUSTER_TABLE[at + 1];
    if (width >= low.inches && width < high.inches) {
      const span = high.inches - low.inches;
      const rise = high.frames - low.frames;
      return roundToStep(low.frames + ((width - low.inches) / span) * rise, FRAME_STEP);
    }
  }
  throw new ValidationError(`cluster width ${inches} fell through the table`, {
    inches,
  });
}

/**
 * Correction applied to a count taken cool. One percent per degree below 65F,
 * capped at fifteen percent, because past that the count is a cluster count
 * anyway and has already been converted.
 */
export function temperatureCorrection(temperatureF) {
  const degrees = requireNumber(temperatureF, 'temperatureF', { min: -40, max: 130 });
  if (degrees >= 65) return 1;
  const shortfall = Math.min(15, 65 - degrees);
  return 1 - shortfall / 100;
}

const READING_KEYS = [
  'colonyId',
  'frames',
  'clusterInches',
  'queenright',
  'brood',
  'notes',
];

export function makeReading(input) {
  const raw = requireObject(input, 'reading');
  rejectUnknownKeys(raw, 'reading', READING_KEYS);
  const hasFrames = raw.frames !== undefined && raw.frames !== null;
  const hasCluster = raw.clusterInches !== undefined && raw.clusterInches !== null;
  if (hasFrames === hasCluster) {
    throw new ValidationError(
      'a reading is either frames or a cluster width, not both',
      {
        colonyId: raw.colonyId,
      }
    );
  }
  const frames = hasFrames
    ? requireNumber(raw.frames, 'reading.frames', { min: 0, max: MAX_FRAMES })
    : undefined;
  if (frames !== undefined && roundToStep(frames, FRAME_STEP) !== frames) {
    throw new ValidationError('frames are called to the quarter', { frames });
  }
  return {
    colonyId: parseId(raw.colonyId, 'colony').id,
    frames,
    clusterInches: hasCluster
      ? requireNumber(raw.clusterInches, 'reading.clusterInches', { min: 0, max: 24 })
      : undefined,
    queenright: raw.queenright === undefined ? true : Boolean(raw.queenright),
    brood: raw.brood === undefined ? true : Boolean(raw.brood),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'reading.notes', { max: 200 })
    ),
  };
}

/** The frames this reading is worth once the method and the temperature are applied. */
export function readingFrames(reading, conditions) {
  const raw =
    reading.frames !== undefined
      ? reading.frames
      : clusterToFrames(reading.clusterInches);
  if (!reading.queenright) return 0;
  const corrected = raw * temperatureCorrection(conditions.temperatureF);
  return roundToStep(corrected, FRAME_STEP, 'down');
}

/** A colony with bees but no brood is counted, and separately flagged. */
export function isBroodless(reading) {
  return reading.queenright && !reading.brood;
}

export function describeReading(reading) {
  const measure =
    reading.frames !== undefined
      ? `${reading.frames} frames`
      : `${reading.clusterInches} inch cluster`;
  const flags = [];
  if (!reading.queenright) flags.push('queenless');
  if (isBroodless(reading)) flags.push('no brood');
  return flags.length === 0
    ? `${reading.colonyId} ${measure}`
    : `${reading.colonyId} ${measure} (${flags.join(', ')})`;
}
