import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { SEASON_STAGES } from '../../src/movement/weight.js';

let root;

const run = cliRunner(() => root, { today: '2025-09-15' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-forecast-cli-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('forecast bloom', () => {
  it('walks the colonies on the books', async () => {
    const { status, capture } = await run(['forecast', 'bloom'], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.startedWith).toBe(12);
    expect(capture.parsed.atBloom).toBe(9);
  });

  it('takes an explicit colony count', async () => {
    const { capture } = await run(['forecast', 'bloom', '--colonies', '1000'], {
      json: true,
    });
    expect(capture.parsed.atBloom).toBe(808);
  });

  it('starts from winter when asked', async () => {
    const { capture } = await run(
      ['forecast', 'bloom', '--colonies', '1000', '--from', 'winter'],
      { json: true }
    );
    expect(capture.parsed.stages).toHaveLength(1);
    expect(capture.parsed.atBloom).toBe(860);
  });

  it('adds the matured splits', async () => {
    const { capture } = await run(
      ['forecast', 'bloom', '--colonies', '1000', '--splits', '200'],
      { json: true }
    );
    expect(capture.parsed.maturedSplits).toBe(110);
  });

  it('holds the answer against the contracted hives', async () => {
    const { capture } = await run(['forecast', 'bloom', '--season', '2025'], {
      json: true,
    });
    expect(capture.parsed.coverage.contracted).toBe(48);
    expect(capture.parsed.coverage.covered).toBe(false);
  });

  it('says how short it is plainly', async () => {
    const { capture } = await run(['forecast', 'bloom', '--season', '2025']);
    expect(capture.lines[0]).toBe('start 12 colonies in fall');
    expect(capture.stdout).toContain('short by 39');
  });

  it('says the spare when there is one', async () => {
    const { capture } = await run([
      'forecast',
      'bloom',
      '--colonies',
      '1000',
      '--season',
      '2025',
    ]);
    expect(capture.stdout).toContain('spare');
  });

  it('refuses a start it cannot walk from', async () => {
    const { status, capture } = await run(['forecast', 'bloom', '--from', 'flow']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('starts in fall or winter');
  });
});

describe('forecast splits', () => {
  it('is nothing when the target is already covered', async () => {
    const { capture } = await run(
      ['forecast', 'splits', '--target', '500', '--colonies', '1000'],
      { json: true }
    );
    expect(capture.parsed.splitsNeeded).toBe(0);
  });

  it('works back through the maturity rate', async () => {
    const { capture } = await run(
      ['forecast', 'splits', '--target', '1000', '--colonies', '1000'],
      { json: true }
    );
    expect(capture.parsed.splitsNeeded).toBe(350);
  });

  it('says whether the yards can carry them', async () => {
    const { capture } = await run(
      [
        'forecast',
        'splits',
        '--target',
        '1000',
        '--colonies',
        '1000',
        '--strengths',
        'CY-2025-0011:12,CY-2025-0012:10',
      ],
      { json: true }
    );
    expect(capture.parsed.possible).toBeLessThan(350);
    expect(capture.parsed.short).toBeGreaterThan(0);
  });

  it('leaves the feasibility out when no strengths are given', async () => {
    const { capture } = await run(
      ['forecast', 'splits', '--target', '1000', '--colonies', '1000'],
      { json: true }
    );
    expect(capture.parsed.possible).toBeUndefined();
  });

  it('refuses a split stage that will never be ready', async () => {
    const { status, capture } = await run([
      'forecast',
      'splits',
      '--target',
      '1000',
      '--colonies',
      '1000',
      '--split-stage',
      'winter',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('will not be ready by bloom');
  });
});

describe('forecast losses', () => {
  it('publishes the rates the forecast uses', async () => {
    const { capture } = await run(['forecast', 'losses'], { json: true });
    expect(capture.parsed).toHaveLength(SEASON_STAGES.length);
    expect(capture.parsed.find((row) => row.stage === 'winter').loss).toBe(0.14);
  });

  it('prints a table', async () => {
    const { capture } = await run(['forecast', 'losses']);
    expect(capture.lines[0]).toContain('split maturity');
  });
});
