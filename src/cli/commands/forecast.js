import { asNumber, asText, parseList } from '../parse.js';
import { seasonOf } from '../../core/dates.js';
import { isProductive } from '../../apiary/colony.js';
import { contractedHives } from '../../contracts/contract.js';
import {
  forecastToBloom,
  splitsNeededFor,
  increaseFeasible,
  contractCoverage,
  describeForecast,
  lossTable,
} from '../../reporting/forecast.js';

/**
 * Forecast commands.
 *
 * The default is the one that matters: take the colonies on the books, walk
 * them to bloom, and hold the answer against what has been contracted. The
 * office runs it in September and again in November, and the difference
 * between the two runs is the reason to make splits or to sell a contract on.
 */

const STRENGTHS = {
  label: 'strengths',
  example: 'CY-2025-0011:12,CY-2025-0012:9',
  fields: [
    { name: 'id', convert: asText },
    { name: 'frames', convert: asNumber },
  ],
};

export function registerForecastCommands(program, context) {
  const forecast = program
    .command('forecast')
    .description('colonies at bloom against contracts');

  forecast
    .command('bloom')
    .description('walk the colonies on the books through to bloom')
    .option('--colonies <count>', 'colonies to start from, otherwise what is on file')
    .option('--from <stage>', 'fall or winter', 'fall')
    .option('--splits <count>', 'splits made', '0')
    .option('--split-stage <stage>', 'the stage the splits were made in', 'fall')
    .option('--season <year>', 'season to hold the answer against')
    .action((options) => {
      const desk = context.desk();
      const colonies =
        options.colonies === undefined
          ? desk.store.list('colonies').filter(isProductive).length
          : Number(options.colonies);
      const outcome = forecastToBloom(colonies, {
        from: options.from,
        splits: Number(options.splits),
        splitStage: options.splitStage,
      });
      const season =
        options.season === undefined
          ? seasonOf(desk.clock.today())
          : Number(options.season);
      const contracted = desk.store
        .list('contracts')
        .filter((contract) => contract.season === season)
        .reduce((total, contract) => total + contractedHives(contract), 0);
      const coverage = contractCoverage(outcome.atBloom, contracted);
      if (context.output.json) {
        context.output.value({ ...outcome, season, coverage });
        return;
      }
      context.output.line(describeForecast(outcome));
      context.output.line();
      context.output.detail([
        ['season', String(season)],
        ['contracted', String(coverage.contracted)],
        ['at bloom', String(coverage.atBloom)],
        [
          'cover',
          coverage.covered
            ? `${coverage.spare} spare`
            : `short by ${Math.abs(coverage.spare)}`,
        ],
      ]);
    });

  forecast
    .command('splits')
    .description('splits needed to reach a target at bloom')
    .requiredOption('--target <count>', 'colonies wanted at bloom')
    .option('--colonies <count>', 'colonies to start from, otherwise what is on file')
    .option('--split-stage <stage>', 'the stage the splits would be made in', 'fall')
    .option(
      '--strengths <list>',
      'colony:frames pairs, to say whether the yards can carry it'
    )
    .action((options) => {
      const desk = context.desk();
      const colonies =
        options.colonies === undefined
          ? desk.store.list('colonies').filter(isProductive).length
          : Number(options.colonies);
      const needed = splitsNeededFor(Number(options.target), colonies, {
        splitStage: options.splitStage,
      });
      const feasible =
        options.strengths === undefined
          ? null
          : increaseFeasible(parseList(options.strengths, STRENGTHS), needed);
      context.output.value({
        target: Number(options.target),
        colonies,
        splitsNeeded: needed,
        ...(feasible === null
          ? {}
          : { possible: feasible.possible, short: feasible.short }),
      });
    });

  forecast
    .command('losses')
    .description('the loss and maturity rates the forecast uses')
    .action(() => {
      context.output.table(
        [
          { header: 'stage', key: 'stage' },
          { header: 'loss', key: 'loss', align: 'right' },
          { header: 'split maturity', key: 'splitMaturity', align: 'right' },
        ],
        lossTable()
      );
    });

  return forecast;
}
