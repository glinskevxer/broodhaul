import { ValidationError } from '../../core/errors.js';
import { formatMoney } from '../../core/money.js';
import { readJson, writeJson } from '../../store/files.js';
import { join } from 'node:path';
import {
  makeDrum,
  netLb,
  isSaleable,
  moistureOver,
  totalNetLb,
  averageMoisture,
  describeDrum,
} from '../../honey/drum.js';
import { makeLot, lotSummary, lotSources, unsaleableDrums } from '../../honey/lot.js';
import {
  makeYardCrop,
  lbPerColony,
  winterLoss,
  seasonTotal,
  bestYards,
  cropValueCents,
} from '../../honey/crop.js';

/**
 * Honey commands.
 *
 * Drums and lots do not go through the record store, because the honey house
 * keeps its own book and the office copies it in at the end of the season. So
 * these commands read and write two json files under the record directory and
 * say so, rather than pretending they are records like a yard is.
 */

const DRUM_FILE = 'honey/drums.json';
const LOT_FILE = 'honey/lots.json';
const CROP_FILE = 'honey/crops.json';

const DRUM_COLUMNS = [
  { header: 'drum', key: 'id' },
  { header: 'source', key: 'floralSource' },
  {
    header: 'net',
    key: 'grossLb',
    align: 'right',
    format: (_value, drum) => netLb(drum),
  },
  { header: 'moisture', key: 'moisturePct', align: 'right' },
  {
    header: 'grade',
    key: 'moisturePct',
    format: (_value, drum) => (isSaleable(drum) ? 'ok' : `over ${moistureOver(drum)}`),
  },
];

function loadDrums(root) {
  return readJson(join(root, DRUM_FILE), { missing: [] }).map(makeDrum);
}

function drumIndex(root) {
  return new Map(loadDrums(root).map((drum) => [drum.id, drum]));
}

function loadLots(root) {
  const drums = drumIndex(root);
  return readJson(join(root, LOT_FILE), { missing: [] }).map((lot) =>
    makeLot(lot, drums)
  );
}

