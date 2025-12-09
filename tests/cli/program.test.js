import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { buildContext, buildProgram, VERSION } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

/**
 * The program as a whole rather than one command.
 *
 * Commands get registered by hand in `buildProgram`, and the way that goes
 * wrong is silently: a module is written, tested and never wired in, so its
 * tests pass and the command does not exist. This file is the check that the
 * list on the help screen is the list somebody meant.
 */

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

const TOP_LEVEL = [
  'audit',
  'block',
  'check',
  'colony',
  'contract',
  'counts',
  'dispute',
  'documents',
  'drop',
  'example',
  'export',
  'feed',
  'forecast',
  'grading',
  'haul',
  'health',
  'honey',
  'increase',
  'journal',
  'kpi',
  'ledger',
  'load',
  'pallet',
  'print',
  'queen',
  'register',
  'registration',
  'scale',
  'season',
  'selftest',
  'settle',
  'store',
  'yard',
];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-program-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the command list', () => {
  const names = () => {
    const context = buildContext({ output: captureOutput().output });
    return buildProgram(context)
      .commands.map((command) => command.name())
      .sort();
  };

  it('is exactly what the readme says it is', () => {
    expect(names()).toEqual(TOP_LEVEL);
  });

  it('registers no command twice', () => {
    expect(new Set(names()).size).toBe(names().length);
  });

  it('gives every command a description', () => {
    const context = buildContext({ output: captureOutput().output });
    for (const command of buildProgram(context).commands) {
      expect(command.description().length, command.name()).toBeGreaterThan(0);
    }
  });

  it('carries the package version', async () => {
    const capture = captureOutput();
    const context = buildContext({ output: capture.output });
    expect(buildProgram(context).version()).toBe(VERSION);
  });
});

describe('the help screen', () => {
  it('names the global options', async () => {
    const { capture } = await run(['--help']);
    expect(capture.stdout).toContain('--root');
    expect(capture.stdout).toContain('--actor');
    expect(capture.stdout).toContain('--today');
    expect(capture.stdout).toContain('--json');
  });

  it('names every top level command', async () => {
    const { capture } = await run(['--help']);
    for (const name of TOP_LEVEL) {
      expect(capture.stdout, name).toContain(name);
    }
  });

  it('exits cleanly', async () => {
    const { status } = await run(['--help']);
    expect(status).toBe(0);
  });
});

describe('an unknown command', () => {
  it('does not exit zero', async () => {
    const { status } = await run(['nonsense']);
    expect(status).not.toBe(0);
  });
});
