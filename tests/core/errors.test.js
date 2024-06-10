import { describe, it, expect } from 'vitest';
import {
  BroodhaulError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RuleViolation,
  StateError,
  exitCodeFor,
  describeError,
} from '../../src/core/errors.js';

describe('BroodhaulError', () => {
  it('keeps the subclass name so a log line says what went wrong', () => {
    const err = new ValidationError('bad frame count');
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(BroodhaulError);
    expect(err).toBeInstanceOf(Error);
  });

  it('serialises the details bag', () => {
    const err = new ValidationError('bad frame count', { field: 'frames', got: -1 });
    expect(err.toJSON()).toEqual({
      error: 'ValidationError',
      code: 'validation',
      message: 'bad frame count',
      details: { field: 'frames', got: -1 },
    });
  });
});

describe('NotFoundError', () => {
  it('builds its own message from the kind and id', () => {
    const err = new NotFoundError('yard', 'YD-014');
    expect(err.message).toBe('no yard with id YD-014');
    expect(err.details).toEqual({ kind: 'yard', id: 'YD-014' });
  });

  it('merges extra details without losing kind or id', () => {
    const err = new NotFoundError('colony', 'C-9', { grower: 'stanislaus' });
    expect(err.details.grower).toBe('stanislaus');
    expect(err.details.kind).toBe('colony');
  });
});

describe('RuleViolation', () => {
  it('carries the manual clause it came from', () => {
    const err = new RuleViolation('GR-4', 'average below contract minimum', {
      average: 5.4,
    });
    expect(err.rule).toBe('GR-4');
    expect(err.details).toEqual({ rule: 'GR-4', average: 5.4 });
  });
});

describe('exitCodeFor', () => {
  it('maps every domain code to a distinct status', () => {
    const codes = [
      exitCodeFor(new ValidationError('x')),
      exitCodeFor(new NotFoundError('yard', 'y')),
      exitCodeFor(new ConflictError('x')),
      exitCodeFor(new RuleViolation('R', 'x')),
      exitCodeFor(new StateError('x')),
    ];
    expect(codes).toEqual([2, 3, 4, 5, 6]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('falls back to 1 for anything else', () => {
    expect(exitCodeFor(new Error('boom'))).toBe(1);
    expect(exitCodeFor('boom')).toBe(1);
  });

  it('uses 1 for a domain error carrying an unmapped code', () => {
    expect(exitCodeFor(new BroodhaulError('odd', 'unmapped'))).toBe(1);
  });
});

describe('describeError', () => {
  it('passes a domain error through its own toJSON', () => {
    expect(describeError(new ConflictError('two loads claim one truck'))).toEqual({
      error: 'ConflictError',
      code: 'conflict',
      message: 'two loads claim one truck',
      details: {},
    });
  });

  it('wraps a plain error', () => {
    expect(describeError(new TypeError('nope'))).toEqual({
      error: 'TypeError',
      code: 'internal',
      message: 'nope',
      details: {},
    });
  });

  it('wraps a thrown non-error', () => {
    expect(describeError('nope')).toEqual({
      error: 'Error',
      code: 'internal',
      message: 'nope',
      details: {},
    });
  });
});
