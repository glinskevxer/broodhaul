import { describe, it, expect } from 'vitest';
import {
  LINE_CODES,
  makeLine,
  buildInvoice,
  invoiceSubtotalCents,
  invoiceTotalCents,
  commissionCents,
  withCommissionLine,
  netToOperationCents,
  linesByCode,
  addAdjustment,
  invoiceNumber,
} from '../../src/settlement/invoice.js';
import { assessContract } from '../../src/contracts/assessment.js';
import { makeDrop } from '../../src/placement/drop.js';
import { aContract, aRun } from '../helpers/contracts.js';

const light = aRun();
const strong = aRun({ frames: [9, 9, 9, 9] });

const invoiceFor = (contract, run, extra = {}) =>
  buildInvoice(contract, {
    assessment: assessContract(contract, [run]),
    deliveredHives: 377,
    runs: [run],
    issuedOn: '2025-03-20',
    ...extra,
  });

describe('makeLine', () => {
  it('works the amount out from the quantity and the rate', () => {
    const line = makeLine({
      code: 'rent',
      description: 'rent',
      quantity: 10,
      unitCents: 20500,
    });
    expect(line.amountCents).toBe(205000);
  });

  it('takes an amount that was worked out elsewhere', () => {
    const line = makeLine({
      code: 'tier',
      description: 'tier',
      quantity: 0,
      unitCents: -2500,
      amountCents: -942500,
    });
    expect(line.amountCents).toBe(-942500);
  });

  it('refuses a code that is not on the chart', () => {
    expect(() =>
      makeLine({ code: 'freight', description: 'x', quantity: 1, unitCents: 1 })
    ).toThrow(/must be one of/);
  });

  it('refuses a fractional unit price', () => {
    expect(() =>
      makeLine({ code: 'rent', description: 'x', quantity: 1, unitCents: 1.5 })
    ).toThrow(/whole number/);
  });
});

describe('buildInvoice when the drop made weight', () => {
  const contract = aContract();
  const invoice = invoiceFor(contract, strong);

  it('carries the contract identity', () => {
    expect(invoice.contractId).toBe('CT-2025-0007');
    expect(invoice.grower).toBe('Wilkins Farming');
    expect(invoice.season).toBe(2025);
    expect(invoice.issuedOn).toBe('2025-03-20');
  });

  it('has just the rent line', () => {
    expect(invoice.lines.map((line) => line.code)).toEqual(['rent']);
  });

  it('bills the full rate on every delivered hive', () => {
    expect(invoice.lines[0].amountCents).toBe(7728500);
    expect(invoiceTotalCents(invoice)).toBe(7728500);
  });

  it('describes the rent line in money the grower can read', () => {
    expect(invoice.lines[0].description).toBe('pollination rent, 377 hives at $205.00');
  });
});

describe('buildInvoice when the drop came in light', () => {
  const contract = aContract();
  const invoice = invoiceFor(contract, light);

  it('bills rent in full and takes the grading off underneath', () => {
    expect(invoice.lines.map((line) => line.code)).toEqual([
      'rent',
      'tier',
      'shortfall',
    ]);
    expect(invoice.lines[0].amountCents).toBe(7728500);
    expect(invoice.lines[1].amountCents).toBe(-942500);
    expect(invoice.lines[2].amountCents).toBe(-848250);
  });

  it('adds to what the shortfall rule says is owed', () => {
    expect(invoiceTotalCents(invoice)).toBe(5937750);
  });

  it('names the rule and the note on the shortfall line', () => {
    expect(invoice.lines[2].description).toBe('prorate: rate prorated to 87.5 percent');
  });

  it('keeps every hive payable under prorate', () => {
    expect(invoice.payableHives).toBe(377);
    expect(invoice.rule).toBe('prorate');
  });
});

describe('buildInvoice under the reject rule', () => {
  const contract = aContract({ terms: { shortfall: 'reject' } });
  const invoice = invoiceFor(contract, light);

  it('cuts the payable hives instead of the rate', () => {
    expect(invoice.payableHives).toBe(188);
    expect(invoice.deliveredHives).toBe(377);
  });

  it('still bills rent on what was delivered', () => {
    expect(invoice.lines[0].quantity).toBe(377);
  });

  it('takes the difference on the shortfall line', () => {
    expect(invoice.lines[2].amountCents).toBe(-3402000);
    expect(invoiceTotalCents(invoice)).toBe(3384000);
  });
});

