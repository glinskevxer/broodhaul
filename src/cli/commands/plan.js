import { asNumber, asText, parseList } from '../parse.js';
import { seasonOf } from '../../core/dates.js';
import { kpiRows, kpis } from '../../reporting/kpi.js';
import {
  syrupRunFor,
  splitIntoDays,
  daysNeeded,
  runCostCents,
  proteinRunFor,
  visitDates,
  describeRun,
} from '../../feeding/schedule.js';
import { formatMoney } from '../../core/money.js';

/**
 * Planning commands: the season numbers and the feeding run.
 *
 * Both read the records and write nothing, so they can be run in the middle of
 * an argument without anybody worrying about what they might change.
 */

const YARD_COLONIES = {
  label: 'yards',
  example: 'YD-2025-0001:96,YD-2025-0002:64',
  fields: [
    { name: 'yardId', convert: asText },
    { name: 'colonies', convert: asNumber },
  ],
};

export function registerPlanCommands(program, context) {
  program
    .command('kpi [year]')
    .description('the numbers the operation is judged on')
    .action((year) => {
      const desk = context.desk();
      const season = year === undefined ? seasonOf(desk.clock.today()) : Number(year);
      if (context.output.json) {
        context.output.value(kpis(desk, season));
        return;
      }
      context.output.table(
        [
          { header: 'measure', key: 'name' },
          { header: 'value', key: 'value' },
          {
            header: 'rate',
            key: 'rate',
            align: 'right',
            format: (rate) => (rate === null ? '' : `${Math.round(rate * 1000) / 10}%`),
          },
        ],
        kpiRows(desk, season)
      );
    });

  const feed = program.command('feed').description('syrup and protein runs');

  feed
    .command('syrup')
    .description('size a syrup run and split it into days')
    .requiredOption('--yards <list>', 'yard:colonies pairs, comma separated')
    .requiredOption('--stage <stage>', 'winter, bloom, flow or fall')
    .requiredOption('--from <date>', 'first day of the run')
    .option('--tank <gallons>', 'tank on the truck')
    .option('--yards-per-day <count>', 'yards the crew does in a day')
    .option('--sugar <cents>', 'sugar price per pound, to cost the run')
    .action((options) => {
      const run = syrupRunFor(parseList(options.yards, YARD_COLONIES), options.stage);
      const settings = {
        ...(options.tank === undefined ? {} : { tankGallons: Number(options.tank) }),
        ...(options.yardsPerDay === undefined
          ? {}
          : { yardsPerDay: Number(options.yardsPerDay) }),
      };
      if (context.output.json) {
        context.output.value({
          stage: run.stage,
          ratio: run.ratio,
          gallons: run.gallons,
          colonies: run.colonies,
          days: splitIntoDays(run, options.from, settings),
          daysNeeded: daysNeeded(run, settings),
          costCents:
            options.sugar === undefined
              ? null
              : runCostCents(run, Number(options.sugar)),
        });
        return;
      }
      context.output.line(describeRun(run, options.from, settings));
      if (options.sugar !== undefined) {
        context.output.line(
          `${formatMoney(runCostCents(run, Number(options.sugar)))} of sugar`
        );
      }
    });

  feed
    .command('protein')
    .description('size a protein run over a build up')
    .requiredOption('--yards <list>', 'yard:colonies pairs, comma separated')
    .requiredOption('--days <count>', 'days the build up covers')
    .requiredOption('--from <date>', 'first visit')
    .option('--kind <kind>', 'patty, dry sub or trapped pollen', 'patty')
    .action((options) => {
      const yards = parseList(options.yards, YARD_COLONIES);
      const run = proteinRunFor(yards, options.kind, Number(options.days));
      const dates = visitDates(options.from, Number(options.days));
      if (context.output.json) {
        context.output.value({ ...run, dates });
        return;
      }
      context.output.detail([
        ['ration', run.kind],
        ['colonies', String(run.colonies)],
        ['visits', String(run.visits)],
        ['per visit', `${run.poundsPerVisit} lb`],
        ['cost', formatMoney(run.costCents)],
        ['dates', dates.join(', ')],
      ]);
    });

  return program;
}
