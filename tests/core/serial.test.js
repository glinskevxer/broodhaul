import { describe, it, expect } from 'vitest';
import {
  stableStringify,
  parseJson,
  encodeNdjson,
  decodeNdjson,
  freezeRecord,
  cloneRecord,
  sameRecord,
} from '../../src/core/serial.js';

describe('stableStringify', () => {
  it('sorts keys so two runs write the same bytes', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('sorts keys inside nested objects and arrays', () => {
    expect(stableStringify({ drops: [{ y: 1, x: 2 }] })).toBe(
      '{"drops":[{"x":2,"y":1}]}'
    );
  });

  it('keeps array order, which is meaningful', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined members rather than writing null', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('keeps an explicit null', () => {
    expect(stableStringify({ a: null })).toBe('{"a":null}');
  });

  it('can indent for a file a person reads', () => {
    expect(stableStringify({ b: 1, a: 2 }, { indent: 2 })).toBe(
      '{\n  "a": 2,\n  "b": 1\n}'
    );
  });
});

describe('parseJson', () => {
  it('reads an object', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('names what it was reading when it fails', () => {
    expect(() => parseJson('{oops', 'yard file')).toThrow(
      /yard file is not valid json/
    );
  });

  it('refuses a non string', () => {
    expect(() => parseJson(null)).toThrow(/must be a string/);
  });
});

describe('encodeNdjson', () => {
  it('writes one record per line with sorted keys', () => {
    expect(encodeNdjson([{ b: 1, a: 2 }, { a: 3 }])).toBe('{"a":2,"b":1}\n{"a":3}');
  });

  it('is empty for no records', () => {
    expect(encodeNdjson([])).toBe('');
  });
});

describe('decodeNdjson', () => {
  it('reads a journal back', () => {
    expect(decodeNdjson('{"a":1}\n{"a":2}')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips blank lines anywhere in the file', () => {
    expect(decodeNdjson('\n{"a":1}\n\n{"a":2}\n')).toHaveLength(2);
  });

  it('refuses a broken line and says which one', () => {
    expect(() => decodeNdjson('{"a":1}\n{oops}\n{"a":3}')).toThrow(/journal line 2/);
  });

  it('refuses a broken last line by default', () => {
    expect(() => decodeNdjson('{"a":1}\n{"a":')).toThrow(/journal line 2/);
  });

  it('salvages the good lines when told to tolerate a torn tail', () => {
    expect(decodeNdjson('{"a":1}\n{"a":', { tolerateTail: true })).toEqual([{ a: 1 }]);
  });

  it('still refuses a broken line in the middle when tolerating a tail', () => {
    expect(() => decodeNdjson('{oops}\n{"a":1}', { tolerateTail: true })).toThrow(
      /journal line 1/
    );
  });

  it('round trips with the encoder', () => {
    const records = [{ id: 'CT-2025-0001', hives: 416 }, { id: 'CT-2025-0002' }];
    expect(decodeNdjson(encodeNdjson(records))).toEqual(records);
  });
});

describe('freezeRecord', () => {
  it('returns something a caller cannot change', () => {
    const frozen = freezeRecord({ a: 1 });
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('has the sorted key order', () => {
    expect(Object.keys(freezeRecord({ b: 1, a: 2 }))).toEqual(['a', 'b']);
  });
});

describe('cloneRecord', () => {
  it('does not share structure with the original', () => {
    const original = { drops: [{ hives: 40 }] };
    const copy = cloneRecord(original);
    copy.drops[0].hives = 1;
    expect(original.drops[0].hives).toBe(40);
  });
});

describe('sameRecord', () => {
  it('ignores key order', () => {
    expect(sameRecord({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('sees a real difference', () => {
    expect(sameRecord({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('treats a missing key and an undefined key as the same', () => {
    expect(sameRecord({ a: 1 }, { a: 1, b: undefined })).toBe(true);
  });
});
