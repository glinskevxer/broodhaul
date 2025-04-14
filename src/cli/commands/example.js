import { SEASON, loadSeason } from '../../examples/season.js';
import { storeCounts } from '../../store/repository.js';

/**
 * The worked season, loaded into a record directory.
 *
 * This is what somebody runs first. It puts a complete season on disk so every
 * other command has something to talk about, which beats reading the help for
 * fourteen commands and guessing which record has to exist before the next one
 * will take.
 */

export function registerExampleCommands(program, context) {
  const example = program
    .command('example')
    .description('the worked season that ships with this');

  example
    .command('load')
    .description('write the worked season into the record directory')
    .action(() => {
      const desk = context.desk();
      const written = loadSeason(desk);
      if (context.output.json) {
        context.output.value({
          written: written.length,
          counts: storeCounts(desk.store),
        });
        return;
      }
      context.output.line(`${written.length} records written to ${desk.root}`);
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'records', key: 'records', align: 'right' },
        ],
        storeCounts(desk.store).filter((row) => row.records > 0)
      );
    });

  example
    .command('show')
    .description('what the worked season contains, without writing anything')
    .action(() => {
      const rows = Object.entries(SEASON).map(([collection, records]) => ({
        collection,
        records: records.length,
      }));
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'records', key: 'records', align: 'right' },
        ],
        rows
      );
    });

  return example;
}
