import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli/program.js';
import { captureOutput } from '../../src/cli/io.js';
import { EQUIPMENT_KINDS } from '../../src/apiary/equipment.js';

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
      '2025-09-01',
      ...(json ? ['--json'] : []),
      ...args,
    ],
    { output: capture.output }
  );
  return { status, capture };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-increase-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('increase plan', () => {
  const strengths = 'CY-2025-0011:12,CY-2025-0012:9,CY-2025-0013:6';

  it('plans splits off the strong colonies only', async () => {
    const { status, capture } = await run(
      ['increase', 'plan', '--strengths', strengths],
      { json: true }
    );
    expect(status).toBe(0);
    expect(capture.parsed.donors).toBe(2);
    expect(
      capture.parsed.splitsPlanned.every((entry) => entry.donorId !== 'CY-2025-0013')
    ).toBe(true);
  });

  it('stops at the number wanted', async () => {
    const { capture } = await run(
      ['increase', 'plan', '--strengths', strengths, '--wanted', '2'],
      { json: true }
    );
    expect(capture.parsed.splits).toBe(2);
  });

  it('makes fewer splits at a bigger take', async () => {
    const small = await run(['increase', 'plan', '--strengths', strengths], {
      json: true,
    });
    const big = await run(
      ['increase', 'plan', '--strengths', strengths, '--take', '4'],
      {
        json: true,
      }
    );
    expect(big.capture.parsed.splits).toBeLessThan(small.capture.parsed.splits);
  });

  it('prints the donors and a summary line', async () => {
    const { capture } = await run(['increase', 'plan', '--strengths', strengths]);
    expect(capture.lines[0]).toContain('donor');
    expect(capture.lines.pop()).toContain('colonies after');
  });

  it('refuses strengths in the wrong shape', async () => {
    const { status, capture } = await run([
      'increase',
      'plan',
      '--strengths',
      'CY-2025-0011',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('strengths look like');
  });
});

describe('increase deadline', () => {
  it('works out the last day and shows it makes grade', async () => {
    const { capture } = await run(
      ['increase', 'deadline', '--target', '8', '--by', '2026-02-01'],
      { json: true }
    );
    expect(capture.parsed.latest).toBe('2025-11-23');
    expect(capture.parsed.makesGrade).toBe(true);
    expect(capture.parsed.projected).toBe(8);
  });

  it('leaves more time for a walk away split', async () => {
    const cell = await run(
      ['increase', 'deadline', '--target', '8', '--by', '2026-02-01'],
      { json: true }
    );
    const walk = await run(
      [
        'increase',
        'deadline',
        '--target',
        '8',
        '--by',
        '2026-02-01',
        '--queened',
        'walk away',
      ],
      { json: true }
    );
    expect(walk.capture.parsed.latest < cell.capture.parsed.latest).toBe(true);
  });

  it('refuses a way of queening nobody uses', async () => {
    const { status } = await run([
      'increase',
      'deadline',
      '--target',
      '8',
      '--by',
      '2026-02-01',
      '--queened',
      'hope',
    ]);
    expect(status).toBe(2);
  });
});

describe('increase equipment', () => {
  it('says to buy everything when nothing is on hand', async () => {
    const { capture } = await run(['increase', 'equipment', '--colonies', '100'], {
      json: true,
    });
    const deeps = capture.parsed.lines.find((row) => row.kind === 'deep box');
    expect(deeps.buy).toBe(200);
    expect(capture.parsed.buyCostCents).toBeGreaterThan(0);
  });

  it('takes what is already in the shed off the order', async () => {
    const { capture } = await run(
      ['increase', 'equipment', '--colonies', '100', '--holdings', 'deep box:400'],
      { json: true }
    );
    expect(capture.parsed.lines.find((row) => row.kind === 'deep box').buy).toBe(0);
  });

  it('counts the attrition on old gear', async () => {
    const { capture } = await run(
      ['increase', 'equipment', '--colonies', '100', '--holdings', 'lid:200:5'],
      { json: true }
    );
    expect(
      capture.parsed.lines.find((row) => row.kind === 'lid').attrition
    ).toBeGreaterThan(0);
  });

  it('values what is on hand', async () => {
    const { capture } = await run(
      ['increase', 'equipment', '--colonies', '100', '--holdings', 'deep box:100:4'],
      { json: true }
    );
    expect(capture.parsed.replacementValueCents).toBe(220000);
    expect(capture.parsed.depreciatedValueCents).toBe(110000);
  });

  it('prints the order and what it costs', async () => {
    const { capture } = await run(['increase', 'equipment', '--colonies', '10']);
    expect(capture.lines[0]).toContain('needed');
    expect(capture.lines.pop()).toContain('of woodenware');
  });

  it('refuses a holding of a kind nobody stocks', async () => {
    const { status, capture } = await run([
      'increase',
      'equipment',
      '--colonies',
      '10',
      '--holdings',
      'nuc box:20',
    ]);
    expect(status).toBe(2);
    expect(capture.stderr).toContain('must be one of');
  });
});

describe('increase kinds', () => {
  it('lists every kind, including the ones this outfit does not run', async () => {
    const { capture } = await run(['increase', 'kinds'], { json: true });
    expect(capture.parsed.map((row) => row.kind).sort()).toEqual(
      [...EQUIPMENT_KINDS].sort()
    );
  });

  it('shows a zero for the kinds not in use', async () => {
    const { capture } = await run(['increase', 'kinds'], { json: true });
    expect(capture.parsed.find((row) => row.kind === 'excluder').perColony).toBe(0);
  });
});
