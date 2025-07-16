import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-02-03' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-haul-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('haul route', () => {
  const valley = '36.5:-119.4,36.9:-120.1';
  const plains = '36.5:-119.4,46.8:-100.8';

  it('measures a short run and calls it one shift', async () => {
    const { status, capture } = await run(['haul', 'route', '--points', valley], {
      json: true,
    });
    expect(status).toBe(0);
    expect(capture.parsed.singleShift).toBe(true);
    expect(capture.parsed.restsNeeded).toBe(0);
  });

  it('measures a run to the plains and asks for rests', async () => {
    const { capture } = await run(['haul', 'route', '--points', plains], {
      json: true,
    });
    expect(capture.parsed.miles).toBeGreaterThan(1000);
    expect(capture.parsed.singleShift).toBe(false);
    expect(capture.parsed.restsNeeded).toBeGreaterThan(0);
  });

  it('adds the stop time', async () => {
    const withStops = await run(
      ['haul', 'route', '--points', valley, '--stops', 'fuel:36.7:-119.8'],
      { json: true }
    );
    const without = await run(['haul', 'route', '--points', valley], { json: true });
    expect(withStops.capture.parsed.elapsedHours).toBeGreaterThan(
      without.capture.parsed.elapsedHours
    );
  });

  it('takes a planning speed', async () => {
    const slow = await run(['haul', 'route', '--points', plains, '--speed', '45'], {
      json: true,
    });
    const quick = await run(['haul', 'route', '--points', plains, '--speed', '65'], {
      json: true,
    });
    expect(slow.capture.parsed.drivingHours).toBeGreaterThan(
      quick.capture.parsed.drivingHours
    );
  });

  it('refuses a route that breaks the hours rule when asked to check', async () => {
    const { status, capture } = await run([
      'haul',
      'route',
      '--points',
      plains,
      '--check',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('more rest stop');
  });

  it('passes the check once the rests are planned', async () => {
    const { status } = await run([
      'haul',
      'route',
      '--points',
      plains,
      '--stops',
      'rest:40.1:-118.5,rest:43.1:-110.5',
      '--check',
    ]);
    expect(status).toBe(0);
  });

  it('refuses points in the wrong shape', async () => {
    const { status, capture } = await run(['haul', 'route', '--points', '36.5']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('points look like');
  });

  it('prints the answer plainly', async () => {
    const { capture } = await run(['haul', 'route', '--points', valley]);
    expect(capture.stdout).toContain('one shift     yes');
    expect(capture.stdout).toContain('rests needed  none');
  });

  it('names the stop kinds it knows', async () => {
    const { capture } = await run(['haul', 'stops'], { json: true });
    expect(capture.parsed).toContain('rest');
  });
});

describe('haul dispatch', () => {
  const addLoad = (sequence, pallets) =>
    run([
      'load',
      'add',
      '--id',
      `LD-2025-${String(sequence).padStart(4, '0')}`,
      '--unit',
      'bh-7',
      '--driver',
      'D Rasmussen',
      '--from',
      'YD-2025-0001',
      '--to',
      'DR-2025-0004',
      '--pallets',
      pallets,
    ]);

  beforeEach(async () => {
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
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      await addLoad(sequence, `PL-2025-000${sequence}`);
    }
  });

  it('fills three loads a night and rolls the fourth', async () => {
    const { capture } = await run(['haul', 'dispatch', '--from', '2025-02-03'], {
      json: true,
    });
    expect(capture.parsed.nights).toEqual([
      { date: '2025-02-03', loads: 3, pallets: 3 },
      { date: '2025-02-04', loads: 1, pallets: 1 },
    ]);
  });

  it('reports the nights the whole set needs', async () => {
    const { capture } = await run(['haul', 'dispatch', '--from', '2025-02-03'], {
      json: true,
    });
    expect(capture.parsed.nightsNeeded).toBe(2);
  });

  it('takes an explicit load list', async () => {
    const { capture } = await run(
      [
        'haul',
        'dispatch',
        '--from',
        '2025-02-03',
        '--loads',
        'LD-2025-0001,LD-2025-0002',
      ],
      { json: true }
    );
    expect(capture.parsed.nights).toHaveLength(1);
  });

  it('names the loads that land after their deadline', async () => {
    const { capture } = await run(
      ['haul', 'dispatch', '--from', '2025-02-03', '--due', 'LD-2025-0004:2025-02-03'],
      { json: true }
    );
    expect(capture.parsed.late).toEqual([
      { load: 'LD-2025-0004', scheduled: '2025-02-04', due: '2025-02-03' },
    ]);
  });

  it('prints the nights and the late loads', async () => {
    const { capture } = await run([
      'haul',
      'dispatch',
      '--from',
      '2025-02-03',
      '--due',
      'LD-2025-0004:2025-02-03',
    ]);
    expect(capture.lines[0]).toContain('2025-02-03: 3 loads');
    expect(capture.lines.pop()).toBe(
      'LD-2025-0004 lands 2025-02-04, wanted by 2025-02-03'
    );
  });

  it('groups the loads by truck', async () => {
    const { capture } = await run(['haul', 'dispatch', '--from', '2025-02-03'], {
      json: true,
    });
    expect(capture.parsed.trucks).toEqual([{ unit: 'BH-7', loads: 4, pallets: 4 }]);
  });
});
