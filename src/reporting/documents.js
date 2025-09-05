import { NotFoundError } from '../core/errors.js';
import { renderDetail, renderHeading, renderTable } from '../core/table.js';
import { formatSpan } from '../core/span.js';
import { sortBy, sumBy } from '../core/collections.js';
import { coloniesOn, occupiedCount, palletCapacity } from '../apiary/pallet.js';
import { palletWeightLb } from '../movement/weight.js';
import { shortBy, standingSpan } from '../placement/drop.js';
import { contractedHives } from '../contracts/contract.js';
import { describeConditions } from '../grading/conditions.js';
import { correctedFrames, runFlags, runMethod, runAverage } from '../grading/run.js';

/**
 * The paper.
 *
 * Three documents leave the office and go out in a truck: a set sheet for the
 * forklift, a manifest for the driver, and a grading certificate that the
 * grower signs. All three get printed, folded into quarters and put in a shirt
 * pocket, so they are narrow, they carry no colour, and the number somebody
 * needs is never below a fold.
 */

export function setSheet(desk, contractId) {
  const contract = desk.store.get('contracts', contractId);
  const drops = sortBy(
    desk.store.list('drops').filter((drop) => drop.contractId === contractId),
    (drop) => drop.id
  );
  const parts = [
    renderHeading(`set sheet ${contract.id}`),
    renderDetail([
      ['grower', contract.grower.name],
      ['crop', contract.crop],
      ['hives owed', String(contractedHives(contract))],
      ['delivery', formatSpan(contract.delivery)],
      ['removal', formatSpan(contract.removal)],
    ]),
    '',
    renderTable(
      [
        { header: 'drop', key: 'id' },
        { header: 'block', key: 'blockId' },
        { header: 'pattern', key: 'pattern' },
        { header: 'ordered', key: 'ordered', align: 'right' },
        { header: 'set', key: 'set', align: 'right' },
        {
          header: 'short',
          align: 'right',
          value: (drop) => shortBy(drop),
        },
      ],
      drops
    ),
  ];
  const shortTotal = sumBy(drops, shortBy);
  parts.push('', shortTotal === 0 ? 'nothing short' : `${shortTotal} hives short`);
  return parts.join('\n');
}

export function loadManifest(desk, loadId) {
  const load = desk.store.get('loads', loadId);
  const pallets = load.pallets.map((palletId) => {
    const pallet = desk.store.list('pallets').find((entry) => entry.id === palletId);
    if (!pallet) throw new NotFoundError('pallet', palletId);
    return pallet;
  });
  const colonies = pallets.flatMap(coloniesOn);
  const parts = [
    renderHeading(`manifest ${load.id}`),
    renderDetail([
      [
        'truck',
        `${load.truck.unit}${load.truck.plate ? ` (${load.truck.plate})` : ''}`,
      ],
      ['driver', load.driver],
      ['from', load.originYardId],
      ['to', `${load.destination.kind} ${load.destination.id}`],
      ['loaded', load.loadedOn ?? 'not yet'],
      ['pallets', String(pallets.length)],
      ['colonies', String(colonies.length)],
      ['permit', load.permit ?? 'none'],
    ]),
    '',
    renderTable(
      [
        { header: 'pallet', key: 'id' },
        { header: 'pattern', key: 'pattern' },
        {
          header: 'on',
          align: 'right',
          value: (pallet) => `${occupiedCount(pallet)} of ${palletCapacity(pallet)}`,
        },
        {
          header: 'weight',
          align: 'right',
          value: (pallet) => palletWeightLb(pallet, 'bloom'),
        },
      ],
      pallets
    ),
    '',
    'brands aboard',
    colonies.join(' '),
  ];
  return parts.join('\n');
}

export function gradingCertificate(desk, gradingId) {
  const run = desk.store.get('gradings', gradingId);
  const contract = desk.store.get('contracts', run.contractId);
  const frames = correctedFrames(run);
  const flags = runFlags(run);
  const rows = run.readings.map((reading, at) => ({
    colony: reading.colonyId,
    called:
      reading.frames === undefined ? `${reading.clusterInches} in` : reading.frames,
    counted: frames[at],
    note:
      reading.queenright === false
        ? 'queenless'
        : reading.brood === false
          ? 'no brood'
          : '',
  }));
  const drop = desk.store.list('drops').find((entry) => entry.id === run.dropId);
  return [
    renderHeading(`grading certificate ${run.id}`),
    renderDetail([
      ['contract', contract.id],
      ['grower', contract.grower.name],
      ['drop', run.dropId],
      [
        'standing',
        drop && standingSpan(drop) ? formatSpan(standingSpan(drop)) : 'unknown',
      ],
      ['conditions', describeConditions(run.conditions)],
      ['method', runMethod(run)],
      ['grader', run.grader],
      ['witness', run.witness ?? 'none'],
    ]),
    '',
    renderTable(
      [
        { header: 'colony', key: 'colony' },
        { header: 'called', key: 'called', align: 'right' },
        { header: 'counted', key: 'counted', align: 'right' },
        { header: 'note', key: 'note' },
      ],
      rows
    ),
    '',
    renderDetail([
      ['opened', String(flags.read)],
      ['average', String(runAverage(run))],
      ['minimum', String(contract.terms.minimumAverage)],
      ['queenless', String(flags.queenless)],
      ['broodless', String(flags.broodless)],
    ]),
    '',
    'grower signature ____________________  date __________',
  ].join('\n');
}

export const DOCUMENTS = {
  'set-sheet': setSheet,
  manifest: loadManifest,
  certificate: gradingCertificate,
};

export function documentNames() {
  return Object.keys(DOCUMENTS).sort();
}

export function renderDocument(desk, name, id) {
  const render = DOCUMENTS[name];
  if (!render) {
    throw new NotFoundError('document', name);
  }
  return render(desk, id);
}
