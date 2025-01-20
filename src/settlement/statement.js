import { ValidationError } from '../core/errors.js';
import { requireInteger, requireString } from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { formatMoney, sumMoney } from '../core/money.js';
import { groupBy, sortBy } from '../core/collections.js';
import { renderDetail, renderHeading, renderTable } from '../core/table.js';
import { invoiceSubtotalCents, invoiceTotalCents, linesByCode } from './invoice.js';

/**
 * The statement that goes in the envelope.
 *
 * A grower with four blocks under two contracts gets one statement, not four
 * invoices, and the total at the bottom has to be the number on the cheque.
 * The rendering is plain text on purpose: these get printed, faxed and read
 * over the phone, and a column that wraps is a column that gets argued about.
 */

export function buildStatement({ grower, season, invoices, issuedOn }) {
  const name = requireString(grower, 'grower', { max: 80 });
  const year = requireInteger(season, 'season', { min: 2000, max: 2999 });
  if (invoices.length === 0) {
    throw new ValidationError(`no invoices for ${name} in ${year}`, {
      grower: name,
      season: year,
    });
  }
  const wrong = invoices.find(
    (invoice) => invoice.grower !== name || invoice.season !== year
  );
  if (wrong) {
    throw new ValidationError(
      `invoice ${wrong.contractId} belongs to ${wrong.grower} in ${wrong.season}`,
      { invoice: wrong.contractId }
    );
  }
  return {
    grower: name,
    season: year,
    issuedOn: parseDate(issuedOn, 'issuedOn'),
    invoices: sortBy(invoices, (invoice) => invoice.contractId),
  };
}

export function statementTotalCents(statement) {
  return sumMoney(statement.invoices.map(invoiceTotalCents));
}

export function statementSubtotalCents(statement) {
  return sumMoney(statement.invoices.map(invoiceSubtotalCents));
}

export function statementHives(statement) {
  return statement.invoices.reduce(
    (total, invoice) => total + invoice.deliveredHives,
    0
  );
}

/** Every line across every invoice, totalled by code, which is what the office checks. */
export function totalsByCode(statement) {
  const lines = statement.invoices.flatMap((invoice) => linesByCode(invoice));
  const groups = groupBy(lines, (line) => line.code);
  return [...groups.entries()].map(([code, entries]) => ({
    code,
    lines: entries.length,
    amountCents: sumMoney(entries.map((line) => line.amountCents)),
  }));
}

const LINE_COLUMNS = [
  { header: 'code', key: 'code' },
  { header: 'description', key: 'description' },
  { header: 'qty', key: 'quantity', align: 'right' },
  {
    header: 'amount',
    key: 'amountCents',
    align: 'right',
    format: (cents) => formatMoney(cents),
  },
];

export function renderInvoice(invoice) {
  const heading = renderHeading(`contract ${invoice.contractId}`, { underline: '-' });
  const detail = renderDetail([
    ['issued', invoice.issuedOn],
    ['delivered', `${invoice.deliveredHives} hives`],
    ['payable', `${invoice.payableHives} hives`],
    ['shortfall rule', invoice.rule],
  ]);
  const table = renderTable(LINE_COLUMNS, linesByCode(invoice));
  const total = `total  ${formatMoney(invoiceTotalCents(invoice))}`;
  return [heading, detail, '', table, '', total].join('\n');
}

export function renderStatement(statement) {
  const heading = renderHeading(`${statement.grower} season ${statement.season}`);
  const parts = [heading, `issued ${statement.issuedOn}`, ''];
  for (const invoice of statement.invoices) {
    parts.push(renderInvoice(invoice), '');
  }
  parts.push(
    renderDetail([
      ['hives delivered', String(statementHives(statement))],
      ['statement total', formatMoney(statementTotalCents(statement))],
    ])
  );
  return parts.join('\n');
}

export function statementSummary(statement) {
  return {
    grower: statement.grower,
    season: statement.season,
    contracts: statement.invoices.length,
    hives: statementHives(statement),
    subtotalCents: statementSubtotalCents(statement),
    totalCents: statementTotalCents(statement),
  };
}
