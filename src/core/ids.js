import { ValidationError } from './errors.js';

/**
 * Identifiers used on paperwork.
 *
 * Every one of these ends up handwritten on a pallet tag, a load sheet or a
 * grading slip at six in the morning, so they are short, uppercase, and use a
 * prefix that says what the thing is. A driver reading `LD-2025-0143` off a
 * clipboard should not have to ask which office it came from.
 */

const PREFIXES = {
  yard: 'YD',
  colony: 'CY',
  pallet: 'PL',
  contract: 'CT',
  block: 'BK',
  drop: 'DR',
  load: 'LD',
  grading: 'GR',
  treatment: 'TR',
  lot: 'HL',
  invoice: 'IN',
  inspection: 'IS',
};

const SEQUENCE_WIDTH = 4;

export function idPrefix(kind) {
  const prefix = PREFIXES[kind];
  if (!prefix) {
    throw new ValidationError(`no identifier prefix for ${kind}`, {
      kind,
      known: Object.keys(PREFIXES).sort(),
    });
  }
  return prefix;
}

/** `CT-2025-0007`, the shape used on every contract in the file cabinet. */
export function makeId(kind, season, sequence) {
  const prefix = idPrefix(kind);
  if (!Number.isInteger(season) || season < 2000 || season > 2999) {
    throw new ValidationError('season must be a four digit year', { season });
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new ValidationError('sequence must be a positive whole number', { sequence });
  }
  const digits = String(sequence);
  if (digits.length > SEQUENCE_WIDTH) {
    throw new ValidationError(`sequence ${sequence} does not fit in four digits`, {
      sequence,
    });
  }
  return `${prefix}-${season}-${digits.padStart(SEQUENCE_WIDTH, '0')}`;
}

const ID_PATTERN = /^([A-Z]{2})-(\d{4})-(\d{4})$/;

export function parseId(id, expectedKind) {
  if (typeof id !== 'string') {
    throw new ValidationError('identifier must be a string', { got: typeof id });
  }
  const match = ID_PATTERN.exec(id.trim());
  if (!match) {
    throw new ValidationError(`identifier is not in the office format: ${id}`, { id });
  }
  const [, prefix, season, sequence] = match;
  const kind = Object.keys(PREFIXES).find((name) => PREFIXES[name] === prefix);
  if (!kind) {
    throw new ValidationError(`unknown identifier prefix ${prefix}`, { id, prefix });
  }
  if (expectedKind !== undefined && kind !== expectedKind) {
    throw new ValidationError(`expected a ${expectedKind} identifier, got ${kind}`, {
      id,
      kind,
      expectedKind,
    });
  }
  return { kind, season: Number(season), sequence: Number(sequence), id: id.trim() };
}

export function isId(value, expectedKind) {
  try {
    parseId(value, expectedKind);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next free sequence number in a season, given the identifiers already issued.
 * Gaps are not reused: a torn up contract keeps its number so the file stays
 * in order.
 */
export function nextSequence(existing, kind, season) {
  const used = existing
    .filter((id) => isId(id, kind))
    .map((id) => parseId(id, kind))
    .filter((parsed) => parsed.season === season)
    .map((parsed) => parsed.sequence);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

export function issueId(existing, kind, season) {
  return makeId(kind, season, nextSequence(existing, kind, season));
}

/** Sort key that puts a season's identifiers in issue order. */
export function idSortKey(id) {
  const parsed = parseId(id);
  return `${parsed.kind}-${parsed.season}-${String(parsed.sequence).padStart(6, '0')}`;
}