describe('short set lines', () => {
  const contract = aContract();
  const drop = (ordered, set) =>
    makeDrop({
      id: 'DR-2025-0004',
      contractId: 'CT-2025-0007',
      blockId: 'BK-2025-0001',
      location: { latitude: 36.9, longitude: -120.1 },
      ordered,
      set,
      setOn: '2025-02-04',
    });

  it('has no line when every drop was filled', () => {
    const invoice = invoiceFor(contract, strong, { drops: [drop(24, 24)] });
    expect(invoice.lines.map((line) => line.code)).toEqual(['rent']);
  });

  it('credits the hives that were ordered and never set', () => {
    const invoice = invoiceFor(contract, strong, { drops: [drop(24, 20)] });
    const line = invoice.lines.find((entry) => entry.code === 'short set');
    expect(line.quantity).toBe(4);
    expect(line.amountCents).toBe(-82000);
    expect(line.description).toBe('4 hives ordered and not set');
  });

  it('adds the shortfalls across several drops', () => {
    const second = makeDrop({
      id: 'DR-2025-0005',
      contractId: 'CT-2025-0007',
      blockId: 'BK-2025-0001',
      location: { latitude: 36.9, longitude: -120.1 },
      ordered: 24,
      set: 18,
      setOn: '2025-02-04',
    });
    const invoice = invoiceFor(contract, strong, { drops: [drop(24, 20), second] });
    expect(invoice.lines.find((entry) => entry.code === 'short set').quantity).toBe(10);
  });
});

describe('commission', () => {
  const contract = aContract({
    broker: { name: 'Central Valley Bee', commissionBps: 750 },
  });
  const invoice = invoiceFor(contract, strong);

  it('is nothing without a broker', () => {
    const plain = invoiceFor(aContract(), strong);
    expect(commissionCents(plain, aContract())).toBe(0);
    expect(withCommissionLine(plain, aContract())).toBe(plain);
  });

  it('is taken off the subtotal', () => {
    expect(commissionCents(invoice, contract)).toBe(579638);
  });

  it('appears as its own line when added', () => {
    const withLine = withCommissionLine(invoice, contract);
    expect(withLine.lines.map((line) => line.code)).toEqual(['rent', 'commission']);
    expect(withLine.lines[1].amountCents).toBe(-579638);
  });

  it('does not change the subtotal when the line is added', () => {
    const withLine = withCommissionLine(invoice, contract);
    expect(invoiceSubtotalCents(withLine)).toBe(invoiceSubtotalCents(invoice));
    expect(invoiceTotalCents(withLine)).toBe(7728500 - 579638);
  });

  it('reports what reaches the operation', () => {
    expect(netToOperationCents(invoice, contract)).toBe(7148862);
  });
});

describe('addAdjustment', () => {
  const contract = aContract();
  const invoice = invoiceFor(contract, strong);

  it('appends a line and moves the total', () => {
    const adjusted = addAdjustment(invoice, 'gate left open, fence repair', -12500);
    expect(adjusted.lines).toHaveLength(2);
    expect(invoiceTotalCents(adjusted)).toBe(7728500 - 12500);
  });

  it('leaves the original invoice alone', () => {
    addAdjustment(invoice, 'x', -1);
    expect(invoice.lines).toHaveLength(1);
  });

  it('refuses a fractional adjustment', () => {
    expect(() => addAdjustment(invoice, 'x', -12.5)).toThrow(/whole cents/);
  });
});

describe('linesByCode and invoiceNumber', () => {
  const contract = aContract();

  it('sorts the lines into chart order', () => {
    const invoice = addAdjustment(invoiceFor(contract, light), 'late pull', -1000);
    expect(linesByCode(invoice).map((line) => line.code)).toEqual([
      'rent',
      'tier',
      'shortfall',
      'adjustment',
    ]);
    expect(LINE_CODES.indexOf('rent')).toBe(0);
  });

  it('numbers an invoice from the contract', () => {
    const invoice = invoiceFor(contract, strong);
    expect(invoiceNumber(invoice)).toBe('CT-2025-0007-001');
    expect(invoiceNumber(invoice, 12)).toBe('CT-2025-0007-012');
  });
});
