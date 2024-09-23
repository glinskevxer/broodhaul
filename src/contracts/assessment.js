import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireArray } from '../core/validate.js';
import { divideMoney, sumMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';
import { correctedFrames, runMethod } from '../grading/run.js';
import { adjustmentFor, meetsMinimum, tierFor } from './terms.js';

/**
 * Turn the grading runs on a contract into the one number the settlement
 * needs: cents per delivered hive.
 *
 * Which route it takes is the contract's own `gradeBy` clause. Graded by
 * average, every run on the contract is pooled, one average comes out and one
 * tier is read off it. Graded by colony, each hive that was opened is tiered on
 * its own and the sampled hives then stand in for the whole delivery, so the
 * per hive figure is the mean of the sampled adjustments. The two routes
 * disagree whenever the drop is uneven, which is most Februarys, and the
 * contract decides which answer is the real one.
 */

function checkRunsBelong(contract, runs) {
  const wrong = runs.find((run) => run.contractId !== contract.id);
  if (wrong) {
    throw new ValidationError(
      `grading run ${wrong.id} is not on contract ${contract.id}`,
      {
        run: wrong.id,
        contract: contract.id,
      }
    );
  }
}

/** Every corrected reading on the contract, with the run it came from. */
export function pooledReadings(contract, runs) {
  checkRunsBelong(contract, runs);
  const pooled = [];
  for (const run of runs) {
    const frames = correctedFrames(run);
    run.readings.forEach((reading, at) => {
      pooled.push({
        runId: run.id,
        dropId: run.dropId,
        colonyId: reading.colonyId,
        frames: frames[at],
      });
    });
  }
  return sortBy(pooled, (entry) => entry.colonyId);
}

export function pooledAverage(contract, runs) {
  const pooled = pooledReadings(contract, runs);
  if (pooled.length === 0) {
    throw new RuleViolation('AS-1', `contract ${contract.id} has no grading readings`, {
      contract: contract.id,
    });
  }
  const total = pooled.reduce((sum, entry) => sum + entry.frames, 0);
  return Math.round((total / pooled.length) * 100) / 100;
}

/** Per hive adjustment when the contract grades on the pooled average. */
function averageRoute(contract, runs) {
  const average = pooledAverage(contract, runs);
  return {
    average,
    perHiveAdjustmentCents: adjustmentFor(contract.terms, average),
    colonyAdjustments: [],
  };
}

/** Per hive adjustment when each opened hive is tiered on its own. */
function colonyRoute(contract, runs) {
  const pooled = pooledReadings(contract, runs);
  const colonyAdjustments = pooled.map((entry) => ({
    colonyId: entry.colonyId,
    runId: entry.runId,
    frames: entry.frames,
    tier: tierFor(contract.terms, entry.frames)?.atLeast,
    adjustmentCents: adjustmentFor(contract.terms, entry.frames),
  }));
  const total = sumMoney(colonyAdjustments.map((entry) => entry.adjustmentCents));
  return {
    average: pooledAverage(contract, runs),
    perHiveAdjustmentCents: divideMoney(total, colonyAdjustments.length),
    colonyAdjustments,
  };
}

export function assessContract(contract, runs) {
  requireArray(runs, 'runs', { min: 1 });
  checkRunsBelong(contract, runs);
  const route = contract.terms.gradeBy === 'colony' ? colonyRoute : averageRoute;
  const outcome = route(contract, runs);
  const pooled = pooledReadings(contract, runs);
  return {
    contractId: contract.id,
    runIds: sortBy(runs, (run) => run.id).map((run) => run.id),
    methods: [...new Set(runs.map(runMethod))].sort(),
    coloniesRead: pooled.length,
    average: outcome.average,
    meetsMinimum: meetsMinimum(contract.terms, outcome.average),
    perHiveAdjustmentCents: outcome.perHiveAdjustmentCents,
    colonyAdjustments: outcome.colonyAdjustments,
  };
}

/** Hives at or above the contract minimum, which a rejecting contract pays on. */
export function coloniesMeetingMinimum(contract, runs) {
  return pooledReadings(contract, runs).filter(
    (entry) => entry.frames >= contract.terms.minimumAverage
  ).length;
}

export function assessmentShortfall(contract, assessment) {
  if (assessment.meetsMinimum) return 0;
  return Math.round((contract.terms.minimumAverage - assessment.average) * 100) / 100;
}
