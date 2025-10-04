import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-02-03' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-yardwork-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const ticket = (overrides = []) => [
  'scale',
  'ticket',
  '--number',
  't-1',
  '--load',
  'LD-2025-0143',
  '--scale',
  'Kettleman certified',
  '--on',
  '2025-02-03',
  '--gross',
  '74000',
  '--tare',
  '32000',
  '--axles',
  'steer:11000,drives:32000,trailer:31000',
  ...overrides,
];

describe('scale ticket', () => {
  it('reads the ticket and says it is legal', async () => {
    const { status, capture } = await run(ticket(), { json: true });
    expect(status).toBe(0);
    expect(capture.parsed).toMatchObject({
      number: 'T-1',
      grossLb: 74000,
      netLb: 42000,
      overLb: 0,
      axlesOver: [],
    });
  });

  it('names an axle that is over', async () => {
    const { capture } = await run(
      ticket(['--gross', '78000', '--axles', 'steer:12000,drives:35000,trailer:31000']),
      { json: true }
    );
    expect(capture.parsed.axlesOver).toHaveLength(1);
    expect(capture.parsed.axlesOver[0].axle).toBe('drives');
  });

  it('says how far over gross a bobtail is', async () => {
    const { capture } = await run(ticket(['--kind', 'bobtail']), { json: true });
    expect(capture.parsed.overLb).toBe(48000);
  });

  it('compares against the estimate when one is given', async () => {
    const { capture } = await run(ticket(['--estimate', '70000']), { json: true });
    expect(capture.parsed.comparison.differenceLb).toBe(4000);
    expect(capture.parsed.comparison.withinTolerance).toBe(false);
    expect(capture.parsed.pallets).toBe(8);
  });

  it('leaves the comparison out when no estimate is given', async () => {
    const { capture } = await run(ticket(), { json: true });
    expect(capture.parsed.comparison).toBeNull();
    expect(capture.parsed.pallets).toBeNull();
  });

  it('prints the answer plainly', async () => {
    const { capture } = await run(ticket(['--estimate', '70000']));
    expect(capture.stdout).toContain('over gross  no');
    expect(capture.stdout).toContain('axles over  none');
    expect(capture.stdout).toContain('about 8 pallets');
  });

  it('refuses axle weights that do not add to the gross', async () => {
    const { status, capture } = await run(
      ticket(['--axles', 'steer:11000,drives:20000,trailer:20000'])
    );
    expect(status).toBe(2);
    expect(capture.stderr).toContain('do not add to the gross');
  });
});

describe('scale check', () => {
  const check = (overrides = []) => [
    'scale',
    'check',
    '--number',
    't-1',
    '--load',
    'LD-2025-0143',
    '--scale',
    'Kettleman certified',
    '--on',
    '2025-02-03',
    '--gross',
    '74000',
    '--axles',
    'steer:11000,drives:32000,trailer:31000',
    ...overrides,
  ];

  it('passes a legal ticket', async () => {
    const { status, capture } = await run(check(), { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.legal).toBe(true);
  });

  it('refuses an axle overage', async () => {
    const { status, capture } = await run(
      check(['--gross', '82000', '--axles', 'steer:12000,drives:38000,trailer:32000'])
    );
    expect(status).toBe(5);
    expect(capture.stderr).toContain('over on the drives');
  });

  it('refuses a gross overage', async () => {
    const { status, capture } = await run(check(['--kind', 'bobtail']));
    expect(status).toBe(5);
    expect(capture.stderr).toContain('over gross');
  });
});

describe('queen graft', () => {
  const graft = (overrides = []) => [
    'queen',
    'graft',
    '--id',
    'g-1',
    '--on',
    '2025-04-10',
    '--count',
    '40',
    '--builder',
    'CB-1',
    ...overrides,
  ];

  it('books the graft and works out the calendar', async () => {
    const { status, capture } = await run(graft(), { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.cells).toBe(28);
    expect(capture.parsed.queens).toBe(21);
    expect(capture.parsed.schedule).toHaveLength(4);
  });

  it('expects fewer cells from a learner', async () => {
    const { capture } = await run(graft(['--grafter', 'learning']), { json: true });
    expect(capture.parsed.cells).toBe(18);
  });

  it('refuses a batch that overfills the builder', async () => {
    const { status, capture } = await run(graft(['--already-in', '10']));
    expect(status).toBe(5);
    expect(capture.stderr).toContain('holds 45 cells');
  });

  it('prints the calendar plainly', async () => {
    const { capture } = await run(graft());
    expect(capture.lines[0]).toContain('cells out 2025-04-20');
    expect(capture.lines.pop()).toBe('expect 28 cells, 21 queens');
  });
});

describe('queen plan', () => {
  it('works back from the queens wanted', async () => {
    const { capture } = await run(
      ['queen', 'plan', '--queens', '100', '--by', '2025-05-11'],
      { json: true }
    );
    expect(capture.parsed).toEqual({
      queens: 100,
      grafts: 191,
      batches: 5,
      latestGraft: '2025-04-10',
    });
  });

  it('needs more grafts from a learner', async () => {
    const { capture } = await run(
      [
        'queen',
        'plan',
        '--queens',
        '100',
        '--by',
        '2025-05-11',
        '--grafter',
        'learning',
      ],
      { json: true }
    );
    expect(capture.parsed.grafts).toBe(297);
  });
});
