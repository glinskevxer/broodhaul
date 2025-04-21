import { RuleViolation } from '../core/errors.js';
import { requireInteger } from '../core/validate.js';
import { addDays, compareDates, diffDays } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { multiplyMoney } from '../core/money.js';
import { allowsRegrade } from '../contracts/terms.js';
import { assessContract } from '../contracts/assessment.js';
import { runAverage } from './run.js';

/**
 * The grower's right to ask for a second opinion.
 *
 * A grower who thinks a drop graded low can call for a regrade, and the
 * contract says how long they have. The second run has to be a different
 * grader with a witness, because a regrade by the same person on the same
 * afternoon settles nothing.
 *
 * The interesting clause is what happens afterwards. A regrade only replaces
 * the original if it moves the number by more than the tolerance; inside the
 * tolerance the original stands and the grower pays for the second opening.
 * That is what stops a regrade being a free option, and it is also why the
 * tolerance is read against whatever the contract grades on rather than
 * against the average every time.
 */

export const TOLERANCE_FRAMES = 0.5;
export const REGRADE_COST_PER_COLONY_CENTS = 450;

/** The last day the grower can ask, or nothing when the contract has no clause. */
export function regradeDeadline(contract, run) {
  if (!allowsRegrade(contract.terms)) return undefined;
  return addDays(run.conditions.date, contract.terms.regradeWithinDays);
}

/** Days the grower has left to ask, counted from the day the run was taken. */
export function daysLeftToAsk(contract, run, today) {
  if (!allowsRegrade(contract.terms)) return 0;
  const used = diffDays(run.conditions.date, today);
  return Math.max(0, contract.terms.regradeWithinDays - used);
}

export function checkRegradeAllowed(contract, original, regrade) {
  if (!allowsRegrade(contract.terms)) {
    throw new RuleViolation('RG-1', `contract ${contract.id} has no regrade clause`, {
      contract: contract.id,
    });
  }
  if (regrade.dropId !== original.dropId) {
    throw new RuleViolation('RG-2', 'a regrade has to be of the same drop', {
      original: original.dropId,
      regrade: regrade.dropId,
    });
  }
  if (compareDates(regrade.conditions.date, original.conditions.date) < 0) {
    throw new RuleViolation('RG-3', 'a regrade cannot predate the run it questions', {
      original: original.conditions.date,
      regrade: regrade.conditions.date,
    });
  }
  const used = diffDays(original.conditions.date, regrade.conditions.date);
  if (used > contract.terms.regradeWithinDays) {
    throw new RuleViolation(
      'RG-4',
      `the regrade window closed after ${contract.terms.regradeWithinDays} days`,
      { used, allowed: contract.terms.regradeWithinDays }
    );
  }
  if (regrade.grader === original.grader) {
    throw new RuleViolation('RG-5', 'a regrade needs a different grader', {
      grader: regrade.grader,
    });
  }
  if (!regrade.witness) {
    throw new RuleViolation('RG-6', 'a regrade needs a witness from the grower side', {
      regrade: regrade.id,
    });
  }
  return true;
}

/**
 * The number the tolerance is read against. On an average contract that is the
 * run average; on a colony contract it is the per hive adjustment, because
 * that is what the contract actually pays on and two runs can share an average
 * while paying differently.
 */
export function measuredValue(contract, run) {
  if (contract.terms.gradeBy === 'average') return runAverage(run);
  return assessContract(contract, [run]).perHiveAdjustmentCents / 100;
}

export function regradeOutcome(contract, original, regrade) {
  checkRegradeAllowed(contract, original, regrade);
  const before = measuredValue(contract, original);
  const after = measuredValue(contract, regrade);
  const movement = roundTo(after - before, 2);
  const stands = Math.abs(movement) <= TOLERANCE_FRAMES;
  return {
    contract: contract.id,
    original: original.id,
    regrade: regrade.id,
    before,
    after,
    movement,
    tolerance: TOLERANCE_FRAMES,
    governing: stands ? original.id : regrade.id,
    payer: stands ? 'grower' : 'operation',
    costCents: multiplyMoney(
      REGRADE_COST_PER_COLONY_CENTS,
      requireInteger(regrade.readings.length, 'readings', { min: 1 })
    ),
  };
}

export function governingRun(contract, original, regrade) {
  const outcome = regradeOutcome(contract, original, regrade);
  return outcome.governing === original.id ? original : regrade;
}

export function describeRegrade(outcome) {
  const direction =
    outcome.movement === 0 ? 'no movement' : `moved ${outcome.movement}`;
  return `${outcome.regrade} against ${outcome.original}: ${direction}, ${outcome.governing} governs, ${outcome.payer} pays`;
}
