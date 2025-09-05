import { describe, it, expect } from 'vitest';
import {
  padCell,
  renderTable,
  renderDetail,
  renderHeading,
} from '../../src/core/table.js';

describe('padCell', () => {
  it('pads on the right by default', () => {
    expect(padCell('YD-1', 8)).toBe('YD-1    ');
  });

  it('pads on the left when asked', () => {
    expect(padCell('48', 5, 'right')).toBe('   48');
  });

  it('leaves an oversized cell alone', () => {
    expect(padCell('a very long yard name', 4)).toBe('a very long yard name');
  });

  it('treats a missing value as blank', () => {
    expect(padCell(undefined, 3)).toBe('   ');
    expect(padCell(null, 3)).toBe('   ');
  });

  it('refuses an alignment it does not know', () => {
    expect(() => padCell('x', 3, 'centre')).toThrow(/must be left or right/);
  });
});

describe('renderTable', () => {
  const columns = [
    { header: 'yard', key: 'yard' },
    { header: 'hives', key: 'hives', align: 'right' },
  ];

  it('sizes each column to its widest cell', () => {
    const text = renderTable(columns, [
      { yard: 'YD-2025-0001', hives: 48 },
      { yard: 'YD-2', hives: 6 },
    ]);
    expect(text.split('\n')).toEqual([
      'yard          hives',
      '------------  -----',
      'YD-2025-0001     48',
      'YD-2              6',
    ]);
  });

  it('keeps the header wide enough when every cell is short', () => {
    const text = renderTable(columns, [{ yard: 'A', hives: 1 }]);
    expect(text.split('\n')[0]).toBe('yard  hives');
  });

  it('can leave the rule out', () => {
    const text = renderTable(columns, [{ yard: 'A', hives: 1 }], { rule: false });
    expect(text.split('\n')).toHaveLength(2);
  });

  it('renders a header only table when there are no records', () => {
    expect(renderTable(columns, [])).toBe('yard  hives\n----  -----');
  });

  it('runs a column formatter over the value', () => {
    const text = renderTable(
      [{ header: 'rate', key: 'cents', format: (value) => `$${value / 100}` }],
      [{ cents: 20500 }]
    );
    expect(text.split('\n')[2]).toBe('$205');
  });

  it('gives a value column the whole record', () => {
    const text = renderTable(
      [
        {
          header: 'note',
          value: (record) => `${record.hives} at ${record.yard}`,
        },
      ],
      [{ yard: 'YD-9', hives: 12 }]
    );
    expect(text.split('\n')[2]).toBe('12 at YD-9');
  });

  it('leaves a missing key blank', () => {
    const text = renderTable(columns, [{ yard: 'A' }]);
    expect(text.split('\n')[2]).toBe('A');
  });

  it('trims trailing spaces so the file has no ragged right edge', () => {
    const text = renderTable(columns, [{ yard: 'YD-2025-0001', hives: 1 }]);
    for (const line of text.split('\n')) {
      expect(line).toBe(line.replace(/\s+$/, ''));
    }
  });

  it('refuses a table with no columns', () => {
    expect(() => renderTable([], [])).toThrow(/at least one column/);
  });
});

describe('renderDetail', () => {
  it('lines the values up', () => {
    expect(
      renderDetail([
        ['contract', 'CT-2025-0007'],
        ['grower', 'Wilkins'],
      ])
    ).toBe('contract  CT-2025-0007\ngrower    Wilkins');
  });

  it('is empty on no pairs', () => {
    expect(renderDetail([])).toBe('');
  });

  it('leaves a missing value blank without trailing space', () => {
    expect(renderDetail([['grower', undefined]])).toBe('grower');
  });
});

describe('renderHeading', () => {
  it('underlines to the width of the text', () => {
    expect(renderHeading('grading run')).toBe('grading run\n===========');
  });

  it('takes another underline character', () => {
    expect(renderHeading('totals', { underline: '-' })).toBe('totals\n------');
  });
});
