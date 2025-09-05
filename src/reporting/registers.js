import { NotFoundError } from '../core/errors.js';
import { renderHeading, renderTable } from '../core/table.js';
import { formatMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';
import { boxCount } from '../apiary/colony.js';
import { yardOccupancy } from '../apiary/register.js';
import { occupiedCount, palletCapacity } from '../apiary/pallet.js';
import { contractedHives, contractValueCents } from '../contracts/contract.js';
import { shortBy } from '../placement/drop.js';
import { summariseRun } from '../grading/run.js';
import { dueOffOn, isOnHives } from '../health/treatment.js';
import { healthRegister } from '../health/register.js';

/**
 * The registers that get printed and put in the binder.
 *
 * These are the same rows the commands show on screen, but with the columns a
 * printed page can carry and a heading at the top. They exist as their own
 * module because a register is asked for by name, and putting the definitions
 * in one table is what lets the command take a name rather than growing a
 * subcommand for each one.
 */

const REGISTERS = {
  yards: {
    heading: 'yard register',
    columns: [
      { header: 'yard', key: 'yardId' },
      { header: 'name', key: 'name' },
      { header: 'colonies', key: 'colonies', align: 'right' },
      { header: 'pallets', key: 'pallets', align: 'right' },
      { header: 'capacity', key: 'capacity', align: 'right' },
      { header: 'headroom', key: 'headroom', align: 'right' },
    ],
    rows: (desk) => yardOccupancy(desk.register()),
  },
  colonies: {
    heading: 'colony register',
    columns: [
      { header: 'colony', key: 'id' },
      { header: 'brand', key: 'brand' },
      { header: 'yard', key: 'yardId' },
      { header: 'status', key: 'status' },
      { header: 'since', key: 'statusOn' },
      {
        header: 'boxes',
        align: 'right',
        value: (colony) => boxCount(colony),
      },
    ],
    rows: (desk) => desk.store.list('colonies'),
  },
  pallets: {
    heading: 'pallet register',
    columns: [
      { header: 'pallet', key: 'id' },
      { header: 'yard', key: 'yardId' },
      { header: 'pattern', key: 'pattern' },
      {
        header: 'on',
        align: 'right',
        value: (pallet) => `${occupiedCount(pallet)} of ${palletCapacity(pallet)}`,
      },
    ],
    rows: (desk) => desk.store.list('pallets'),
  },
  contracts: {
    heading: 'contract register',
    columns: [
      { header: 'contract', key: 'id' },
      { header: 'grower', key: 'grower', format: (grower) => grower.name },
      { header: 'crop', key: 'crop' },
      {
        header: 'hives',
        align: 'right',
        value: (contract) => contractedHives(contract),
      },
      {
        header: 'value',
        align: 'right',
        value: (contract) => formatMoney(contractValueCents(contract)),
      },
    ],
    rows: (desk) => desk.store.list('contracts'),
  },
  drops: {
    heading: 'drop register',
    columns: [
      { header: 'drop', key: 'id' },
      { header: 'contract', key: 'contractId' },
      { header: 'ordered', key: 'ordered', align: 'right' },
      { header: 'set', key: 'set', align: 'right' },
      {
        header: 'short',
        align: 'right',
        value: (drop) => shortBy(drop),
      },
      { header: 'set on', key: 'setOn' },
      { header: 'pulled', key: 'pulledOn' },
    ],
    rows: (desk) => desk.store.list('drops'),
  },
  gradings: {
    heading: 'grading register',
    columns: [
      { header: 'run', key: 'id' },
      { header: 'contract', key: 'contractId' },
      { header: 'date', key: 'date' },
      { header: 'method', key: 'method' },
      { header: 'read', key: 'read', align: 'right' },
      { header: 'average', key: 'average', align: 'right' },
    ],
    rows: (desk) => desk.store.list('gradings').map(summariseRun),
  },
  treatments: {
    heading: 'treatment register',
    columns: [
      { header: 'treatment', key: 'id' },
      { header: 'yard', key: 'yardId' },
      { header: 'product', key: 'product' },
      { header: 'applied', key: 'appliedOn' },
      {
        header: 'due off',
        value: (treatment) => dueOffOn(treatment),
      },
      {
        header: 'on',
        value: (treatment) => (isOnHives(treatment) ? 'yes' : ''),
      },
    ],
    rows: (desk) => desk.store.list('treatments'),
  },
  health: {
    heading: 'health register',
    columns: [
      { header: 'yard', key: 'yardId' },
      { header: 'sampled', key: 'sampledOn' },
      { header: 'rate', key: 'rate', align: 'right' },
      { header: 'action', key: 'action' },
      { header: 'on hives', key: 'onHives', format: (products) => products.join(' ') },
      { header: 'held to', key: 'heldUntil' },
    ],
    rows: (desk) =>
      healthRegister({
        yardIds: desk.store.list('yards').map((yard) => yard.id),
        treatments: desk.store.list('treatments'),
        inspections: desk.store.list('inspections'),
        today: desk.clock.today(),
      }),
  },
};

export function registerNames() {
  return Object.keys(REGISTERS).sort();
}

export function registerRows(desk, name) {
  const definition = REGISTERS[name];
  if (!definition) throw new NotFoundError('register', name);
  return sortBy(definition.rows(desk), (row) => row.id ?? row.yardId ?? '');
}

export function registerColumns(name) {
  const definition = REGISTERS[name];
  if (!definition) throw new NotFoundError('register', name);
  return definition.columns;
}

export function renderRegister(desk, name) {
  const definition = REGISTERS[name];
  if (!definition) throw new NotFoundError('register', name);
  const rows = registerRows(desk, name);
  return [
    renderHeading(definition.heading),
    '',
    renderTable(definition.columns, rows),
    '',
    `${rows.length} rows`,
  ].join('\n');
}
