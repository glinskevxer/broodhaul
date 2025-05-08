import { describe, it, expect } from 'vitest';
import {
  asText,
  asNumber,
  asFlag,
  parseList,
  parseWindow,
  parseIdList,
} from '../../src/cli/parse.js';

const varieties = {
  label: 'varieties',
  example: 'Nonpareil:0.5,Monterey:0.5',
  fields: [
    { name: 'name', convert: asText },
    { name: 'share', convert: asNumber },
    { name: 'selfFertile', convert: asFlag('self'), optional: true },
  ],
};

describe('converters', () => {
  it('pass text through', () => {
    expect(asText(' already trimmed ')).toBe(' already trimmed ');
  });

  it('turn a number into a number', () => {
    expect(asNumber('0.5')).toBe(0.5);
    expect(asNumber('-12')).toBe(-12);
  });

  it('refuse something that is not a number', () => {
    expect(() => asNumber('half')).toThrow(/is not a number/);
  });

  it('read a flag as true only on a match', () => {
    expect(asFlag('self')('self')).toBe(true);
    expect(asFlag('self')('other')).toBe(false);
  });
});

describe('parseList', () => {
  it('reads a two field list', () => {
    expect(parseList('Nonpareil:0.5,Monterey:0.5', varieties)).toEqual([
      { name: 'Nonpareil', share: 0.5 },
      { name: 'Monterey', share: 0.5 },
    ]);
  });

  it('trims around the separators', () => {
    expect(parseList(' Nonpareil : 0.5 ', varieties)[0]).toEqual({
      name: 'Nonpareil',
      share: 0.5,
    });
  });

  it('reads an optional third field', () => {
    expect(parseList('Independence:1:self', varieties)[0].selfFertile).toBe(true);
  });

  it('leaves an absent optional field out', () => {
    expect(parseList('Nonpareil:1', varieties)[0]).not.toHaveProperty('selfFertile');
  });

  it('names the option and the shape when the entry is wrong', () => {
    expect(() => parseList('Nonpareil', varieties)).toThrow(
      /varieties look like "Nonpareil:0.5,Monterey:0.5", got Nonpareil/
    );
  });

  it('names the missing field when one is blank', () => {
    expect(() => parseList('Nonpareil::self', varieties)).toThrow(/missing share/);
  });

  it('refuses an empty option', () => {
    expect(() => parseList('', varieties)).toThrow(/varieties is empty/);
    expect(() => parseList(undefined, varieties)).toThrow(/varieties is empty/);
  });

  it('carries the converter errors through', () => {
    expect(() => parseList('Nonpareil:half', varieties)).toThrow(
      /half is not a number/
    );
  });
});

describe('parseWindow', () => {
  it('splits on the dots', () => {
    expect(parseWindow('2025-02-01..2025-02-10', 'delivery')).toEqual({
      start: '2025-02-01',
      end: '2025-02-10',
    });
  });

  it('trims around them', () => {
    expect(parseWindow(' 2025-02-01 .. 2025-02-10 ', 'delivery').start).toBe(
      '2025-02-01'
    );
  });

  it('refuses anything else', () => {
    expect(() => parseWindow('2025-02-01', 'delivery')).toThrow(/delivery looks like/);
    expect(() => parseWindow('..2025-02-10', 'delivery')).toThrow(
      /delivery looks like/
    );
    expect(() => parseWindow(undefined, 'delivery')).toThrow(/delivery looks like/);
  });
});

describe('parseIdList', () => {
  it('splits and trims', () => {
    expect(parseIdList(' PL-2025-0031 , PL-2025-0032 ', 'pallets')).toEqual([
      'PL-2025-0031',
      'PL-2025-0032',
    ]);
  });

  it('drops empty entries left by a trailing comma', () => {
    expect(parseIdList('PL-2025-0031,', 'pallets')).toEqual(['PL-2025-0031']);
  });

  it('refuses an empty option', () => {
    expect(() => parseIdList('', 'pallets')).toThrow(/pallets is empty/);
  });
});
