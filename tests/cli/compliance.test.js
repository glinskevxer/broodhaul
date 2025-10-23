import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { STATES } from '../../src/apiary/registration.js';

let root;
let previousExitCode;

const run = cliRunner(() => root, { today: '2025-05-15' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-compliance-'));
  previousExitCode = process.exitCode;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.exitCode = previousExitCode;
});

describe('registration calendar', () => {
  it('lists every state by due date', async () => {
    const { status, capture } = await run(
      ['registration', 'calendar', '--year', '2025'],
      { json: true }
    );
    expect(status).toBe(0);
    expect(capture.parsed).toHaveLength(STATES.length);
    expect(capture.parsed[0].state).toBe('CA');
  });

  it('narrows to the states asked for', async () => {
    const { capture } = await run(
      ['registration', 'calendar', '--year', '2025', '--states', 'ND,ID'],
      { json: true }
    );
    expect(capture.parsed.map((row) => row.state)).toEqual(['ID', 'ND']);
  });
});

describe('registration file and book', () => {
  const file = (state, overrides = []) =>
    run([
      'registration',
      'file',
      state,
      '--year',
      '2025',
      '--hives',
      '480',
      '--apiaries',
      '12',
      ...overrides,
    ]);

  it('records a filing and works the fee out', async () => {
    const { capture } = await file('ca', ['--on', '2025-01-20']);
    expect(capture.lines).toEqual([
      'state     CA',
      'year      2025',
      'feeCents  12000',
      'filedOn   2025-01-20',
    ]);
  });

  it('charges Idaho by the hive', async () => {
    const { capture } = await file('id', ['--on', '2025-04-10']);
    expect(capture.lines[2]).toBe('feeCents  6825');
  });

  it('replaces a filing for the same state and year', async () => {
    await file('ca', ['--on', '2025-01-20']);
    await file('ca', ['--on', '2025-01-25', '--hives', '500']);
    const { capture } = await run(['registration', 'book'], { json: true });
    expect(capture.parsed.records).toHaveLength(1);
    expect(capture.parsed.records[0].hives).toBe(500);
  });

  it('adds the fees in the book', async () => {
    await file('ca', ['--on', '2025-01-20']);
    await file('nd', ['--on', '2025-05-10']);
    const { capture } = await run(['registration', 'book'], { json: true });
    expect(capture.parsed.totalFeeCents).toBe(12000 + 30000);
  });

  it('prints the book plainly', async () => {
    await file('ca', ['--on', '2025-02-05']);
    const { capture } = await run(['registration', 'book']);
    expect(capture.lines[0]).toContain('filed 2025-02-05 late');
    expect(capture.lines.pop()).toContain('in fees');
  });
});

describe('registration outstanding and check', () => {
  it('names what has not been filed', async () => {
    await run([
      'registration',
      'file',
      'ca',
      '--year',
      '2025',
      '--hives',
      '480',
      '--apiaries',
      '12',
      '--on',
      '2025-01-20',
    ]);
    const { capture } = await run(
      ['registration', 'outstanding', '--year', '2025', '--states', 'CA,ND,ID'],
      { json: true }
    );
    expect(capture.parsed.map((row) => row.state)).toEqual(['ID', 'ND']);
  });

  it('flags the ones already past their date', async () => {
    const { capture } = await run(
      ['registration', 'outstanding', '--year', '2025', '--states', 'CA,ND'],
      { json: true }
    );
    expect(capture.parsed.find((row) => row.state === 'CA').overdue).toBe(true);
  });

  it('refuses a state that was never filed', async () => {
    const { status, capture } = await run([
      'registration',
      'check',
      'ca',
      '--year',
      '2025',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('is not filed');
  });

  it('passes one filed on time', async () => {
    await run([
      'registration',
      'file',
      'ca',
      '--year',
      '2025',
      '--hives',
      '480',
      '--apiaries',
      '12',
      '--on',
      '2025-01-20',
    ]);
    const { status } = await run(['registration', 'check', 'ca', '--year', '2025']);
    expect(status).toBe(0);
  });
});

describe('dispute', () => {
  const raise = (overrides = []) =>
    run([
      'dispute',
      'raise',
      'CT-2025-0007',
      '--id',
      'ds-1',
      '--grounds',
      'grading',
      '--amount',
      '250000',
      '--on',
      '2025-05-10',
      ...overrides,
    ]);

  it('puts a dispute on the book with its remedy', async () => {
    const { status, capture } = await raise();
    expect(status).toBe(0);
    expect(capture.lines[0]).toBe('id       DS-1');
    expect(capture.lines[2]).toContain('regrade');
  });

  it('lists the open ones with the exposure', async () => {
    await raise();
    const { capture } = await run(['dispute', 'open'], { json: true });
    expect(capture.parsed.open).toHaveLength(1);
    expect(capture.parsed.exposureCents).toBe(250000);
  });

  it('flags an overdue dispute in the printed list', async () => {
    await raise(['--on', '2025-04-01']);
    const { capture } = await run(['dispute', 'open']);
    expect(capture.lines[0]).toContain('overdue');
  });

  it('walks a dispute to settled', async () => {
    await raise();
    await run(['dispute', 'advance', 'ds-1', 'answered']);
    const { capture } = await run(
      ['dispute', 'advance', 'ds-1', 'settled', '--settled', '100000'],
      { json: true }
    );
    expect(capture.parsed.state).toBe('settled');
    const book = await run(['dispute', 'open'], { json: true });
    expect(book.capture.parsed.settledCents).toBe(100000);
  });

  it('refuses a move the record does not allow', async () => {
    await raise();
    const { status, capture } = await run([
      'dispute',
      'advance',
      'ds-1',
      'settled',
      '--settled',
      '1',
    ]);
    expect(status).toBe(6);
    expect(capture.stderr).toContain('cannot move a dispute from open to settled');
  });

  it('says so when the dispute is not on the book', async () => {
    await run(['dispute', 'advance', 'ds-9', 'answered']);
    expect(process.exitCode).toBe(3);
  });
});
