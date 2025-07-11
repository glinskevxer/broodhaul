import {
  takeSnapshot,
  writeSnapshot,
  readSnapshot,
  restoreSnapshot,
  snapshotCounts,
  snapshotTotal,
  differenceFromSnapshot,
  matchesSnapshot,
} from '../../store/snapshot.js';

/**
 * Snapshot commands.
 *
 * `store restore` is the only command in this program that throws work away,
 * so it says exactly what it is about to do and takes a confirmation flag. The
 * office has restored the wrong side of a sync before and it cost a day.
 */

const COUNT_COLUMNS = [
  { header: 'collection', key: 'collection' },
  { header: 'records', key: 'records', align: 'right' },
];

const DIFF_COLUMNS = [
  { header: 'collection', key: 'collection' },
  { header: 'record', key: 'id' },
  { header: 'change', key: 'change' },
];

export function registerStoreCommands(program, context) {
  const store = program
    .command('store')
    .description('snapshots of the record directory');

  store
    .command('snapshot <file>')
    .description('write every record to one file')
    .option('--note <text>', 'why it was taken')
    .action((file, options) => {
      const desk = context.desk();
      const snapshot = takeSnapshot(desk.store, {
        takenAt: desk.clock.now(),
        note: options.note,
      });
      writeSnapshot(file, snapshot);
      if (context.output.json) {
        context.output.value({
          file,
          takenAt: snapshot.takenAt,
          records: snapshotTotal(snapshot),
          counts: snapshotCounts(snapshot),
        });
        return;
      }
      context.output.line(`${snapshotTotal(snapshot)} records written to ${file}`);
      context.output.table(
        COUNT_COLUMNS,
        snapshotCounts(snapshot).filter((row) => row.records > 0)
      );
    });

  store
    .command('diff <file>')
    .description('what has changed since a snapshot was taken')
    .action((file) => {
      const desk = context.desk();
      const snapshot = readSnapshot(file);
      const differences = differenceFromSnapshot(desk.store, snapshot);
      if (context.output.json) {
        context.output.value({
          file,
          takenAt: snapshot.takenAt,
          matches: matchesSnapshot(desk.store, snapshot),
          differences,
        });
        return;
      }
      if (differences.length === 0) {
        context.output.line(`nothing has changed since ${snapshot.takenAt}`);
        return;
      }
      context.output.table(DIFF_COLUMNS, differences);
    });

  store
    .command('restore <file>')
    .description('put a snapshot back, throwing away anything since')
    .option('--confirm', 'actually do it')
    .action((file, options) => {
      const desk = context.desk();
      const snapshot = readSnapshot(file);
      const differences = differenceFromSnapshot(desk.store, snapshot);
      if (!options.confirm) {
        if (context.output.json) {
          context.output.value({ file, wouldChange: differences.length, differences });
          return;
        }
        context.output.line(
          `${differences.length} records would change, run again with --confirm`
        );
        context.output.table(DIFF_COLUMNS, differences);
        return;
      }
      const outcome = restoreSnapshot(desk.store, snapshot);
      context.output.value({
        file,
        takenAt: snapshot.takenAt,
        written: outcome.written,
        removed: outcome.removed,
      });
    });

  return store;
}
