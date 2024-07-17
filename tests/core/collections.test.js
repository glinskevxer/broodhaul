import { describe, it, expect } from 'vitest';
import {
  sortBy,
  groupBy,
  indexBy,
  partition,
  uniqueBy,
  countBy,
  sumBy,
  maxBy,
  minBy,
  chunk,
  alignKeys,
} from '../../src/core/collections.js';

const drops = [
  { yard: 'YD-3', grower: 'wilkins', hives: 40 },
  { yard: 'YD-1', grower: 'wilkins', hives: 24 },
  { yard: 'YD-2', grower: 'ackerman', hives: 40 },
  { yard: 'YD-1', grower: 'ackerman', hives: 12 },
];

describe('sortBy', () => {
  it('sorts on one key without touching the input', () => {
    const sorted = sortBy(drops, (drop) => drop.yard);
    expect(sorted.map((drop) => drop.yard)).toEqual(['YD-1', 'YD-1', 'YD-2', 'YD-3']);
    expect(drops[0].yard).toBe('YD-3');
  });

  it('breaks ties with the next key', () => {
    const sorted = sortBy(
      drops,
      (drop) => drop.yard,
      (drop) => drop.grower
    );
    expect(sorted.slice(0, 2).map((drop) => drop.grower)).toEqual([
      'ackerman',
      'wilkins',
    ]);
  });

  it('is stable when every key ties', () => {
    const sorted = sortBy(drops, () => 1);
    expect(sorted).toEqual(drops);
  });
});

describe('groupBy', () => {
  it('keeps each group in the order it was seen', () => {
    const groups = groupBy(drops, (drop) => drop.grower);
    expect([...groups.keys()]).toEqual(['wilkins', 'ackerman']);
    expect(groups.get('wilkins').map((drop) => drop.yard)).toEqual(['YD-3', 'YD-1']);
  });

  it('is empty on an empty list', () => {
    expect(groupBy([], (item) => item).size).toBe(0);
  });
});

describe('indexBy', () => {
  it('keys the records', () => {
    const index = indexBy(
      [
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
      ],
      (item) => item.id
    );
    expect(index.get('b').n).toBe(2);
  });

  it('refuses a repeated key and names the kind', () => {
    expect(() => indexBy(drops, (drop) => drop.yard, 'drop')).toThrow(
      /two drop entries share the key YD-1/
    );
  });
});

describe('partition', () => {
  it('splits and keeps order in both halves', () => {
    const [big, small] = partition(drops, (drop) => drop.hives >= 40);
    expect(big.map((drop) => drop.yard)).toEqual(['YD-3', 'YD-2']);
    expect(small.map((drop) => drop.yard)).toEqual(['YD-1', 'YD-1']);
  });

  it('puts everything on one side when the predicate never changes', () => {
    expect(partition(drops, () => false)[0]).toEqual([]);
  });
});

describe('uniqueBy', () => {
  it('keeps the first of each key', () => {
    const unique = uniqueBy(drops, (drop) => drop.yard);
    expect(unique.map((drop) => drop.yard)).toEqual(['YD-3', 'YD-1', 'YD-2']);
    expect(unique[1].grower).toBe('wilkins');
  });
});

describe('countBy', () => {
  it('counts each key', () => {
    const counts = countBy(drops, (drop) => drop.grower);
    expect(counts.get('wilkins')).toBe(2);
    expect(counts.get('ackerman')).toBe(2);
  });
});

describe('sumBy', () => {
  it('totals a field', () => {
    expect(sumBy(drops, (drop) => drop.hives)).toBe(116);
  });

  it('is zero on nothing', () => {
    expect(sumBy([], (drop) => drop.hives)).toBe(0);
  });
});

describe('maxBy and minBy', () => {
  it('find the ends', () => {
    expect(maxBy(drops, (drop) => drop.hives).yard).toBe('YD-3');
    expect(minBy(drops, (drop) => drop.hives).yard).toBe('YD-1');
  });

  it('keep the first on a tie', () => {
    expect(maxBy(drops, (drop) => drop.hives).grower).toBe('wilkins');
  });

  it('return nothing for an empty list', () => {
    expect(maxBy([], (item) => item)).toBeUndefined();
    expect(minBy([], (item) => item)).toBeUndefined();
  });
});

describe('chunk', () => {
  it('splits into loads', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('refuses a size below one', () => {
    expect(() => chunk([1], 0)).toThrow(/positive whole number/);
    expect(() => chunk([1], 1.5)).toThrow(/positive whole number/);
  });
});

describe('alignKeys', () => {
  it('unions and sorts', () => {
    const left = new Map([
      ['b', 1],
      ['a', 2],
    ]);
    const right = new Map([['c', 3]]);
    expect(alignKeys(left, right)).toEqual(['a', 'b', 'c']);
  });

  it('is empty when nothing is given', () => {
    expect(alignKeys()).toEqual([]);
  });
});
