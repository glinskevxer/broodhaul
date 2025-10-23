import { join } from 'node:path';
import { readJson, writeJson } from '../../store/files.js';
import { formatMoney } from '../../core/money.js';
import { parseIdList } from '../parse.js';
import {
  STATES,
  makeRegistration,
  calendarFor,
  outstanding,
  totalFeeCents,
  checkFiledInTime,
  describeRegistration,
} from '../../apiary/registration.js';
import {
  makeDispute,
  advance,
  openDisputes,
  exposureCents,
  settledCents,
  remedyFor,
  describeDispute,
  GROUNDS,
} from '../../contracts/dispute.js';

/**
 * Compliance commands: state registrations and grower disputes.
 *
 * Both are books the office keeps rather than records about bees, so both live
 * in their own file under the record directory. Both are also the sort of
 * thing that gets forgotten, so both commands lead with what is outstanding
 * rather than with what has been done.
 */

const REGISTRATION_FILE = 'compliance/registrations.json';
const DISPUTE_FILE = 'compliance/disputes.json';

const readRegistrations = (root) =>
  readJson(join(root, REGISTRATION_FILE), { missing: [] }).map(makeRegistration);
const readDisputes = (root) =>
  readJson(join(root, DISPUTE_FILE), { missing: [] }).map(makeDispute);

export function registerComplianceCommands(program, context) {
  const registration = program
    .command('registration')
    .description('state hive registrations');

  registration
    .command('calendar')
    .description('what is due and when')
    .requiredOption('--year <year>', 'registration year')
    .option('--states <list>', 'state codes, comma separated', STATES.join(','))
    .action((options) => {
      const rows = calendarFor(
        parseIdList(options.states, 'states'),
        Number(options.year)
      );
      context.output.table(
        [
          { header: 'state', key: 'state' },
          { header: 'count on', key: 'countOn' },
          { header: 'due', key: 'dueOn' },
          { header: 'grace ends', key: 'graceEndsOn' },
        ],
        rows
      );
    });

  registration
    .command('file <state>')
    .description('record a registration')
    .requiredOption('--year <year>', 'registration year')
    .requiredOption('--hives <count>', 'hives counted')
    .requiredOption('--apiaries <count>', 'apiaries registered')
    .option('--on <date>', 'day it was filed')
    .option('--number <number>', 'registration number')
    .action((state, options) => {
      const desk = context.desk();
      const record = makeRegistration({
        state,
        year: Number(options.year),
        hives: Number(options.hives),
        apiaries: Number(options.apiaries),
        filedOn: options.on,
        number: options.number,
      });
      const existing = readRegistrations(desk.root).filter(
        (entry) => !(entry.state === record.state && entry.year === record.year)
      );
      writeJson(join(desk.root, REGISTRATION_FILE), [...existing, record]);
      context.output.value({
        state: record.state,
        year: record.year,
        feeCents: record.feeCents,
        filedOn: record.filedOn ?? null,
      });
    });

  registration
    .command('outstanding')
    .description('states with nothing filed yet')
    .requiredOption('--year <year>', 'registration year')
    .option('--states <list>', 'state codes, comma separated', STATES.join(','))
    .action((options) => {
      const desk = context.desk();
      const rows = outstanding(
        readRegistrations(desk.root),
        parseIdList(options.states, 'states'),
        Number(options.year),
        desk.clock.today()
      );
      context.output.table(
        [
          { header: 'state', key: 'state' },
          { header: 'due', key: 'dueOn' },
          {
            header: 'overdue',
            key: 'overdue',
            format: (value) => (value ? 'yes' : ''),
          },
        ],
        rows
      );
    });

  registration
    .command('book')
    .description('what has been filed and what it cost')
    .action(() => {
      const desk = context.desk();
      const records = readRegistrations(desk.root);
      if (context.output.json) {
        context.output.value({ records, totalFeeCents: totalFeeCents(records) });
        return;
      }
      for (const record of records) {
        context.output.line(describeRegistration(record));
      }
      context.output.line(`${formatMoney(totalFeeCents(records))} in fees`);
    });

  registration
    .command('check <state>')
    .description('refuse a registration that missed its window')
    .requiredOption('--year <year>', 'registration year')
    .action((state, options) => {
      const desk = context.desk();
      const record = readRegistrations(desk.root).find(
        (entry) =>
          entry.state === state.toUpperCase() && entry.year === Number(options.year)
      );
      checkFiledInTime(
        record ??
          makeRegistration({ state, year: Number(options.year), hives: 0, apiaries: 0 })
      );
      context.output.value({
        state: state.toUpperCase(),
        year: Number(options.year),
        ok: true,
      });
    });

  const dispute = program.command('dispute').description('grower disputes');

  dispute
    .command('raise <contract>')
    .description('put a dispute on the book')
    .requiredOption('--id <id>', 'dispute identifier')
    .requiredOption('--grounds <grounds>', GROUNDS.join(', '))
    .requiredOption('--amount <cents>', 'amount in dispute')
    .requiredOption('--on <date>', 'day it was raised')
    .option('--note <text>', 'what the grower said')
    .action((contractId, options) => {
      const desk = context.desk();
      const record = makeDispute({
        id: options.id,
        contractId,
        grounds: options.grounds,
        amountCents: Number(options.amount),
        raisedOn: options.on,
        note: options.note,
      });
      const existing = readDisputes(desk.root).filter(
        (entry) => entry.id !== record.id
      );
      writeJson(join(desk.root, DISPUTE_FILE), [...existing, record]);
      context.output.value({
        id: record.id,
        grounds: record.grounds,
        remedy: remedyFor(record, { regradeOpen: options.grounds !== 'grading' }),
      });
    });

  dispute
    .command('advance <id> <state>')
    .description('move a dispute to answered, settled or withdrawn')
    .option('--settled <cents>', 'what it settled for')
    .action((id, state, options) => {
      const desk = context.desk();
      const book = readDisputes(desk.root);
      const record = book.find((entry) => entry.id === id.toUpperCase());
      if (!record) {
        context.output.warn(`no dispute ${id}`);
        process.exitCode = 3;
        return;
      }
      const moved = advance(record, state, {
        settledCents:
          options.settled === undefined ? undefined : Number(options.settled),
      });
      writeJson(
        join(desk.root, DISPUTE_FILE),
        book.map((entry) => (entry.id === moved.id ? moved : entry))
      );
      context.output.value({ id: moved.id, state: moved.state });
    });

  dispute
    .command('open')
    .description('what is still open, soonest answer first')
    .action(() => {
      const desk = context.desk();
      const book = readDisputes(desk.root);
      const rows = openDisputes(book, desk.clock.today());
      if (context.output.json) {
        context.output.value({
          open: rows,
          exposureCents: exposureCents(book),
          settledCents: settledCents(book),
        });
        return;
      }
      for (const row of rows) {
        context.output.line(
          describeDispute(
            book.find((entry) => entry.id === row.id),
            desk.clock.today()
          )
        );
      }
      context.output.line(`${formatMoney(exposureCents(book))} in dispute`);
    });

  return program;
}
