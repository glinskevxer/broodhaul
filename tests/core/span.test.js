import { describe, it, expect } from 'vitest';
import {
  makeSpan,
  spanDays,
  spanContains,
  spansOverlap,
  spanIntersection,
  spansAdjacent,
  mergeSpans,
  subtractSpan,
  spansCover,
  formatSpan,
} from '../../src/core/span.js';

const span = (start, end) => makeSpan(start, end);

describe('makeSpan', () => {
  it('keeps a one day span', () => {
    expect(span('2025-02-14', '2025-02-14')).toEqual({
      start: '2025-02-14',
      end: '2025-02-14',
    });
  });

  it('refuses a backwards span', () => {
    expect(() => span('2025-02-15', '2025-02-14')).toThrow(/ends before it starts/);
  });

  it('validates both ends', () => {
    expect(() => span('2025-02-30', '2025-03-01')).toThrow(/span start/);
    expect(() => span('2025-02-01', 'later')).toThrow(/span end/);
  });
});

describe('spanDays', () => {
  it('counts both ends', () => {
    expect(spanDays(span('2025-02-14', '2025-02-14'))).toBe(1);
    expect(spanDays(span('2025-02-01', '2025-02-28'))).toBe(28);
  });
});

describe('spanContains', () => {
  it('includes both ends', () => {
    const bloom = span('2025-02-10', '2025-03-05');
    expect(spanContains(bloom, '2025-02-10')).toBe(true);
    expect(spanContains(bloom, '2025-03-05')).toBe(true);
    expect(spanContains(bloom, '2025-02-09')).toBe(false);
    expect(spanContains(bloom, '2025-03-06')).toBe(false);
  });
});

describe('spansOverlap', () => {
  it('sees a one day touch as an overlap', () => {
    const left = span('2025-02-01', '2025-02-10');
    const right = span('2025-02-10', '2025-02-20');
    expect(spansOverlap(left, right)).toBe(true);
  });

  it('sees a one day gap as no overlap', () => {
    const left = span('2025-02-01', '2025-02-10');
    const right = span('2025-02-12', '2025-02-20');
    expect(spansOverlap(left, right)).toBe(false);
  });
});

describe('spanIntersection', () => {
  it('returns the shared days', () => {
    const shared = spanIntersection(
      span('2025-02-01', '2025-02-20'),
      span('2025-02-10', '2025-03-01')
    );
    expect(shared).toEqual({ start: '2025-02-10', end: '2025-02-20' });
  });

  it('returns the inner span when one contains the other', () => {
    const shared = spanIntersection(
      span('2025-02-01', '2025-03-01'),
      span('2025-02-10', '2025-02-12')
    );
    expect(shared).toEqual({ start: '2025-02-10', end: '2025-02-12' });
  });

  it('returns null when they miss', () => {
    const shared = spanIntersection(
      span('2025-02-01', '2025-02-05'),
      span('2025-02-07', '2025-02-09')
    );
    expect(shared).toBeNull();
  });
});

describe('spansAdjacent', () => {
  it('joins two spans separated by nothing', () => {
    const left = span('2025-02-01', '2025-02-10');
    const right = span('2025-02-11', '2025-02-20');
    expect(spansAdjacent(left, right)).toBe(true);
  });

  it('works in either order', () => {
    const left = span('2025-02-11', '2025-02-20');
    const right = span('2025-02-01', '2025-02-10');
    expect(spansAdjacent(left, right)).toBe(true);
  });

  it('does not join across a gap', () => {
    const left = span('2025-02-01', '2025-02-10');
    const right = span('2025-02-12', '2025-02-20');
    expect(spansAdjacent(left, right)).toBe(false);
  });
});

describe('mergeSpans', () => {
  it('is empty on nothing', () => {
    expect(mergeSpans([])).toEqual([]);
  });

  it('joins overlapping and touching spans and sorts the result', () => {
    const merged = mergeSpans([
      span('2025-03-01', '2025-03-05'),
      span('2025-02-01', '2025-02-10'),
      span('2025-02-08', '2025-02-14'),
      span('2025-02-15', '2025-02-20'),
    ]);
    expect(merged).toEqual([
      { start: '2025-02-01', end: '2025-02-20' },
      { start: '2025-03-01', end: '2025-03-05' },
    ]);
  });

  it('keeps a swallowed span from shortening the one that holds it', () => {
    const merged = mergeSpans([
      span('2025-02-01', '2025-02-28'),
      span('2025-02-10', '2025-02-12'),
    ]);
    expect(merged).toEqual([{ start: '2025-02-01', end: '2025-02-28' }]);
  });
});

describe('subtractSpan', () => {
  it('returns the original when the cut misses', () => {
    const left = subtractSpan(
      span('2025-02-01', '2025-02-10'),
      span('2025-03-01', '2025-03-02')
    );
    expect(left).toEqual([{ start: '2025-02-01', end: '2025-02-10' }]);
  });

  it('leaves a head and a tail when the cut is inside', () => {
    const left = subtractSpan(
      span('2025-02-01', '2025-02-28'),
      span('2025-02-10', '2025-02-12')
    );
    expect(left).toEqual([
      { start: '2025-02-01', end: '2025-02-09' },
      { start: '2025-02-13', end: '2025-02-28' },
    ]);
  });

  it('leaves nothing when the cut covers everything', () => {
    const left = subtractSpan(
      span('2025-02-10', '2025-02-12'),
      span('2025-02-01', '2025-02-28')
    );
    expect(left).toEqual([]);
  });

  it('trims one end', () => {
    const left = subtractSpan(
      span('2025-02-01', '2025-02-28'),
      span('2025-02-20', '2025-03-10')
    );
    expect(left).toEqual([{ start: '2025-02-01', end: '2025-02-19' }]);
  });
});

describe('spansCover', () => {
  it('is true when two spans meet inside the target', () => {
    const covered = spansCover(
      [span('2025-02-01', '2025-02-14'), span('2025-02-15', '2025-03-01')],
      span('2025-02-01', '2025-03-01')
    );
    expect(covered).toBe(true);
  });

  it('is false when a single day is missing', () => {
    const covered = spansCover(
      [span('2025-02-01', '2025-02-14'), span('2025-02-16', '2025-03-01')],
      span('2025-02-01', '2025-03-01')
    );
    expect(covered).toBe(false);
  });

  it('is false when nothing is offered', () => {
    expect(spansCover([], span('2025-02-01', '2025-02-02'))).toBe(false);
  });
});

describe('formatSpan', () => {
  it('reads the way the office says it', () => {
    expect(formatSpan(span('2025-02-01', '2025-03-01'))).toBe(
      '2025-02-01 to 2025-03-01'
    );
  });
});
