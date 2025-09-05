import { asNumber, asText, parseIdList, parseList } from '../parse.js';
import {
  makeTreatment,
  checkLabel,
  checkSeasonCap,
  checkRotation,
  lastTreatmentFor,
  dueOffOn,
  isOnHives,
  isOverdue,
  withdrawalEndsOn,
  supersMayReturnOn,
} from '../../health/treatment.js';
import {
  makeInspection,
  holdSpan,
  isHeldOn,
  requiresDestruction,
  inspectionsForYard,
} from '../../health/inspection.js';
import {
  makeWash,
  correctedRate,
  yardRate,
  worstWash,
  describeWash,
} from '../../health/wash.js';
import { actionFor, describeAction } from '../../health/threshold.js';
import {
  allProducts,
  availableProducts,
  describeProduct,
  getProduct,
} from '../../health/product.js';

/**
 * Health commands: mite washes, treatments and state inspections.
 *
 * `health wash` is the one the crew uses. It takes the count, works the rate
 * and then tells them what to do about it, because a number on its own has
 * never once caused anybody to go back out with strips.
 */

const WASHES = {
  label: 'washes',
  example: 'CY-2025-0011:9,CY-2025-0012:3',
  fields: [
    { name: 'colonyId', convert: asText },
    { name: 'mites', convert: asNumber },
  ],
};

const TREATMENT_COLUMNS = [
  { header: 'treatment', key: 'id' },
  { header: 'yard', key: 'yardId' },
  { header: 'product', key: 'product' },
  { header: 'applied', key: 'appliedOn' },
  { header: 'due off', value: (record) => dueOffOn(record) },
  { header: 'removed', key: 'removedOn' },
];

