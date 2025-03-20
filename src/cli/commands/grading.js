import { ValidationError } from '../../core/errors.js';
import { formatMoney } from '../../core/money.js';
import {
  makeGradingRun,
  runMethod,
  runAverage,
  runDistribution,
  runFlags,
  summariseRun,
  checkSampleSize,
} from '../../grading/run.js';
import { assessContract, assessmentShortfall } from '../../contracts/assessment.js';
import { applyShortfall, shortfallValueCents } from '../../contracts/shortfall.js';
import { describeConditions } from '../../grading/conditions.js';

/**
 * Grading commands.
 *
 * A run is typed in off the field sheet: the weather at the top, then a colony
 * and a frame count per line. The method falls out of the weather rather than
 * being chosen, which is the point, so `grading add` says which method it used
 * and the grader can argue with the thermometer instead of the software.
 */

const LIST_COLUMNS = [
  { header: 'run', key: 'id' },
  { header: 'contract', key: 'contractId' },
  { header: 'date', key: 'date' },
  { header: 'method', key: 'method' },
  { header: 'read', key: 'read', align: 'right' },
  { header: 'average', key: 'average', align: 'right' },
];

function parseReadings(text) {
  return text.split(',').map((entry) => {
    const [colonyId, measure, flag] = entry.split(':').map((part) => part.trim());
    if (!colonyId || measure === undefined) {
      throw new ValidationError(
        `readings look like "CY-2025-0011:8,CY-2025-0012:6.5", got ${entry}`,
        { entry }
      );
    }
    const reading = { colonyId };
    if (measure.endsWith('in')) {
      reading.clusterInches = Number(measure.slice(0, -2));
    } else {
      reading.frames = Number(measure);
    }
    if (flag === 'queenless') reading.queenright = false;
    if (flag === 'nobrood') reading.brood = false;
    return reading;
  });
}

export function registerGradingCommands(program, context) {
  const grading = program.command('grading').description('colony strength grading');

  grading
    .command('add')
    .description('record a grading run off the field sheet')
    .requiredOption('--id <id>', 'grading identifier')
    .requiredOption('--contract <id>', 'contract being graded')
    .requiredOption('--drop <id>', 'drop being graded')
    .requiredOption('--grader <name>', 'who opened the hives')
    .requiredOption('--on <date>', 'day of the run')
    .requiredOption('--at <time>', 'time of day, HH:MM')
    .requiredOption('--temperature <degrees>', 'ambient temperature in F')
    .requiredOption('--readings <list>', 'colony:frames pairs, comma separated')
    .option('--wind <mph>', 'wind speed in mph', '5')
    .option('--precipitation <kind>', 'none, drizzle or rain', 'none')
    .option('--witness <name>', 'who watched from the grower side')
    .action((options) => {
      const record = makeGradingRun({
        id: options.id,
        contractId: options.contract,
        dropId: options.drop,
        grader: options.grader,
        conditions: {
          date: options.on,
          time: options.at,
          temperatureF: Number(options.temperature),
          windMph: Number(options.wind),
          precipitation: options.precipitation,
        },
        readings: parseReadings(options.readings),
        witness: options.witness,
      });
      const method = runMethod(record);
      const saved = context.desk().save('gradings', record);
      context.output.value({
        id: saved.id,
        method,
        read: saved.readings.length,
        average: runAverage(saved),
      });
    });

  grading
    .command('list')
    .description('grading runs on the books')
    .option('--contract <id>', 'only this contract')
    .action((options) => {
      let runs = context.desk().store.list('gradings');
      if (options.contract) {
        runs = runs.filter((entry) => entry.contractId === options.contract);
      }
      context.output.table(LIST_COLUMNS, runs.map(summariseRun));
    });

  grading
    .command('show <id>')
    .description('one run in full, with the distribution')
    .action((id) => {
      const record = context.desk().store.get('gradings', id);
      const summary = summariseRun(record);
      if (context.output.json) {
        context.output.value({
          ...summary,
          distribution: runDistribution(record),
          flags: runFlags(record),
        });
        return;
      }
      context.output.detail([
        ['run', summary.id],
        ['contract', summary.contractId],
        ['conditions', describeConditions(record.conditions)],
        ['method', summary.method],
        ['read', String(summary.read)],
        ['average', String(summary.average)],
        ['queenless', String(summary.queenless)],
        ['broodless', String(summary.broodless)],
      ]);
      context.output.line();
      context.output.table(
        [
          { header: 'frames', key: 'frames', align: 'right' },
          { header: 'colonies', key: 'colonies', align: 'right' },
        ],
        runDistribution(record)
      );
    });

  grading
    .command('assess <contract>')
    .description('what the grading does to the money')
    .requiredOption('--delivered <hives>', 'hives actually delivered')
    .action((contractId, options) => {
      const desk = context.desk();
      const contract = desk.store.get('contracts', contractId);
      const runs = desk.store
        .list('gradings')
        .filter((entry) => entry.contractId === contractId);
      const assessment = assessContract(contract, runs);
      const outcome = applyShortfall(
        contract,
        assessment,
        Number(options.delivered),
        runs
      );
      const payload = {
        contract: contract.id,
        average: assessment.average,
        meetsMinimum: assessment.meetsMinimum,
        shortfall: assessmentShortfall(contract, assessment),
        perHiveAdjustmentCents: assessment.perHiveAdjustmentCents,
        rule: outcome.rule,
        payableHives: outcome.payableHives,
        rateCents: outcome.rateCents,
        valueCents: shortfallValueCents(outcome),
      };
      if (context.output.json) {
        context.output.value(payload);
        return;
      }
      context.output.detail([
        ['contract', payload.contract],
        ['average', String(payload.average)],
        [
          'minimum met',
          payload.meetsMinimum ? 'yes' : `no, short by ${payload.shortfall}`,
        ],
        ['tier per hive', formatMoney(payload.perHiveAdjustmentCents)],
        ['rule', outcome.rule],
        ['note', outcome.note],
        [
          'payable',
          `${payload.payableHives} hives at ${formatMoney(payload.rateCents)}`,
        ],
        ['value', formatMoney(payload.valueCents)],
      ]);
    });

  grading
    .command('sample <id>')
    .description('check a run opened as many hives as the terms ask for')
    .requiredOption('--population <hives>', 'hives standing on the drop')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('gradings', id);
      const contract = desk.store.get('contracts', record.contractId);
      const wanted = checkSampleSize(
        record,
        Number(options.population),
        contract.terms.samplePercent
      );
      context.output.value({ run: record.id, opened: record.readings.length, wanted });
    });

  return grading;
}
