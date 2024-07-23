import { ValidationError } from './errors.js';

/**
 * Serialisation with a fixed key order.
 *
 * The desk writes its records to disk as JSON and its journal as one JSON
 * object per line. Both get committed to a share that two offices sync, so a
 * file that changes only because the keys came out in a different order is a
 * false conflict every time somebody reruns a report.
 */

function orderValue(value) {
  if (Array.isArray(value)) return value.map(orderValue);
  if (value !== null && typeof value === 'object') {
    const ordered = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      ordered[key] = orderValue(child);
    }
    return ordered;
  }
  return value;
}

export function stableStringify(value, { indent = 0 } = {}) {
  return JSON.stringify(orderValue(value), null, indent);
}

export function parseJson(text, what = 'json') {
  if (typeof text !== 'string') {
    throw new ValidationError(`${what} must be a string`, { what });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ValidationError(`${what} is not valid json: ${err.message}`, { what });
  }
}

export function encodeNdjson(records) {
  return records.map((record) => stableStringify(record)).join('\n');
}

/**
 * Decode a journal. A half written last line is a real thing after a power cut
 * in the honey house, so the caller gets to say whether to salvage what came
 * before it or refuse the file outright.
 */
export function decodeNdjson(text, { tolerateTail = false } = {}) {
  const lines = text.split('\n');
  const records = [];
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at].trim();
    if (line === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      const isLast = at === lines.length - 1;
      if (isLast && tolerateTail) break;
      throw new ValidationError(
        `journal line ${at + 1} is not valid json: ${err.message}`,
        {
          line: at + 1,
        }
      );
    }
  }
  return records;
}

/** Deep copy through the ordered form, so callers cannot mutate a stored record. */
export function freezeRecord(value) {
  return Object.freeze(orderValue(value));
}

export function cloneRecord(value) {
  return orderValue(value);
}

/** True when two records serialise identically, which is how the desk compares them. */
export function sameRecord(left, right) {
  return stableStringify(left) === stableStringify(right);
}
