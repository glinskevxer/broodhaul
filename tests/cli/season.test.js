import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';
import { cliRunner } from '../helpers/cli.js';

let root;
let previousRoot;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-season-cli-'));
  previousRoot = process.env.BROODHAUL_ROOT;
  delete process.env.BROODHAUL_ROOT;
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (previousRoot === undefined) {
    delete process.env.BROODHAUL_ROOT;
  } else {
    process.env.BROODHAUL_ROOT = previousRoot;
  }
});

describe('example load', () => {
  it('writes the worked season', async () => {
    const { capture } = await run(['example', 'load'], { json: true });
    expect(capture.parsed.written).toBe(24);
  });

  it('says what it wrote in text mode', async () => {
    const { capture } = await run(['example', 'load']);
    expect(capture.lines[0]).toContain('24 records written');
  });

  it('shows the season without writing anything', async () => {
    const { capture } = await run(['example', 'show'], { json: true });
    expect(capture.parsed.find((row) => row.collection === 'colonies').records).toBe(
      12
    );
  });
});

describe('season', () => {
  it('prints the season on one page', async () => {
    const { status, capture } = await run(['season', '2025']);
    expect(status).toBe(0);
    expect(capture.lines[0]).toBe('season 2025');
    expect(capture.stdout).toContain('Wilkins Farming');
  });

  it('defaults to the season the clock is in', async () => {
    const { capture } = await run(['season'], { json: true });
    expect(capture.parsed.season).toBe(2025);
  });

  it('gives the summary and the rows in json', async () => {
    const { capture } = await run(['season', '2025'], { json: true });
    expect(capture.parsed).toMatchObject({
      contracts: 1,
      hivesOrdered: 48,
      hivesSet: 44,
      hivesShort: 4,
      colonies: 12,
    });
    expect(capture.parsed.contractRows).toHaveLength(1);
  });

  it('can print just the contract table', async () => {
    const { capture } = await run(['season', '2025', '--contracts']);
    expect(capture.lines[0]).toContain('made minimum');
    expect(capture.lines[2]).toContain('no');
  });

  it('is quiet for a season with nothing in it', async () => {
    const { capture } = await run(['season', '2023'], { json: true });
    expect(capture.parsed.contracts).toBe(0);
  });
});

describe('the record directory', () => {
  it('comes off the environment when no flag is given', async () => {
    process.env.BROODHAUL_ROOT = root;
    const capture = captureOutput({ json: true });
    const status = await runCli(['--json', '--today', '2025-03-20', 'counts'], {
      output: capture.output,
    });
    expect(status).toBe(0);
    expect(capture.parsed.find((row) => row.collection === 'yards').records).toBe(2);
  });

  it('is overridden by the flag', async () => {
    process.env.BROODHAUL_ROOT = join(root, 'nowhere');
    const { capture } = await run(['counts'], { json: true });
    expect(capture.parsed.find((row) => row.collection === 'yards').records).toBe(2);
  });

  it('still complains when neither is given', async () => {
    const capture = captureOutput();
    const status = await runCli(['counts'], { output: capture.output });
    expect(status).toBe(2);
    expect(capture.stderr).toContain('use --root');
  });
});
