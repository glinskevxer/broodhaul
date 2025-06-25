import { asNumber, asText, parseList } from '../parse.js';
import { formatMoney } from '../../core/money.js';
import {
  planIncrease,
  increaseSummary,
  latestMakeDate,
  makeSplit,
  projectedFrames,
  willMakeGrade,
  QUEEN_SOURCES,
} from '../../apiary/split.js';
import {
  inventoryReport,
  makeHolding,
  requirementFor,
  EQUIPMENT_KINDS,
} from '../../apiary/equipment.js';

/**
 * Increase and the woodenware to put it in.
 *
 * These two questions are asked in the same conversation every autumn: how
 * many splits can we make, and can we house them. Answering one without the
 * other is how an outfit ends up with three hundred nucs in cardboard.
 */

const STRENGTHS = {
  label: 'strengths',
  example: 'CY-2025-0011:12,CY-2025-0012:9',
  fields: [
    { name: 'id', convert: asText },
    { name: 'frames', convert: asNumber },
  ],
};

const HOLDINGS = {
  label: 'holdings',
  example: 'deep box:800:3,lid:400:5',
  fields: [
    { name: 'kind', convert: asText },
    { name: 'onHand', convert: asNumber },
    { name: 'averageAgeSeasons', convert: asNumber, optional: true },
  ],
};

export function registerIncreaseCommands(program, context) {
  const increase = program
    .command('increase')
    .description('splits and the gear to house them');

  increase
    .command('plan')
    .description('how many splits a set of colonies can carry')
    .requiredOption('--strengths <list>', 'colony:frames pairs, comma separated')
    .option('--take <frames>', 'frames taken per split', '2')
    .option('--wanted <count>', 'stop after this many splits')
    .action((options) => {
      const colonies = parseList(options.strengths, STRENGTHS);
      const plan = planIncrease(colonies, {
        takeFrames: Number(options.take),
        wanted: options.wanted === undefined ? undefined : Number(options.wanted),
      });
      const summary = increaseSummary(plan, colonies);
      if (context.output.json) {
        context.output.value({ ...summary, splitsPlanned: plan });
        return;
      }
      context.output.table(
        [
          { header: 'donor', key: 'donorId' },
          { header: 'take', key: 'takeFrames', align: 'right' },
          { header: 'donor left', key: 'donorLeft', align: 'right' },
        ],
        plan
      );
      context.output.line(
        `${summary.splits} splits off ${summary.donors} donors, ${summary.coloniesAfter} colonies after`
      );
    });

  increase
    .command('deadline')
    .description('the last day a split can be made and still make grade')
    .requiredOption('--target <frames>', 'frames wanted by the date')
    .requiredOption('--by <date>', 'the date they are wanted')
    .option('--take <frames>', 'frames the split starts with', '2')
    .option('--queened <how>', `one of ${QUEEN_SOURCES.join(', ')}`, 'cell')
    .action((options) => {
      const latest = latestMakeDate(Number(options.target), options.by, {
        takeFrames: Number(options.take),
        queenedBy: options.queened,
      });
      const split = makeSplit({
        donorId: 'CY-0000-0000',
        takeFrames: Number(options.take),
        queenedBy: options.queened,
        madeOn: latest,
      });
      context.output.value({
        latest,
        projected: projectedFrames(split, options.by),
        makesGrade: willMakeGrade(split, Number(options.target), options.by),
      });
    });

  increase
    .command('equipment')
    .description('what has to be bought to house a colony count')
    .requiredOption('--colonies <count>', 'colonies to house')
    .option('--holdings <list>', 'kind:onHand:age triples, comma separated')
    .action((options) => {
      const holdings =
        options.holdings === undefined
          ? []
          : parseList(options.holdings, HOLDINGS).map((entry) => makeHolding(entry));
      const report = inventoryReport(holdings, Number(options.colonies));
      if (context.output.json) {
        context.output.value(report);
        return;
      }
      context.output.table(
        [
          { header: 'kind', key: 'kind' },
          { header: 'needed', key: 'needed', align: 'right' },
          { header: 'on hand', key: 'onHand', align: 'right' },
          { header: 'attrition', key: 'attrition', align: 'right' },
          { header: 'buy', key: 'buy', align: 'right' },
        ],
        report.lines
      );
      context.output.line(`buy ${formatMoney(report.buyCostCents)} of woodenware`);
    });

  increase
    .command('kinds')
    .description('the woodenware kinds and what a colony needs of each')
    .action(() => {
      const rows = requirementFor(1).map((row) => ({
        kind: row.kind,
        perColony: row.needed,
      }));
      const unused = EQUIPMENT_KINDS.filter(
        (kind) => !rows.some((row) => row.kind === kind)
      ).map((kind) => ({ kind, perColony: 0 }));
      context.output.table(
        [
          { header: 'kind', key: 'kind' },
          { header: 'per colony', key: 'perColony', align: 'right' },
        ],
        [...rows, ...unused].sort((left, right) => left.kind.localeCompare(right.kind))
      );
    });

  return increase;
}
