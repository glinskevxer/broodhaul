import {
  makeLoad,
  advanceLoad,
  palletCount,
  coloniesAboard,
  nightsInTransit,
} from '../../movement/load.js';
import {
  loadWeightLb,
  overweightBy,
  isLegal,
  palletsToShed,
  averagePalletLb,
} from '../../movement/weight.js';
import { makeCertificate, checkMovement } from '../../movement/permit.js';
import { checkYardMovable } from '../../health/inspection.js';
import { indexBy } from '../../core/collections.js';
import { parseIdList } from '../parse.js';

/**
 * Load commands.
 *
 * `load weigh` is the one that gets run in the dark with a phone propped on
 * the mirror, so it answers the only question that matters at that moment,
 * which is how many pallets have to come back off.
 */

const LIST_COLUMNS = [
  { header: 'load', key: 'id' },
  { header: 'truck', key: 'truck', format: (truck) => truck.unit },
  { header: 'from', key: 'originYardId' },
  { header: 'to', key: 'destination', format: (destination) => destination.id },
  {
    header: 'pallets',
    key: 'pallets',
    align: 'right',
    format: (pallets) => pallets.length,
  },
  { header: 'state', key: 'state' },
];

function palletIndex(desk) {
  return indexBy(desk.store.list('pallets'), (pallet) => pallet.id, 'pallet');
}

export function registerLoadCommands(program, context) {
  const load = program.command('load').description('truck loads of bees');

  load
    .command('add')
    .description('plan a load')
    .requiredOption('--id <id>', 'load identifier')
    .requiredOption('--unit <unit>', 'truck unit number')
    .requiredOption('--driver <name>', 'who is driving')
    .requiredOption('--from <yard>', 'yard it leaves')
    .requiredOption('--to <id>', 'yard or drop it goes to')
    .requiredOption('--pallets <list>', 'pallet identifiers, comma separated')
    .option('--kind <kind>', 'semi, bobtail or flatbed', 'semi')
    .option('--destination-kind <kind>', 'yard or drop', 'drop')
    .option('--plate <plate>', 'truck plate')
    .action((options) => {
      const desk = context.desk();
      const record = makeLoad({
        id: options.id,
        truck: { unit: options.unit, kind: options.kind, plate: options.plate },
        driver: options.driver,
        originYardId: options.from,
        destination: { kind: options.destinationKind, id: options.to },
        pallets: parseIdList(options.pallets, 'pallets'),
      });
      checkYardMovable(
        desk.store.list('inspections'),
        record.originYardId,
        desk.clock.today()
      );
      const saved = desk.save('loads', record);
      context.output.value({
        id: saved.id,
        pallets: palletCount(saved),
        state: saved.state,
      });
    });

  load
    .command('list')
    .description('loads on the books')
    .option('--state <state>', 'only loads in this state')
    .option('--from <yard>', 'only loads out of this yard')
    .action((options) => {
      let loads = context.desk().store.list('loads');
      if (options.state) loads = loads.filter((entry) => entry.state === options.state);
      if (options.from)
        loads = loads.filter((entry) => entry.originYardId === options.from);
      context.output.table(LIST_COLUMNS, loads);
    });

  load
    .command('advance <id> <state>')
    .description('move a load to loaded, delivered or cancelled')
    .requiredOption('--on <date>', 'day it happened')
    .action((id, state, options) => {
      const desk = context.desk();
      const moved = advanceLoad(desk.store.get('loads', id), state, options.on);
      const saved = desk.save('loads', moved);
      context.output.value({
        id: saved.id,
        state: saved.state,
        nights: nightsInTransit(saved),
      });
    });

  load
    .command('weigh <id>')
    .description('what the load weighs and whether it is legal')
    .option('--stage <stage>', 'winter, bloom, flow or fall', 'bloom')
    .option('--tare <lb>', 'empty truck weight', '32000')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('loads', id);
      const pallets = palletIndex(desk);
      const weights = loadWeightLb(
        record,
        pallets,
        options.stage,
        Number(options.tare)
      );
      const average = averagePalletLb(record, pallets, options.stage);
      const payload = {
        load: record.id,
        stage: options.stage,
        payloadLb: weights.payloadLb,
        grossLb: weights.grossLb,
        legal: isLegal(weights, record.truck.kind),
        overLb: overweightBy(weights, record.truck.kind),
        shed: palletsToShed(weights, record.truck.kind, average),
        colonies: coloniesAboard(record, pallets),
      };
      if (context.output.json) {
        context.output.value(payload);
        return;
      }
      context.output.detail([
        ['load', payload.load],
        ['colonies', String(payload.colonies)],
        ['payload', `${payload.payloadLb} lb`],
        ['gross', `${payload.grossLb} lb`],
        ['legal', payload.legal ? 'yes' : `no, over by ${payload.overLb} lb`],
        ['shed', payload.shed === 0 ? 'nothing' : `${payload.shed} pallets`],
      ]);
    });

  load
    .command('permit <id>')
    .description('check the paperwork for an interstate move')
    .requiredOption('--to-state <state>', 'state it is going to')
    .requiredOption('--from-state <state>', 'state it is leaving')
    .requiredOption('--certificate <number>', 'certificate number')
    .requiredOption('--issued-on <date>', 'day the certificate was issued')
    .requiredOption('--issued-by <name>', 'who issued it')
    .requiredOption('--covers <colonies>', 'colonies the certificate covers')
    .requiredOption('--moved-on <date>', 'day the load rolls')
    .option('--entry-permit <number>', 'entry permit number')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('loads', id);
      const certificate = makeCertificate({
        number: options.certificate,
        issuedOn: options.issuedOn,
        issuedBy: options.issuedBy,
        originState: options.fromState,
        colonies: Number(options.covers),
      });
      const outcome = checkMovement({
        certificate,
        entryPermit: options.entryPermit,
        originState: options.fromState,
        destinationState: options.toState,
        colonies: coloniesAboard(record, palletIndex(desk)),
        movedOn: options.movedOn,
      });
      context.output.value({ load: record.id, ...outcome });
    });

  return load;
}
