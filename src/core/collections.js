import { ConflictError, ValidationError } from './errors.js';

/**
 * Small list helpers. Every report in the desk groups something by yard, by
 * grower or by day and then totals it, and the ordering has to be stable or
 * two runs of the same report disagree and somebody has to work out which one
 * the grower was sent.
 */

/** Sort by a list of key functions, ascending, ties broken by the next key. */
export function sortBy(items, ...keyFns) {
  return [...items].sort((left, right) => {
    for (const keyFn of keyFns) {
      const a = keyFn(left);
      const b = keyFn(right);
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  });
}

export function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** One item per key. A repeated key is a data problem, not a silent overwrite. */
export function indexBy(items, keyFn, kind = 'record') {
  const index = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (index.has(key)) {
      throw new ConflictError(`two ${kind} entries share the key ${key}`, {
        key,
        kind,
      });
    }
    index.set(key, item);
  }
  return index;
}

export function partition(items, predicate) {
  const kept = [];
  const rest = [];
  for (const item of items) {
    (predicate(item) ? kept : rest).push(item);
  }
  return [kept, rest];
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function sumBy(items, valueFn) {
  return items.reduce((total, item) => total + valueFn(item), 0);
}

export function maxBy(items, valueFn) {
  if (items.length === 0) return undefined;
  return items.reduce((best, item) => (valueFn(item) > valueFn(best) ? item : best));
}

export function minBy(items, valueFn) {
  if (items.length === 0) return undefined;
  return items.reduce((best, item) => (valueFn(item) < valueFn(best) ? item : best));
}

export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new ValidationError('chunk size must be a positive whole number', { size });
  }
  const chunks = [];
  for (let at = 0; at < items.length; at += size) {
    chunks.push(items.slice(at, at + size));
  }
  return chunks;
}

/** Every key present in either map, sorted, so two totals can be compared row by row. */
export function alignKeys(...maps) {
  const keys = new Set();
  for (const map of maps) {
    for (const key of map.keys()) keys.add(key);
  }
  return [...keys].sort();
}
