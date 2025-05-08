import { ValidationError } from '../core/errors.js';

/**
 * Colon and comma lists.
 *
 * Four commands were each parsing their own version of `a:1,b:2` and each one
 * had a slightly different idea of what to do about whitespace and a missing
 * field. They now share this, and the error message names the option and shows
 * the shape it wanted, which is the part the office actually needed.
 */

export const asText = (value) => value;
export const asNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${value} is not a number`, { value });
  }
  return parsed;
};
export const asFlag = (match) => (value) => value === match;

export function parseList(text, { label, example, fields }) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ValidationError(`${label} is empty, it looks like "${example}"`, {
      label,
    });
  }
  return text.split(',').map((entry) => {
    const parts = entry.split(':').map((part) => part.trim());
    const required = fields.filter((field) => !field.optional).length;
    if (parts.length < required || parts[0] === '') {
      throw new ValidationError(
        `${label} look like "${example}", got ${entry.trim()}`,
        {
          label,
          entry: entry.trim(),
        }
      );
    }
    const parsed = {};
    fields.forEach((field, at) => {
      const value = parts[at];
      if (value === undefined || value === '') {
        if (field.optional) return;
        throw new ValidationError(
          `${label} are missing ${field.name} in ${entry.trim()}`,
          {
            label,
            field: field.name,
          }
        );
      }
      parsed[field.name] = field.convert(value);
    });
    return parsed;
  });
}

/** A single `from..to` pair, which is how every window arrives on the command line. */
export function parseWindow(text, label) {
  if (typeof text !== 'string' || !text.includes('..')) {
    throw new ValidationError(`${label} looks like "2025-02-01..2025-02-10"`, {
      label,
    });
  }
  const [start, end] = text.split('..').map((part) => part.trim());
  if (!start || !end) {
    throw new ValidationError(`${label} looks like "2025-02-01..2025-02-10"`, {
      label,
    });
  }
  return { start, end };
}

export function parseIdList(text, label) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ValidationError(`${label} is empty`, { label });
  }
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}
