import { ValidationError } from './errors.js';

/**
 * Wrapping text for paper.
 *
 * The documents that leave the office get folded into quarters and read in a
 * truck, so a note that runs off the right edge is a note nobody reads. Sixty
 * four characters is what fits on the printer in the shop with the margins it
 * has, and every document uses that width rather than picking its own.
 */

export const PAGE_WIDTH = 64;

export function wrapText(text, width = PAGE_WIDTH) {
  if (typeof text !== 'string') {
    throw new ValidationError('wrap needs a string', { got: typeof text });
  }
  if (!Number.isInteger(width) || width < 8 || width > 200) {
    throw new ValidationError('width must be a whole number from 8 to 200', { width });
  }
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (line === '') {
        line = word;
        continue;
      }
      if (line.length + 1 + word.length <= width) {
        line = `${line} ${word}`;
        continue;
      }
      lines.push(line);
      line = word;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Cut a value to fit a column, with an ellipsis a person can see. */
export function truncate(text, width) {
  const value = text === null || text === undefined ? '' : String(text);
  if (!Number.isInteger(width) || width < 4) {
    throw new ValidationError('truncate needs a width of at least 4', { width });
  }
  if (value.length <= width) return value;
  return `${value.slice(0, width - 3)}...`;
}

export function indent(text, spaces = 2) {
  if (!Number.isInteger(spaces) || spaces < 0 || spaces > 20) {
    throw new ValidationError('indent must be a whole number from 0 to 20', { spaces });
  }
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line === '' ? '' : `${pad}${line}`))
    .join('\n');
}

/** A block of text under a label, wrapped and indented, as the documents use it. */
export function noteBlock(label, text, width = PAGE_WIDTH) {
  if (text === undefined || text === null || String(text).trim() === '') return '';
  return `${label}\n${indent(wrapText(String(text), width - 2))}`;
}

export function padTo(text, width) {
  const value = text === null || text === undefined ? '' : String(text);
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

export function centre(text, width = PAGE_WIDTH) {
  const value = String(text);
  if (value.length >= width) return value;
  const left = Math.floor((width - value.length) / 2);
  return `${' '.repeat(left)}${value}`;
}
