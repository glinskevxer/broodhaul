import { RuleViolation, ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireInteger,
  requireObject,
  requireString,
} from '../core/validate.js';
import { addDays, compareDates, parseDate } from '../core/dates.js';
import { makeSpan, spanContains } from '../core/span.js';

/**
 * Certificates of inspection and entry permits.
 *
 * Bees crossing a state line need a certificate from an apiary inspector in
 * the state they left, and most of the states this outfit works in also want
 * an entry permit number issued before the truck rolls. The certificate is the
 * one with teeth: it names a hive count and a date, it goes stale, and a load
 * carrying more hives than the certificate covers is turned around at the
 * inspection station regardless of what the permit says.
 */

export const CERTIFICATE_DAYS = 60;

/** States that want an entry permit on top of the certificate. */
export const PERMIT_STATES = ['ID', 'ND', 'SD', 'WA', 'OR', 'MT'];

const CERTIFICATE_KEYS = [
  'number',
  'issuedOn',
  'issuedBy',
  'originState',
  'colonies',
  'expiresOn',
];

export function makeCertificate(input) {
  const raw = requireObject(input, 'certificate');
  rejectUnknownKeys(raw, 'certificate', CERTIFICATE_KEYS);
  const issuedOn = parseDate(raw.issuedOn, 'certificate.issuedOn');
  const expiresOn = raw.expiresOn
    ? parseDate(raw.expiresOn, 'certificate.expiresOn')
    : addDays(issuedOn, CERTIFICATE_DAYS);
  if (compareDates(expiresOn, issuedOn) < 0) {
    throw new ValidationError('a certificate cannot expire before it was issued', {
      issuedOn,
      expiresOn,
    });
  }
  return {
    number: requireString(raw.number, 'certificate.number', { max: 24 }).toUpperCase(),
    issuedOn,
    expiresOn,
    issuedBy: requireString(raw.issuedBy, 'certificate.issuedBy', { max: 60 }),
    originState: requireString(raw.originState, 'certificate.originState', {
      min: 2,
      max: 2,
    }).toUpperCase(),
    colonies: requireInteger(raw.colonies, 'certificate.colonies', {
      min: 1,
      max: 5000,
    }),
  };
}

export function certificateSpan(certificate) {
  return makeSpan(certificate.issuedOn, certificate.expiresOn);
}

export function isValidOn(certificate, date) {
  return spanContains(certificateSpan(certificate), date);
}

export function daysLeft(certificate, date) {
  const day = parseDate(date);
  if (compareDates(day, certificate.expiresOn) > 0) return 0;
  const from = new Date(`${day}T00:00:00Z`).getTime();
  const to = new Date(`${certificate.expiresOn}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

export function needsEntryPermit(destinationState) {
  const state = requireString(destinationState, 'destinationState', {
    min: 2,
    max: 2,
  }).toUpperCase();
  return PERMIT_STATES.includes(state);
}

export function crossesStateLine(originState, destinationState) {
  return originState.toUpperCase() !== destinationState.toUpperCase();
}

/**
 * Everything the state line asks of one movement. Throws on the first thing
 * that is wrong, because that is the order the inspector reads them in.
 */
export function checkMovement({
  certificate,
  entryPermit,
  originState,
  destinationState,
  colonies,
  movedOn,
}) {
  if (!crossesStateLine(originState, destinationState)) return { required: false };
  if (!certificate) {
    throw new RuleViolation(
      'MV-1',
      'an interstate move needs a certificate of inspection',
      {
        originState,
        destinationState,
      }
    );
  }
  if (certificate.originState !== originState.toUpperCase()) {
    throw new RuleViolation(
      'MV-2',
      `certificate ${certificate.number} was issued in ${certificate.originState}, the load left ${originState}`,
      { certificate: certificate.number, originState }
    );
  }
  if (!isValidOn(certificate, movedOn)) {
    throw new RuleViolation(
      'MV-3',
      `certificate ${certificate.number} was not valid on ${movedOn}`,
      {
        certificate: certificate.number,
        movedOn,
        issuedOn: certificate.issuedOn,
        expiresOn: certificate.expiresOn,
      }
    );
  }
  const aboard = requireInteger(colonies, 'colonies', { min: 0 });
  if (aboard > certificate.colonies) {
    throw new RuleViolation(
      'MV-4',
      `load carries ${aboard} colonies, certificate ${certificate.number} covers ${certificate.colonies}`,
      { certificate: certificate.number, aboard, covered: certificate.colonies }
    );
  }
  if (needsEntryPermit(destinationState) && !entryPermit) {
    throw new RuleViolation(
      'MV-5',
      `${destinationState.toUpperCase()} wants an entry permit before the load rolls`,
      { destinationState }
    );
  }
  return {
    required: true,
    certificate: certificate.number,
    entryPermit: optional(entryPermit, (permit) =>
      requireString(permit, 'entryPermit', { max: 24 }).toUpperCase()
    ),
  };
}
