import { join } from 'node:path';
import { writeTextAtomic } from '../../store/files.js';
import { documentNames, renderDocument } from '../../reporting/documents.js';

/**
 * Printing.
 *
 * One command with a document name and an identifier, because that is how the
 * office asks for it: "print me the set sheet for the Wilkins contract". The
 * output goes to standard output so it can be piped at a printer, or to a file
 * when it is going in an email.
 */

export function registerPrintCommands(program, context) {
  program
    .command('print <document> <id>')
    .description(`one of ${documentNames().join(', ')}`)
    .option('--to <file>', 'write to a file instead of standard output')
    .action((document, id, options) => {
      const desk = context.desk();
      const text = renderDocument(desk, document, id);
      if (options.to) {
        const path = options.to;
        writeTextAtomic(path, `${text}\n`);
        context.output.value({
          document,
          id,
          file: path,
          lines: text.split('\n').length,
        });
        return;
      }
      if (context.output.json) {
        context.output.value({ document, id, text });
        return;
      }
      context.output.line(text);
    });

  program
    .command('documents')
    .description('the documents this can print')
    .action(() => {
      context.output.value(documentNames());
    });

  return program;
}

/** Where a batch of printed documents goes when nobody says. */
export function defaultPrintDirectory(root) {
  return join(root, 'printed');
}
