import { NotFoundError, ValidationError } from '../core/errors.js';
import { requireNumber, requireString } from '../core/validate.js';
import { sortBy } from '../core/collections.js';

/**
 * The miticide shelf, straight off the labels.
 *
 * Every one of these numbers is a legal requirement rather than a preference.
 * The temperature window is the one that bites in practice: a thymol product
 * put on at a hundred and five degrees will kill the queen, and the label says
 * so, which means an application outside the window is both a dead hive and a
 * violation. The chemical class is here for the rotation rule rather than for
 * the label, since two products can share a class and rotating between them
 * buys nothing.
 */

const CATALOGUE = [
  {
    code: 'apivar',
    name: 'Apivar',
    active: 'amitraz',
    chemicalClass: 'formamidine',
    minTemperatureF: 40,
    maxTemperatureF: 105,
    supersAllowed: false,
    withdrawalDays: 14,
    durationDays: 42,
    maxPerSeason: 2,
    unitsPerBox: 2,
    unit: 'strip',
  },
  {
    code: 'apiguard',
    name: 'Apiguard',
    active: 'thymol',
    chemicalClass: 'essential oil',
    minTemperatureF: 60,
    maxTemperatureF: 105,
    supersAllowed: false,
    withdrawalDays: 0,
    durationDays: 28,
    maxPerSeason: 2,
    unitsPerBox: 1,
    unit: 'tray',
  },
  {
    code: 'formic-pro',
    name: 'Formic Pro',
    active: 'formic acid',
    chemicalClass: 'organic acid',
    minTemperatureF: 50,
    maxTemperatureF: 85,
    supersAllowed: true,
    withdrawalDays: 0,
    durationDays: 14,
    maxPerSeason: 2,
    unitsPerBox: 2,
    unit: 'pad',
  },
  {
    code: 'oxalic-dribble',
    name: 'Oxalic acid dribble',
    active: 'oxalic acid',
    chemicalClass: 'organic acid',
    minTemperatureF: 35,
    maxTemperatureF: 80,
    supersAllowed: false,
    withdrawalDays: 14,
    durationDays: 1,
    maxPerSeason: 3,
    unitsPerBox: 1,
    unit: 'dose',
  },
  {
    code: 'apistan',
    name: 'Apistan',
    active: 'fluvalinate',
    chemicalClass: 'pyrethroid',
    minTemperatureF: 50,
    maxTemperatureF: 105,
    supersAllowed: false,
    withdrawalDays: 42,
    durationDays: 56,
    maxPerSeason: 1,
    unitsPerBox: 2,
    unit: 'strip',
  },
];

const BY_CODE = new Map(CATALOGUE.map((product) => [product.code, product]));

export const PRODUCT_CODES = CATALOGUE.map((product) => product.code);

export function getProduct(code) {
  const key = requireString(code, 'product code', { max: 30 }).toLowerCase();
  const product = BY_CODE.get(key);
  if (!product) throw new NotFoundError('product', key);
  return product;
}

export function allProducts() {
  return sortBy(CATALOGUE, (product) => product.code);
}

export function productsInClass(chemicalClass) {
  return allProducts().filter((product) => product.chemicalClass === chemicalClass);
}

export function chemicalClasses() {
  return [...new Set(CATALOGUE.map((product) => product.chemicalClass))].sort();
}

/** Reasons the label will not let this product go on today. */
export function labelBlockers(product, { temperatureF, supersOn = false }) {
  const degrees = requireNumber(temperatureF, 'temperatureF', { min: -40, max: 130 });
  const blockers = [];
  if (degrees < product.minTemperatureF) {
    blockers.push(`below ${product.minTemperatureF}F`);
  }
  if (degrees > product.maxTemperatureF) {
    blockers.push(`above ${product.maxTemperatureF}F`);
  }
  if (supersOn && !product.supersAllowed) {
    blockers.push('honey supers on');
  }
  return blockers;
}

export function labelAllows(product, conditions) {
  return labelBlockers(product, conditions).length === 0;
}

/** Products that can legally go on today, in the order the shed keeps them. */
export function availableProducts(conditions) {
  return allProducts().filter((product) => labelAllows(product, conditions));
}

export function unitsFor(product, boxes) {
  const count = requireNumber(boxes, 'boxes', { min: 1, max: 10 });
  if (!Number.isInteger(count)) {
    throw new ValidationError('boxes must be a whole number', { boxes });
  }
  return product.unitsPerBox * count;
}

export function describeProduct(product) {
  return [
    `${product.name} (${product.active}, ${product.chemicalClass})`,
    `${product.minTemperatureF}F to ${product.maxTemperatureF}F`,
    product.supersAllowed ? 'supers may stay on' : 'supers off',
    `${product.durationDays} days on, ${product.withdrawalDays} day withdrawal`,
    `at most ${product.maxPerSeason} a season`,
  ].join('\n');
}
