/**
 * Error types shared by every module in the desk.
 *
 * Two things separate these from a bare `Error`. Each one carries a stable
 * `code` that the CLI turns into an exit status, and each one carries a
 * `details` bag that survives serialisation, so a failure that happened deep
 * inside a settlement run still says which contract and which colony it was
 * looking at when it gave up.
 */

export class BroodhaulError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** A value arrived in the wrong shape or outside its allowed range. */
export class ValidationError extends BroodhaulError {
  constructor(message, details = {}) {
    super(message, 'validation', details);
  }
}

/** A record was asked for by identifier and no such record exists. */
export class NotFoundError extends BroodhaulError {
  constructor(kind, id, details = {}) {
    super(`no ${kind} with id ${id}`, 'not_found', { kind, id, ...details });
    this.kind = kind;
    this.id = id;
  }
}

/** Two records claim something only one of them can have. */
export class ConflictError extends BroodhaulError {
  constructor(message, details = {}) {
    super(message, 'conflict', details);
  }
}

/**
 * A business rule said no. `rule` is the identifier used in the operations
 * manual, so a grower who disputes a deduction can be pointed at the clause.
 */
export class RuleViolation extends BroodhaulError {
  constructor(rule, message, details = {}) {
    super(message, 'rule_violation', { rule, ...details });
    this.rule = rule;
  }
}

/** An operation was attempted against a record in the wrong state. */
export class StateError extends BroodhaulError {
  constructor(message, details = {}) {
    super(message, 'state', details);
  }
}

const EXIT_CODES = {
  validation: 2,
  not_found: 3,
  conflict: 4,
  rule_violation: 5,
  state: 6,
};

/** Exit status the CLI should use for a thrown value. */
export function exitCodeFor(err) {
  if (err instanceof BroodhaulError) {
    return EXIT_CODES[err.code] ?? 1;
  }
  return 1;
}

/** Turn any thrown value into a plain object safe to print as JSON. */
export function describeError(err) {
  if (err instanceof BroodhaulError) return err.toJSON();
  if (err instanceof Error) {
    return { error: err.name, code: 'internal', message: err.message, details: {} };
  }
  return { error: 'Error', code: 'internal', message: String(err), details: {} };
}
