import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { CHECKS, runSelfTest } from '../../src/cli/commands/selftest.js';

let root;
let previousExitCode;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-selftest-cli-'));
  previousExitCode = process.exitCode;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.exitCode = previousExitCode;
});

describe('runSelfTest', () => {
  it('passes every check', () => {
    const outcome = runSelfTest();
    expect(outcome.failures).toEqual([]);
    expect(outcome.checks).toBe(CHECKS.length);
  });

  it('checks the registers, the snapshot and the forecast too', () => {
    expect(CHECKS).toContain('registers render');
    expect(CHECKS).toContain('snapshot round trips');
    expect(CHECKS).toContain('forecast holds against the contracts');
  });

  it('cleans up the directory it used', () => {
    const outcome = runSelfTest();
    expect(existsSync(outcome.root)).toBe(false);
  });

  it('reports the season it walked', () => {
    const outcome = runSelfTest();
    expect(outcome.season.hivesOrdered).toBe(48);
    expect(outcome.season.hivesShort).toBe(4);
  });

  it('reports an invoice below the contract value', () => {
    expect(runSelfTest().invoiceCents).toBeLessThan(48 * 20500);
  });

  it('works from another day', () => {
    expect(runSelfTest({ today: '2025-06-01' }).failures).toEqual([]);
  });
});

describe('selftest', () => {
  it('says how many checks passed', async () => {
    const { status, capture } = await run(['selftest']);
    expect(status).toBe(0);
    expect(capture.lines).toEqual([`${CHECKS.length} checks passed`]);
  });

  it('leaves the exit code alone when it passes', async () => {
    process.exitCode = 0;
    await run(['selftest']);
    expect(process.exitCode).toBe(0);
  });

  it('reports the numbers in json', async () => {
    const { capture } = await run(['selftest'], { json: true });
    expect(capture.parsed.failures).toEqual([]);
    expect(capture.parsed.hivesSet).toBe(44);
  });

  it('needs no record directory of its own', async () => {
    const { status } = await run(['selftest'], { root: null });
    expect(status).toBe(0);
  });

  it('names the checks without running them', async () => {
    const { status, capture } = await run(['selftest', '--list'], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed).toEqual(CHECKS);
  });

  it('runs the register check against every register', async () => {
    const outcome = runSelfTest();
    expect(
      outcome.failures.find((entry) => entry.check === 'registers render')
    ).toBeUndefined();
  });

  it('runs the snapshot check by removing a record and putting it back', async () => {
    const outcome = runSelfTest();
    expect(
      outcome.failures.find((entry) => entry.check === 'snapshot round trips')
    ).toBeUndefined();
  });

  it('runs the forecast check against the contracted hives', async () => {
    const outcome = runSelfTest();
    expect(
      outcome.failures.find(
        (entry) => entry.check === 'forecast holds against the contracts'
      )
    ).toBeUndefined();
  });

  it('names every check it runs', () => {
    expect(CHECKS).toHaveLength(10);
    expect(new Set(CHECKS).size).toBe(CHECKS.length);
  });
});
