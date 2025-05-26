import { ConflictError, ValidationError } from '../core/errors.js';
import { requireInteger, requireOneOf, requireString } from '../core/validate.js';
import { compareDates, diffDays, parseDate } from '../core/dates.js';
import { formatMoney, sumMoney } from '../core/money.js';
import { groupBy, sortBy, sumBy } from '../core/collections.js';

/**
 * What growers owe and what they have paid.
 *
 * Pollination is settled once a year and the money arrives over the following
 * three months, so the ledger is small and the aging matters. A grower who is
 * ninety days late in June is a grower to think hard about before signing them
 * for next February, and that judgement is made off this file.
 */

export const ENTRY_KINDS = ['charge', 'payment', 'credit'];
export const AGING_BUCKETS = [30, 60, 90];

export function makeEntry(input) {
  const kind = requireOneOf(input.kind, 'entry.kind', ENTRY_KINDS);
  const amountCents = requireInteger(input.amountCents, 'entry.amountCents', {
    min: -100000000,
    max: 100000000,
  });
  if (kind === 'charge' && amountCents <= 0) {
    throw new ValidationError('a charge has to be positive', { amountCents });
  }
  if (kind !== 'charge' && amountCents >= 0) {
    throw new ValidationError(`a ${kind} has to be negative`, { amountCents });
  }
  return {
    id: requireString(input.id, 'entry.id', { max: 40 }),
    grower: requireString(input.grower, 'entry.grower', { max: 80 }),
    contractId:
      input.contractId === undefined
        ? undefined
        : requireString(input.contractId, 'entry.contractId', { max: 40 }),
    kind,
    amountCents,
    date: parseDate(input.date, 'entry.date'),
    reference:
      input.reference === undefined
        ? undefined
        : requireString(input.reference, 'entry.reference', { max: 60 }),
  };
}

export function makeLedger(entries = []) {
  const parsed = entries.map(makeEntry);
  const ids = parsed.map((entry) => entry.id);
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated) {
    throw new ConflictError(`ledger entry ${repeated} is recorded twice`, {
      entry: repeated,
    });
  }
  return sortBy(
    parsed,
    (entry) => entry.date,
    (entry) => entry.id
  );
}

export function balanceCents(ledger, grower) {
  const rows =
    grower === undefined ? ledger : ledger.filter((entry) => entry.grower === grower);
  return sumMoney(rows.map((entry) => entry.amountCents));
}

export function balancesByGrower(ledger) {
  const groups = groupBy(ledger, (entry) => entry.grower);
  return sortBy(
    [...groups.entries()].map(([grower, entries]) => ({
      grower,
      chargedCents: sumBy(
        entries.filter((entry) => entry.kind === 'charge'),
        (entry) => entry.amountCents
      ),
      paidCents: sumBy(
        entries.filter((entry) => entry.kind !== 'charge'),
        (entry) => entry.amountCents
      ),
      balanceCents: sumMoney(entries.map((entry) => entry.amountCents)),
    })),
    (row) => row.grower
  );
}

/**
 * Charges that are still open, oldest first, with the payments applied against
 * them in the order they arrived. A grower who pays a round number rather than
 * an invoice is the normal case, so payments are not matched to charges.
 */
export function openCharges(ledger, grower, asOf) {
  const rows = ledger.filter(
    (entry) => entry.grower === grower && compareDates(entry.date, asOf) <= 0
  );
  const charges = rows.filter((entry) => entry.kind === 'charge');
  let credit = -sumBy(
    rows.filter((entry) => entry.kind !== 'charge'),
    (entry) => entry.amountCents
  );
  const open = [];
  for (const charge of charges) {
    if (credit >= charge.amountCents) {
      credit -= charge.amountCents;
      continue;
    }
    open.push({
      ...charge,
      openCents: charge.amountCents - credit,
      ageDays: diffDays(charge.date, asOf),
    });
    credit = 0;
  }
  return open;
}

export function agingFor(ledger, grower, asOf) {
  const open = openCharges(ledger, grower, asOf);
  const buckets = { current: 0 };
  for (const limit of AGING_BUCKETS) buckets[`over${limit}`] = 0;
  for (const charge of open) {
    const bucket = AGING_BUCKETS.filter((limit) => charge.ageDays > limit).pop();
    const key = bucket === undefined ? 'current' : `over${bucket}`;
    buckets[key] += charge.openCents;
  }
  return {
    grower,
    asOf,
    ...buckets,
    totalCents: sumBy(open, (charge) => charge.openCents),
  };
}

export function agingReport(ledger, asOf) {
  const growers = [...new Set(ledger.map((entry) => entry.grower))].sort();
  return growers.map((grower) => agingFor(ledger, grower, asOf));
}

export function describeAging(row) {
  return `${row.grower} owes ${formatMoney(row.totalCents)}, ${formatMoney(row.over90)} of it over ninety days`;
}
