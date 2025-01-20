import { describe, it, expect } from 'vitest';
import {
  buildStatement,
  statementTotalCents,
  statementSubtotalCents,
  statementHives,
  totalsByCode,
  renderInvoice,
  renderStatement,
  statementSummary,
} from '../../src/settlement/statement.js';
import { buildInvoice, withCommissionLine } from '../../src/settlement/invoice.js';
import { assessContract } from '../../src/contracts/assessment.js';
import { aContract, aRun } from '../helpers/contracts.js';

const strong = aRun({ frames: [9, 9, 9, 9] });

const invoiceFor = (contract, run) =>
  buildInvoice(contract, {
    assessment: assessContract(contract, [run]),
    deliveredHives: 377,
    runs: [run],
    issuedOn: '2025-03-20',
  });

const first = invoiceFor(aContract(), strong);
const second = invoiceFor(
  aContract({ id: 'CT-2025-0008' }),
  aRun({ id: 'GR-2025-0010', contractId: 'CT-2025-0008' })
);

const statement = (overrides = {}) =>
  buildStatement({
    grower: 'Wilkins Farming',
    season: 2025,
    issuedOn: '2025-03-25',
    invoices: [second, first],
    ...overrides,
  });

describe('buildStatement', () => {
  it('sorts the invoices by contract', () => {
    expect(statement().invoices.map((invoice) => invoice.contractId)).toEqual([
      'CT-2025-0007',
      'CT-2025-0008',
    ]);
  });

  it('refuses a statement with nothing on it', () => {
    expect(() => statement({ invoices: [] })).toThrow(
      /no invoices for Wilkins Farming in 2025/
    );
  });

  it('refuses an invoice belonging to another grower', () => {
    const other = buildInvoice(
      aContract({ grower: { name: 'Ackerman Ranches', county: 'Madera' } }),
      {
        assessment: assessContract(aContract(), [strong]),
        deliveredHives: 100,
        runs: [strong],
        issuedOn: '2025-03-20',
      }
    );
    expect(() => statement({ invoices: [first, other] })).toThrow(
      /belongs to Ackerman Ranches/
    );
  });

  it('refuses an invoice from another season', () => {
    expect(() => statement({ season: 2024 })).toThrow(
      /belongs to Wilkins Farming in 2025/
    );
  });

  it('refuses an issue date that is not a date', () => {
    expect(() => statement({ issuedOn: '25 March' })).toThrow(
      /issuedOn must look like YYYY-MM-DD/
    );
  });
});

describe('statement totals', () => {
  it('adds the invoices', () => {
    expect(statementTotalCents(statement())).toBe(7728500 + 5937750);
  });

  it('counts the hives across contracts', () => {
    expect(statementHives(statement())).toBe(754);
  });

  it('has a subtotal equal to the total when there is no commission', () => {
    expect(statementSubtotalCents(statement())).toBe(statementTotalCents(statement()));
  });

  it('separates the subtotal from the total once a commission is taken', () => {
    const contract = aContract({
      broker: { name: 'Central Valley Bee', commissionBps: 750 },
    });
    const brokered = withCommissionLine(invoiceFor(contract, strong), contract);
    const withBroker = statement({ invoices: [brokered] });
    expect(statementSubtotalCents(withBroker)).toBe(7728500);
    expect(statementTotalCents(withBroker)).toBe(7728500 - 579638);
  });
});

describe('totalsByCode', () => {
  it('groups every line across the statement', () => {
    const totals = totalsByCode(statement());
    const rent = totals.find((row) => row.code === 'rent');
    expect(rent.lines).toBe(2);
    expect(rent.amountCents).toBe(7728500 * 2);
  });

  it('carries the deductions through', () => {
    const totals = totalsByCode(statement());
    expect(totals.find((row) => row.code === 'tier').amountCents).toBe(-942500);
    expect(totals.find((row) => row.code === 'shortfall').amountCents).toBe(-848250);
  });
});

describe('renderInvoice', () => {
  const text = renderInvoice(second);

  it('heads with the contract', () => {
    expect(text.split('\n')[0]).toBe('contract CT-2025-0008');
  });

  it('shows the shortfall rule in the detail block', () => {
    expect(text).toContain('shortfall rule  prorate');
  });

  it('prints the money as money', () => {
    expect(text).toContain('$77,285.00');
    expect(text).toContain('-$9,425.00');
  });

  it('ends with the invoice total', () => {
    expect(text.trim().split('\n').pop()).toBe('total  $59,377.50');
  });

  it('never leaves a trailing space on a line', () => {
    for (const line of text.split('\n')) {
      expect(line).toBe(line.replace(/\s+$/, ''));
    }
  });
});

describe('renderStatement', () => {
  const text = renderStatement(statement());

  it('heads with the grower and the season', () => {
    expect(text.split('\n')[0]).toBe('Wilkins Farming season 2025');
    expect(text.split('\n')[1]).toBe('===========================');
  });

  it('shows both contracts', () => {
    expect(text).toContain('contract CT-2025-0007');
    expect(text).toContain('contract CT-2025-0008');
  });

  it('ends with the statement total', () => {
    expect(text.trim().split('\n').pop()).toBe('statement total  $136,662.50');
  });

  it('counts the hives in the footer', () => {
    expect(text).toContain('hives delivered  754');
  });
});

describe('statementSummary', () => {
  it('gives one flat row for the season register', () => {
    expect(statementSummary(statement())).toEqual({
      grower: 'Wilkins Farming',
      season: 2025,
      contracts: 2,
      hives: 754,
      subtotalCents: 13666250,
      totalCents: 13666250,
    });
  });
});
