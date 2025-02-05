import { describeError, exitCodeFor } from '../core/errors.js';
import { stableStringify } from '../core/serial.js';
import { renderDetail, renderHeading, renderTable } from '../core/table.js';

/**
 * Where the commands write.
 *
 * Two shapes come out of this program. The default is plain text lined up for
 * a terminal or a printer, because most of what the office does with it is
 * read it. The other is json, because the almond broker wants a file and the
 * nightly job pipes it somewhere. Every command writes through here rather
 * than calling console.log, so the two shapes cannot drift apart and a test
 * can capture the output without a global.
 */

export function createOutput({ stdout, stderr, json = false } = {}) {
  const out = stdout ?? ((text) => process.stdout.write(text));
  const err = stderr ?? ((text) => process.stderr.write(text));

  function line(text = '') {
    out(`${text}\n`);
  }

  function warn(text) {
    err(`${text}\n`);
  }

  function value(payload) {
    if (json) {
      out(`${stableStringify(payload, { indent: 2 })}\n`);
      return;
    }
    if (Array.isArray(payload)) {
      for (const entry of payload) line(String(entry));
      return;
    }
    if (payload !== null && typeof payload === 'object') {
      line(
        renderDetail(
          Object.entries(payload).map(([key, item]) => [key, String(item ?? '')])
        )
      );
      return;
    }
    line(String(payload));
  }

  function table(columns, rows) {
    if (json) {
      out(`${stableStringify(rows, { indent: 2 })}\n`);
      return;
    }
    line(renderTable(columns, rows));
  }

  function detail(pairs) {
    if (json) {
      out(`${stableStringify(Object.fromEntries(pairs), { indent: 2 })}\n`);
      return;
    }
    line(renderDetail(pairs));
  }

  function heading(text) {
    if (json) return;
    line(renderHeading(text));
  }

  function failure(error) {
    const described = describeError(error);
    if (json) {
      err(`${stableStringify(described, { indent: 2 })}\n`);
    } else {
      warn(`${described.code}: ${described.message}`);
    }
    return exitCodeFor(error);
  }

  return { json, line, warn, value, table, detail, heading, failure };
}

/** Collects output in memory, which is how every command test reads it. */
export function captureOutput({ json = false } = {}) {
  const chunks = [];
  const errors = [];
  const output = createOutput({
    stdout: (text) => chunks.push(text),
    stderr: (text) => errors.push(text),
    json,
  });
  return {
    output,
    get stdout() {
      return chunks.join('');
    },
    get stderr() {
      return errors.join('');
    },
    get lines() {
      return chunks
        .join('')
        .split('\n')
        .filter((entry) => entry !== '');
    },
    get parsed() {
      return JSON.parse(chunks.join(''));
    },
  };
}
