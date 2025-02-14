import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-colony-'));
  await run([
    'yard',
    'add',
    '--id',
    'YD-2025-0001',
    '--name',
    'home place',
    '--county',
    'Tulare',
    '--state',
    'CA',
    '--landowner',
    'R Wilkins',
    '--agreement-on',
    '2024-11-01',
    '--latitude',
    '36.5',
    '--longitude',
    '-119.4',
    '--capacity',
    '96',
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function run(args, { json = false } = {}) {
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
}

const addColony = (sequence, overrides = []) =>
  run([
    'colony',
    'add',
    '--id',
    `CY-2025-${String(sequence).padStart(4, '0')}`,
    '--brand',
    `BH-${String(sequence).padStart(4, '0')}`,
    '--yard',
    'YD-2025-0001',
    '--installed-on',
    '2024-11-12',
    '--queen-source',
    'Koehnen',
    ...overrides,
  ]);

describe('colony add', () => {
  it('writes the colony', async () => {
    const { status, capture } = await addColony(11);
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id     CY-2025-0011',
      'brand  BH-0011',
      'yard   YD-2025-0001',
    ]);
  });

  it('defaults the queen to going in with the bees', async () => {
    await addColony(11);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011'], { json: true });
    expect(capture.parsed.queen.installedOn).toBe('2024-11-12');
  });

  it('takes a later queen date', async () => {
    await addColony(11, [
      '--queen-installed-on',
      '2025-04-02',
      '--queen-race',
      'carniolan',
    ]);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011'], { json: true });
    expect(capture.parsed.queen).toMatchObject({
      race: 'carniolan',
      installedOn: '2025-04-02',
    });
  });

  it('defaults to two deeps', async () => {
    await addColony(11);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011'], { json: true });
    expect(capture.parsed.boxes).toEqual({ deeps: 2, mediums: 0 });
  });

  it('refuses a colony with no boxes', async () => {
    const { status, capture } = await addColony(11, ['--deeps', '0']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('at least one box');
  });
});

describe('colony list', () => {
  beforeEach(async () => {
    await addColony(11);
    await addColony(12);
  });

  it('lists what is on the books', async () => {
    const { capture } = await run(['colony', 'list'], { json: true });
    expect(capture.parsed.map((row) => row.id)).toEqual([
      'CY-2025-0011',
      'CY-2025-0012',
    ]);
  });

  it('filters to a yard', async () => {
    const { capture } = await run(['colony', 'list', '--yard', 'YD-2025-0001'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(2);
  });

  it('refuses a yard that is not on file', async () => {
    const { status } = await run(['colony', 'list', '--yard', 'YD-2025-0099']);
    expect(status).toBe(3);
  });

  it('filters by status', async () => {
    await run(['colony', 'status', 'CY-2025-0012', 'dead', '--on', '2025-01-04']);
    const { capture } = await run(['colony', 'list', '--status', 'dead'], {
      json: true,
    });
    expect(capture.parsed.map((row) => row.id)).toEqual(['CY-2025-0012']);
  });

  it('counts the boxes in the table', async () => {
    const { capture } = await run(['colony', 'list']);
    expect(capture.lines[2].trim().endsWith('2')).toBe(true);
  });
});

describe('colony show', () => {
  it('says the colony is on the ground when no pallet holds it', async () => {
    await addColony(11);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011']);
    expect(capture.stdout).toContain('pallet      on the ground');
  });

  it('lists what the colony can become next', async () => {
    await addColony(11);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011']);
    expect(capture.stdout).toContain('can become  dead, combined, sold, split');
  });

  it('says nothing can follow a dead colony', async () => {
    await addColony(11);
    await run(['colony', 'status', 'CY-2025-0011', 'dead', '--on', '2025-01-04']);
    const { capture } = await run(['colony', 'show', 'CY-2025-0011']);
    expect(capture.stdout).toContain('can become  nothing');
  });
});

describe('colony status', () => {
  beforeEach(() => addColony(11));

  it('moves a colony and stamps the day', async () => {
    const { capture } = await run(
      ['colony', 'status', 'CY-2025-0011', 'dead', '--on', '2025-01-04'],
      { json: true }
    );
    expect(capture.parsed).toEqual({
      id: 'CY-2025-0011',
      status: 'dead',
      statusOn: '2025-01-04',
    });
  });

  it('refuses a move the record does not allow', async () => {
    await run(['colony', 'status', 'CY-2025-0011', 'dead', '--on', '2025-01-04']);
    const { status, capture } = await run(
      ['colony', 'status', 'CY-2025-0011', 'sold', '--on', '2025-02-04'],
      {}
    );
    expect(status).toBe(6);
    expect(capture.stderr).toContain('a dead colony cannot become sold');
  });
});

describe('colony requeen', () => {
  beforeEach(() => addColony(11));

  it('records the new queen', async () => {
    const { capture } = await run(
      [
        'colony',
        'requeen',
        'CY-2025-0011',
        '--source',
        'Olivarez',
        '--race',
        'carniolan',
        '--on',
        '2025-04-02',
      ],
      { json: true }
    );
    expect(capture.parsed).toEqual({
      id: 'CY-2025-0011',
      queen: 'Olivarez',
      on: '2025-04-02',
    });
  });

  it('refuses to requeen a dead colony', async () => {
    await run(['colony', 'status', 'CY-2025-0011', 'dead', '--on', '2025-01-04']);
    const { status } = await run([
      'colony',
      'requeen',
      'CY-2025-0011',
      '--source',
      'Olivarez',
      '--on',
      '2025-04-02',
    ]);
    expect(status).toBe(6);
  });
});

describe('colony loose', () => {
  it('lists the productive colonies on no pallet', async () => {
    await addColony(11);
    await addColony(12);
    await run(['colony', 'status', 'CY-2025-0012', 'dead', '--on', '2025-01-04']);
    const { capture } = await run(['colony', 'loose'], { json: true });
    expect(capture.parsed.map((row) => row.id)).toEqual(['CY-2025-0011']);
  });
});
