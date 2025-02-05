import { describe, it, expect } from 'vitest';
import { captureOutput, createOutput } from '../../src/cli/io.js';
import { NotFoundError, RuleViolation } from '../../src/core/errors.js';

const columns = [
  { header: 'yard', key: 'yard' },
  { header: 'hives', key: 'hives', align: 'right' },
];

const rows = [
  { yard: 'YD-2025-0001', hives: 48 },
  { yard: 'YD-2025-0002', hives: 6 },
];

describe('createOutput', () => {
  it('writes to the streams it was given', () => {
    const written = [];
    const output = createOutput({ stdout: (text) => written.push(text) });
    output.line('hello');
    expect(written).toEqual(['hello\n']);
  });

  it('writes an empty line with no argument', () => {
    const capture = captureOutput();
    capture.output.line();
    expect(capture.stdout).toBe('\n');
  });

  it('sends warnings to the error stream', () => {
    const capture = captureOutput();
    capture.output.warn('gate was locked');
    expect(capture.stdout).toBe('');
    expect(capture.stderr).toBe('gate was locked\n');
  });
});

describe('text output', () => {
  it('lines a table up', () => {
    const capture = captureOutput();
    capture.output.table(columns, rows);
    expect(capture.lines[0]).toBe('yard          hives');
    expect(capture.lines[2]).toBe('YD-2025-0001     48');
  });

  it('lines a detail block up', () => {
    const capture = captureOutput();
    capture.output.detail([
      ['contract', 'CT-2025-0007'],
      ['grower', 'Wilkins'],
    ]);
    expect(capture.lines).toEqual(['contract  CT-2025-0007', 'grower    Wilkins']);
  });

  it('underlines a heading', () => {
    const capture = captureOutput();
    capture.output.heading('yards');
    expect(capture.lines).toEqual(['yards', '=====']);
  });

  it('prints an object as a detail block', () => {
    const capture = captureOutput();
    capture.output.value({ id: 'YD-2025-0001', capacity: 96 });
    expect(capture.lines).toEqual(['id        YD-2025-0001', 'capacity  96']);
  });

  it('prints an array a line at a time', () => {
    const capture = captureOutput();
    capture.output.value(['one', 'two']);
    expect(capture.lines).toEqual(['one', 'two']);
  });

  it('prints a bare value', () => {
    const capture = captureOutput();
    capture.output.value(48);
    expect(capture.lines).toEqual(['48']);
  });

  it('leaves a missing field blank rather than printing undefined', () => {
    const capture = captureOutput();
    capture.output.value({ id: 'YD-2025-0001', notes: undefined });
    expect(capture.stdout).not.toContain('undefined');
  });
});

describe('json output', () => {
  it('writes a table as an array of rows', () => {
    const capture = captureOutput({ json: true });
    capture.output.table(columns, rows);
    expect(capture.parsed).toEqual(rows);
  });

  it('writes a detail block as an object', () => {
    const capture = captureOutput({ json: true });
    capture.output.detail([
      ['contract', 'CT-2025-0007'],
      ['grower', 'Wilkins'],
    ]);
    expect(capture.parsed).toEqual({ contract: 'CT-2025-0007', grower: 'Wilkins' });
  });

  it('writes keys in a fixed order', () => {
    const capture = captureOutput({ json: true });
    capture.output.value({ b: 1, a: 2 });
    expect(capture.stdout).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });

  it('says nothing for a heading', () => {
    const capture = captureOutput({ json: true });
    capture.output.heading('yards');
    expect(capture.stdout).toBe('');
  });

  it('still writes plain lines, which is how a warning reaches a log', () => {
    const capture = captureOutput({ json: true });
    capture.output.line('note');
    expect(capture.stdout).toBe('note\n');
  });
});

describe('failure', () => {
  it('prints the code and the message and returns the exit status', () => {
    const capture = captureOutput();
    const status = capture.output.failure(new NotFoundError('yard', 'YD-2025-0099'));
    expect(status).toBe(3);
    expect(capture.stderr).toBe('not_found: no yard with id YD-2025-0099\n');
  });

  it('prints the whole error as json when asked', () => {
    const capture = captureOutput({ json: true });
    const status = capture.output.failure(
      new RuleViolation('GR-2', 'too few opened', { opened: 4 })
    );
    expect(status).toBe(5);
    expect(JSON.parse(capture.stderr)).toEqual({
      code: 'rule_violation',
      details: { opened: 4, rule: 'GR-2' },
      error: 'RuleViolation',
      message: 'too few opened',
    });
  });

  it('gives an ordinary error status one', () => {
    const capture = captureOutput();
    expect(capture.output.failure(new Error('boom'))).toBe(1);
  });
});

describe('captureOutput', () => {
  it('drops blank lines from the line view but keeps them in the raw text', () => {
    const capture = captureOutput();
    capture.output.line('one');
    capture.output.line();
    capture.output.line('two');
    expect(capture.lines).toEqual(['one', 'two']);
    expect(capture.stdout).toBe('one\n\ntwo\n');
  });
});
