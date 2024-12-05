import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireArray,
  requireInteger,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { addDays, compareDates, parseDate } from '../core/dates.js';
import { makeSpan, spanContains } from '../core/span.js';
import { parseId } from '../core/ids.js';
import { sortBy } from '../core/collections.js';

/**
 * State apiary inspections and what they leave behind.
 *
 * Most findings are a note in the book. American foulbrood is not: the spores
 * live in the woodenware for decades, the affected hives are burned, and the
 * yard is held for a period during which nothing leaves it. That hold is the
 * reason this module exists, because a load planned out of a held yard has to
 * be caught before the truck is loaded rather than at the state line.
 */

export const FINDINGS = ['clean', 'chalkbrood', 'nosema', 'shb', 'efb', 'afb'];

/** Findings the state wants reported, and the hold each one carries in days. */
export const HOLD_DAYS = {
  afb: 30,
  efb: 14,
};

export const DESTRUCTION_FINDINGS = ['afb'];

const INSPECTION_KEYS = [
  'id',
  'yardId',
  'date',
  'inspector',
  'coloniesOpened',
  'findings',
  'coloniesAffected',
  'notes',
];

export function makeInspection(input) {
  const raw = requireObject(input, 'inspection');
  rejectUnknownKeys(raw, 'inspection', INSPECTION_KEYS);
  const findings = requireArray(raw.findings ?? ['clean'], 'inspection.findings', {
    min: 1,
    max: 6,
  }).map((finding, at) =>
    requireOneOf(finding, `inspection.findings[${at}]`, FINDINGS)
  );
  const unique = [...new Set(findings)];
  if (unique.length !== findings.length) {
    throw new ValidationError('a finding is listed twice', { findings });
  }
  if (unique.includes('clean') && unique.length > 1) {
    throw new ValidationError('a clean inspection cannot also carry a finding', {
      findings,
    });
  }
  const coloniesOpened = requireInteger(
    raw.coloniesOpened,
    'inspection.coloniesOpened',
    {
      min: 1,
      max: 600,
    }
  );
  const coloniesAffected = requireInteger(
    raw.coloniesAffected ?? 0,
    'inspection.coloniesAffected',
    { min: 0, max: 600 }
  );
  if (coloniesAffected > coloniesOpened) {
    throw new ValidationError('more colonies affected than were opened', {
      coloniesOpened,
      coloniesAffected,
    });
  }
  if (unique.includes('clean') && coloniesAffected > 0) {
    throw new ValidationError('a clean inspection cannot have affected colonies', {
      coloniesAffected,
    });
  }
  return {
    id: parseId(raw.id, 'inspection').id,
    yardId: parseId(raw.yardId, 'yard').id,
    date: parseDate(raw.date, 'inspection.date'),
    inspector: requireString(raw.inspector, 'inspection.inspector', { max: 60 }),
    coloniesOpened,
    findings: sortBy(unique, (finding) => FINDINGS.indexOf(finding)),
    coloniesAffected,
    notes: optional(raw.notes, (note) =>
      requireString(note, 'inspection.notes', { max: 400 })
    ),
  };
}

export function isClean(inspection) {
  return inspection.findings.length === 1 && inspection.findings[0] === 'clean';
}

/** The finding that carries the longest hold, which is the one that governs. */
export function governingFinding(inspection) {
  return inspection.findings
    .filter((finding) => HOLD_DAYS[finding] !== undefined)
    .sort((left, right) => HOLD_DAYS[right] - HOLD_DAYS[left])[0];
}

export function holdDays(inspection) {
  const finding = governingFinding(inspection);
  return finding ? HOLD_DAYS[finding] : 0;
}

export function holdSpan(inspection) {
  const days = holdDays(inspection);
  if (days === 0) return null;
  return makeSpan(inspection.date, addDays(inspection.date, days));
}

export function isHeldOn(inspection, date) {
  const span = holdSpan(inspection);
  return span ? spanContains(span, date) : false;
}

export function requiresDestruction(inspection) {
  return inspection.findings.some((finding) => DESTRUCTION_FINDINGS.includes(finding));
}

export function inspectionsForYard(inspections, yardId) {
  return sortBy(
    inspections.filter((inspection) => inspection.yardId === yardId),
    (inspection) => inspection.date,
    (inspection) => inspection.id
  );
}

/** Nothing leaves a yard while a hold is running. */
export function checkYardMovable(inspections, yardId, date) {
  const held = inspectionsForYard(inspections, yardId).find((inspection) =>
    isHeldOn(inspection, date)
  );
  if (held) {
    throw new RuleViolation(
      'HL-1',
      `yard ${yardId} is held to ${holdSpan(held).end} after ${governingFinding(held)} on ${held.date}`,
      {
        yard: yardId,
        inspection: held.id,
        finding: governingFinding(held),
        until: holdSpan(held).end,
      }
    );
  }
  return true;
}

export function latestInspection(inspections, yardId, onOrBefore) {
  const found = inspectionsForYard(inspections, yardId).filter(
    (inspection) => compareDates(inspection.date, onOrBefore) <= 0
  );
  return found[found.length - 1];
}
