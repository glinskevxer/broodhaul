import { describe, it, expect } from 'vitest';
import {
  PAGE_WIDTH,
  wrapText,
  truncate,
  indent,
  noteBlock,
  padTo,
  centre,
} from '../../src/core/text.js';

describe('wrapText', () => {
  it('leaves a short line alone', () => {
    expect(wrapText('gate is on the canal side')).toBe('gate is on the canal side');
  });

  it('breaks at the width', () => {
    const text = wrapText('one two three four five', 9);
    expect(text.split('\n')).toEqual(['one two', 'three', 'four five']);
  });

  it('never returns a line over the width', () => {
    const long =
      'the gate is on the canal side and the combination is four four one two';
    for (const line of wrapText(long, 20).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it('keeps a word longer than the width on its own line', () => {
    expect(wrapText('short unbreakablewordhere', 10).split('\n')).toEqual([
      'short',
      'unbreakablewordhere',
    ]);
  });

  it('keeps paragraph breaks', () => {
    expect(wrapText('one\n\ntwo', 20).split('\n')).toEqual(['one', '', 'two']);
  });

  it('collapses runs of spaces', () => {
    expect(wrapText('one   two')).toBe('one two');
  });

  it('uses the page width by default', () => {
    expect(PAGE_WIDTH).toBe(64);
    const long = 'word '.repeat(30).trim();
    for (const line of wrapText(long).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(PAGE_WIDTH);
    }
  });

  it('refuses a width nobody prints at', () => {
    expect(() => wrapText('x', 4)).toThrow(/from 8 to 200/);
    expect(() => wrapText('x', 400)).toThrow(/from 8 to 200/);
  });

  it('refuses something that is not a string', () => {
    expect(() => wrapText(7)).toThrow(/needs a string/);
  });
});

describe('truncate', () => {
  it('leaves a short value alone', () => {
    expect(truncate('YD-2025-0001', 20)).toBe('YD-2025-0001');
  });

  it('cuts a long one and marks it', () => {
    expect(truncate('Dinuba home place north', 10)).toBe('Dinuba ...');
  });

  it('never returns more than the width', () => {
    for (const width of [4, 8, 12]) {
      expect(
        truncate('a very long yard name indeed', width).length
      ).toBeLessThanOrEqual(width);
    }
  });

  it('treats a missing value as blank', () => {
    expect(truncate(undefined, 8)).toBe('');
  });

  it('refuses a width too small to mark', () => {
    expect(() => truncate('x', 3)).toThrow(/at least 4/);
  });
});

describe('indent', () => {
  it('indents every line', () => {
    expect(indent('one\ntwo')).toBe('  one\n  two');
  });

  it('leaves blank lines blank rather than trailing spaces', () => {
    expect(indent('one\n\ntwo')).toBe('  one\n\n  two');
  });

  it('takes another width', () => {
    expect(indent('one', 4)).toBe('    one');
    expect(indent('one', 0)).toBe('one');
  });

  it('refuses an indent nobody uses', () => {
    expect(() => indent('one', 40)).toThrow(/from 0 to 20/);
  });
});

describe('noteBlock', () => {
  it('is empty when there is no note', () => {
    expect(noteBlock('notes', undefined)).toBe('');
    expect(noteBlock('notes', '   ')).toBe('');
  });

  it('puts the note under the label, indented', () => {
    expect(noteBlock('notes', 'gate is locked')).toBe('notes\n  gate is locked');
  });

  it('wraps a long note inside the page', () => {
    const long = 'word '.repeat(40).trim();
    for (const line of noteBlock('notes', long).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(PAGE_WIDTH);
    }
  });
});

describe('padTo and centre', () => {
  it('pads to a width', () => {
    expect(padTo('ab', 5)).toBe('ab   ');
    expect(padTo('abcdef', 3)).toBe('abcdef');
    expect(padTo(undefined, 3)).toBe('   ');
  });

  it('centres inside a width', () => {
    expect(centre('ab', 6)).toBe('  ab');
    expect(centre('abcdef', 4)).toBe('abcdef');
  });

  it('leaves no trailing space on a centred line', () => {
    expect(centre('ab', 6).endsWith(' ')).toBe(false);
  });
});
