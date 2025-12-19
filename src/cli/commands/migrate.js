import {
  planMigration,
  runMigrations,
  readVersion,
  latestVersion,
  isUpToDate,
  describePlan,
} from '../../store/migrate.js';

/**
 * Migration commands.
 *
 * The store parses every record on the way out, so a record written by an
 * older build stops the program rather than being read wrong. That is the
 * right trade, and it means somebody has to be able to run the migrations,
 * which until now they could not: the module existed and nothing called it.
 *
 * `migrate plan` is the safe one and prints what would happen. `migrate run`
 * does it, and is idempotent, because the two offices sync and one of them
 * will run it twice.
 */

export function registerMigrateCommands(program, context) {
  const migrate = program.command('migrate').description('bring older records forward');

  migrate
    .command('version')
    .description('what version the records are at')
    .action(() => {
      const desk = context.desk();
      context.output.value({
        version: readVersion(desk.root),
        latest: latestVersion(),
        upToDate: isUpToDate(desk.root),
      });
    });

  migrate
    .command('plan')
    .description('what running the migrations would do')
    .action(() => {
      const desk = context.desk();
      const plan = planMigration(desk.store, desk.root);
      if (context.output.json) {
        context.output.value(plan);
        return;
      }
      context.output.line(describePlan(plan));
    });

  migrate
    .command('run')
    .description('bring the records forward')
    .action(() => {
      const desk = context.desk();
      const outcome = runMigrations(desk.store, desk.root, { at: desk.clock.now() });
      if (context.output.json) {
        context.output.value(outcome);
        return;
      }
      if (outcome.steps === 0) {
        context.output.line(`records are already at version ${outcome.to}`);
        return;
      }
      context.output.line(
        `moved ${outcome.records} records from version ${outcome.from} to ${outcome.to}`
      );
    });

  return migrate;
}
