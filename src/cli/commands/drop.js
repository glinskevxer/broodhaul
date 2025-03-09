import {
  makeDrop,
  isSet,
  isPulled,
  shortBy,
  standingSpan,
  checkSetInWindow,
  checkPullInWindow,
} from '../../placement/drop.js';
import { formatSpan } from '../../core/span.js';
import { sumBy } from '../../core/collections.js';

/**
 * Drop commands.
 *
 * `drop set` and `drop pull` are the two the crew runs off a phone in an
 * orchard, so both of them check the contract window before they write. A drop
 * set a day early is worth catching while the forklift is still there.
 */

const LIST_COLUMNS = [
  { header: 'drop', key: 'id' },
  { header: 'contract', key: 'contractId' },
  { header: 'block', key: 'blockId' },
  { header: 'ordered', key: 'ordered', align: 'right' },
  { header: 'set', key: 'set', align: 'right' },
  { header: 'on', key: 'setOn' },
  { header: 'pulled', key: 'pulledOn' },
];

export function registerDropCommands(program, context) {
  const drop = program.command('drop').description('set points inside a block');

  drop
    .command('add')
    .description('plan a drop')
    .requiredOption('--id <id>', 'drop identifier')
    .requiredOption('--contract <id>', 'contract it belongs to')
    .requiredOption('--block <id>', 'block it sits in')
    .requiredOption('--ordered <hives>', 'hives the grower asked for')
    .requiredOption('--latitude <degrees>', 'latitude in degrees')
    .requiredOption('--longitude <degrees>', 'longitude in degrees')
    .option('--pattern <pattern>', 'perimeter, interior, road or corner', 'interior')
    .option('--notes <text>', 'anything the driver needs')
    .action((options) => {
      const record = makeDrop({
        id: options.id,
        contractId: options.contract,
        blockId: options.block,
        ordered: Number(options.ordered),
        location: {
          latitude: Number(options.latitude),
          longitude: Number(options.longitude),
        },
        pattern: options.pattern,
        notes: options.notes,
      });
      const saved = context.desk().save('drops', record);
      context.output.value({
        id: saved.id,
        ordered: saved.ordered,
        pattern: saved.pattern,
      });
    });

  drop
    .command('set <id>')
    .description('record the hives that went in')
    .requiredOption('--hives <count>', 'hives actually set')
    .requiredOption('--on <date>', 'day they went in')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('drops', id);
      const updated = makeDrop({
        ...record,
        set: Number(options.hives),
        setOn: options.on,
      });
      checkSetInWindow(desk.store.get('contracts', updated.contractId), updated);
      const saved = desk.save('drops', updated);
      context.output.value({
        id: saved.id,
        set: saved.set,
        short: shortBy(saved),
        on: saved.setOn,
      });
    });

  drop
    .command('pull <id>')
    .description('record the hives coming out')
    .requiredOption('--on <date>', 'day they came out')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('drops', id);
      const updated = makeDrop({ ...record, pulledOn: options.on });
      checkPullInWindow(desk.store.get('contracts', updated.contractId), updated);
      const saved = desk.save('drops', updated);
      context.output.value({
        id: saved.id,
        pulledOn: saved.pulledOn,
        standing: formatSpan(standingSpan(saved)),
      });
    });

  drop
    .command('list')
    .description('drops on the books')
    .option('--contract <id>', 'only this contract')
    .option('--standing', 'only drops still in the orchard')
    .option('--short', 'only drops that came up light')
    .action((options) => {
      let drops = context.desk().store.list('drops');
      if (options.contract) {
        drops = drops.filter((entry) => entry.contractId === options.contract);
      }
      if (options.standing) drops = drops.filter(isSet);
      if (options.short) drops = drops.filter((entry) => shortBy(entry) > 0);
      context.output.table(LIST_COLUMNS, drops);
    });

  drop
    .command('shortfall')
    .description('hives ordered and not set, by contract')
    .action(() => {
      const drops = context.desk().store.list('drops');
      const byContract = new Map();
      for (const entry of drops) {
        byContract.set(
          entry.contractId,
          (byContract.get(entry.contractId) ?? 0) + shortBy(entry)
        );
      }
      const rows = [...byContract.entries()]
        .map(([contract, hives]) => ({ contract, hives }))
        .filter((row) => row.hives > 0)
        .sort((left, right) => left.contract.localeCompare(right.contract));
      context.output.table(
        [
          { header: 'contract', key: 'contract' },
          { header: 'short', key: 'hives', align: 'right' },
        ],
        rows
      );
      if (!context.output.json) {
        context.output.line(`${sumBy(rows, (row) => row.hives)} hives short in total`);
      }
    });

  drop
    .command('show <id>')
    .description('one drop in full')
    .action((id) => {
      const record = context.desk().store.get('drops', id);
      if (context.output.json) {
        context.output.value({
          ...record,
          short: shortBy(record),
          pulled: isPulled(record),
        });
        return;
      }
      context.output.detail([
        ['drop', record.id],
        ['contract', record.contractId],
        ['block', record.blockId],
        ['ordered', String(record.ordered)],
        ['set', record.set === undefined ? 'not yet' : String(record.set)],
        ['short', String(shortBy(record))],
        [
          'standing',
          standingSpan(record) ? formatSpan(standingSpan(record)) : 'not set',
        ],
      ]);
    });

  return drop;
}
