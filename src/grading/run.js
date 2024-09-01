import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireObject,
  requireString,
} from '../core/validate.js';
import { parseId } from '../core/ids.js';
import { countBy, sortBy, sumBy } from '../core/collections.js';
import { makeConditions, methodFor } from './conditions.js';
import { makeReading, isBroodless, readingFrames } from './frames.js';
import { sampleSize } from './sample.js';

/**
 * One grading run: a grader, a day, a set of conditions and the hives that
 * were opened.
 *
 * The run holds the readings as they were called in the field. Everything the
 * contract cares about is derived rather than stored, because the correction
 * depends on the conditions and the conditions are part of the same record.
 * A run that stored its own average would be a number nobody could re-derive
 * two months later when the grower rings up about it.
 */

const RUN_KEYS = [
  'id',
  'contractId',
  'dropId',
  'grader',
  'conditions',
  'readings',
  'witness',
];

export function makeGradingRun(input) {
  const raw = requireObject(input, 'grading run');
  rejectUnknownKeys(raw, 'grading run', RUN_KEYS);
  const readings = requireArray(raw.readings, 'grading run.readings', { min: 1 }).map(
    makeReading
  );
  const seen = new Set();
  for (const reading of readings) {
    if (seen.has(reading.colonyId)) {
      throw new ValidationError(
        `colony ${reading.colonyId} was read twice in one run`,
        {
          colonyId: reading.colonyId,
        }
      );
    }
    seen.add(reading.colonyId);
  }
  return {
    id: parseId(raw.id, 'grading').id,
    contractId: parseId(raw.contractId, 'contract').id,
    dropId: parseId(raw.dropId, 'drop').id,
    grader: requireString(raw.grader, 'grading run.grader', { max: 60 }),
    conditions: makeConditions(raw.conditions),
    readings,
    witness: optional(raw.witness, (name) =>
      requireString(name, 'grading run.witness', { max: 60 })
    ),
  };
}

export function runMethod(run) {
  return methodFor(run.conditions);
}

/** Every reading's corrected frame figure, in the order they were called. */
export function correctedFrames(run) {
  return run.readings.map((reading) => readingFrames(reading, run.conditions));
}

export function runAverage(run) {
  const frames = correctedFrames(run);
  const total = frames.reduce((sum, value) => sum + value, 0);
  return Math.round((total / frames.length) * 100) / 100;
}

export function runTotalFrames(run) {
  return (
    Math.round(correctedFrames(run).reduce((sum, value) => sum + value, 0) * 100) / 100
  );
}

/** Colonies grouped into whole frame buckets, which is how the grower reads it. */
export function runDistribution(run) {
  const buckets = countBy(correctedFrames(run), (frames) => Math.floor(frames));
  return sortBy(
    [...buckets.entries()].map(([frames, colonies]) => ({ frames, colonies })),
    (row) => row.frames
  );
}

export function runFlags(run) {
  return {
    read: run.readings.length,
    queenless: run.readings.filter((reading) => !reading.queenright).length,
    broodless: run.readings.filter(isBroodless).length,
    empty: correctedFrames(run).filter((frames) => frames === 0).length,
  };
}

/** Colonies at or above a threshold, which is what a tiered contract pays on. */
export function countAtOrAbove(run, frames) {
  return correctedFrames(run).filter((value) => value >= frames).length;
}

export function shareAtOrAbove(run, frames) {
  return (
    Math.round((countAtOrAbove(run, frames) / run.readings.length) * 10000) / 10000
  );
}

/**
 * Check the run actually opened as many hives as the terms asked for. The
 * method comes from the run's own conditions, so a run taken cold needs more
 * hives than the same drop would have needed on a warm afternoon.
 */
export function checkSampleSize(run, population, percent) {
  const wanted = sampleSize(population, percent, runMethod(run));
  if (run.readings.length < wanted) {
    throw new RuleViolation(
      'GR-2',
      `run ${run.id} opened ${run.readings.length} colonies, terms ask for ${wanted}`,
      { run: run.id, opened: run.readings.length, wanted, population, percent }
    );
  }
  return wanted;
}

export function summariseRun(run) {
  const flags = runFlags(run);
  return {
    id: run.id,
    contractId: run.contractId,
    dropId: run.dropId,
    date: run.conditions.date,
    method: runMethod(run),
    grader: run.grader,
    read: flags.read,
    average: runAverage(run),
    total: runTotalFrames(run),
    queenless: flags.queenless,
    broodless: flags.broodless,
  };
}

export function totalReadings(runs) {
  return sumBy(runs, (run) => run.readings.length);
}
