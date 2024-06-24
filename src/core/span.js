import { ValidationError } from './errors.js';
import { addDays, compareDates, diffDays, parseDate } from './dates.js';

/**
 * Inclusive day ranges.
 *
 * Contracts, bloom, treatment withdrawal and permit validity are all stated as
 * "from this day through that day", both ends counted. Half open ranges keep
 * being tempting and keep producing a one day argument with a grower, so the
 * whole codebase uses inclusive spans and says so.
 */

export function makeSpan(start, end) {
  const from = parseDate(start, 'span start');
  const to = parseDate(end, 'span end');
  if (compareDates(from, to) > 0) {
    throw new ValidationError('span ends before it starts', { start: from, end: to });
  }
  return { start: from, end: to };
}

export function spanDays(span) {
  return diffDays(span.start, span.end) + 1;
}

export function spanContains(span, date) {
  const day = parseDate(date);
  return compareDates(span.start, day) <= 0 && compareDates(day, span.end) <= 0;
}

export function spansOverlap(left, right) {
  return (
    compareDates(left.start, right.end) <= 0 && compareDates(right.start, left.end) <= 0
  );
}

export function spanIntersection(left, right) {
  if (!spansOverlap(left, right)) return null;
  const start = compareDates(left.start, right.start) >= 0 ? left.start : right.start;
  const end = compareDates(left.end, right.end) <= 0 ? left.end : right.end;
  return makeSpan(start, end);
}

/** True when the two spans touch or overlap, so they can be stated as one. */
export function spansAdjacent(left, right) {
  if (spansOverlap(left, right)) return true;
  return addDays(left.end, 1) === right.start || addDays(right.end, 1) === left.start;
}

export function mergeSpans(spans) {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort(
    (a, b) => compareDates(a.start, b.start) || compareDates(a.end, b.end)
  );
  const merged = [sorted[0]];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (spansAdjacent(last, span)) {
      merged[merged.length - 1] = makeSpan(
        last.start,
        compareDates(last.end, span.end) >= 0 ? last.end : span.end
      );
    } else {
      merged.push(span);
    }
  }
  return merged;
}

/** What is left of `span` once `cut` is taken out of it. Zero, one or two spans. */
export function subtractSpan(span, cut) {
  if (!spansOverlap(span, cut)) return [makeSpan(span.start, span.end)];
  const pieces = [];
  if (compareDates(span.start, cut.start) < 0) {
    pieces.push(makeSpan(span.start, addDays(cut.start, -1)));
  }
  if (compareDates(cut.end, span.end) < 0) {
    pieces.push(makeSpan(addDays(cut.end, 1), span.end));
  }
  return pieces;
}

/** True when the spans between them leave no gap inside `target`. */
export function spansCover(spans, target) {
  let remaining = [makeSpan(target.start, target.end)];
  for (const span of spans) {
    remaining = remaining.flatMap((piece) => subtractSpan(piece, span));
    if (remaining.length === 0) return true;
  }
  return remaining.length === 0;
}

export function formatSpan(span) {
  return `${span.start} to ${span.end}`;
}
