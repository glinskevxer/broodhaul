import { asFlag, asNumber, asText, parseList } from '../parse.js';
import {
  makeBlock,
  blockTrees,
  treesPerAcre,
  describeBlock,
  mainVariety,
  pollinizerShare,
  isSelfFertile,
  blockAge,
} from '../../placement/block.js';
import {
  recommendedDensity,
  recommendedHives,
  explainDensity,
  densityVariance,
} from '../../placement/density.js';
import { seasonOf } from '../../core/dates.js';

/**
 * Block commands.
 *
 * The one that earns its keep is `block density`, which shows the grower the
 * working rather than a number. Half the arguments about a set sheet end the
 * moment somebody can see that the recommendation moved because the block is
 * three years old, not because the price went up.
 */

const VARIETIES = {
  label: 'varieties',
  example: 'Nonpareil:0.5,Monterey:0.5',
  fields: [
    { name: 'name', convert: asText },
    { name: 'share', convert: asNumber },
    { name: 'selfFertile', convert: asFlag('self'), optional: true },
  ],
};

const LIST_COLUMNS = [
  { header: 'block', key: 'id' },
  { header: 'name', key: 'name' },
  { header: 'crop', key: 'crop' },
  { header: 'acres', key: 'acres', align: 'right' },
  {
    header: 'trees',
    align: 'right',
    value: (record) => blockTrees(record),
  },
];

export function registerBlockCommands(program, context) {
  const block = program
    .command('block')
    .description('orchard blocks and how many hives they want');

  block
    .command('add')
    .description('put a block on the books')
    .requiredOption('--id <id>', 'block identifier')
    .requiredOption('--name <name>', 'what the grower calls it')
    .requiredOption('--crop <crop>', 'crop it is planted to')
    .requiredOption('--acres <acres>', 'planted acres')
    .requiredOption('--varieties <list>', 'name:share pairs, comma separated')
    .requiredOption('--planted <year>', 'year it went in')
    .requiredOption('--latitude <degrees>', 'latitude in degrees')
    .requiredOption('--longitude <degrees>', 'longitude in degrees')
    .option('--row-spacing <feet>', 'feet between rows', '22')
    .option('--tree-spacing <feet>', 'feet between trees', '18')
    .option('--notes <text>', 'anything worth knowing')
    .action((options) => {
      const record = makeBlock({
        id: options.id,
        name: options.name,
        crop: options.crop,
        acres: Number(options.acres),
        varieties: parseList(options.varieties, VARIETIES),
        plantedYear: Number(options.planted),
        rowSpacingFt: Number(options.rowSpacing),
        treeSpacingFt: Number(options.treeSpacing),
        location: {
          latitude: Number(options.latitude),
          longitude: Number(options.longitude),
        },
        notes: options.notes,
      });
      const saved = context.desk().save('blocks', record);
      context.output.value({
        id: saved.id,
        acres: saved.acres,
        trees: blockTrees(saved),
        perAcre: treesPerAcre(saved),
      });
    });

  block
    .command('list')
    .description('blocks on the books')
    .option('--crop <crop>', 'only this crop')
    .action((options) => {
      let blocks = context.desk().store.list('blocks');
      if (options.crop) blocks = blocks.filter((entry) => entry.crop === options.crop);
      context.output.table(LIST_COLUMNS, blocks);
    });

  block
    .command('show <id>')
    .description('one block in full')
    .action((id) => {
      const desk = context.desk();
      const record = desk.store.get('blocks', id);
      const season = seasonOf(desk.clock.today());
      if (context.output.json) {
        context.output.value({
          ...record,
          trees: blockTrees(record),
          age: blockAge(record, season),
          pollinizerShare: pollinizerShare(record),
          selfFertile: isSelfFertile(record),
        });
        return;
      }
      context.output.line(describeBlock(record));
      context.output.detail([
        ['trees', String(blockTrees(record))],
        ['age', `${blockAge(record, season)} seasons`],
        ['main variety', mainVariety(record).name],
        ['pollinizer share', String(pollinizerShare(record))],
        ['self fertile', isSelfFertile(record) ? 'yes' : 'no'],
      ]);
    });

  block
    .command('density <id>')
    .description('hives per acre this block wants, with the working')
    .option('--cool-bloom', 'assume a cool bloom forecast')
    .option('--contracted <perAcre>', 'compare against a contracted density')
    .action((id, options) => {
      const desk = context.desk();
      const record = desk.store.get('blocks', id);
      const season = seasonOf(desk.clock.today());
      const settings = { coolBloom: Boolean(options.coolBloom) };
      if (context.output.json) {
        const payload = {
          block: record.id,
          season,
          recommended: recommendedDensity(record, season, settings),
          hives: recommendedHives(record, season, settings),
        };
        context.output.value(
          options.contracted === undefined
            ? payload
            : {
                ...payload,
                ...densityVariance(
                  record,
                  season,
                  Number(options.contracted),
                  settings
                ),
              }
        );
        return;
      }
      context.output.line(explainDensity(record, season, settings));
      context.output.line(
        `${recommendedHives(record, season, settings)} hives over the block`
      );
      if (options.contracted !== undefined) {
        const variance = densityVariance(
          record,
          season,
          Number(options.contracted),
          settings
        );
        context.output.line(
          variance.short
            ? `contracted at ${variance.contracted}, short by ${Math.abs(variance.difference)}`
            : `contracted at ${variance.contracted}, ${variance.difference} over`
        );
      }
    });

  return block;
}
