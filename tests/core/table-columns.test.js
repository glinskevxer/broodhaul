import { describe, it, expect } from 'vitest';
import { renderTable } from '../../src/core/table.js';

/**
 * The column shapes, on their own. A derived column used to have to name a
 * field it did not read, and three of them named the wrong one without any
 * test noticing, because the formatter ignored the value it was handed.
 */

const records = [
  { id: 'YD-2025-0001', capacity: 96, boxes: { deeps: 2, mediums: 1 } },
  { id: 'YD-2025-0002', capacity: 48, boxes: { deeps: 1, mediums: 0 } },
];

describe('a key column', () => {
  it('reads the field', () => {
    const text = renderTable([{ header: 'yard', key: 'id' }], records);
    expect(text.split('\n')[2]).toBe('YD-2025-0001');
  });

  it('formats what it read', () => {
    const text = renderTable(
      [{ header: 'capacity', key: 'capacity', format: (value) => `${value} hives` }],
      records
    );
    expect(text.split('\n')[2]).toBe('96 hives');
  });

  it('is blank when the field is missing', () => {
    const text = renderTable([{ header: 'note', key: 'note' }], records);
    expect(text.split('\n')[2]).toBe('');
  });
});

describe('a value column', () => {
  it('reads the whole record', () => {
    const text = renderTable(
      [
        {
          header: 'boxes',
          value: (record) => record.boxes.deeps + record.boxes.mediums,
        },
      ],
      records
    );
    expect(text.split('\n')[2]).toBe('3');
    expect(text.split('\n')[3]).toBe('1');
  });

  it('formats what the accessor returned', () => {
    const text = renderTable(
      [
        {
          header: 'boxes',
          value: (record) => record.boxes.deeps,
          format: (value) => `${value} deep`,
        },
      ],
      records
    );
    expect(text.split('\n')[2]).toBe('2 deep');
  });

  it('wins over a key when both are given', () => {
    const text = renderTable(
      [{ header: 'both', key: 'capacity', value: () => 'from the accessor' }],
      records
    );
    expect(text.split('\n')[2]).toBe('from the accessor');
  });

  it('is blank when the accessor returns nothing', () => {
    const text = renderTable([{ header: 'nothing', value: () => undefined }], records);
    expect(text.split('\n')[2]).toBe('');
  });

  it('takes an alignment like any other column', () => {
    const text = renderTable(
      [
        { header: 'yard', key: 'id' },
        { header: 'boxes', align: 'right', value: (record) => record.boxes.deeps },
      ],
      records
    );
    expect(text.split('\n')[2]).toBe('YD-2025-0001      2');
  });
});
