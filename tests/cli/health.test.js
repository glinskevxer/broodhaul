import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';

let root;

const run = cliRunner(() => root, { today: '2025-08-20' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-health-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('health products', () => {
  it('lists the whole shelf', async () => {
    const { capture } = await run(['health', 'products'], { json: true });
    expect(capture.parsed).toHaveLength(5);
  });

  it('narrows to what can go on today', async () => {
    const { capture } = await run(
      ['health', 'products', '--temperature', '80', '--supers-on'],
      { json: true }
    );
    expect(capture.parsed.map((row) => row.code)).toEqual(['formic-pro']);
  });

  it('prints the label in text mode', async () => {
    const { capture } = await run([
      'health',
      'products',
      '--temperature',
      '95',
      '--supers-on',
    ]);
    expect(capture.stdout).toBe('');
  });
});

describe('health wash', () => {
  const wash = (overrides = []) =>
    run([
      'health',
      'wash',
      '--colony',
      'CY-2025-0011',
      '--yard',
      'YD-2025-0001',
      '--on',
      '2025-08-14',
      '--mites',
      '9',
      ...overrides,
    ]);

  it('reports the rate and the call', async () => {
    const { status, capture } = await wash();
    expect(status).toBe(0);
    expect(capture.lines[0]).toBe('CY-2025-0011 2025-08-14: 9 of 300, 3 per hundred');
    expect(capture.lines[1]).toContain('treat');
  });

  it('corrects an entrance sample upward', async () => {
    const { capture } = await wash(['--source', 'entrance']);
    expect(capture.lines[0]).toContain('4.2 per hundred');
  });

  it('uses the bee count that was in the jar', async () => {
    const { capture } = await wash(['--bees', '240'], { json: true });
    expect(capture.lines[0]).toContain('9 of 240');
  });

  it('says to pull the supers first when they are on', async () => {
    const { capture } = await wash(['--supers-on']);
    expect(capture.lines[1]).toContain('pull supers first');
  });

  it('refuses more mites than bees', async () => {
    const { status, capture } = await wash(['--mites', '400']);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('more mites than bees');
  });
});

describe('health yard-rate', () => {
  it('averages the washes and names the worst colony', async () => {
    const { capture } = await run(
      [
        'health',
        'yard-rate',
        '--yard',
        'YD-2025-0001',
        '--on',
        '2025-08-14',
        '--washes',
        'CY-2025-0011:9,CY-2025-0012:21,CY-2025-0013:3',
      ],
      { json: true }
    );
    expect(capture.parsed).toEqual({
      yard: 'YD-2025-0001',
      washes: 3,
      rate: 3.7,
      worst: 'CY-2025-0012',
      action: 'treat',
      threshold: 2,
    });
  });
});

describe('health treat', () => {
  const treat = (overrides = []) =>
    run([
      'health',
      'treat',
      '--id',
      'TR-2025-0021',
      '--yard',
      'YD-2025-0001',
      '--product',
      'apivar',
      '--on',
      '2025-08-14',
      '--colonies',
      'CY-2025-0011,CY-2025-0012',
      '--temperature',
      '88',
      '--applicator',
      'M Ojeda',
      ...overrides,
    ]);

  it('records it and works out the dates', async () => {
    const { status, capture } = await treat();
    expect(status).toBe(0);
    expect(capture.lines).toEqual([
      'id            TR-2025-0021',
      'product       apivar',
      'dueOff        2025-09-25',
      'supersReturn  2025-10-10',
    ]);
  });

  it('works the units out from the label when none are given', async () => {
    await treat();
    const { capture } = await run(['health', 'treatments'], { json: true });
    expect(capture.parsed[0].units).toBe(4);
  });

  it('refuses one that breaks the label', async () => {
    const { status, capture } = await treat(['--supers-on']);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('honey supers on');
  });

  it('refuses the third application of a product capped at two', async () => {
    await treat();
    await treat([
      '--id',
      'TR-2025-0022',
      '--product',
      'formic-pro',
      '--temperature',
      '72',
    ]);
    await treat(['--id', 'TR-2025-0023', '--on', '2025-09-30']);
    const { status, capture } = await treat([
      '--id',
      'TR-2025-0024',
      '--on',
      '2025-10-10',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('limited to 2 applications');
  });

  it('refuses two of the same chemical class in a row', async () => {
    await treat([
      '--id',
      'TR-2025-0022',
      '--product',
      'formic-pro',
      '--temperature',
      '72',
    ]);
    const { status, capture } = await treat([
      '--id',
      'TR-2025-0023',
      '--product',
      'oxalic-dribble',
      '--temperature',
      '55',
      '--on',
      '2025-09-30',
    ]);
    expect(status).toBe(5);
    expect(capture.stderr).toContain('both are organic acid');
  });
});

describe('health pull and treatments', () => {
  beforeEach(() =>
    run([
      'health',
      'treat',
      '--id',
      'TR-2025-0021',
      '--yard',
      'YD-2025-0001',
      '--product',
      'apivar',
      '--on',
      '2025-01-14',
      '--colonies',
      'CY-2025-0011',
      '--temperature',
      '60',
      '--applicator',
      'M Ojeda',
    ])
  );

  it('records the pull and the end of the withdrawal', async () => {
    const { capture } = await run(
      ['health', 'pull', 'TR-2025-0021', '--on', '2025-02-25'],
      {
        json: true,
      }
    );
    expect(capture.parsed).toEqual({
      id: 'TR-2025-0021',
      removedOn: '2025-02-25',
      withdrawalEnds: '2025-03-11',
    });
  });

  it('lists the overdue treatments', async () => {
    const { capture } = await run(['health', 'treatments', '--overdue'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(1);
  });

  it('drops it off the overdue list once pulled', async () => {
    await run(['health', 'pull', 'TR-2025-0021', '--on', '2025-02-25']);
    const { capture } = await run(['health', 'treatments', '--overdue'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });
});

describe('health inspection and holds', () => {
  const inspect = (overrides = []) =>
    run([
      'health',
      'inspection',
      '--id',
      'IS-2025-0003',
      '--yard',
      'YD-2025-0001',
      '--on',
      '2025-08-12',
      '--inspector',
      'L Prentice',
      '--opened',
      '24',
      ...overrides,
    ]);

  it('records a clean inspection with no hold', async () => {
    const { capture } = await inspect();
    expect(capture.lines).toEqual([
      'id           IS-2025-0003',
      'findings     clean',
      'heldUntil    not held',
      'destruction  false',
    ]);
  });

  it('holds the yard after foulbrood', async () => {
    const { capture } = await inspect(['--findings', 'afb', '--affected', '2']);
    expect(capture.lines[2]).toBe('heldUntil    2025-09-11');
    expect(capture.lines[3]).toBe('destruction  true');
  });

  it('lists the yards held today', async () => {
    await inspect(['--findings', 'afb', '--affected', '2']);
    const { capture } = await run(['health', 'holds'], { json: true });
    expect(capture.parsed).toEqual([
      {
        yard: 'YD-2025-0001',
        inspection: 'IS-2025-0003',
        until: '2025-09-11',
        findings: 'afb',
      },
    ]);
  });

  it('says nothing is held once the hold runs out', async () => {
    await inspect(['--findings', 'afb', '--affected', '2']);
    const { capture } = await run(['health', 'holds'], {
      json: true,
      today: '2025-10-01',
    });
    expect(capture.parsed).toEqual([]);
  });

  it('prints the history for a yard', async () => {
    await inspect();
    const { capture } = await run(['health', 'history', 'YD-2025-0001'], {
      json: true,
    });
    expect(capture.parsed).toHaveLength(1);
  });
});
