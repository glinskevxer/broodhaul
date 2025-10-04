import { asNumber, asText, parseList } from '../parse.js';
import {
  makeTicket,
  netLb,
  axleOverages,
  grossOverageLb,
  checkTicket,
  compareToEstimate,
  palletsUnaccounted,
  AXLES,
} from '../../movement/scale.js';
import {
  makeGraft,
  checkBuilderCapacity,
  expectedCells,
  expectedQueens,
  graftsNeeded,
  batchesNeeded,
  latestGraftDate,
  scheduleFor,
  describeGraft,
} from '../../apiary/queen.js';

/**
 * Yard work: scale tickets and queen rearing.
 *
 * Both are things somebody types in from a piece of paper, so both commands
 * take the numbers exactly as they appear on it and do the arithmetic
 * afterwards rather than asking for a total.
 */

const AXLE_WEIGHTS = {
  label: 'axles',
  example: 'steer:11000,drives:32000,trailer:31000',
  fields: [
    { name: 'axle', convert: asText },
    { name: 'weightLb', convert: asNumber },
  ],
};

export function registerYardworkCommands(program, context) {
  const scale = program.command('scale').description('scale tickets');

  scale
    .command('ticket')
    .description('read a ticket and say whether it is legal')
    .requiredOption('--number <number>', 'ticket number')
    .requiredOption('--load <id>', 'load it belongs to')
    .requiredOption('--scale <name>', 'which scale')
    .requiredOption('--on <date>', 'day it was weighed')
    .requiredOption('--gross <lb>', 'gross weight')
    .option('--tare <lb>', 'tare weight', '0')
    .option('--axles <list>', 'axle:weight pairs, comma separated')
    .option('--kind <kind>', 'semi, bobtail or flatbed', 'semi')
    .option('--estimate <lb>', 'what the office worked out')
    .option('--pallet <lb>', 'weight of one pallet, to explain a difference', '508')
    .action((options) => {
      const axles = Object.fromEntries(
        (options.axles === undefined ? [] : parseList(options.axles, AXLE_WEIGHTS)).map(
          (entry) => [entry.axle, entry.weightLb]
        )
      );
      const ticket = makeTicket({
        number: options.number,
        loadId: options.load,
        scale: options.scale,
        weighedOn: options.on,
        grossLb: Number(options.gross),
        tareLb: Number(options.tare),
        axles,
      });
      const comparison =
        options.estimate === undefined
          ? null
          : compareToEstimate(ticket, Number(options.estimate));
      const payload = {
        number: ticket.number,
        grossLb: ticket.grossLb,
        netLb: netLb(ticket),
        overLb: grossOverageLb(ticket, options.kind),
        axlesOver: axleOverages(ticket),
        comparison,
        pallets:
          comparison === null
            ? null
            : palletsUnaccounted(comparison, Number(options.pallet)),
      };
      if (context.output.json) {
        context.output.value(payload);
        return;
      }
      context.output.detail([
        ['ticket', payload.number],
        ['gross', `${payload.grossLb} lb`],
        ['net', `${payload.netLb} lb`],
        ['over gross', payload.overLb === 0 ? 'no' : `${payload.overLb} lb`],
        [
          'axles over',
          payload.axlesOver.length === 0
            ? 'none'
            : payload.axlesOver.map((row) => `${row.axle} by ${row.overLb}`).join(', '),
        ],
        ...(comparison === null
          ? []
          : [
              ['estimate', `${comparison.estimateLb} lb`],
              [
                'difference',
                `${comparison.differenceLb} lb${comparison.withinTolerance ? '' : `, about ${payload.pallets} pallets`}`,
              ],
            ]),
      ]);
    });

  scale
    .command('check')
    .description('refuse a ticket that would get a citation')
    .requiredOption('--number <number>', 'ticket number')
    .requiredOption('--load <id>', 'load it belongs to')
    .requiredOption('--scale <name>', 'which scale')
    .requiredOption('--on <date>', 'day it was weighed')
    .requiredOption('--gross <lb>', 'gross weight')
    .option('--axles <list>', 'axle:weight pairs, comma separated')
    .option('--kind <kind>', 'semi, bobtail or flatbed', 'semi')
    .action((options) => {
      const axles = Object.fromEntries(
        (options.axles === undefined ? [] : parseList(options.axles, AXLE_WEIGHTS)).map(
          (entry) => [entry.axle, entry.weightLb]
        )
      );
      const ticket = makeTicket({
        number: options.number,
        loadId: options.load,
        scale: options.scale,
        weighedOn: options.on,
        grossLb: Number(options.gross),
        axles,
      });
      checkTicket(ticket, options.kind);
      context.output.value({ number: ticket.number, legal: true, axles: AXLES.length });
    });

  const queen = program.command('queen').description('queen rearing');

  queen
    .command('graft')
    .description('book a graft and print its calendar')
    .requiredOption('--id <id>', 'graft identifier')
    .requiredOption('--on <date>', 'day of the graft')
    .requiredOption('--count <cells>', 'cells grafted')
    .requiredOption('--builder <id>', 'cell builder used')
    .option('--grafter <who>', 'experienced or learning', 'experienced')
    .option('--already-in <cells>', 'cells already in that builder', '0')
    .action((options) => {
      const graft = makeGraft({
        id: options.id,
        graftedOn: options.on,
        grafted: Number(options.count),
        grafter: options.grafter,
        builderId: options.builder,
      });
      checkBuilderCapacity(graft, Number(options.alreadyIn));
      if (context.output.json) {
        context.output.value({
          ...graft,
          cells: expectedCells(graft),
          queens: expectedQueens(graft),
          schedule: scheduleFor(graft),
        });
        return;
      }
      context.output.line(describeGraft(graft));
      context.output.table(
        [
          { header: 'stage', key: 'stage' },
          { header: 'on', key: 'on' },
        ],
        scheduleFor(graft)
      );
      context.output.line(
        `expect ${expectedCells(graft)} cells, ${expectedQueens(graft)} queens`
      );
    });

  queen
    .command('plan')
    .description('grafts and batches needed for a number of queens')
    .requiredOption('--queens <count>', 'laying queens wanted')
    .requiredOption('--by <date>', 'when they have to be laying')
    .option('--grafter <who>', 'experienced or learning', 'experienced')
    .action((options) => {
      context.output.value({
        queens: Number(options.queens),
        grafts: graftsNeeded(Number(options.queens), { grafter: options.grafter }),
        batches: batchesNeeded(Number(options.queens), { grafter: options.grafter }),
        latestGraft: latestGraftDate(options.by),
      });
    });

  return program;
}
