import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-plan-'));
  await run(['example', 'load']);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('kpi', () => {
  it('reports every measure', async () => {
    const { status, capture } = await run(['kpi', '2025'], { json: true });
    expect(status).toBe(0);
    expect(Object.keys(capture.parsed).sort()).toEqual([
      'coverage',
      'fill',
      'grade',
      'revenue',
      'season',
      'treatments',
    ]);
  });

  it('defaults to the season the clock is in', async () => {
    const { capture } = await run(['kpi'], { json: true });
    expect(capture.parsed.season).toBe(2025);
  });

  it('prints the rates as percentages', async () => {
    const { capture } = await run(['kpi', '2025']);
    expect(capture.lines[0]).toContain('measure');
    expect(capture.stdout).toContain('%');
  });

  it('leaves the rate blank where there is not one', async () => {
    const { capture } = await run(['kpi', '2025']);
    const line = capture.lines.find((entry) =>
      entry.includes('contract value per colony')
    );
    expect(line.trim().endsWith('$820.00')).toBe(true);
  });
});

describe('feed syrup', () => {
  const yards = 'YD-2025-0001:120,YD-2025-0002:64,YD-2025-0003:96';

  it('sizes the run and splits it into days', async () => {
    const { status, capture } = await run(
      ['feed', 'syrup', '--yards', yards, '--stage', 'fall', '--from', '2025-09-15'],
      { json: true }
    );
    expect(status).toBe(0);
    expect(capture.parsed.ratio).toBe('2:1');
    expect(capture.parsed.gallons).toBe(560);
    expect(capture.parsed.days).toHaveLength(1);
  });

  it('rolls onto more days with a smaller tank', async () => {
    const { capture } = await run(
      [
        'feed',
        'syrup',
        '--yards',
        yards,
        '--stage',
        'fall',
        '--from',
        '2025-09-15',
        '--tank',
        '250',
      ],
      { json: true }
    );
    expect(capture.parsed.days).toHaveLength(3);
    expect(capture.parsed.daysNeeded).toBe(3);
  });

  it('costs the run when a sugar price is given', async () => {
    const { capture } = await run(
      [
        'feed',
        'syrup',
        '--yards',
        yards,
        '--stage',
        'fall',
        '--from',
        '2025-09-15',
        '--sugar',
        '55',
      ],
      { json: true }
    );
    expect(capture.parsed.costCents).toBeGreaterThan(0);
  });

  it('leaves the cost out when no price is given', async () => {
    const { capture } = await run(
      ['feed', 'syrup', '--yards', yards, '--stage', 'fall', '--from', '2025-09-15'],
      { json: true }
    );
    expect(capture.parsed.costCents).toBeNull();
  });

  it('refuses a stage nobody feeds in', async () => {
    const { status, capture } = await run([
      'feed',
      'syrup',
      '--yards',
      yards,
      '--stage',
      'flow',
      '--from',
      '2025-09-15',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('no syrup is fed in flow');
  });

  it('prints the run and the cost plainly', async () => {
    const { capture } = await run([
      'feed',
      'syrup',
      '--yards',
      yards,
      '--stage',
      'fall',
      '--from',
      '2025-09-15',
      '--sugar',
      '55',
    ]);
    expect(capture.lines[0]).toContain('560 gallons of 2:1');
    expect(capture.lines.pop()).toContain('of sugar');
  });
});

describe('feed protein', () => {
  const yards = 'YD-2025-0001:120,YD-2025-0002:64';

  it('works out the visits and the dates', async () => {
    const { capture } = await run(
      ['feed', 'protein', '--yards', yards, '--days', '42', '--from', '2025-01-02'],
      { json: true }
    );
    expect(capture.parsed.visits).toBe(3);
    expect(capture.parsed.dates).toEqual(['2025-01-02', '2025-01-16', '2025-01-30']);
  });

  it('takes another ration', async () => {
    const { capture } = await run(
      [
        'feed',
        'protein',
        '--yards',
        yards,
        '--days',
        '42',
        '--from',
        '2025-01-02',
        '--kind',
        'dry sub',
      ],
      { json: true }
    );
    expect(capture.parsed.kind).toBe('dry sub');
    expect(capture.parsed.poundsPerVisit).toBe(368);
  });

  it('refuses a ration nobody feeds', async () => {
    const { status } = await run([
      'feed',
      'protein',
      '--yards',
      yards,
      '--days',
      '42',
      '--from',
      '2025-01-02',
      '--kind',
      'sugar water',
    ]);
    expect(status).toBe(2);
  });

  it('prints the plan plainly', async () => {
    const { capture } = await run([
      'feed',
      'protein',
      '--yards',
      yards,
      '--days',
      '42',
      '--from',
      '2025-01-02',
    ]);
    expect(capture.stdout).toContain('ration');
    expect(capture.stdout).toContain('2025-01-30');
  });
});
