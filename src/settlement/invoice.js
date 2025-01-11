import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { basisPoints, formatMoney, multiplyMoney, sumMoney } from '../core/money.js';
import { sortBy, sumBy } from '../core/collections.js';
import { shortBy } from '../placement/drop.js';
import { applyShortfall } from '../contracts/shortfall.js';

/**
 * The invoice sent to the grower.
 *
 * Every line has to be traceable to something on the ground: a hive count, a
 * grading run, a drop that came up short. A grower who queries a statement
 * gets sent the working, so a line with a number nobody can re-derive is worse
 * than no line at all.
 *
 * The rent line is therefore always the full contract rate on the hives that
 * were actually delivered. What the grading did to that comes off underneath
 * it, one line for the tier and one for the shortfall clause, and the three of
 * them add to what the shortfall rule says is owed. Netting it all into a
 * single line would be shorter and would end the conversation with the grower
 * exactly where it starts now.
 */

export const LINE_CODES = [
  'rent',
  'tier',
  'shortfall',
  'short set',
  'adjustment',
  'commission',
];

export function makeLine(input) {
  const raw = requireObject(input, 'line');
  rejectUnknownKeys(raw, 'line', [
    'code',
    'description',
    'quantity',
    'unitCents',
    'amountCents',
  ]);
  const code = requireOneOf(raw.code, 'line.code', LINE_CODES);
  const quantity = requireNumber(raw.quantity, 'line.quantity', {
    min: -100000,
    max: 100000,
  });
  const unitCents = requireInteger(raw.unitCents, 'line.unitCents', {
    min: -100000000,
    max: 100000000,
  });
  const amountCents =
    raw.amountCents === undefined
      ? multiplyMoney(unitCents, quantity)
      : requireInteger(raw.amountCents, 'line.amountCents', {
          min: -1000000000,
          max: 1000000000,
        });
  return {
    code,
    description: requireString(raw.description, 'line.description', { max: 120 }),
    quantity,
    unitCents,
    amountCents,
  };
}

export function buildInvoice(
  contract,
  { assessment, deliveredHives, runs, drops = [], issuedOn }
) {
  const delivered = requireInteger(deliveredHives, 'deliveredHives', { min: 0 });
  const outcome = applyShortfall(contract, assessment, delivered, runs);
  const lines = [];

  const rentCents = multiplyMoney(contract.rateCents, delivered);
  lines.push(
    makeLine({
      code: 'rent',
      description: `pollination rent, ${delivered} hives at ${formatMoney(contract.rateCents)}`,
      quantity: delivered,
      unitCents: contract.rateCents,
    })
  );

  const tierCents = multiplyMoney(assessment.perHiveAdjustmentCents, delivered);
  if (tierCents !== 0) {
    lines.push(
      makeLine({
        code: 'tier',
        description: `strength tier at ${assessment.average} frames`,
        quantity: delivered,
        unitCents: assessment.perHiveAdjustmentCents,
      })
    );
  }

  const owed = multiplyMoney(outcome.rateCents, outcome.payableHives);
  const shortfallCents = owed - (rentCents + tierCents);
  if (shortfallCents !== 0) {
    lines.push(
      makeLine({
        code: 'shortfall',
        description: `${outcome.rule}: ${outcome.note}`,
        quantity: 1,
        unitCents: shortfallCents,
      })
    );
  }

  const shortHives = sumBy(drops, shortBy);
  if (shortHives > 0) {
    lines.push(
      makeLine({
        code: 'short set',
        description: `${shortHives} hives ordered and not set`,
        quantity: shortHives,
        unitCents: -contract.rateCents,
      })
    );
  }

  return {
    contractId: contract.id,
    grower: contract.grower.name,
    season: contract.season,
    issuedOn: parseDate(issuedOn, 'issuedOn'),
    deliveredHives: delivered,
    payableHives: outcome.payableHives,
    rule: outcome.rule,
    lines,
  };
}

export function invoiceSubtotalCents(invoice) {
  return sumMoney(
    invoice.lines
      .filter((line) => line.code !== 'commission')
      .map((line) => line.amountCents)
  );
}

export function invoiceTotalCents(invoice) {
  return sumMoney(invoice.lines.map((line) => line.amountCents));
}

export function commissionCents(invoice, contract) {
  if (!contract.broker) return 0;
  return basisPoints(invoiceSubtotalCents(invoice), contract.broker.commissionBps);
}

export function withCommissionLine(invoice, contract) {
  const commission = commissionCents(invoice, contract);
  if (commission === 0) return invoice;
  const line = makeLine({
    code: 'commission',
    description: `${contract.broker.name} at ${contract.broker.commissionBps} basis points`,
    quantity: 1,
    unitCents: -commission,
  });
  return { ...invoice, lines: [...invoice.lines, line] };
}

export function netToOperationCents(invoice, contract) {
  return invoiceSubtotalCents(invoice) - commissionCents(invoice, contract);
}

export function linesByCode(invoice) {
  return sortBy(invoice.lines, (line) => LINE_CODES.indexOf(line.code));
}

export function addAdjustment(invoice, description, amountCents) {
  if (!Number.isInteger(amountCents)) {
    throw new ValidationError('an adjustment must be whole cents', { amountCents });
  }
  const line = makeLine({
    code: 'adjustment',
    description: requireString(description, 'description', { max: 120 }),
    quantity: 1,
    unitCents: amountCents,
  });
  return { ...invoice, lines: [...invoice.lines, line] };
}

export function invoiceNumber(invoice, sequence) {
  const number = optional(sequence, (value) =>
    requireInteger(value, 'sequence', { min: 1, max: 999 })
  );
  return `${invoice.contractId}-${String(number ?? 1).padStart(3, '0')}`;
}
