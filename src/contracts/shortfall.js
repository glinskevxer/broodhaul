import { RuleViolation } from '../core/errors.js';
import { requireInteger } from '../core/validate.js';
import { multiplyMoney } from '../core/money.js';
import { coloniesMeetingMinimum, pooledReadings } from './assessment.js';

/**
 * What a light drop costs the operation.
 *
 * Three clauses are in use across the book and they are not variations on each
 * other. Prorate scales the rate by how close the average came. Reject pays
 * only for the share of the sample that made the minimum and the grower keeps
 * the rest for free until they are swapped out. Tier says the tier table
 * already handled it and nothing further happens.
 *
 * Prorate and reject both lean on the sample standing in for the delivery,
 * which is why the sampling percentage in the same terms block matters far
 * more than it looks like it should.
 */

export function prorateFactor(contract, assessment) {
  if (assessment.meetsMinimum) return 1;
  const minimum = contract.terms.minimumAverage;
  if (minimum === 0) return 1;
  return Math.min(1, Math.round((assessment.average / minimum) * 10000) / 10000);
}

export function payableShare(contract, runs) {
  const pooled = pooledReadings(contract, runs);
  if (pooled.length === 0) {
    throw new RuleViolation('SF-1', `contract ${contract.id} has no grading readings`, {
      contract: contract.id,
    });
  }
  return coloniesMeetingMinimum(contract, runs) / pooled.length;
}

/**
 * Payable hives and the rate they are payable at.
 *
 * The delivered count is what went in the gate. Under reject it is cut to the
 * share of the sample that made weight, rounded down, because the operation
 * does not get paid for a hive it cannot show made the number.
 */
export function applyShortfall(contract, assessment, deliveredHives, runs) {
  const delivered = requireInteger(deliveredHives, 'deliveredHives', { min: 0 });
  const baseRate = contract.rateCents + assessment.perHiveAdjustmentCents;
  if (assessment.meetsMinimum) {
    return {
      rule: contract.terms.shortfall,
      payableHives: delivered,
      rateCents: baseRate,
      factor: 1,
      note: 'minimum met',
    };
  }
  if (contract.terms.shortfall === 'tier') {
    return {
      rule: 'tier',
      payableHives: delivered,
      rateCents: baseRate,
      factor: 1,
      note: 'tier table already carries the shortfall',
    };
  }
  if (contract.terms.shortfall === 'prorate') {
    const factor = prorateFactor(contract, assessment);
    return {
      rule: 'prorate',
      payableHives: delivered,
      rateCents: multiplyMoney(baseRate, factor),
      factor,
      note: `rate prorated to ${Math.round(factor * 10000) / 100} percent`,
    };
  }
  const share = payableShare(contract, runs);
  const payableHives = Math.floor(delivered * share);
  return {
    rule: 'reject',
    payableHives,
    rateCents: baseRate,
    factor: Math.round(share * 10000) / 10000,
    note: `${payableHives} of ${delivered} hives made the minimum in the sample`,
  };
}

export function shortfallValueCents(outcome) {
  return multiplyMoney(outcome.rateCents, outcome.payableHives);
}

/** What the same delivery would have been worth had the drop made weight. */
export function forgoneCents(contract, outcome, deliveredHives) {
  const full = multiplyMoney(contract.rateCents, deliveredHives);
  return full - shortfallValueCents(outcome);
}
