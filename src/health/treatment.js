import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireInteger,
  requireNumber,
  requireObject,
  requireString,
} from '../core/validate.js';
import { addDays, compareDates, parseDate, seasonOf } from '../core/dates.js';
import { makeSpan, spanContains } from '../core/span.js';
import { isId, parseId } from '../core/ids.js';
import { sortBy } from '../core/collections.js';
import { getProduct, labelBlockers } from './product.js';

/**
 * A miticide application on a yard.
 *
 * The record is the legal one. If an inspector asks what went on which hives
 * and when it came off, this is the answer, and it has to be defensible three
 * years later. So the label check runs against the conditions recorded at the
 * time rather than against today's weather, and a treatment that is still on
 * the hives is a different thing from one that has been pulled.
 */

const TREATMENT_KEYS = [
  'id',
  'yardId',
  'colonies',
  'product',
  'appliedOn',
  'removedOn',
  'temperatureF',
  'supersOn',
  'applicator',
  'units',
  'notes',
];

export function makeTreatment(input) {
  const raw = requireObject(input, 'treatment');
  rejectUnknownKeys(raw, 'treatment', TREATMENT_KEYS);
  const product = getProduct(raw.product);
  const appliedOn = parseDate(raw.appliedOn, 'treatment.appliedOn');
  const removedOn = optional(raw.removedOn, (date) =>
    parseDate(date, 'treatment.removedOn')
  );
  if (removedOn && compareDates(appliedOn, removedOn) > 0) {
    throw new ValidationError('a treatment came off before it went on', {
      appliedOn,
      removedOn,
    });
  }
  const colonies = requireArray(raw.colonies, 'treatment.colonies', {
    min: 1,
    max: 600,
  }).map((entry, at) => {
    if (!isId(entry, 'colony')) {
      throw new ValidationError(
        `treatment.colonies[${at}] is not a colony identifier`,
        {
          at,
          got: entry,
        }
      );
    }
    return parseId(entry, 'colony').id;
  });
  const repeated = colonies.find((id, at) => colonies.indexOf(id) !== at);
  if (repeated) {
    throw new ValidationError(`colony ${repeated} is on the treatment twice`, {
      colony: repeated,
    });
  }
  return {
    id: parseId(raw.id, 'treatment').id,
    yardId: parseId(raw.yardId, 'yard').id,
    colonies,
    product: product.code,
    appliedOn,
    removedOn,
    temperatureF: requireNumber(raw.temperatureF, 'treatment.temperatureF', {
      min: -40,
      max: 130,
    }),
    supersOn: Boolean(raw.supersOn),
    applicator: requireString(raw.applicator, 'treatment.applicator', { max: 60 }),
    units: requireInteger(raw.units, 'treatment.units', { min: 1, max: 5000 }),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'treatment.notes', { max: 300 })
    ),
  };
}

export function treatmentSeason(treatment) {
  return seasonOf(treatment.appliedOn);
}

export function isOnHives(treatment) {
  return treatment.removedOn === undefined;
}

/** The day the label says it should come off, whether or not anybody did. */
export function dueOffOn(treatment) {
  return addDays(treatment.appliedOn, getProduct(treatment.product).durationDays);
}

export function isOverdue(treatment, date) {
  if (!isOnHives(treatment)) return false;
  return compareDates(parseDate(date), dueOffOn(treatment)) > 0;
}

export function withdrawalEndsOn(treatment) {
  const off = treatment.removedOn ?? dueOffOn(treatment);
  return addDays(off, getProduct(treatment.product).withdrawalDays);
}

/** Supers cannot go back on until the withdrawal has run out. */
export function supersMayReturnOn(treatment) {
  return addDays(withdrawalEndsOn(treatment), 1);
}

export function inWithdrawal(treatment, date) {
  const off = treatment.removedOn ?? dueOffOn(treatment);
  const end = withdrawalEndsOn(treatment);
  if (compareDates(off, end) === 0) return false;
  return spanContains(makeSpan(off, end), date);
}

export function treatmentSpan(treatment) {
  return makeSpan(treatment.appliedOn, treatment.removedOn ?? dueOffOn(treatment));
}

export function checkLabel(treatment) {
  const product = getProduct(treatment.product);
  const blockers = labelBlockers(product, {
    temperatureF: treatment.temperatureF,
    supersOn: treatment.supersOn,
  });
  if (blockers.length > 0) {
    throw new RuleViolation(
      'TR-1',
      `${product.name} on ${treatment.appliedOn} breaks the label: ${blockers.join(', ')}`,
      { treatment: treatment.id, product: product.code, blockers }
    );
  }
  return true;
}

export function treatmentsInSeason(treatments, season) {
  return sortBy(
    treatments.filter((treatment) => treatmentSeason(treatment) === season),
    (treatment) => treatment.appliedOn,
    (treatment) => treatment.id
  );
}

export function checkSeasonCap(treatments, candidate) {
  const product = getProduct(candidate.product);
  const season = treatmentSeason(candidate);
  const already = treatmentsInSeason(treatments, season).filter(
    (treatment) =>
      treatment.product === candidate.product && treatment.id !== candidate.id
  ).length;
  if (already + 1 > product.maxPerSeason) {
    throw new RuleViolation(
      'TR-2',
      `${product.name} is limited to ${product.maxPerSeason} applications a season`,
      { product: product.code, season, already, allowed: product.maxPerSeason }
    );
  }
  return already + 1;
}

/** Two applications in a row from the same chemical class buy no resistance break. */
export function checkRotation(previous, candidate) {
  if (!previous) return true;
  const before = getProduct(previous.product);
  const next = getProduct(candidate.product);
  if (before.chemicalClass === next.chemicalClass) {
    throw new RuleViolation(
      'TR-3',
      `${next.name} follows ${before.name} and both are ${next.chemicalClass}`,
      {
        previous: previous.id,
        candidate: candidate.id,
        chemicalClass: next.chemicalClass,
      }
    );
  }
  return true;
}

export function lastTreatmentFor(treatments, yardId, before) {
  const earlier = treatments.filter(
    (treatment) =>
      treatment.yardId === yardId && compareDates(treatment.appliedOn, before) < 0
  );
  return sortBy(earlier, (treatment) => treatment.appliedOn).pop();
}
