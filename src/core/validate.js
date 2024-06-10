import { ValidationError } from './errors.js';

/** Throw a ValidationError unless `condition` holds. */
export function check(condition, message, details = {}) {
  if (!condition) throw new ValidationError(message, details);
  return true;
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, {
      field,
      got: typeof value,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(`${field} must be at least ${min} characters`, { field });
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`, { field });
  }
  return trimmed;
}

export function requireNumber(value, field, { min, max, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`, {
      field,
      got: value,
    });
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be a whole number`, { field, got: value });
  }
  if (min !== undefined && value < min) {
    throw new ValidationError(`${field} must be at least ${min}`, {
      field,
      got: value,
    });
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${field} must be at most ${max}`, { field, got: value });
  }
  return value;
}

export function requireInteger(value, field, opts = {}) {
  return requireNumber(value, field, { ...opts, integer: true });
}

export function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of ${allowed.join(', ')}`, {
      field,
      got: value,
      allowed,
    });
  }
  return value;
}

export function requireArray(value, field, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, {
      field,
      got: typeof value,
    });
  }
  if (value.length < min) {
    throw new ValidationError(`${field} needs at least ${min} entries`, {
      field,
      got: value.length,
    });
  }
  if (value.length > max) {
    throw new ValidationError(`${field} takes at most ${max} entries`, {
      field,
      got: value.length,
    });
  }
  return value;
}

export function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`, { field });
  }
  return value;
}

/** Reject unexpected keys so a typo in a fixture does not pass silently. */
export function rejectUnknownKeys(value, field, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ValidationError(
      `${field} has unknown keys: ${unknown.sort().join(', ')}`,
      {
        field,
        unknown,
      }
    );
  }
  return value;
}

export function optional(value, fn) {
  return value === undefined || value === null ? undefined : fn(value);
}