export function registerHealthCommands(program, context) {
  const health = program
    .command('health')
    .description('mites, treatments and inspections');

  health
    .command('products')
    .description('the miticide shelf, with the label windows')
    .option('--temperature <degrees>', 'only what can go on at this temperature')
    .option('--supers-on', 'only what can go on with honey supers up')
    .action((options) => {
      const products =
        options.temperature === undefined
          ? allProducts()
          : availableProducts({
              temperatureF: Number(options.temperature),
              supersOn: Boolean(options.supersOn),
            });
      if (context.output.json) {
        context.output.value(products);
        return;
      }
      for (const product of products) {
        context.output.line(describeProduct(product));
        context.output.line();
      }
    });

  health
    .command('wash')
    .description('record an alcohol wash and say what to do about it')
    .requiredOption('--colony <id>', 'colony sampled')
    .requiredOption('--yard <id>', 'yard it stands in')
    .requiredOption('--on <date>', 'day of the sample')
    .requiredOption('--mites <count>', 'mites counted')
    .option('--bees <count>', 'bees in the jar', '300')
    .option('--source <source>', 'brood frame, outer frame or entrance', 'brood frame')
    .option('--supers-on', 'honey supers are on the hive')
    .action((options) => {
      const wash = makeWash({
        colonyId: options.colony,
        yardId: options.yard,
        date: options.on,
        mites: Number(options.mites),
        beesSampled: Number(options.bees),
        source: options.source,
      });
      const rate = correctedRate(wash);
      const outcome = actionFor(rate, wash.date, {
        supersOn: Boolean(options.supersOn),
      });
      if (context.output.json) {
        context.output.value({ ...wash, rate, ...outcome });
        return;
      }
      context.output.line(describeWash(wash));
      context.output.line(describeAction(outcome));
    });

  health
    .command('yard-rate')
    .description('average a set of washes and call the yard')
    .requiredOption('--washes <list>', 'colony:mites pairs, comma separated')
    .requiredOption('--yard <id>', 'yard the washes came from')
    .requiredOption('--on <date>', 'day of the sampling')
    .action((options) => {
      const washes = parseList(options.washes, WASHES).map((entry) =>
        makeWash({
          colonyId: entry.colonyId,
          yardId: options.yard,
          date: options.on,
          mites: entry.mites,
        })
      );
      const rate = yardRate(washes);
      const outcome = actionFor(rate, options.on);
      context.output.value({
        yard: options.yard,
        washes: washes.length,
        rate,
        worst: worstWash(washes).colonyId,
        action: outcome.action,
        threshold: outcome.threshold,
      });
    });

  health
    .command('treat')
    .description('record a treatment against the label and the rotation')
    .requiredOption('--id <id>', 'treatment identifier')
    .requiredOption('--yard <id>', 'yard treated')
    .requiredOption('--product <code>', 'product code')
    .requiredOption('--on <date>', 'day it went on')
    .requiredOption('--colonies <list>', 'colony identifiers, comma separated')
    .requiredOption('--temperature <degrees>', 'ambient temperature in F')
    .requiredOption('--applicator <name>', 'who put it on')
    .option('--units <count>', 'strips, pads or doses used')
    .option('--supers-on', 'honey supers were on')
    .action((options) => {
      const desk = context.desk();
      const colonies = parseIdList(options.colonies, 'colonies');
      const product = getProduct(options.product);
      const record = makeTreatment({
        id: options.id,
        yardId: options.yard,
        colonies,
        product: options.product,
        appliedOn: options.on,
        temperatureF: Number(options.temperature),
        supersOn: Boolean(options.supersOn),
        applicator: options.applicator,
        units:
          options.units === undefined
            ? colonies.length * product.unitsPerBox
            : Number(options.units),
      });
      checkLabel(record);
      const existing = desk.store.list('treatments');
      checkSeasonCap(existing, record);
      checkRotation(
        lastTreatmentFor(existing, record.yardId, record.appliedOn),
        record
      );
      const saved = desk.save('treatments', record);
      context.output.value({
        id: saved.id,
        product: saved.product,
        dueOff: dueOffOn(saved),
        supersReturn: supersMayReturnOn(saved),
      });
    });

  health
    .command('pull <id>')
    .description('record a treatment coming off')
    .requiredOption('--on <date>', 'day it came off')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('treatments', id);
      const saved = desk.save('treatments', { ...record, removedOn: options.on });
      context.output.value({
        id: saved.id,
        removedOn: saved.removedOn,
        withdrawalEnds: withdrawalEndsOn(saved),
      });
    });

  health
    .command('treatments')
    .description('treatments on the books')
    .option('--on-hives', 'only what is still on')
    .option('--overdue', 'only what should have come off')
    .action((options) => {
      const desk = context.desk();
      let treatments = desk.store.list('treatments');
      if (options.onHives) treatments = treatments.filter(isOnHives);
      if (options.overdue) {
        treatments = treatments.filter((entry) => isOverdue(entry, desk.clock.today()));
      }
      context.output.table(TREATMENT_COLUMNS, treatments);
    });

  health
    .command('inspection')
    .description('record a state apiary inspection')
    .requiredOption('--id <id>', 'inspection identifier')
    .requiredOption('--yard <id>', 'yard inspected')
    .requiredOption('--on <date>', 'day of the inspection')
    .requiredOption('--inspector <name>', 'who inspected')
    .requiredOption('--opened <count>', 'colonies opened')
    .option('--findings <list>', 'findings, comma separated', 'clean')
    .option('--affected <count>', 'colonies affected', '0')
    .action((options) => {
      const record = makeInspection({
        id: options.id,
        yardId: options.yard,
        date: options.on,
        inspector: options.inspector,
        coloniesOpened: Number(options.opened),
        findings: parseIdList(options.findings, 'findings'),
        coloniesAffected: Number(options.affected),
      });
      const saved = context.desk().save('inspections', record);
      const hold = holdSpan(saved);
      context.output.value({
        id: saved.id,
        findings: saved.findings.join(', '),
        heldUntil: hold ? hold.end : 'not held',
        destruction: requiresDestruction(saved),
      });
    });

  health
    .command('holds')
    .description('yards under a hold today')
    .action(() => {
      const desk = context.desk();
      const today = desk.clock.today();
      const rows = desk.store
        .list('inspections')
        .filter((inspection) => isHeldOn(inspection, today))
        .map((inspection) => ({
          yard: inspection.yardId,
          inspection: inspection.id,
          until: holdSpan(inspection).end,
          findings: inspection.findings.join(', '),
        }));
      context.output.table(
        [
          { header: 'yard', key: 'yard' },
          { header: 'inspection', key: 'inspection' },
          { header: 'until', key: 'until' },
          { header: 'findings', key: 'findings' },
        ],
        rows
      );
    });

  health
    .command('history <yard>')
    .description('inspection history for a yard')
    .action((yardId) => {
      const inspections = inspectionsForYard(
        context.desk().store.list('inspections'),
        yardId
      );
      context.output.table(
        [
          { header: 'inspection', key: 'id' },
          { header: 'date', key: 'date' },
          { header: 'opened', key: 'coloniesOpened', align: 'right' },
          { header: 'affected', key: 'coloniesAffected', align: 'right' },
          {
            header: 'findings',
            key: 'findings',
            format: (findings) => findings.join(', '),
          },
        ],
        inspections
      );
    });

  return health;
}
