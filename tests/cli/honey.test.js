import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-06-20' });

const addDrum = (id, overrides = []) =>
  run([
    'honey',
    'drum',
    '--id',
    id,
    '--gross',
    '690',
    '--tare',
    '48',
    '--moisture',
    '17.4',
    '--source',
    'orange blossom',
    '--on',
    '2025-05-22',
    ...overrides,
  ]);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-honey-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('honey drum', () => {
  it('books a drum in and works out the net', async () => {
    const { status, capture } = await addDrum('d-4471');
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id           D-4471',
      'netLb        642',
      'moisturePct  17.4',
      'saleable     true',
    ]);
  });

  it('corrects a warm reading as it books it', async () => {
    const { capture } = await addDrum('d-1', [
      '--moisture',
      '18.8',
      '--reading-at',
      '88',
    ]);
    expect(capture.lines[2]).toBe('moisturePct  17.6');
  });

  it('flags a wet drum', async () => {
    const { capture } = await addDrum('d-1', ['--moisture', '19.2']);
    expect(capture.lines[3]).toBe('saleable     false');
  });

  it('replaces a drum booked twice rather than doubling it', async () => {
    await addDrum('d-1');
    await addDrum('d-1', ['--gross', '700']);
    const { capture } = await run(['honey', 'drums'], { json: true });
    expect(capture.parsed).toHaveLength(1);
    expect(capture.parsed[0].grossLb).toBe(700);
  });
});

describe('honey drums', () => {
  beforeEach(async () => {
    await addDrum('d-1');
    await addDrum('d-2', ['--moisture', '19.2']);
  });

  it('lists them with the grade', async () => {
    const { capture } = await run(['honey', 'drums']);
    expect(capture.lines[2]).toContain('ok');
    expect(capture.lines[3]).toContain('over 0.6');
  });

  it('totals the net and the moisture underneath', async () => {
    const { capture } = await run(['honey', 'drums']);
    expect(capture.lines.pop()).toBe('2 drums, 1284 lb at 18.3 percent');
  });

  it('filters to the wet ones', async () => {
    const { capture } = await run(['honey', 'drums', '--wet'], { json: true });
    expect(capture.parsed.map((row) => row.id)).toEqual(['D-2']);
  });

  it('says nothing extra when there are no drums', async () => {
    rmSync(join(root, 'honey'), { recursive: true, force: true });
    const { capture } = await run(['honey', 'drums']);
    expect(capture.lines).toHaveLength(2);
  });
});

describe('honey lot', () => {
  beforeEach(async () => {
    await addDrum('d-1');
    await addDrum('d-2');
    await addDrum('d-3', ['--source', 'sage']);
  });

  const addLot = (overrides = []) =>
    run(
      [
        'honey',
        'lot',
        '--id',
        'HL-2025-0004',
        '--drums',
        'd-1,d-2',
        '--yards',
        'YD-2025-0001',
        '--from',
        '2025-05-20',
        '--to',
        '2025-05-22',
        ...overrides,
      ],
      { json: true }
    );

  it('grades one source as single source', async () => {
    const { capture } = await addLot();
    expect(capture.parsed).toMatchObject({
      id: 'HL-2025-0004',
      drums: 2,
      netLb: 1284,
      grade: 'single source',
      label: 'orange blossom',
    });
  });

  it('grades a mixed lot as a blend named for the heavier source', async () => {
    const { capture } = await addLot(['--drums', 'd-1,d-2,d-3']);
    expect(capture.parsed.grade).toBe('blend');
    expect(capture.parsed.label).toBe('orange blossom blend');
  });

  it('refuses a drum that is not in the book', async () => {
    const { status, capture } = await addLot(['--drums', 'd-9']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('which is not on file');
  });

  it('lists the lots', async () => {
    await addLot();
    const { capture } = await run(['honey', 'lots'], { json: true });
    expect(capture.parsed).toHaveLength(1);
  });

  it('shows one lot with its drums', async () => {
    await addLot();
    const { capture } = await run(['honey', 'lot-show', 'HL-2025-0004']);
    expect(capture.stdout).toContain('D-1 642 lb orange blossom');
    expect(capture.stdout).toContain('D-2 642 lb orange blossom');
  });

  it('says so when a lot is not in the book', async () => {
    const { status, capture } = await run(['honey', 'lot-show', 'HL-2025-0099']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('no lot HL-2025-0099');
  });
});

describe('honey crop and season', () => {
  const addCrop = (yard, overrides = []) =>
    run([
      'honey',
      'crop',
      '--yard',
      yard,
      '--season',
      '2025',
      '--started',
      '100',
      '--ended',
      '80',
      '--net',
      '4800',
      ...overrides,
    ]);

  it('books a crop and reports the yield', async () => {
    const { capture } = await addCrop('YD-2025-0001');
    expect(capture.lines).toEqual([
      'yard         YD-2025-0001',
      'season       2025',
      'lbPerColony  60',
      'lossPercent  20',
    ]);
  });

  it('replaces a crop booked twice for the same yard and season', async () => {
    await addCrop('YD-2025-0001');
    await addCrop('YD-2025-0001', ['--net', '5200']);
    const { capture } = await run(['honey', 'season', '2025'], { json: true });
    expect(capture.parsed.netLb).toBe(5200);
  });

  it('totals a season and ranks the yards', async () => {
    await addCrop('YD-2025-0001');
    await addCrop('YD-2025-0002', ['--net', '4000', '--ended', '40']);
    const { capture } = await run(['honey', 'season', '2025'], { json: true });
    expect(capture.parsed).toMatchObject({ yards: 2, netLb: 8800, colonies: 120 });
    expect(capture.parsed.best[0].yardId).toBe('YD-2025-0002');
  });

  it('prices the crop when a price is given', async () => {
    await addDrum('d-1');
    await run([
      'honey',
      'lot',
      '--id',
      'HL-2025-0004',
      '--drums',
      'd-1',
      '--yards',
      'YD-2025-0001',
      '--from',
      '2025-05-20',
      '--to',
      '2025-05-22',
    ]);
    await addCrop('YD-2025-0001');
    const { capture } = await run(['honey', 'season', '2025', '--price', '285']);
    expect(capture.stdout).toContain('value       $1,829.70');
  });

  it('is empty for a season with nothing booked', async () => {
    const { capture } = await run(['honey', 'season', '2024'], { json: true });
    expect(capture.parsed).toMatchObject({ yards: 0, netLb: 0 });
  });
});
