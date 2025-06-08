import { join } from 'node:path';
import { ensureDir, writeTextAtomic } from '../../store/files.js';
import {
  exportAll,
  exportColumns,
  exportCsv,
  exportNames,
  exportRows,
} from '../../reporting/export.js';

/**
 * Export commands.
 *
 * The csv goes to standard output by default, because that is what a pipe
 * wants, and to a directory when the office is emailing a folder to the
 * accountant. Writing to a directory names every file it wrote, since the
 * usual failure is somebody sending four of the five.
 */

export function registerExportCommands(program, context) {
  const exportCommand = program
    .command('export')
    .description('csv for the people who ask for it');

  exportCommand
    .command('list')
    .description('what can be exported')
    .action(() => {
      const rows = exportNames().map((name) => ({
        name,
        columns: exportColumns(name).join(' '),
      }));
      context.output.table(
        [
          { header: 'name', key: 'name' },
          { header: 'columns', key: 'columns' },
        ],
        rows
      );
    });

  exportCommand
    .command('csv <name>')
    .description('one export, to standard output')
    .action((name) => {
      const desk = context.desk();
      if (context.output.json) {
        context.output.value(exportRows(desk, name));
        return;
      }
      context.output.line(exportCsv(desk, name));
    });

  exportCommand
    .command('all <directory>')
    .description('every export, one file each, into a directory')
    .action((directory) => {
      const desk = context.desk();
      ensureDir(directory);
      const written = exportAll(desk).map((entry) => {
        const path = join(directory, `${entry.name}.csv`);
        writeTextAtomic(path, `${entry.csv}\n`);
        return { name: entry.name, rows: entry.rows, path };
      });
      if (context.output.json) {
        context.output.value(written);
        return;
      }
      context.output.table(
        [
          { header: 'name', key: 'name' },
          { header: 'rows', key: 'rows', align: 'right' },
          { header: 'file', key: 'path' },
        ],
        written
      );
    });

  return exportCommand;
}
