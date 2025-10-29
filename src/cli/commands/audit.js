import {
  activityByActor,
  activityByDay,
  activityByCollection,
  historyOf,
  reworked,
  auditSummary,
  busiestDay,
  removedRecords,
} from '../../reporting/audit.js';

/**
 * Audit commands.
 *
 * These read the journal and write nothing. The one that earns its keep is
 * `audit history`, because the question it answers, what did this record look
 * like before somebody changed it, used to be answered by opening the journal
 * in a text editor and searching for the identifier.
 */

export function registerAuditCommands(program, context) {
  const audit = program.command('audit').description('who changed what and when');

  audit
    .command('summary')
    .description('the journal in five numbers')
    .option('--since <date>', 'only from this day on')
    .action((options) => {
      const entries = context.desk().journal.read();
      const summary = auditSummary(entries, { since: options.since });
      if (context.output.json) {
        context.output.value({ ...summary, busiestDay: busiestDay(entries) });
        return;
      }
      context.output.detail([
        ['writes', String(summary.writes)],
        ['actors', String(summary.actors)],
        ['days', String(summary.days)],
        ['collections', String(summary.collections)],
        ['removals', String(summary.removals)],
        ['busiest day', busiestDay(entries) ? busiestDay(entries).day : 'none'],
      ]);
    });

  audit
    .command('actors')
    .description('what each person has written')
    .action(() => {
      context.output.table(
        [
          { header: 'actor', key: 'actor' },
          { header: 'writes', key: 'writes', align: 'right' },
          { header: 'inserts', key: 'inserts', align: 'right' },
          { header: 'updates', key: 'updates', align: 'right' },
          { header: 'removes', key: 'removes', align: 'right' },
          { header: 'first', key: 'firstOn' },
          { header: 'last', key: 'lastOn' },
        ],
        activityByActor(context.desk().journal.read())
      );
    });

  audit
    .command('days')
    .description('writes a day')
    .action(() => {
      context.output.table(
        [
          { header: 'day', key: 'day' },
          { header: 'writes', key: 'writes', align: 'right' },
          { header: 'actors', key: 'actors', align: 'right' },
        ],
        activityByDay(context.desk().journal.read())
      );
    });

  audit
    .command('collections')
    .description('writes by collection')
    .action(() => {
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'writes', key: 'writes', align: 'right' },
        ],
        activityByCollection(context.desk().journal.read())
      );
    });

  audit
    .command('history <collection> <id>')
    .description('every version of one record and what changed')
    .action((collection, id) => {
      const history = historyOf(context.desk().journal.read(), collection, id);
      if (context.output.json) {
        context.output.value(history);
        return;
      }
      context.output.table(
        [
          { header: 'at', key: 'at' },
          { header: 'actor', key: 'actor' },
          { header: 'action', key: 'action' },
          { header: 'changed', key: 'changed', format: (fields) => fields.join(' ') },
        ],
        history
      );
    });

  audit
    .command('reworked')
    .description('records touched more than a few times')
    .option('--at-least <count>', 'how many writes counts as rework', '3')
    .action((options) => {
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'record', key: 'id' },
          { header: 'writes', key: 'writes', align: 'right' },
          { header: 'actors', key: 'actors', format: (actors) => actors.join(', ') },
        ],
        reworked(context.desk().journal.read(), { atLeast: Number(options.atLeast) })
      );
    });

  audit
    .command('removed')
    .description('records the journal knows and the store no longer holds')
    .action(() => {
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'record', key: 'id' },
          { header: 'removed', key: 'removedOn' },
          { header: 'by', key: 'by' },
        ],
        removedRecords(context.desk().journal.read())
      );
    });

  return audit;
}
