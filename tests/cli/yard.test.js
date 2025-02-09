import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGlobals, runCli, VERSION } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-cli-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const run = async (args, { json = false } = {}) => {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      '2025-06-20',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
};

const addYard = (overrides = []) =>
  run([
    'yard',
    'add',
    '--id',
    'YD-2025-0001',
    '--name',
    'Dinuba home place',
    '--county',
    'Tulare',
    '--state',
    'CA',
    '--landowner',
    'R Wilkins',
    '--agreement-on',
    '2024-11-01',
    '--latitude',
    '36.5432',
    '--longitude',
    '-119.3871',
    '--capacity',
    '96',
    ...overrides,
  ]);

describe('parseGlobals', () => {
  it('reads the globals off the argument list', () => {
    expect(parseGlobals(['--root', '/tmp/x', '--actor', 'M', '--json'])).toEqual({
      root: '/tmp/x',
      actor: 'M',
      json: true,
    });
  });

  it('reads the equals form as well', () => {
    expect(parseGlobals(['--root=/tmp/x', '--today=2025-06-20'])).toEqual({
      root: '/tmp/x',
      today: '2025-06-20',
    });
  });

  it('ignores anything else', () => {
    expect(parseGlobals(['yard', 'list'])).toEqual({});
  });
});

describe('the program itself', () => {
  it('prints its version', async () => {
    const capture = captureOutput();
    const status = await runCli(['--version'], { output: capture.output });
    expect(status).toBe(0);
    expect(capture.stdout.trim()).toBe(VERSION);
  });

  it('refuses to work without a record directory', async () => {
    const capture = captureOutput();
    const status = await runCli(['yard', 'list'], { output: capture.output });
    expect(status).toBe(2);
    expect(capture.stderr).toContain('use --root');
  });
});

describe('yard add', () => {
  it('writes the yard and says what it wrote', async () => {
    const { status, capture } = await addYard();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id        YD-2025-0001',
      'name      Dinuba home place',
      'capacity  96',
    ]);
  });

  it('journals the write under the actor given', async () => {
    await addYard();
    const { capture } = await run(['yard', 'show', 'YD-2025-0001'], { json: true });
    expect(capture.parsed.id).toBe('YD-2025-0001');
  });

  it('refuses a yard that does not validate and gives a validation status', async () => {
    const { status, capture } = await addYard(['--capacity', '0']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('yard.capacity must be at least 1');
  });

  it('takes the optional rent', async () => {
    await addYard(['--rent', '25000']);
    const { capture } = await run(['yard', 'show', 'YD-2025-0001']);
    expect(capture.stdout).toContain('$250.00');
  });
});

describe('yard list', () => {
  beforeEach(async () => {
    await addYard();
    await run([
      'yard',
      'add',
      '--id',
      'YD-2025-0002',
      '--name',
      'River bottom',
      '--county',
      'Madera',
      '--state',
      'CA',
      '--landowner',
      'B Ackerman',
      '--agreement-on',
      '2024-11-01',
      '--latitude',
      '36.9',
      '--longitude',
      '-120.1',
      '--capacity',
      '48',
      '--access',
      'quad',
    ]);
  });

  it('lists both yards', async () => {
    const { capture } = await run(['yard', 'list']);
    expect(capture.lines).toHaveLength(4);
    expect(capture.lines[2]).toContain('YD-2025-0001');
  });

  it('filters by county without caring about case', async () => {
    const { capture } = await run(['yard', 'list', '--county', 'madera'], {
      json: true,
    });
    expect(capture.parsed.map((row) => row.id)).toEqual(['YD-2025-0002']);
  });

  it('filters by access grade', async () => {
    const { capture } = await run(['yard', 'list', '--access', 'quad'], { json: true });
    expect(capture.parsed).toHaveLength(1);
  });

  it('is a bare header when nothing matches', async () => {
    const { capture } = await run(['yard', 'list', '--county', 'Kern']);
    expect(capture.lines).toHaveLength(2);
  });
});

describe('yard show', () => {
  it('says how much room is left', async () => {
    await addYard();
    const { capture } = await run(['yard', 'show', 'YD-2025-0001']);
    expect(capture.stdout).toContain('headroom         96');
    expect(capture.stdout).toContain('agreement today  yes');
  });

  it('gives the whole record in json', async () => {
    await addYard();
    const { capture } = await run(['yard', 'show', 'YD-2025-0001'], { json: true });
    expect(capture.parsed.capacity).toBe(96);
    expect(capture.parsed.headroom).toBe(96);
  });

  it('says so when the yard is not on file', async () => {
    const { status, capture } = await run(['yard', 'show', 'YD-2025-0099']);
    expect(status).toBe(3);
    expect(capture.stderr).toContain('no yard with id YD-2025-0099');
  });
});

describe('yard occupancy and remove', () => {
  it('reports a row per yard', async () => {
    await addYard();
    const { capture } = await run(['yard', 'occupancy'], { json: true });
    expect(capture.parsed).toEqual([
      {
        yardId: 'YD-2025-0001',
        name: 'Dinuba home place',
        capacity: 96,
        colonies: 0,
        pallets: 0,
        positions: 0,
        headroom: 96,
      },
    ]);
  });

  it('removes a yard and says whether there was one', async () => {
    await addYard();
    const first = await run(['yard', 'remove', 'YD-2025-0001'], { json: true });
    expect(first.capture.parsed.removed).toBe(true);
    const second = await run(['yard', 'remove', 'YD-2025-0001'], { json: true });
    expect(second.capture.parsed.removed).toBe(false);
  });
});
