import {
  makePallet,
  setColony,
  removeColony,
  clearPosition,
  palletCapacity,
  occupiedCount,
  coloniesOn,
  isFull,
} from '../../apiary/pallet.js';
import { palletsInYard } from '../../apiary/register.js';
import { palletWeightLb } from '../../movement/weight.js';

/**
 * Pallet commands.
 *
 * A pallet is the unit the forklift moves, so the commands here are the ones
 * shouted across a yard: what is on it, put this one on, take that one off.
 */

const LIST_COLUMNS = [
  { header: 'pallet', key: 'id' },
  { header: 'pattern', key: 'pattern' },
  { header: 'yard', key: 'yardId' },
  {
    header: 'on',
    align: 'right',
    value: (record) => `${occupiedCount(record)} of ${palletCapacity(record)}`,
  },
  { header: 'tare', key: 'tareLb', align: 'right' },
];

export function registerPalletCommands(program, context) {
  const pallet = program
    .command('pallet')
    .description('pallets and what is standing on them');

  pallet
    .command('add')
    .description('put a pallet on the books')
    .requiredOption('--id <id>', 'pallet identifier')
    .requiredOption('--yard <id>', 'yard it is standing in')
    .requiredOption('--built-on <date>', 'day it was built')
    .option('--pattern <pattern>', 'four-way or six-way', 'four-way')
    .option('--tare <lb>', 'empty weight in pounds', '62')
    .option('--notes <text>', 'anything worth knowing')
    .action((options) => {
      const record = makePallet({
        id: options.id,
        pattern: options.pattern,
        yardId: options.yard,
        tareLb: Number(options.tare),
        builtOn: options.builtOn,
        notes: options.notes,
      });
      const saved = context.desk().save('pallets', record);
      context.output.value({
        id: saved.id,
        pattern: saved.pattern,
        positions: palletCapacity(saved),
      });
    });

  pallet
    .command('list')
    .description('pallets on the books')
    .option('--yard <id>', 'only this yard')
    .option('--full', 'only pallets with every position taken')
    .action((options) => {
      const desk = context.desk();
      let pallets = options.yard
        ? palletsInYard(desk.register(), options.yard)
        : desk.store.list('pallets');
      if (options.full) pallets = pallets.filter(isFull);
      context.output.table(LIST_COLUMNS, pallets);
    });

  pallet
    .command('show <id>')
    .description('what is standing on one pallet')
    .option('--stage <stage>', 'season stage to weigh it at', 'bloom')
    .action((id, options) => {
      const record = context.desk().store.get('pallets', id);
      const payload = {
        id: record.id,
        yard: record.yardId,
        pattern: record.pattern,
        colonies: coloniesOn(record),
        positions: record.positions,
        weightLb: palletWeightLb(record, options.stage),
      };
      if (context.output.json) {
        context.output.value(payload);
        return;
      }
      context.output.detail([
        ['pallet', record.id],
        ['yard', record.yardId],
        ['pattern', record.pattern],
        ['weight', `${payload.weightLb} lb at ${options.stage}`],
        ...record.positions.map((entry, at) => [
          `position ${at + 1}`,
          entry ?? 'empty',
        ]),
      ]);
    });

  pallet
    .command('set <id> <colony>')
    .description('put a colony on a pallet')
    .option('--position <number>', 'position to use, otherwise the first free one')
    .action((id, colonyId, options) => {
      const desk = context.desk();
      const loaded = setColony(
        desk.store.get('pallets', id),
        colonyId,
        options.position === undefined ? undefined : Number(options.position)
      );
      const saved = desk.save('pallets', loaded);
      context.output.value({
        id: saved.id,
        colony: colonyId,
        on: occupiedCount(saved),
        capacity: palletCapacity(saved),
      });
    });

  pallet
    .command('clear <id>')
    .description('take a colony or a position off a pallet')
    .option('--colony <id>', 'colony to take off')
    .option('--position <number>', 'position to empty')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('pallets', id);
      const cleared = options.colony
        ? removeColony(record, options.colony)
        : clearPosition(record, Number(options.position));
      const saved = desk.save('pallets', cleared);
      context.output.value({ id: saved.id, on: occupiedCount(saved) });
    });

  return pallet;
}
