import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

/**
 * Running the program from a test.
 *
 * Seventeen command suites each had their own copy of this, and they had
 * drifted: some passed `--today`, some did not, one had stopped passing
 * `--actor` and was quietly testing the default. One runner, one set of
 * defaults, and a per call override for the two things that vary.
 *
 * The root is taken as a function rather than a value because every suite
 * makes a fresh temporary directory in `beforeEach`, so the runner has to ask
 * for it at call time rather than close over whatever it was at import.
 */

export function cliRunner(getRoot, defaults = {}) {
  const { actor = 'M Ojeda', today = '2025-06-20' } = defaults;
  return async function run(args, options = {}) {
    const json = options.json ?? false;
    const capture = captureOutput({ json });
    const root = options.root === undefined ? getRoot() : options.root;
    const status = await runCli(
      [
        ...(root === null ? [] : ['--root', root]),
        '--actor',
        options.actor ?? actor,
        '--today',
        options.today ?? today,
        ...(json ? ['--json'] : []),
        ...args,
      ],
      { output: capture.output }
    );
    return { status, capture };
  };
}
