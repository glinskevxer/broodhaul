import { ValidationError } from './errors.js';

/**
 * CSV in and out.
 *
 * Growers send acreage and block lists as spreadsheets, the bee broker sends
 * grading sheets, and the state inspector wants a hive count file. All of it
 * arrives as CSV with quoted commas in the grower names and a stray carriage
 * return from whichever Windows machine typed it, so this parser handles both
 * rather than assuming a clean file.
 */

export function escapeCsvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatCsv(rows, { delimiter = ',', newline = '\n' } = {}) {
  return rows.map((row) => row.map(escapeCsvField).join(delimiter)).join(newline);
}

export function formatCsvRecords(records, columns, options = {}) {
  const rows = [columns, ...records.map((record) => columns.map((key) => record[key]))];
  return formatCsv(rows, options);
}

export function parseCsv(text, { delimiter = ',' } = {}) {
  if (typeof text !== 'string') {
    throw new ValidationError('csv input must be a string', { got: typeof text });
  }
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }
    field += char;
    started = true;
    index += 1;
  }
  if (quoted) {
    throw new ValidationError('csv input ends inside a quoted field', {});
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

/** Rows keyed by the header line, with the blank trailing line ignored. */
export function parseCsvRecords(text, options = {}) {
  const rows = parseCsv(text, options).filter(
    (row) => row.length > 1 || row[0].trim() !== ''
  );
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const columns = header.map((name) => name.trim());
  const duplicates = columns.filter((name, at) => columns.indexOf(name) !== at);
  if (duplicates.length > 0) {
    throw new ValidationError(`csv header repeats ${duplicates[0]}`, { duplicates });
  }
  return body.map((values, line) => {
    if (values.length !== columns.length) {
      throw new ValidationError(
        `csv line ${line + 2} has ${values.length} fields, header has ${columns.length}`,
        { line: line + 2, fields: values.length, columns: columns.length }
      );
    }
    return Object.fromEntries(columns.map((name, at) => [name, values[at]]));
  });
}
