import { describe, it, expect } from 'vitest';
import {
  PRODUCT_CODES,
  getProduct,
  allProducts,
  productsInClass,
  chemicalClasses,
  labelBlockers,
  labelAllows,
  availableProducts,
  unitsFor,
  describeProduct,
} from '../../src/health/product.js';

describe('getProduct', () => {
  it('finds a product by code', () => {
    expect(getProduct('apivar').name).toBe('Apivar');
  });

  it('does not care about case', () => {
    expect(getProduct('APIVAR').code).toBe('apivar');
  });

  it('says so when the shed does not carry it', () => {
    expect(() => getProduct('checkmite')).toThrow(/no product with id checkmite/);
  });

  it('finds every code it publishes', () => {
    for (const code of PRODUCT_CODES) {
      expect(getProduct(code).code).toBe(code);
    }
  });
});

describe('the catalogue', () => {
  it('is sorted by code', () => {
    const codes = allProducts().map((product) => product.code);
    expect(codes).toEqual([...codes].sort());
  });

  it('gives every product a temperature window that makes sense', () => {
    for (const product of allProducts()) {
      expect(product.minTemperatureF).toBeLessThan(product.maxTemperatureF);
      expect(product.maxPerSeason).toBeGreaterThanOrEqual(1);
      expect(product.durationDays).toBeGreaterThanOrEqual(1);
    }
  });

  it('lets only the organic acid keep supers on', () => {
    const withSupers = allProducts().filter((product) => product.supersAllowed);
    expect(withSupers.map((product) => product.code)).toEqual(['formic-pro']);
  });

  it('groups products by chemical class', () => {
    expect(chemicalClasses()).toEqual([
      'essential oil',
      'formamidine',
      'organic acid',
      'pyrethroid',
    ]);
    expect(productsInClass('organic acid').map((product) => product.code)).toEqual([
      'formic-pro',
      'oxalic-dribble',
    ]);
  });

  it('has no class with a product outside the catalogue', () => {
    for (const chemicalClass of chemicalClasses()) {
      expect(productsInClass(chemicalClass).length).toBeGreaterThan(0);
    }
  });
});

describe('labelBlockers', () => {
  const apiguard = getProduct('apiguard');
  const formic = getProduct('formic-pro');

  it('is empty inside the window', () => {
    expect(labelBlockers(apiguard, { temperatureF: 75 })).toEqual([]);
  });

  it('blocks below the floor and above the ceiling', () => {
    expect(labelBlockers(apiguard, { temperatureF: 55 })).toEqual(['below 60F']);
    expect(labelBlockers(formic, { temperatureF: 92 })).toEqual(['above 85F']);
  });

  it('allows both ends of the window exactly', () => {
    expect(labelBlockers(formic, { temperatureF: 50 })).toEqual([]);
    expect(labelBlockers(formic, { temperatureF: 85 })).toEqual([]);
  });

  it('blocks a product that cannot go on under supers', () => {
    expect(labelBlockers(apiguard, { temperatureF: 75, supersOn: true })).toEqual([
      'honey supers on',
    ]);
  });

  it('lets formic go on with the supers up', () => {
    expect(labelBlockers(formic, { temperatureF: 75, supersOn: true })).toEqual([]);
  });

  it('lists more than one blocker at once', () => {
    expect(labelBlockers(apiguard, { temperatureF: 40, supersOn: true })).toEqual([
      'below 60F',
      'honey supers on',
    ]);
  });

  it('refuses a temperature nobody records', () => {
    expect(() => labelBlockers(apiguard, { temperatureF: 200 })).toThrow(/at most 130/);
  });
});

describe('labelAllows and availableProducts', () => {
  it('agree with the blocker list', () => {
    for (const product of allProducts()) {
      const conditions = { temperatureF: 70, supersOn: false };
      expect(labelAllows(product, conditions)).toBe(
        labelBlockers(product, conditions).length === 0
      );
    }
  });

  it('narrows the shelf to one product with supers on in the heat', () => {
    expect(
      availableProducts({ temperatureF: 80, supersOn: true }).map(
        (product) => product.code
      )
    ).toEqual(['formic-pro']);
  });

  it('offers nothing at all on a hot day with supers on', () => {
    expect(availableProducts({ temperatureF: 95, supersOn: true })).toEqual([]);
  });

  it('offers most of the shelf on a mild day with supers off', () => {
    const codes = availableProducts({ temperatureF: 70 }).map(
      (product) => product.code
    );
    expect(codes).toEqual([
      'apiguard',
      'apistan',
      'apivar',
      'formic-pro',
      'oxalic-dribble',
    ]);
  });

  it('offers only the cold tolerant products in a January dribble window', () => {
    expect(
      availableProducts({ temperatureF: 42 }).map((product) => product.code)
    ).toEqual(['apivar', 'oxalic-dribble']);
  });
});

describe('unitsFor', () => {
  it('scales the units with the boxes', () => {
    expect(unitsFor(getProduct('apivar'), 2)).toBe(4);
    expect(unitsFor(getProduct('apiguard'), 2)).toBe(2);
  });

  it('refuses a part box', () => {
    expect(() => unitsFor(getProduct('apivar'), 1.5)).toThrow(/whole number/);
  });

  it('refuses a stack nobody runs', () => {
    expect(() => unitsFor(getProduct('apivar'), 0)).toThrow(/at least 1/);
  });
});

describe('describeProduct', () => {
  it('prints the label in five lines', () => {
    const lines = describeProduct(getProduct('formic-pro')).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('Formic Pro (formic acid, organic acid)');
    expect(lines[2]).toBe('supers may stay on');
  });

  it('says supers off for everything else', () => {
    expect(describeProduct(getProduct('apivar'))).toContain('supers off');
  });
});
