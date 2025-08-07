import { join } from 'node:path';
import { readJson, writeJson } from '../../store/files.js';
import { formatMoney } from '../../core/money.js';
import {
  registerNames,
  registerRows,
  registerColumns,
  renderRegister,
} from '../../reporting/registers.js';
import {
  makeLedger,
  balancesByGrower,
  agingReport,
  openCharges,
  describeAging,
} from '../../settlement/ledger.js';

/**
 * Office commands: the binder registers and the receivables book.
 *
 * The ledger lives in its own file rather than in the record store, because a
 * payment is a fact about the bank rather than about the bees, and the office
 * reconciles it against a statement rather than against a yard.
 */

const LEDGER_FILE = 'settlement/ledger.json';

function loadLedger(root) {
  return makeLedger(readJson(join(root, LEDGER_FILE), { missing: [] }));
}

function saveLedger(root, entries) {
  writeJson(join(root, LEDGER_FILE), entries);
  return entries;
}

const AGING_COLUMNS = [
  { header: 'grower', key: 'grower' },
  { header: 'current', key: 'current', align: 'right', format: formatMoney },
  { header: 'over 30', key: 'over30', align: 'right', format: formatMoney },
  { header: 'over 60', key: 'over60', align: 'right', format: formatMoney },
  { header: 'over 90', key: 'over90', align: 'right', format: formatMoney },
  { header: 'total', key: 'totalCents', align: 'right', format: formatMoney },
];

export function registerOfficeCommands(program, context) {
  program
    .command('register [name]')
    .description(`one of ${registerNames().join(', ')}`)
    .action((name) => {
      const desk = context.desk();
      if (name === undefined) {
        context.output.value(registerNames());
        return;
      }
      if (context.output.json) {
        context.output.value(registerRows(desk, name));
        return;
      }
      context.output.line(renderRegister(desk, name));
    });

  const ledger = program
    .command('ledger')
    .description('what growers owe and have paid');

  ledger
    .command('charge <grower>')
    .description('put a charge on the book')
    .requiredOption('--id <id>', 'entry identifier')
    .requiredOption('--amount <cents>', 'amount in cents')
    .requiredOption('--on <date>', 'day of the charge')
    .option('--contract <id>', 'contract it settles')
    .action((grower, options) => {
      const desk = context.desk();
      const entries = [
        ...loadLedger(desk.root),
        {
          id: options.id,
          grower,
          contractId: options.contract,
          kind: 'charge',
          amountCents: Number(options.amount),
          date: options.on,
        },
      ];
      saveLedger(desk.root, makeLedger(entries));
      context.output.value({
        id: options.id,
        grower,
        amountCents: Number(options.amount),
      });
    });

  ledger
    .command('payment <grower>')
    .description('record money in')
    .requiredOption('--id <id>', 'entry identifier')
    .requiredOption('--amount <cents>', 'amount in cents, negative')
    .requiredOption('--on <date>', 'day it arrived')
    .option('--reference <text>', 'check number or wire reference')
    .action((grower, options) => {
      const desk = context.desk();
      const entries = [
        ...loadLedger(desk.root),
        {
          id: options.id,
          grower,
          kind: 'payment',
          amountCents: Number(options.amount),
          date: options.on,
          reference: options.reference,
        },
      ];
      saveLedger(desk.root, makeLedger(entries));
      context.output.value({
        id: options.id,
        grower,
        amountCents: Number(options.amount),
      });
    });

  ledger
    .command('balances')
    .description('what each grower owes')
    .action(() => {
      const rows = balancesByGrower(loadLedger(context.desk().root));
      context.output.table(
        [
          { header: 'grower', key: 'grower' },
          {
            header: 'charged',
            key: 'chargedCents',
            align: 'right',
            format: formatMoney,
          },
          { header: 'paid', key: 'paidCents', align: 'right', format: formatMoney },
          {
            header: 'balance',
            key: 'balanceCents',
            align: 'right',
            format: formatMoney,
          },
        ],
        rows
      );
    });

  ledger
    .command('aging')
    .description('open charges by age')
    .option('--as-of <date>', 'the day to age against, otherwise today')
    .action((options) => {
      const desk = context.desk();
      const asOf = options.asOf ?? desk.clock.today();
      const rows = agingReport(loadLedger(desk.root), asOf);
      if (context.output.json) {
        context.output.value(rows);
        return;
      }
      context.output.table(AGING_COLUMNS, rows);
      for (const row of rows.filter((entry) => entry.over90 > 0)) {
        context.output.line(describeAging(row));
      }
    });

  ledger
    .command('open <grower>')
    .description('the charges still open for one grower')
    .option('--as-of <date>', 'the day to read as of, otherwise today')
    .action((grower, options) => {
      const desk = context.desk();
      const asOf = options.asOf ?? desk.clock.today();
      const open = openCharges(loadLedger(desk.root), grower, asOf);
      context.output.table(
        [
          { header: 'entry', key: 'id' },
          { header: 'date', key: 'date' },
          { header: 'open', key: 'openCents', align: 'right', format: formatMoney },
          { header: 'days', key: 'ageDays', align: 'right' },
        ],
        open
      );
    });

  return program;
}

export { LEDGER_FILE, registerColumns };
