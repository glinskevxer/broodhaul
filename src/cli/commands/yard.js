import {
  makeYard,
  agreementCovers,
  capacityLeft,
  describeYard,
} from '../../apiary/yard.js';
import { coloniesInYard, yardOccupancy } from '../../apiary/register.js';
import { formatMoney } from '../../core/money.js';

/**
 * Yard commands. The register the crew asks for over the radio, plus the two
 * writes the office makes: adding a yard when a landowner agreement is signed,
 * and retiring one when it is not renewed.
 */

const LIST_COLUMNS = [
  { header: 'yard', key: 'id' },
  { header: 'name', key: 'name' },
  { header: 'county', key: 'county' },
  { header: 'access', key: 'access' },
  { header: 'capacity', key: 'capacity', align: 'right' },
];

const OCCUPANCY_COLUMNS = [
  { header: 'yard', key: 'yardId' },
  { header: 'name', key: 'name' },
  { header: 'colonies', key: 'colonies', align: 'right' },
  { header: 'pallets', key: 'pallets', align: 'right' },
  { header: 'capacity', key: 'capacity', align: 'right' },
  { header: 'headroom', key: 'headroom', align: 'right' },
];

export function registerYardCommands(program, context) {
  const yard = program
    .command('yard')
    .description('bee yards and landowner agreements');

  yard
    .command('add')
    .description('put a yard on the books')
    .requiredOption('--id <id>', 'yard identifier')
    .requiredOption('--name <name>', 'what the crew calls it')
    .requiredOption('--county <county>', 'county it sits in')
    .requiredOption('--state <state>', 'two letter state code')
    .requiredOption('--landowner <name>', 'who owns the ground')
    .requiredOption('--agreement-on <date>', 'day the agreement starts')
    .requiredOption('--latitude <degrees>', 'latitude in degrees')
    .requiredOption('--longitude <degrees>', 'longitude in degrees')
    .requiredOption('--capacity <colonies>', 'colonies it will hold')
    .option('--access <grade>', 'semi, bobtail or quad', 'semi')
    .option('--water <source>', 'onsite, canal or hauled', 'canal')
    .option('--rent <cents>', 'yard rent for the season, in cents')
    .option('--notes <text>', 'anything the driver needs')
    .action((options) => {
      const record = makeYard({
        id: options.id,
        name: options.name,
        county: options.county,
        state: options.state,
        landowner: {
          name: options.landowner,
          agreementOn: options.agreementOn,
          rentCents: options.rent === undefined ? undefined : Number(options.rent),
        },
        location: {
          latitude: Number(options.latitude),
          longitude: Number(options.longitude),
        },
        capacity: Number(options.capacity),
        access: options.access,
        water: options.water,
        notes: options.notes,
      });
      const saved = context.desk().save('yards', record);
      context.output.value({
        id: saved.id,
        name: saved.name,
        capacity: saved.capacity,
      });
    });

  yard
    .command('list')
    .description('every yard on the books')
    .option('--county <county>', 'only this county')
    .option('--access <grade>', 'only yards a truck of this grade can reach')
    .action((options) => {
      let yards = context.desk().store.list('yards');
      if (options.county) {
        yards = yards.filter(
          (entry) => entry.county.toLowerCase() === options.county.toLowerCase()
        );
      }
      if (options.access) {
        yards = yards.filter((entry) => entry.access === options.access);
      }
      context.output.table(LIST_COLUMNS, yards);
    });

  yard
    .command('show <id>')
    .description('one yard in full')
    .action((id) => {
      const desk = context.desk();
      const record = desk.store.get('yards', id);
      const colonies = coloniesInYard(desk.register(), id, { productiveOnly: true });
      if (context.output.json) {
        context.output.value({
          ...record,
          colonies: colonies.length,
          headroom: capacityLeft(record, colonies.length),
          agreementCovers: agreementCovers(record, desk.clock.today()),
        });
        return;
      }
      context.output.line(describeYard(record));
      context.output.detail([
        ['colonies', String(colonies.length)],
        ['headroom', String(capacityLeft(record, colonies.length))],
        ['agreement today', agreementCovers(record, desk.clock.today()) ? 'yes' : 'no'],
        [
          'rent',
          record.landowner.rentCents === undefined
            ? 'none'
            : formatMoney(record.landowner.rentCents),
        ],
      ]);
    });

  yard
    .command('occupancy')
    .description('what is standing in each yard against what it holds')
    .action(() => {
      context.output.table(OCCUPANCY_COLUMNS, yardOccupancy(context.desk().register()));
    });

  yard
    .command('remove <id>')
    .description('take a yard off the books')
    .action((id) => {
      const removed = context.desk().remove('yards', id);
      context.output.value({ id, removed });
    });

  return yard;
}
