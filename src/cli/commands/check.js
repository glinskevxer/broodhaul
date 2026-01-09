import {
  problems,
  problemCounts,
  PROBLEM_KINDS,
  requireProblemKind,
} from '../../desk.js';
import { storeCounts, collectionNames } from '../../store/repository.js';
import {
  actors,
  describeEntry,
  entriesFor,
  entriesOn,
  entriesSince,
} from '../../store/journal.js';

/**
 * The checks the office runs, and the journal it reads when something looks
 * wrong.
 *
 * `check` is the nightly job. It exits non zero when it finds anything, so it
 * can sit in a scheduled task and only send mail when there is something to
 * read.
 */

export function registerCheckCommands(program, context) {
  program
    .command('check')
    .description('every disagreement the desk can find')
    .option('--counts', 'just the count of each kind')
    .option('--exit-zero', 'report the problems but do not fail')
    .option('--only <kind>', 'only problems of this kind')
    .action((options) => {
      const desk = context.desk();
      const all = options.only
        ? problems(desk).filter(
            (problem) => problem.kind === requireProblemKind(options.only)
          )
        : problems(desk);
      const found = options.counts ? problemCounts(desk) : all;
      if (options.counts) {
        context.output.table(
          [
            { header: 'kind', key: 'kind' },
            { header: 'count', key: 'count', align: 'right' },
          ],
          found
        );
      } else if (context.output.json) {
        context.output.value(found);
      } else if (found.length === 0) {
        context.output.line('nothing to report');
      } else {
        for (const problem of found) {
          const rest = Object.entries(problem)
            .filter(([key]) => key !== 'kind')
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join(' ');
          context.output.line(`${problem.kind}  ${rest}`);
        }
      }
      if (all.length > 0 && !options.exitZero) {
        process.exitCode = 1;
      }
    });

  program
    .command('kinds')
    .description('every kind of problem the check can report')
    .action(() => {
      context.output.value(PROBLEM_KINDS);
    });

  program
    .command('counts')
    .description('how many records of each kind are on file')
    .action(() => {
      context.output.table(
        [
          { header: 'collection', key: 'collection' },
          { header: 'records', key: 'records', align: 'right' },
        ],
        storeCounts(context.desk().store)
      );
    });

  const journal = program.command('journal').description('the write log');

  journal
    .command('tail')
    .description('the most recent entries')
    .option('--limit <count>', 'how many to show', '20')
    .option('--since <date>', 'only entries from this day on')
    .option('--on <date>', 'only entries from this day')
    .action((options) => {
      const desk = context.desk();
      let entries = desk.journal.read();
      if (options.since) entries = entriesSince(entries, options.since);
      if (options.on) entries = entriesOn(entries, options.on);
      const limit = Number(options.limit);
      const shown = entries.slice(-limit);
      if (context.output.json) {
        context.output.value(shown);
        return;
      }
      for (const entry of shown) {
        context.output.line(describeEntry(entry));
      }
    });

  journal
    .command('record <collection> <id>')
    .description('every entry touching one record')
    .action((collection, id) => {
      const entries = entriesFor(context.desk().journal.read(), collection, id);
      if (context.output.json) {
        context.output.value(entries);
        return;
      }
      for (const entry of entries) {
        context.output.line(describeEntry(entry));
      }
    });

  journal
    .command('actors')
    .description('who has written anything')
    .action(() => {
      context.output.value(actors(context.desk().journal.read()));
    });

  journal
    .command('collections')
    .description('the collections the journal can carry')
    .action(() => {
      context.output.value(collectionNames());
    });

  return program;
}
