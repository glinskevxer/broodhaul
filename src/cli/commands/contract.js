import { asNumber, asText, parseList, parseWindow } from '../parse.js';
import { formatMoney } from '../../core/money.js';
import { formatSpan } from '../../core/span.js';
import {
  makeContract,
  contractedHives,
  contractAcres,
  contractValueCents,
  commissionCents,
  netToOperationCents,
  deliveryOpen,
  removalOpen,
} from '../../contracts/contract.js';
import { describeTerms } from '../../contracts/terms.js';
import { planContractDrops, planTotal, describePlan } from '../../placement/plan.js';

/**
 * Contract commands.
 *
 * A contract is typed in once and read all season, so the add command takes
 * the blocks as a list of `block:acres:perAcre` triples rather than asking the
 * office to write json by hand. The tier table is the same idea: three numbers
 * on the command line rather than a file nobody will edit correctly.
 */

const BLOCKS = {
  label: 'blocks',
  example: 'BK-2025-0001:120:2',
  fields: [
    { name: 'blockId', convert: asText },
    { name: 'acres', convert: asNumber },
    { name: 'hivesPerAcre', convert: asNumber },
  ],
};

const TIERS = {
  label: 'tiers',
  example: '10:2500,8:0,6:-2500',
  fields: [
    { name: 'atLeast', convert: asNumber },
    { name: 'adjustmentCents', convert: asNumber },
  ],
};

const LIST_COLUMNS = [
  { header: 'contract', key: 'id' },
  { header: 'grower', key: 'grower', format: (grower) => grower.name },
  { header: 'crop', key: 'crop' },
  {
    header: 'hives',
    key: 'blocks',
    align: 'right',
    format: (_value, record) => contractedHives(record),
  },
  {
    header: 'rate',
    key: 'rateCents',
    align: 'right',
    format: (cents) => formatMoney(cents),
  },
];

export function registerContractCommands(program, context) {
  const contract = program.command('contract').description('pollination contracts');

  contract
    .command('add')
    .description('put a contract on the books')
    .requiredOption('--id <id>', 'contract identifier')
    .requiredOption('--grower <name>', 'who is renting the bees')
    .requiredOption('--county <county>', 'county the ranch is in')
    .requiredOption('--crop <crop>', 'crop being pollinated')
    .requiredOption('--blocks <list>', 'block:acres:perAcre triples, comma separated')
    .requiredOption('--rate <cents>', 'rate per hive in cents')
    .requiredOption('--delivery <from..to>', 'delivery window')
    .requiredOption('--removal <from..to>', 'removal window')
    .requiredOption('--signed-on <date>', 'day it was signed')
    .option('--ranch <name>', 'ranch name')
    .option('--minimum <frames>', 'minimum average frames', '8')
    .option('--sample <percent>', 'percentage of hives graded', '10')
    .option(
      '--tiers <list>',
      'frames:cents pairs, strongest first',
      '10:2500,8:0,6:-2500'
    )
    .option('--grade-by <basis>', 'average or colony', 'average')
    .option('--shortfall <rule>', 'prorate, reject or tier', 'prorate')
    .option('--regrade <days>', 'days the grower has to ask for a regrade', '0')
    .option('--broker <name>', 'broker who placed it')
    .option('--commission <bps>', 'broker commission in basis points', '0')
    .action((options) => {
      const delivery = parseWindow(options.delivery, 'delivery');
      const removal = parseWindow(options.removal, 'removal');
      const record = makeContract({
        id: options.id,
        grower: { name: options.grower, ranch: options.ranch, county: options.county },
        crop: options.crop,
        blocks: parseList(options.blocks, BLOCKS),
        rateCents: Number(options.rate),
        terms: {
          minimumAverage: Number(options.minimum),
          samplePercent: Number(options.sample),
          tiers: parseList(options.tiers, TIERS),
          gradeBy: options.gradeBy,
          shortfall: options.shortfall,
          regradeWithinDays: Number(options.regrade),
        },
        delivery,
        removal,
        broker: options.broker
          ? { name: options.broker, commissionBps: Number(options.commission) }
          : undefined,
        signedOn: options.signedOn,
      });
      const saved = context.desk().save('contracts', record);
      context.output.value({
        id: saved.id,
        hives: contractedHives(saved),
        acres: contractAcres(saved),
        value: formatMoney(contractValueCents(saved)),
      });
    });

  contract
    .command('list')
    .description('contracts on the books')
    .option('--season <year>', 'only this season')
    .option('--crop <crop>', 'only this crop')
    .action((options) => {
      let contracts = context.desk().store.list('contracts');
      if (options.season) {
        contracts = contracts.filter(
          (entry) => entry.season === Number(options.season)
        );
      }
      if (options.crop)
        contracts = contracts.filter((entry) => entry.crop === options.crop);
      context.output.table(LIST_COLUMNS, contracts);
    });

  contract
    .command('show <id>')
    .description('one contract in full')
    .action((id) => {
      const desk = context.desk();
      const record = desk.store.get('contracts', id);
      const today = desk.clock.today();
      if (context.output.json) {
        context.output.value({
          ...record,
          hives: contractedHives(record),
          acres: contractAcres(record),
          valueCents: contractValueCents(record),
          commissionCents: commissionCents(record),
          netCents: netToOperationCents(record),
        });
        return;
      }
      context.output.detail([
        ['contract', record.id],
        ['grower', record.grower.name],
        ['crop', `${record.crop} over ${contractAcres(record)} acres`],
        ['hives', String(contractedHives(record))],
        ['rate', formatMoney(record.rateCents)],
        ['value', formatMoney(contractValueCents(record))],
        ['commission', formatMoney(commissionCents(record))],
        ['net', formatMoney(netToOperationCents(record))],
        [
          'delivery',
          `${formatSpan(record.delivery)}${deliveryOpen(record, today) ? ', open' : ''}`,
        ],
        [
          'removal',
          `${formatSpan(record.removal)}${removalOpen(record, today) ? ', open' : ''}`,
        ],
      ]);
      context.output.line();
      context.output.line(describeTerms(record.terms));
    });

  contract
    .command('plan <id>')
    .description('drops for a contract, sized in whole pallets')
    .option('--max-per-drop <hives>', 'largest drop the grower will take', '48')
    .option('--pattern <pattern>', 'four-way or six-way', 'four-way')
    .action((id, options) => {
      const record = context.desk().store.get('contracts', id);
      const plan = planContractDrops(record, {
        maxPerDrop: Number(options.maxPerDrop),
        pattern: options.pattern,
      });
      if (context.output.json) {
        context.output.value({
          contract: record.id,
          hives: planTotal(plan),
          drops: plan,
        });
        return;
      }
      context.output.line(describePlan(plan));
      context.output.line(`${plan.length} drops, ${planTotal(plan)} hives`);
    });

  return contract;
}
