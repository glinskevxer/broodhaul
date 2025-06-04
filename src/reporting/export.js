import { ValidationError } from '../core/errors.js';
import { formatCsvRecords } from '../core/csv.js';
import { formatMoney } from '../core/money.js';
import { sortBy } from '../core/collections.js';
import { boxCount } from '../apiary/colony.js';
import { occupiedCount, palletCapacity } from '../apiary/pallet.js';
import { contractedHives, contractValueCents } from '../contracts/contract.js';
import { shortBy } from '../placement/drop.js';
import { summariseRun } from '../grading/run.js';
import { dueOffOn } from '../health/treatment.js';

/**
 * Exports.
 *
 * The broker wants a hive list, the accountant wants the contracts, and the
 * state wants a yard registration file. All three want csv and all three want
 * it differently, so the columns live here rather than in the commands, and
 * the money goes out as a formatted string because every one of these ends up
 * in a spreadsheet where a bare cent count reads as nonsense.
 */

const EXPORTS = {
  yards: {
    columns: [
      'id',
      'name',
      'county',
      'state',
      'access',
      'water',
      'capacity',
      'registration',
    ],
    rows: (desk) => desk.store.list('yards'),
  },
  colonies: {
    columns: [
      'id',
      'brand',
      'yardId',
      'status',
      'statusOn',
      'boxes',
      'queenSource',
      'queenRace',
    ],
    rows: (desk) =>
      desk.store.list('colonies').map((colony) => ({
        ...colony,
        boxes: boxCount(colony),
        queenSource: colony.queen.source,
        queenRace: colony.queen.race,
      })),
  },
  pallets: {
    columns: ['id', 'pattern', 'yardId', 'tareLb', 'occupied', 'capacity', 'builtOn'],
    rows: (desk) =>
      desk.store.list('pallets').map((pallet) => ({
        ...pallet,
        occupied: occupiedCount(pallet),
        capacity: palletCapacity(pallet),
      })),
  },
  contracts: {
    columns: [
      'id',
      'season',
      'grower',
      'crop',
      'hives',
      'rate',
      'value',
      'delivery',
      'removal',
    ],
    rows: (desk) =>
      desk.store.list('contracts').map((contract) => ({
        ...contract,
        grower: contract.grower.name,
        hives: contractedHives(contract),
        rate: formatMoney(contract.rateCents),
        value: formatMoney(contractValueCents(contract)),
        delivery: `${contract.delivery.start} to ${contract.delivery.end}`,
        removal: `${contract.removal.start} to ${contract.removal.end}`,
      })),
  },
  drops: {
    columns: [
      'id',
      'contractId',
      'blockId',
      'ordered',
      'set',
      'short',
      'setOn',
      'pulledOn',
    ],
    rows: (desk) =>
      desk.store.list('drops').map((drop) => ({ ...drop, short: shortBy(drop) })),
  },
  gradings: {
    columns: [
      'id',
      'contractId',
      'dropId',
      'date',
      'method',
      'grader',
      'read',
      'average',
      'total',
    ],
    rows: (desk) => desk.store.list('gradings').map(summariseRun),
  },
  treatments: {
    columns: [
      'id',
      'yardId',
      'product',
      'appliedOn',
      'dueOff',
      'removedOn',
      'units',
      'applicator',
    ],
    rows: (desk) =>
      desk.store.list('treatments').map((treatment) => ({
        ...treatment,
        dueOff: dueOffOn(treatment),
      })),
  },
  inspections: {
    columns: [
      'id',
      'yardId',
      'date',
      'inspector',
      'coloniesOpened',
      'coloniesAffected',
      'findings',
    ],
    rows: (desk) =>
      desk.store.list('inspections').map((inspection) => ({
        ...inspection,
        findings: inspection.findings.join(' '),
      })),
  },
};

export function exportNames() {
  return Object.keys(EXPORTS).sort();
}

export function exportColumns(name) {
  const definition = EXPORTS[name];
  if (!definition) {
    throw new ValidationError(`no export called ${name}`, {
      name,
      known: exportNames(),
    });
  }
  return [...definition.columns];
}

export function exportRows(desk, name) {
  const definition = EXPORTS[name];
  if (!definition) {
    throw new ValidationError(`no export called ${name}`, {
      name,
      known: exportNames(),
    });
  }
  const rows = definition.rows(desk);
  return sortBy(rows, (row) => row.id);
}

export function exportCsv(desk, name) {
  return formatCsvRecords(exportRows(desk, name), exportColumns(name));
}

export function exportAll(desk) {
  return exportNames().map((name) => ({
    name,
    rows: exportRows(desk, name).length,
    csv: exportCsv(desk, name),
  }));
}
