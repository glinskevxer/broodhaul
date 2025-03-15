import { Command } from 'commander';
import { ValidationError } from '../core/errors.js';
import { fixedClock, systemClock } from '../core/clock.js';
import { openDesk } from '../desk.js';
import { createOutput } from './io.js';
import { registerYardCommands } from './commands/yard.js';
import { registerColonyCommands } from './commands/colony.js';
import { registerPalletCommands } from './commands/pallet.js';
import { registerBlockCommands } from './commands/block.js';
import { registerContractCommands } from './commands/contract.js';
import { registerDropCommands } from './commands/drop.js';
import { registerLoadCommands } from './commands/load.js';

export const VERSION = '0.1.0';

/**
 * The command line.
 *
 * Every command gets a context rather than reaching for globals: an output
 * sink, and a function that opens the desk when a command actually needs it.
 * Opening it lazily matters more than it looks, because `broodhaul --help`
 * should not care whether the record directory exists, and half the support
 * calls this program gets start with somebody running it in the wrong folder.
 */

export function buildContext(options = {}) {
  const output = options.output ?? createOutput({ json: Boolean(options.json) });
  const clock = options.today
    ? fixedClock(options.today)
    : (options.clock ?? systemClock());
  let desk;
  return {
    output,
    clock,
    options,
    desk() {
      if (!desk) {
        if (!options.root) {
          throw new ValidationError('no record directory given, use --root', {});
        }
        desk = openDesk({
          root: options.root,
          actor: options.actor ?? 'office',
          clock,
        });
      }
      return desk;
    },
  };
}

export function buildProgram(context) {
  const program = new Command();
  program
    .name('broodhaul')
    .description('pollination desk for a migratory beekeeping operation')
    .version(VERSION)
    .option('--root <dir>', 'directory holding the records')
    .option('--actor <name>', 'who is making the change', 'office')
    .option('--today <date>', 'run as though it were this day')
    .option('--json', 'write json instead of text')
    .exitOverride();
  program.configureOutput({
    writeOut: (text) => context.output.line(text.replace(/\n$/, '')),
    writeErr: (text) => context.output.warn(text.replace(/\n$/, '')),
  });
  registerYardCommands(program, context);
  registerColonyCommands(program, context);
  registerPalletCommands(program, context);
  registerBlockCommands(program, context);
  registerContractCommands(program, context);
  registerDropCommands(program, context);
  registerLoadCommands(program, context);
  return program;
}

/**
 * Parse and run. Returns the exit status rather than calling process.exit, so
 * the tests can run the whole program in process and read what came out.
 */
export async function runCli(argv, options = {}) {
  const globals = parseGlobals(argv);
  const context = buildContext({ ...globals, ...options });
  const program = buildProgram(context);
  try {
    await program.parseAsync(['node', 'broodhaul', ...argv]);
    return 0;
  } catch (err) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      return 0;
    }
    if (err.code === 'commander.help') return 0;
    if (typeof err.exitCode === 'number' && err.code?.startsWith('commander.')) {
      return err.exitCode;
    }
    return context.output.failure(err);
  }
}

/**
 * Commander only hands the global options to an action, and the context has to
 * exist before the program is built, so the few globals are read off the
 * argument list first. Anything unrecognised is left alone for commander to
 * complain about properly.
 */
export function parseGlobals(argv) {
  const globals = {};
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--root') globals.root = argv[at + 1];
    if (arg === '--actor') globals.actor = argv[at + 1];
    if (arg === '--today') globals.today = argv[at + 1];
    if (arg === '--json') globals.json = true;
    if (arg.startsWith('--root=')) globals.root = arg.slice('--root='.length);
    if (arg.startsWith('--actor=')) globals.actor = arg.slice('--actor='.length);
    if (arg.startsWith('--today=')) globals.today = arg.slice('--today='.length);
  }
  return globals;
}
