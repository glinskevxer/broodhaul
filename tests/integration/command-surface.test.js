import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { buildContext, buildProgram } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

/**
 * Every command and subcommand, walked.
 *
 * Two things this catches that nothing else does. A subcommand registered with
 * a required option nobody can supply, which shows up as a help screen that
 * cannot be printed. And a command that was added to a module and never
 * registered, which shows up as a name missing from this walk.
 *
 * It runs `--help` rather than the commands themselves, so it is fast and it
 * writes nothing.
 */

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

const walk = () => {
  const context = buildContext({ output: captureOutput().output });
  const program = buildProgram(context);
  const paths = [];
  for (const command of program.commands) {
    paths.push([command.name()]);
    for (const child of command.commands) {
      paths.push([command.name(), child.name()]);
    }
  }
  return paths;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-surface-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the command surface', () => {
  it('has more than a hundred commands and subcommands', () => {
    expect(walk().length).toBeGreaterThan(100);
  });

  it('prints help for every one of them', async () => {
    for (const path of walk()) {
      const { status, capture } = await run([...path, '--help']);
      expect(status, path.join(' ')).toBe(0);
      expect(capture.stdout.length, path.join(' ')).toBeGreaterThan(0);
    }
  });

  it('describes every one of them', () => {
    const context = buildContext({ output: captureOutput().output });
    for (const command of buildProgram(context).commands) {
      expect(command.description(), command.name()).toBeTruthy();
      for (const child of command.commands) {
        expect(child.description(), `${command.name()} ${child.name()}`).toBeTruthy();
      }
    }
  });

  it('gives every option a description', () => {
    const context = buildContext({ output: captureOutput().output });
    for (const command of buildProgram(context).commands) {
      for (const child of [command, ...command.commands]) {
        for (const option of child.options) {
          expect(option.description, `${child.name()} ${option.flags}`).toBeTruthy();
        }
      }
    }
  });

  it('names no option twice inside one command', () => {
    const context = buildContext({ output: captureOutput().output });
    for (const command of buildProgram(context).commands) {
      for (const child of [command, ...command.commands]) {
        const flags = child.options.map((option) => option.long ?? option.short);
        expect(new Set(flags).size, child.name()).toBe(flags.length);
      }
    }
  });

  it('covers every command module that was written', () => {
    const names = walk().map((path) => path[0]);
    for (const name of [
      'yard',
      'colony',
      'pallet',
      'block',
      'contract',
      'drop',
      'load',
      'grading',
      'health',
      'honey',
      'settle',
      'check',
      'journal',
      'season',
      'export',
      'haul',
      'increase',
      'store',
      'print',
      'register',
      'ledger',
      'kpi',
      'feed',
      'selftest',
      'scale',
      'queen',
      'registration',
      'dispute',
      'audit',
      'forecast',
      'migrate',
      'example',
      'counts',
      'documents',
    ]) {
      expect(names, name).toContain(name);
    }
  });
});
