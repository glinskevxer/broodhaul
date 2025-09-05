import {
  makeColony,
  transitionColony,
  requeen,
  boxCount,
  colonyLabel,
  allowedTransitions,
} from '../../apiary/colony.js';
import { coloniesInYard, looseColonies, palletFor } from '../../apiary/register.js';

/**
 * Colony commands.
 *
 * The write the yard crew makes most often is a status change, and it is the
 * one most likely to be wrong, so `colony status` refuses a move the record
 * does not allow rather than writing it and letting the nightly check find it.
 */

const LIST_COLUMNS = [
  { header: 'colony', key: 'id' },
  { header: 'brand', key: 'brand' },
  { header: 'yard', key: 'yardId' },
  { header: 'status', key: 'status' },
  {
    header: 'boxes',
    align: 'right',
    value: (record) => boxCount(record),
  },
];

export function registerColonyCommands(program, context) {
  const colony = program
    .command('colony')
    .description('colonies, queens and status changes');

  colony
    .command('add')
    .description('put a colony on the books')
    .requiredOption('--id <id>', 'colony identifier')
    .requiredOption('--brand <brand>', 'brand burned into the bottom board')
    .requiredOption('--yard <id>', 'yard it is standing in')
    .requiredOption('--installed-on <date>', 'day the bees went in')
    .requiredOption('--queen-source <name>', 'who raised the queen')
    .option(
      '--queen-race <race>',
      'italian, carniolan, russian, caucasian or mixed',
      'italian'
    )
    .option('--queen-installed-on <date>', 'day the queen went in')
    .option('--deeps <count>', 'deep boxes', '2')
    .option('--mediums <count>', 'medium boxes', '0')
    .option('--notes <text>', 'anything worth knowing')
    .action((options) => {
      const record = makeColony({
        id: options.id,
        brand: options.brand,
        yardId: options.yard,
        installedOn: options.installedOn,
        queen: {
          source: options.queenSource,
          race: options.queenRace,
          installedOn: options.queenInstalledOn ?? options.installedOn,
        },
        boxes: { deeps: Number(options.deeps), mediums: Number(options.mediums) },
        notes: options.notes,
      });
      const saved = context.desk().save('colonies', record);
      context.output.value({ id: saved.id, brand: saved.brand, yard: saved.yardId });
    });

  colony
    .command('list')
    .description('colonies on the books')
    .option('--yard <id>', 'only this yard')
    .option('--status <status>', 'only this status')
    .action((options) => {
      const desk = context.desk();
      let colonies = options.yard
        ? coloniesInYard(desk.register(), options.yard)
        : desk.store.list('colonies');
      if (options.status) {
        colonies = colonies.filter((entry) => entry.status === options.status);
      }
      context.output.table(LIST_COLUMNS, colonies);
    });

  colony
    .command('show <id>')
    .description('one colony in full')
    .action((id) => {
      const desk = context.desk();
      const record = desk.store.get('colonies', id);
      const pallet = palletFor(desk.register(), id);
      if (context.output.json) {
        context.output.value({ ...record, pallet: pallet ?? null });
        return;
      }
      context.output.line(colonyLabel(record));
      context.output.detail([
        ['yard', record.yardId],
        ['pallet', pallet ?? 'on the ground'],
        ['status', `${record.status} since ${record.statusOn}`],
        [
          'queen',
          `${record.queen.source} ${record.queen.race}, ${record.queen.installedOn}`,
        ],
        ['boxes', `${record.boxes.deeps} deep, ${record.boxes.mediums} medium`],
        ['can become', allowedTransitions(record.status).join(', ') || 'nothing'],
      ]);
    });

  colony
    .command('status <id> <status>')
    .description('move a colony to another status')
    .requiredOption('--on <date>', 'day it happened')
    .action((id, status, options) => {
      const desk = context.desk();
      const moved = transitionColony(
        desk.store.get('colonies', id),
        status,
        options.on
      );
      const saved = desk.save('colonies', moved);
      context.output.value({
        id: saved.id,
        status: saved.status,
        statusOn: saved.statusOn,
      });
    });

  colony
    .command('requeen <id>')
    .description('record a new queen')
    .requiredOption('--source <name>', 'who raised her')
    .requiredOption('--on <date>', 'day she went in')
    .option('--race <race>', 'her race', 'italian')
    .option('--marked <colour>', 'marking colour')
    .action((id, options) => {
      const desk = context.desk();
      const done = requeen(
        desk.store.get('colonies', id),
        { source: options.source, race: options.race, marked: options.marked },
        options.on
      );
      const saved = desk.save('colonies', done);
      context.output.value({
        id: saved.id,
        queen: saved.queen.source,
        on: saved.queen.installedOn,
      });
    });

  colony
    .command('loose')
    .description('productive colonies sitting on no pallet')
    .action(() => {
      context.output.table(LIST_COLUMNS, looseColonies(context.desk().register()));
    });

  return colony;
}
