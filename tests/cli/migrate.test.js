import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { latestVersion, INITIAL_VERSION } from '../../src/store/migrate.js';

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-migrate-cli-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('migrate version', () => {
  it('starts at the initial version', async () => {
    const { status, capture } = await run(['migrate', 'version'], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed).toEqual({
      version: INITIAL_VERSION,
      latest: latestVersion(),
      upToDate: false,
    });
  });

  it('reads up to date once the migrations have run', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['migrate', 'version'], { json: true });
    expect(capture.parsed.upToDate).toBe(true);
    expect(capture.parsed.version).toBe(latestVersion());
  });
});

describe('migrate plan', () => {
  it('says what would happen', async () => {
    const { capture } = await run(['migrate', 'plan'], { json: true });
    expect(capture.parsed.from).toBe(INITIAL_VERSION);
    expect(capture.parsed.to).toBe(latestVersion());
    expect(capture.parsed.steps.length).toBeGreaterThan(0);
  });

  it('changes nothing', async () => {
    await run(['migrate', 'plan']);
    const { capture } = await run(['migrate', 'version'], { json: true });
    expect(capture.parsed.upToDate).toBe(false);
  });

  it('prints a line per step', async () => {
    const { capture } = await run(['migrate', 'plan']);
    expect(capture.lines[0]).toContain(
      `version ${INITIAL_VERSION} to ${latestVersion()}`
    );
    expect(capture.lines.length).toBeGreaterThan(1);
  });

  it('says there is nothing to do once it is current', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['migrate', 'plan']);
    expect(capture.lines[0]).toContain('nothing to do');
  });
});

describe('migrate run', () => {
  it('moves the records forward', async () => {
    const { status, capture } = await run(['migrate', 'run'], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.from).toBe(INITIAL_VERSION);
    expect(capture.parsed.to).toBe(latestVersion());
    expect(capture.parsed.records).toBeGreaterThan(0);
  });

  it('does nothing the second time', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['migrate', 'run'], { json: true });
    expect(capture.parsed.records).toBe(0);
    expect(capture.parsed.steps).toBe(0);
  });

  it('says so plainly when there is nothing to do', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['migrate', 'run']);
    expect(capture.lines[0]).toContain(`already at version ${latestVersion()}`);
  });

  it('leaves the records still readable', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['counts'], { json: true });
    expect(capture.parsed.find((row) => row.collection === 'colonies').records).toBe(
      12
    );
  });

  it('leaves the desk with nothing to report', async () => {
    await run(['migrate', 'run']);
    const { capture } = await run(['check'], { json: true });
    expect(capture.parsed).toEqual([]);
  });

  it('says how many records it moved', async () => {
    const { capture } = await run(['migrate', 'run']);
    expect(capture.lines[0]).toContain('moved');
  });
});
