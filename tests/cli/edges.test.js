import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

/**
 * The edges the command tests do not otherwise reach.
 *
 * Every one of these is a path somebody hit in the office: an empty desk, a
 * filter that matches nothing, a text mode branch of a command that is usually
 * read as json. None of them are interesting on their own, which is exactly
 * why none of them had a test.
 */

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-edges-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('an empty desk', () => {
  it('reports nothing everywhere', async () => {
    for (const args of [
      ['yard', 'list'],
      ['colony', 'list'],
      ['pallet', 'list'],
      ['block', 'list'],
      ['contract', 'list'],
      ['drop', 'list'],
      ['load', 'list'],
      ['grading', 'list'],
      ['health', 'treatments'],
      ['health', 'holds'],
    ]) {
      const { status, capture } = await run(args, { json: true });
      expect(status, args.join(' ')).toBe(0);
      expect(capture.parsed, args.join(' ')).toEqual([]);
    }
  });

  it('has nothing to report', async () => {
    const { capture } = await run(['check'], { json: true });
    expect(capture.parsed).toEqual([]);
  });

  it('reports an empty season', async () => {
    const { capture } = await run(['season', '2025'], { json: true });
    expect(capture.parsed.contracts).toBe(0);
  });

  it('reports empty kpis', async () => {
    const { capture } = await run(['kpi', '2025'], { json: true });
    expect(capture.parsed.fill.rate).toBe(0);
    expect(capture.parsed.revenue.perColonyCents).toBe(0);
  });

  it('reports an empty audit', async () => {
    const { capture } = await run(['audit', 'summary'], { json: true });
    expect(capture.parsed.writes).toBe(0);
    expect(capture.parsed.busiestDay).toBeNull();
  });

  it('has an empty ledger and dispute book', async () => {
    const ledger = await run(['ledger', 'balances'], { json: true });
    expect(ledger.capture.parsed).toEqual([]);
    const disputes = await run(['dispute', 'open'], { json: true });
    expect(disputes.capture.parsed.open).toEqual([]);
  });

  it('has an empty honey book', async () => {
    const drums = await run(['honey', 'drums'], { json: true });
    expect(drums.capture.parsed).toEqual([]);
    const lots = await run(['honey', 'lots'], { json: true });
    expect(lots.capture.parsed).toEqual([]);
  });
});

describe('the text mode branches', () => {
  beforeEach(() => run(['example', 'load']));

  it('prints the season page', async () => {
    const { capture } = await run(['season', '2025']);
    expect(capture.lines[0]).toBe('season 2025');
  });

  it('prints the kpi table', async () => {
    const { capture } = await run(['kpi', '2025']);
    expect(capture.lines[0]).toContain('measure');
  });

  it('prints the audit summary', async () => {
    const { capture } = await run(['audit', 'summary']);
    expect(capture.stdout).toContain('busiest day');
  });

  it('prints the forecast', async () => {
    const { capture } = await run(['forecast', 'bloom']);
    expect(capture.lines[0]).toContain('colonies in fall');
  });

  it('prints the honey lot detail', async () => {
    await run([
      'honey',
      'drum',
      '--id',
      'd-1',
      '--gross',
      '690',
      '--tare',
      '48',
      '--moisture',
      '17.4',
      '--source',
      'sage',
      '--on',
      '2025-05-22',
    ]);
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
    const { capture } = await run(['honey', 'lot-show', 'HL-2025-0004']);
    expect(capture.stdout).toContain('D-1 642 lb sage');
  });

  it('prints the registration book', async () => {
    await run([
      'registration',
      'file',
      'ca',
      '--year',
      '2025',
      '--hives',
      '12',
      '--apiaries',
      '2',
      '--on',
      '2025-01-20',
    ]);
    const { capture } = await run(['registration', 'book']);
    expect(capture.stdout).toContain('CA 2025');
  });

  it('prints the store snapshot counts', async () => {
    const file = join(root, 'snap.json');
    const { capture } = await run(['store', 'snapshot', file]);
    expect(capture.lines[0]).toContain('records written');
  });
});

describe('filters that match nothing', () => {
  beforeEach(() => run(['example', 'load']));

  it('return a bare header rather than an error', async () => {
    for (const args of [
      ['yard', 'list', '--county', 'Kern'],
      ['colony', 'list', '--status', 'sold'],
      ['contract', 'list', '--crop', 'cherry'],
      ['drop', 'list', '--contract', 'CT-2025-0099'],
      ['grading', 'list', '--contract', 'CT-2025-0099'],
      ['load', 'list', '--state', 'cancelled'],
    ]) {
      const { status, capture } = await run(args, { json: true });
      expect(status, args.join(' ')).toBe(0);
      expect(capture.parsed, args.join(' ')).toEqual([]);
    }
  });
});
