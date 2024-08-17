import { NotFoundError } from '../core/errors.js';
import { indexBy, sortBy } from '../core/collections.js';
import { capacityLeft } from './yard.js';
import { coloniesOn, palletCapacity } from './pallet.js';
import { isProductive } from './colony.js';

/**
 * The colony register ties the three apiary records together and answers the
 * only question the yard crew ever asks over the radio, which is where a given
 * brand is sitting today.
 *
 * It also knows how to find the disagreements. A colony that says it is in one
 * yard while the pallet under it says another is not a crash, it is a Tuesday,
 * and the crew wants a list rather than an exception.
 */

export function buildRegister({ yards = [], pallets = [], colonies = [] } = {}) {
  const yardIndex = indexBy(yards, (yard) => yard.id, 'yard');
  const palletIndex = indexBy(pallets, (pallet) => pallet.id, 'pallet');
  const colonyIndex = indexBy(colonies, (colony) => colony.id, 'colony');
  const palletOf = new Map();
  for (const pallet of pallets) {
    for (const colonyId of coloniesOn(pallet)) {
      palletOf.set(colonyId, pallet.id);
    }
  }
  return { yards: yardIndex, pallets: palletIndex, colonies: colonyIndex, palletOf };
}

export function getYard(register, yardId) {
  const yard = register.yards.get(yardId);
  if (!yard) throw new NotFoundError('yard', yardId);
  return yard;
}

export function getColony(register, colonyId) {
  const colony = register.colonies.get(colonyId);
  if (!colony) throw new NotFoundError('colony', colonyId);
  return colony;
}

export function getPallet(register, palletId) {
  const pallet = register.pallets.get(palletId);
  if (!pallet) throw new NotFoundError('pallet', palletId);
  return pallet;
}

export function coloniesInYard(register, yardId, { productiveOnly = false } = {}) {
  getYard(register, yardId);
  const found = [...register.colonies.values()].filter(
    (colony) => colony.yardId === yardId && (!productiveOnly || isProductive(colony))
  );
  return sortBy(found, (colony) => colony.id);
}

export function palletsInYard(register, yardId) {
  getYard(register, yardId);
  const found = [...register.pallets.values()].filter(
    (pallet) => pallet.yardId === yardId
  );
  return sortBy(found, (pallet) => pallet.id);
}

export function palletFor(register, colonyId) {
  getColony(register, colonyId);
  return register.palletOf.get(colonyId);
}

export function looseColonies(register) {
  const loose = [...register.colonies.values()].filter(
    (colony) => isProductive(colony) && !register.palletOf.has(colony.id)
  );
  return sortBy(loose, (colony) => colony.id);
}

export function yardOccupancy(register) {
  const rows = [...register.yards.values()].map((yard) => {
    const colonies = coloniesInYard(register, yard.id, { productiveOnly: true });
    const pallets = palletsInYard(register, yard.id);
    const positions = pallets.reduce(
      (total, pallet) => total + palletCapacity(pallet),
      0
    );
    return {
      yardId: yard.id,
      name: yard.name,
      capacity: yard.capacity,
      colonies: colonies.length,
      pallets: pallets.length,
      positions,
      headroom: capacityLeft(yard, colonies.length),
    };
  });
  return sortBy(rows, (row) => row.yardId);
}

/**
 * Every disagreement the register can see, as a flat list. The shape is fixed
 * so the CLI and the nightly check can print the same thing.
 */
export function registerProblems(register) {
  const problems = [];
  for (const pallet of sortBy([...register.pallets.values()], (pallet) => pallet.id)) {
    if (!register.yards.has(pallet.yardId)) {
      problems.push({
        kind: 'pallet_yard_missing',
        pallet: pallet.id,
        yard: pallet.yardId,
      });
    }
    for (const colonyId of coloniesOn(pallet)) {
      const colony = register.colonies.get(colonyId);
      if (!colony) {
        problems.push({
          kind: 'pallet_colony_missing',
          pallet: pallet.id,
          colony: colonyId,
        });
        continue;
      }
      if (colony.yardId !== pallet.yardId) {
        problems.push({
          kind: 'yard_disagreement',
          colony: colony.id,
          colonyYard: colony.yardId,
          palletYard: pallet.yardId,
          pallet: pallet.id,
        });
      }
      if (!isProductive(colony)) {
        problems.push({
          kind: 'dead_colony_on_pallet',
          colony: colony.id,
          pallet: pallet.id,
          status: colony.status,
        });
      }
    }
  }
  for (const colony of sortBy([...register.colonies.values()], (colony) => colony.id)) {
    if (!register.yards.has(colony.yardId)) {
      problems.push({
        kind: 'colony_yard_missing',
        colony: colony.id,
        yard: colony.yardId,
      });
    }
  }
  for (const row of yardOccupancy(register)) {
    if (row.colonies > row.capacity) {
      problems.push({
        kind: 'yard_over_capacity',
        yard: row.yardId,
        colonies: row.colonies,
        capacity: row.capacity,
      });
    }
  }
  return problems;
}
