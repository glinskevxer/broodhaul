import { seasonOf } from '../../core/dates.js';
import { formatMoney } from '../../core/money.js';
import { contractRows, renderSeason, seasonSummary } from '../../reporting/season.js';

/**
 * The season report.
 *
 * One command, because the office asks the same eight questions every March
 * and the answers all come off the same walk through the records.
 */

const CONTRACT_COLUMNS = [
  { header: 'contract', key: 'contract' },
  { header: 'grower', key: 'grower' },
  { header: 'ordered', key: 'ordered', align: 'right' },
  { header: 'set', key: 'set', align: 'right' },
  { header: 'short', key: 'short', align: 'right' },
  { header: 'average', key: 'average', align: 'right' },
  {
    header: 'made minimum',
    key: 'meetsMinimum',
    format: (value) => (value === undefined ? '' : value ? 'yes' : 'no'),
  },
  { header: 'value', key: 'valueCents', align: 'right', format: formatMoney },
];

export function registerSeasonCommands(program, context) {
  program
    .command('season [year]')
    .description('the season on one page')
    .option('--contracts', 'just the contract table')
    .action((year, options) => {
      const desk = context.desk();
      const season = year === undefined ? seasonOf(desk.clock.today()) : Number(year);
      if (options.contracts) {
        context.output.table(CONTRACT_COLUMNS, contractRows(desk, season));
        return;
      }
      if (context.output.json) {
        context.output.value({
          ...seasonSummary(desk, season),
          contractRows: contractRows(desk, season),
        });
        return;
      }
      context.output.line(renderSeason(desk, season));
    });

  return program;
}
