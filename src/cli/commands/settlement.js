import { formatMoney } from '../../core/money.js';
import { sortBy } from '../../core/collections.js';
import { assessContract } from '../../contracts/assessment.js';
import {
  buildInvoice,
  withCommissionLine,
  invoiceTotalCents,
  invoiceSubtotalCents,
  commissionCents,
  invoiceNumber,
  addAdjustment,
} from '../../settlement/invoice.js';
import {
  buildStatement,
  renderStatement,
  renderInvoice,
  statementSummary,
  totalsByCode,
} from '../../settlement/statement.js';

/**
 * Settlement commands.
 *
 * An invoice is built rather than stored. Every number on it comes from a
 * contract, a set of grading runs and the drops, all of which are on file, so
 * rebuilding it a year later gives the same answer and a stored copy would
 * only be a second thing to keep in step.
 */

function runsFor(desk, contractId) {
  return desk.store.list('gradings').filter((entry) => entry.contractId === contractId);
}

function dropsFor(desk, contractId) {
  return desk.store.list('drops').filter((entry) => entry.contractId === contractId);
}

function invoiceForContract(desk, contract, { delivered, issuedOn, adjustment, note }) {
  const runs = runsFor(desk, contract.id);
  const assessment = assessContract(contract, runs);
  const drops = dropsFor(desk, contract.id);
  const hives =
    delivered === undefined
      ? drops.reduce((total, drop) => total + (drop.set ?? 0), 0)
      : Number(delivered);
  let invoice = buildInvoice(contract, {
    assessment,
    deliveredHives: hives,
    runs,
    drops,
    issuedOn,
  });
  if (adjustment !== undefined) {
    invoice = addAdjustment(invoice, note ?? 'adjustment', Number(adjustment));
  }
  return withCommissionLine(invoice, contract);
}

export function registerSettlementCommands(program, context) {
  const settlement = program
    .command('settle')
    .description('invoices and grower statements');

  settlement
    .command('invoice <contract>')
    .description('build the invoice for one contract')
    .option('--delivered <hives>', 'hives delivered, otherwise taken from the drops')
    .option('--on <date>', 'issue date, otherwise today')
    .option('--adjustment <cents>', 'a one off adjustment in cents')
    .option('--note <text>', 'what the adjustment is for')
    .action((contractId, options) => {
      const desk = context.desk();
      const contract = desk.store.get('contracts', contractId);
      const invoice = invoiceForContract(desk, contract, {
        delivered: options.delivered,
        issuedOn: options.on ?? desk.clock.today(),
        adjustment: options.adjustment,
        note: options.note,
      });
      if (context.output.json) {
        context.output.value({
          number: invoiceNumber(invoice),
          ...invoice,
          subtotalCents: invoiceSubtotalCents(invoice),
          commissionCents: commissionCents(invoice, contract),
          totalCents: invoiceTotalCents(invoice),
        });
        return;
      }
      context.output.line(renderInvoice(invoice));
    });

  settlement
    .command('statement <grower>')
    .description('one statement across every contract a grower has')
    .requiredOption('--season <year>', 'season to settle')
    .option('--on <date>', 'issue date, otherwise today')
    .action((grower, options) => {
      const desk = context.desk();
      const season = Number(options.season);
      const contracts = desk.store
        .list('contracts')
        .filter((entry) => entry.grower.name === grower && entry.season === season);
      const issuedOn = options.on ?? desk.clock.today();
      const invoices = contracts.map((contract) =>
        invoiceForContract(desk, contract, { issuedOn })
      );
      const statement = buildStatement({ grower, season, invoices, issuedOn });
      if (context.output.json) {
        context.output.value({
          ...statementSummary(statement),
          totals: totalsByCode(statement),
        });
        return;
      }
      context.output.line(renderStatement(statement));
    });

  settlement
    .command('register')
    .description('what every contract in a season came to')
    .requiredOption('--season <year>', 'season to report')
    .action((options) => {
      const desk = context.desk();
      const season = Number(options.season);
      const issuedOn = desk.clock.today();
      const rows = desk.store
        .list('contracts')
        .filter((entry) => entry.season === season)
        .map((contract) => {
          const invoice = invoiceForContract(desk, contract, { issuedOn });
          return {
            contract: contract.id,
            grower: contract.grower.name,
            hives: invoice.deliveredHives,
            payable: invoice.payableHives,
            rule: invoice.rule,
            total: invoiceTotalCents(invoice),
          };
        });
      context.output.table(
        [
          { header: 'contract', key: 'contract' },
          { header: 'grower', key: 'grower' },
          { header: 'hives', key: 'hives', align: 'right' },
          { header: 'payable', key: 'payable', align: 'right' },
          { header: 'rule', key: 'rule' },
          { header: 'total', key: 'total', align: 'right', format: formatMoney },
        ],
        sortBy(rows, (row) => row.contract)
      );
    });

  return settlement;
}
