import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;

async function run(args, { json = false, today = '2025-06-20' } = {}) {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      today,
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addBlock = (overrides = []) =>
  run([
    'block',
    'add',
    '--id',
    'BK-2025-0001',
    '--name',
    'Avenue 416 north',
    '--crop',
    'almond',
    '--acres',
    '120',
    '--varieties',
    'Nonpareil:0.5,Monterey:0.5',
    '--planted',
    '2016',
    '--latitude',
    '36.9',
    '--longitude',
    '-120.1',
    ...overrides,
  ]);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-block-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('block add', () => {
  it('works out the tree count from the spacing', async () => {
    const { status, capture } = await addBlock();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id       BK-2025-0001',
      'acres    120',
      'trees    13200',
      'perAcre  110',
    ]);
  });

  it('reads a self fertile variety off the list', async () => {
    await addBlock(['--varieties', 'Independence:1:self']);
    const { capture } = await run(['block', 'show', 'BK-2025-0001'], { json: true });
    expect(capture.parsed.selfFertile).toBe(true);
  });

  it('refuses varieties that do not add to one', async () => {
    const { status, capture } = await addBlock([
      '--varieties',
      'Nonpareil:0.5,Monterey:0.4',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('shares add to 0.9');
  });

  it('refuses a variety list in the wrong shape', async () => {
    const { status, capture } = await addBlock(['--varieties', 'Nonpareil']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('varieties look like');
  });

  it('takes tighter spacing', async () => {
    const { capture } = await addBlock(['--row-spacing', '16', '--tree-spacing', '14']);
    expect(capture.lines[3]).toBe('perAcre  194');
  });
});

describe('block show', () => {
  it('names the main variety and the pollinizer share', async () => {
    await addBlock(['--varieties', 'Nonpareil:0.8,Monterey:0.2']);
    const { capture } = await run(['block', 'show', 'BK-2025-0001']);
    expect(capture.stdout).toContain('main variety      Nonpareil');
    expect(capture.stdout).toContain('pollinizer share  0.2');
  });

  it('ages the block against the running season', async () => {
    await addBlock();
    const { capture } = await run(['block', 'show', 'BK-2025-0001'], { json: true });
    expect(capture.parsed.age).toBe(9);
  });
});

describe('block density', () => {
  it('shows the working when nothing argues with the base', async () => {
    await addBlock();
    const { capture } = await run(['block', 'density', 'BK-2025-0001']);
    expect(capture.lines).toEqual([
      'almond base 2 per acre',
      'recommended 2 per acre',
      '240 hives over the block',
    ]);
  });

  it('shows the factor that moved it', async () => {
    await addBlock(['--varieties', 'Nonpareil:0.8,Monterey:0.2']);
    const { capture } = await run(['block', 'density', 'BK-2025-0001']);
    expect(capture.lines[1]).toBe('thin pollinizer share times 1.25');
    expect(capture.lines[3]).toBe('300 hives over the block');
  });

  it('takes a cool bloom forecast', async () => {
    await addBlock();
    const { capture } = await run(
      ['block', 'density', 'BK-2025-0001', '--cool-bloom'],
      {
        json: true,
      }
    );
    expect(capture.parsed.recommended).toBe(2.4);
  });

  it('halves for a self fertile block and skips the pollinizer rule', async () => {
    await addBlock(['--varieties', 'Independence:1:self']);
    const { capture } = await run(['block', 'density', 'BK-2025-0001']);
    expect(capture.stdout).toContain('self fertile planting times 0.5');
    expect(capture.stdout).not.toContain('thin pollinizer');
  });

  it('compares against a contracted density and says it is short', async () => {
    await addBlock(['--varieties', 'Nonpareil:0.8,Monterey:0.2']);
    const { capture } = await run([
      'block',
      'density',
      'BK-2025-0001',
      '--contracted',
      '2',
    ]);
    expect(capture.lines.pop()).toBe('contracted at 2, short by 0.5');
  });

  it('says when the contract is over the recommendation', async () => {
    await addBlock();
    const { capture } = await run([
      'block',
      'density',
      'BK-2025-0001',
      '--contracted',
      '2.5',
    ]);
    expect(capture.lines.pop()).toBe('contracted at 2.5, 0.5 over');
  });

  it('reports the variance in json', async () => {
    await addBlock();
    const { capture } = await run(
      ['block', 'density', 'BK-2025-0001', '--contracted', '1.5'],
      { json: true }
    );
    expect(capture.parsed.short).toBe(true);
    expect(capture.parsed.difference).toBe(-0.5);
  });
});

describe('block list', () => {
  it('filters by crop', async () => {
    await addBlock();
    await addBlock(['--id', 'BK-2025-0002', '--crop', 'cherry', '--name', 'Ranch 9']);
    const { capture } = await run(['block', 'list', '--crop', 'cherry'], {
      json: true,
    });
    expect(capture.parsed.map((row) => row.id)).toEqual(['BK-2025-0002']);
  });
});
