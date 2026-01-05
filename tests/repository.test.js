import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The repository itself.
 *
 * These check the things that are only wrong on somebody else's machine: a
 * file checked out with carriage returns, a dependency that appeared without
 * anybody deciding to add it, a script in the manifest that does not exist.
 * All three have happened here, and none of them fail any other test.
 */

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(repo, path), 'utf8');
const manifest = () => JSON.parse(read('package.json'));

const tracked = () =>
  execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '');

describe('line endings', () => {
  it('pins every checkout to line feeds', () => {
    expect(existsSync(join(repo, '.gitattributes'))).toBe(true);
    expect(read('.gitattributes')).toContain('* text=auto eol=lf');
  });

  it('has no carriage return in any tracked text file', () => {
    const offenders = tracked()
      .filter((path) => /\.(js|json|yml|md|txt)$/.test(path))
      .filter((path) => read(path).includes('\r'));
    expect(offenders).toEqual([]);
  });

  it('ends every source file with a newline', () => {
    const offenders = tracked()
      .filter((path) => path.endsWith('.js'))
      .filter((path) => !read(path).endsWith('\n'));
    expect(offenders).toEqual([]);
  });
});

describe('the manifest', () => {
  it('takes exactly one runtime dependency', () => {
    expect(Object.keys(manifest().dependencies)).toEqual(['commander']);
  });

  it('pins every dependency to an exact version', () => {
    const all = { ...manifest().dependencies, ...manifest().devDependencies };
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('names a node version the code actually uses', () => {
    expect(manifest().engines.node).toBe('>=20.11');
  });

  it('points its binary at a file that exists', () => {
    for (const path of Object.values(manifest().bin)) {
      expect(existsSync(join(repo, path)), path).toBe(true);
    }
  });

  it('ships only the directories that matter', () => {
    for (const path of manifest().files) {
      expect(existsSync(join(repo, path)), path).toBe(true);
    }
  });

  it('carries a version that matches the program', () => {
    expect(manifest().version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('the workflow', () => {
  const workflow = () => read('.github/workflows/ci.yml');

  it('runs the suite on more than one node version', () => {
    expect(workflow()).toContain("'20.18.2'");
    expect(workflow()).toContain("'22.13.1'");
  });

  it('runs the suite under more than one timezone', () => {
    expect(workflow()).toContain('Pacific/Auckland');
    expect(workflow()).toContain('America/Los_Angeles');
  });

  it('checks the runtime dependency list', () => {
    expect(workflow()).toContain('runtime dependencies');
  });

  it('builds the container and runs the worked season in it', () => {
    expect(workflow()).toContain('docker build');
    expect(workflow()).toContain('selftest');
  });
});

describe('the tests themselves', () => {
  it('all live under tests', () => {
    const stray = tracked().filter(
      (path) => path.endsWith('.test.js') && !path.startsWith('tests/')
    );
    expect(stray).toEqual([]);
  });

  it('mirror the source tree closely enough to find', () => {
    const modules = tracked().filter(
      (path) => path.startsWith('src/') && path.endsWith('.js')
    );
    expect(modules.length).toBeGreaterThan(90);
    const suites = tracked().filter((path) => path.endsWith('.test.js'));
    expect(suites.length).toBeGreaterThan(90);
  });
});