export function registerHoneyCommands(program, context) {
  const honey = program
    .command('honey')
    .description('drums, extraction lots and the crop');

  honey
    .command('drum')
    .description('book a drum in off the honey house scale')
    .requiredOption('--id <id>', 'drum number')
    .requiredOption('--gross <lb>', 'gross weight in pounds')
    .requiredOption('--tare <lb>', 'drum tare in pounds')
    .requiredOption('--moisture <percent>', 'refractometer reading')
    .requiredOption('--source <source>', 'floral source')
    .requiredOption('--on <date>', 'day it was filled')
    .option('--reading-at <degrees>', 'temperature the reading was taken at', '68')
    .action((options) => {
      const desk = context.desk();
      const drum = makeDrum({
        id: options.id,
        grossLb: Number(options.gross),
        tareLb: Number(options.tare),
        moisturePct: Number(options.moisture),
        moistureTempF: Number(options.readingAt),
        floralSource: options.source,
        filledOn: options.on,
      });
      const drums = loadDrums(desk.root).filter((entry) => entry.id !== drum.id);
      writeJson(join(desk.root, DRUM_FILE), [...drums, drum]);
      context.output.value({
        id: drum.id,
        netLb: netLb(drum),
        moisturePct: drum.moisturePct,
        saleable: isSaleable(drum),
      });
    });

  honey
    .command('drums')
    .description('the drums booked in')
    .option('--wet', 'only the drums over the moisture limit')
    .action((options) => {
      const drums = loadDrums(context.desk().root);
      const rows = options.wet ? drums.filter((drum) => !isSaleable(drum)) : drums;
      context.output.table(DRUM_COLUMNS, rows);
      if (!context.output.json && rows.length > 0) {
        context.output.line(
          `${rows.length} drums, ${totalNetLb(rows)} lb at ${averageMoisture(rows)} percent`
        );
      }
    });

  honey
    .command('lot')
    .description('group drums into an extraction lot')
    .requiredOption('--id <id>', 'lot identifier')
    .requiredOption('--drums <list>', 'drum numbers, comma separated')
    .requiredOption('--yards <list>', 'yard identifiers the supers came off')
    .requiredOption('--from <date>', 'first day of the run')
    .requiredOption('--to <date>', 'last day of the run')
    .action((options) => {
      const desk = context.desk();
      const drums = drumIndex(desk.root);
      const lot = makeLot(
        {
          id: options.id,
          drums: options.drums.split(',').map((entry) => entry.trim()),
          yardIds: options.yards.split(',').map((entry) => entry.trim()),
          extractedFrom: options.from,
          extractedTo: options.to,
        },
        drums
      );
      const lots = readJson(join(desk.root, LOT_FILE), { missing: [] }).filter(
        (entry) => entry.id !== lot.id
      );
      writeJson(join(desk.root, LOT_FILE), [...lots, lot]);
      context.output.value(lotSummary(lot, drums));
    });

  honey
    .command('lots')
    .description('the extraction lots')
    .action(() => {
      const desk = context.desk();
      const drums = drumIndex(desk.root);
      const rows = loadLots(desk.root).map((lot) => lotSummary(lot, drums));
      context.output.table(
        [
          { header: 'lot', key: 'id' },
          { header: 'drums', key: 'drums', align: 'right' },
          { header: 'net', key: 'netLb', align: 'right' },
          { header: 'moisture', key: 'moisturePct', align: 'right' },
          { header: 'grade', key: 'grade' },
          { header: 'label', key: 'label' },
        ],
        rows
      );
    });

  honey
    .command('lot-show <id>')
    .description('one lot in full')
    .action((id) => {
      const desk = context.desk();
      const drums = drumIndex(desk.root);
      const lot = loadLots(desk.root).find((entry) => entry.id === id);
      if (!lot)
        throw new ValidationError(`no lot ${id} in the honey book`, { lot: id });
      const summary = lotSummary(lot, drums);
      if (context.output.json) {
        context.output.value({ ...summary, sources: lotSources(lot, drums) });
        return;
      }
      context.output.detail(
        Object.entries(summary).map(([key, value]) => [key, String(value)])
      );
      context.output.line();
      for (const drum of lot.drums.map((drumId) => drums.get(drumId))) {
        context.output.line(describeDrum(drum));
      }
      const wet = unsaleableDrums(lot, drums);
      if (wet.length > 0) {
        context.output.line(`${wet.length} drums over the moisture limit`);
      }
    });

  honey
    .command('crop')
    .description('book a yard crop for the season')
    .requiredOption('--yard <id>', 'yard the crop came off')
    .requiredOption('--season <year>', 'season it belongs to')
    .requiredOption('--started <colonies>', 'colonies at the start of the flow')
    .requiredOption('--ended <colonies>', 'colonies at the end of it')
    .requiredOption('--net <lb>', 'net pounds extracted')
    .action((options) => {
      const desk = context.desk();
      const crop = makeYardCrop({
        yardId: options.yard,
        season: Number(options.season),
        coloniesAtStart: Number(options.started),
        coloniesAtEnd: Number(options.ended),
        netLb: Number(options.net),
      });
      const crops = readJson(join(desk.root, CROP_FILE), { missing: [] }).filter(
        (entry) => !(entry.yardId === crop.yardId && entry.season === crop.season)
      );
      writeJson(join(desk.root, CROP_FILE), [...crops, crop]);
      context.output.value({
        yard: crop.yardId,
        season: crop.season,
        lbPerColony: lbPerColony(crop),
        lossPercent: winterLoss(crop),
      });
    });

  honey
    .command('season <year>')
    .description('the crop for a season, best yards first')
    .option('--price <cents>', 'price a pound for a single source lot')
    .action((year, options) => {
      const desk = context.desk();
      const season = Number(year);
      const crops = readJson(join(desk.root, CROP_FILE), { missing: [] }).map(
        makeYardCrop
      );
      const total = seasonTotal(crops, season);
      const payload = { ...total };
      if (options.price !== undefined) {
        const price = Number(options.price);
        const drums = drumIndex(desk.root);
        payload.valueCents = cropValueCents(loadLots(desk.root), drums, {
          'single source': price,
          blend: Math.round(price * 0.85),
          wildflower: Math.round(price * 0.7),
        });
      }
      if (context.output.json) {
        context.output.value({ ...payload, best: bestYards(crops, season) });
        return;
      }
      context.output.detail([
        ['season', String(total.season)],
        ['yards', String(total.yards)],
        ['net', `${total.netLb} lb`],
        ['colonies', String(total.colonies)],
        ['per colony', `${total.lbPerColony} lb`],
        ...(payload.valueCents === undefined
          ? []
          : [['value', formatMoney(payload.valueCents)]]),
      ]);
    });

  return honey;
}
