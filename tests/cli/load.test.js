import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';

let root;

async function run(args, { json = false } = {}) {
  const capture = captureOutput({ json });
  const status = await runCli(
    [
      '--root',
      root,
      '--actor',
      'M Ojeda',
      '--today',
      '2025-02-03',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

const addLoad = (overrides = []) =>
  run([
    'load',
    'add',
    '--id',
    'LD-2025-0143',
    '--unit',
    'bh-7',
    '--driver',
    'D Rasmussen',
    '--from',
    'YD-2025-0001',
    '--to',
    'DR-2025-0004',
    '--pallets',
    'PL-2025-0031,PL-2025-0032',
    ...overrides,
  ]);

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-load-'));
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
  for (const sequence of [31, 32]) {
    await run([
      'pallet',
      'add',
      '--id',
      `PL-2025-00${sequence}`,
      '--yard',
      'YD-2025-0001',
      '--built-on',
      '2024-10-18',
    ]);
    for (let position = 1; position <= 4; position += 1) {
      await run([
        'pallet',
        'set',
        `PL-2025-00${sequence}`,
        `CY-2025-0${sequence}${position}`,
      ]);
    }
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('load add', () => {
  it('plans a load', async () => {
    const { status, capture } = await addLoad();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id       LD-2025-0143',
      'pallets  2',
      'state    planned',
    ]);
  });

  it('refuses a manifest with a repeated pallet', async () => {
    const { status, capture } = await addLoad([
      '--pallets',
      'PL-2025-0031,PL-2025-0031',
    ]);
    expect(status).toBe(4);
    expect(capture.stderr).toContain('is on the load twice');
  });
});

describe('load advance', () => {
  beforeEach(() => addLoad());

  it('walks planned to loaded to delivered', async () => {
    const loaded = await run(
      ['load', 'advance', 'LD-2025-0143', 'loaded', '--on', '2025-02-03'],
      { json: true }
    );
    expect(loaded.capture.parsed.state).toBe('loaded');
    const delivered = await run(
      ['load', 'advance', 'LD-2025-0143', 'delivered', '--on', '2025-02-05'],
      { json: true }
    );
    expect(delivered.capture.parsed).toEqual({
      id: 'LD-2025-0143',
      state: 'delivered',
      nights: 2,
    });
  });

  it('refuses a jump the record does not allow', async () => {
    const { status, capture } = await run([
      'load',
      'advance',
      'LD-2025-0143',
      'delivered',
      '--on',
      '2025-02-05',
    ]);
    expect(status).toBe(6);
    expect(capture.stderr).toContain('a planned load cannot become delivered');
  });
});

describe('load weigh', () => {
  beforeEach(() => addLoad());

  it('weighs the pallets aboard', async () => {
    const { capture } = await run(['load', 'weigh', 'LD-2025-0143'], { json: true });
    expect(capture.parsed).toEqual({
      load: 'LD-2025-0143',
      stage: 'bloom',
      payloadLb: 1016,
      grossLb: 33016,
      legal: true,
      overLb: 0,
      shed: 0,
      colonies: 8,
    });
  });

  it('gets heavier on the flow', async () => {
    const { capture } = await run(
      ['load', 'weigh', 'LD-2025-0143', '--stage', 'flow'],
      {
        json: true,
      }
    );
    expect(capture.parsed.payloadLb).toBe(1616);
  });

  it('says how many pallets to shed when the truck is over', async () => {
    await addLoad(['--id', 'LD-2025-0144', '--kind', 'bobtail']);
    const { capture } = await run(
      ['load', 'weigh', 'LD-2025-0144', '--tare', '25000', '--stage', 'flow'],
      { json: true }
    );
    expect(capture.parsed.legal).toBe(false);
    expect(capture.parsed.overLb).toBe(616);
    expect(capture.parsed.shed).toBe(1);
  });

  it('prints the answer plainly for a phone screen', async () => {
    const { capture } = await run(['load', 'weigh', 'LD-2025-0143']);
    expect(capture.stdout).toContain('legal     yes');
    expect(capture.stdout).toContain('shed      nothing');
  });
});

describe('load permit', () => {
  beforeEach(() => addLoad());

  const permit = (overrides = []) =>
    run(
      [
        'load',
        'permit',
        'LD-2025-0143',
        '--from-state',
        'CA',
        '--to-state',
        'ND',
        '--certificate',
        'ca-2025-11884',
        '--issued-on',
        '2025-01-06',
        '--issued-by',
        'Tulare County',
        '--covers',
        '480',
        '--moved-on',
        '2025-02-03',
        '--entry-permit',
        'nd-4471',
        ...overrides,
      ],
      { json: true }
    );

  it('passes clean paperwork', async () => {
    const { status, capture } = await permit();
    expect(status).toBe(0);
    expect(capture.parsed).toEqual({
      load: 'LD-2025-0143',
      required: true,
      certificate: 'CA-2025-11884',
      entryPermit: 'ND-4471',
    });
  });

  it('asks for nothing inside one state', async () => {
    const { capture } = await permit(['--to-state', 'CA']);
    expect(capture.parsed).toEqual({ load: 'LD-2025-0143', required: false });
  });

  it('refuses a stale certificate', async () => {
    const { status, capture } = await run([
      'load',
      'permit',
      'LD-2025-0143',
      '--from-state',
      'CA',
      '--to-state',
      'ND',
      '--certificate',
      'ca-2025-11884',
      '--issued-on',
      '2024-10-06',
      '--issued-by',
      'Tulare County',
      '--covers',
      '480',
      '--moved-on',
      '2025-02-03',
      '--entry-permit',
      'nd-4471',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('was not valid on 2025-02-03');
  });

  it('refuses a permit state with no entry permit', async () => {
    const { status, capture } = await run([
      'load',
      'permit',
      'LD-2025-0143',
      '--from-state',
      'CA',
      '--to-state',
      'ND',
      '--certificate',
      'ca-2025-11884',
      '--issued-on',
      '2025-01-06',
      '--issued-by',
      'Tulare County',
      '--covers',
      '480',
      '--moved-on',
      '2025-02-03',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('wants an entry permit');
  });
});

describe('load list', () => {
  it('filters by state and origin', async () => {
    await addLoad();
    const byState = await run(['load', 'list', '--state', 'planned'], { json: true });
    expect(byState.capture.parsed).toHaveLength(1);
    const byYard = await run(['load', 'list', '--from', 'YD-2025-0099'], {
      json: true,
    });
    expect(byYard.capture.parsed).toEqual([]);
  });
});
