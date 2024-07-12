import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  formatCsv,
  formatCsvRecords,
  parseCsv,
  parseCsvRecords,
} from '../../src/core/csv.js';

describe('escapeCsvField', () => {
  it('leaves a plain field alone', () => {
    expect(escapeCsvField('almond')).toBe('almond');
  });

  it('quotes a field holding the delimiter', () => {
    expect(escapeCsvField('Wilkins, R and Sons')).toBe('"Wilkins, R and Sons"');
  });

  it('doubles an embedded quote', () => {
    expect(escapeCsvField('the "home" yard')).toBe('"the ""home"" yard"');
  });

  it('quotes across a newline', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('turns null and undefined into an empty field', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('stringifies numbers', () => {
    expect(escapeCsvField(8.25)).toBe('8.25');
  });
});

describe('formatCsv', () => {
  it('writes rows', () => {
    expect(
      formatCsv([
        ['yard', 'hives'],
        ['YD-2025-0001', 48],
      ])
    ).toBe('yard,hives\nYD-2025-0001,48');
  });

  it('takes another delimiter', () => {
    expect(formatCsv([['a', 'b']], { delimiter: '\t' })).toBe('a\tb');
  });
});

describe('formatCsvRecords', () => {
  it('writes the header then the chosen columns in order', () => {
    const records = [
      { yard: 'YD-2025-0001', hives: 48, crop: 'almond' },
      { yard: 'YD-2025-0002', hives: 32, crop: 'cherry' },
    ];
    expect(formatCsvRecords(records, ['crop', 'hives'])).toBe(
      'crop,hives\nalmond,48\ncherry,32'
    );
  });

  it('leaves a missing key blank rather than writing undefined', () => {
    expect(formatCsvRecords([{ a: 1 }], ['a', 'b'])).toBe('a,b\n1,');
  });
});

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads a quoted field holding a comma', () => {
    expect(parseCsv('name,acres\n"Wilkins, R and Sons",120')).toEqual([
      ['name', 'acres'],
      ['Wilkins, R and Sons', '120'],
    ]);
  });

  it('reads a doubled quote back as one', () => {
    expect(parseCsv('note\n"the ""home"" yard"')).toEqual([
      ['note'],
      ['the "home" yard'],
    ]);
  });

  it('reads a newline inside a quoted field', () => {
    expect(parseCsv('note\n"line one\nline two"')).toEqual([
      ['note'],
      ['line one\nline two'],
    ]);
  });

  it('survives carriage returns from a Windows spreadsheet', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps an empty trailing field', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('refuses a file that ends inside a quote', () => {
    expect(() => parseCsv('a\n"unterminated')).toThrow(/ends inside a quoted field/);
  });

  it('refuses a non string', () => {
    expect(() => parseCsv(null)).toThrow(/must be a string/);
  });
});

describe('parseCsvRecords', () => {
  it('keys the rows by the header', () => {
    expect(parseCsvRecords('yard,hives\nYD-2025-0001,48')).toEqual([
      { yard: 'YD-2025-0001', hives: '48' },
    ]);
  });

  it('trims the header names', () => {
    expect(parseCsvRecords(' yard , hives \nA,1')).toEqual([{ yard: 'A', hives: '1' }]);
  });

  it('ignores a blank trailing line', () => {
    expect(parseCsvRecords('yard,hives\nA,1\n')).toHaveLength(1);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsvRecords('')).toEqual([]);
  });

  it('names the line when the field count is wrong', () => {
    expect(() => parseCsvRecords('a,b\n1,2\n3')).toThrow(
      /csv line 3 has 1 fields, header has 2/
    );
  });

  it('refuses a repeated header name', () => {
    expect(() => parseCsvRecords('a,a\n1,2')).toThrow(/header repeats a/);
  });

  it('round trips with the formatter', () => {
    const records = [
      { yard: 'YD-2025-0001', note: 'the "home" yard, north end' },
      { yard: 'YD-2025-0002', note: '' },
    ];
    const text = formatCsvRecords(records, ['yard', 'note']);
    expect(parseCsvRecords(text)).toEqual(records);
  });
});
