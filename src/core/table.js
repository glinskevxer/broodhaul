import { ValidationError } from './errors.js';

/**
 * Plain text tables for the terminal and for the sheets that get printed and
 * taped to the shop wall. No colour and no box drawing characters, because
 * half of these get faxed to a grower and the rest get read over a phone.
 */

const ALIGNMENTS = ['left', 'right'];

export function padCell(text, width, align = 'left') {
  if (!ALIGNMENTS.includes(align)) {
    throw new ValidationError(`alignment must be left or right, got ${align}`, {
      align,
    });
  }
  const value = text === null || text === undefined ? '' : String(text);
  if (value.length >= width) return value;
  const filler = ' '.repeat(width - value.length);
  return align === 'right' ? filler + value : value + filler;
}

function columnWidths(columns, rows) {
  return columns.map((column, at) => {
    const cells = rows.map((row) => String(row[at] ?? ''));
    return Math.max(column.header.length, ...cells.map((cell) => cell.length), 1);
  });
}

/**
 * `columns` is a list of `{ header, key, align }`. Anything not listed in the
 * columns is left out, so the same record can feed a wide office report and a
 * narrow one for the truck.
 */
export function renderTable(columns, records, { rule = true } = {}) {
  if (columns.length === 0) {
    throw new ValidationError('a table needs at least one column', {});
  }
  const rows = records.map((record) =>
    columns.map((column) => {
      const value = column.format
        ? column.format(record[column.key], record)
        : record[column.key];
      return value === null || value === undefined ? '' : String(value);
    })
  );
  const widths = columnWidths(columns, rows);
  const lines = [];
  lines.push(
    columns
      .map((column, at) => padCell(column.header, widths[at], column.align))
      .join('  ')
  );
  if (rule) {
    lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  }
  for (const row of rows) {
    lines.push(
      row.map((cell, at) => padCell(cell, widths[at], columns[at].align)).join('  ')
    );
  }
  return lines.map((line) => line.replace(/\s+$/, '')).join('\n');
}

/** Two column label and value block, used for anything that is not a list. */
export function renderDetail(pairs) {
  if (pairs.length === 0) return '';
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs
    .map(([label, value]) =>
      `${padCell(label, width)}  ${value ?? ''}`.replace(/\s+$/, '')
    )
    .join('\n');
}

export function renderHeading(text, { underline = '=' } = {}) {
  return `${text}\n${underline.repeat(text.length)}`;
}
