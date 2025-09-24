import { describe, it, expect } from 'vitest';
import {
  parseDate,
  addDays,
  diffDays,
  seasonOf,
  seasonBounds,
} from '../../src/core/dates.js';
import { makeSpan, spanContains, spanDays } from '../../src/core/span.js';
import { fixedClock } from '../../src/core/clock.js';
import { stageFor, thresholdOn } from '../../src/health/threshold.js';
import {
  dueOffOn,
  makeTreatment,
  withdrawalEndsOn,
} from '../../src/health/treatment.js';
import { makeCertificate, isValidOn } from '../../src/movement/permit.js';
import { makeDrop, standingSpan } from '../../src/placement/drop.js';

/**
 * Dates are days, not instants.
 *
 * The office is in California, the packer is in Iowa and one of the machines
 * this runs on is set to UTC. A treatment that comes off on the twenty fifth
 * has to come off on the twenty fifth on all three, and the way that goes
 * wrong is a date built through a local Date constructor somewhere.
 *
 * These run against whatever timezone the process is in. The workflow runs the
 * whole suite again under four of them, which is what actually proves it; this
 * file is the part that would fail loudly and quickly.
 */

const treatment = (appliedOn) =>
  makeTreatment({
    id: 'TR-2025-0021',
    yardId: 'YD-2025-0001',
    colonies: ['CY-2025-0011'],
    product: 'apivar',
    appliedOn,
    temperatureF: 60,
    applicator: 'M Ojeda',
    units: 2,
  });

describe('dates do not move with the clock', () => {
  it('parses and returns the same day', () => {
    for (const day of ['2025-01-01', '2025-06-15', '2025-12-31']) {
      expect(parseDate(day)).toBe(day);
    }
  });

  it('adds days without drifting across a month end', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('adds days without drifting across a daylight saving change', () => {
    expect(addDays('2025-03-08', 1)).toBe('2025-03-09');
    expect(addDays('2025-11-01', 1)).toBe('2025-11-02');
    expect(diffDays('2025-03-08', '2025-03-10')).toBe(2);
    expect(diffDays('2025-11-01', '2025-11-03')).toBe(2);
  });

  it('counts a year as 365 days and a leap year as 366', () => {
    expect(diffDays('2025-01-01', '2026-01-01')).toBe(365);
    expect(diffDays('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('keeps the season boundary on the first of November', () => {
    expect(seasonOf('2024-10-31')).toBe(2024);
    expect(seasonOf('2024-11-01')).toBe(2025);
    expect(seasonBounds(2025)).toEqual({ start: '2024-11-01', end: '2025-10-31' });
  });

  it('keeps the health stage boundaries on month ends', () => {
    expect(stageFor('2025-01-31')).toBe('winter');
    expect(stageFor('2025-02-01')).toBe('bloom');
    expect(stageFor('2025-07-31')).toBe('flow');
    expect(stageFor('2025-08-01')).toBe('fall');
    expect(thresholdOn('2025-02-01')).toBe(2);
  });
});

describe('spans do not move with the clock', () => {
  it('counts both ends', () => {
    expect(spanDays(makeSpan('2025-03-08', '2025-03-10'))).toBe(3);
    expect(spanDays(makeSpan('2025-11-01', '2025-11-03'))).toBe(3);
  });

  it('contains the boundary days', () => {
    const span = makeSpan('2025-03-08', '2025-03-10');
    expect(spanContains(span, '2025-03-08')).toBe(true);
    expect(spanContains(span, '2025-03-10')).toBe(true);
    expect(spanContains(span, '2025-03-11')).toBe(false);
  });
});

describe('the derived dates hold', () => {
  it('takes a treatment off on the same day everywhere', () => {
    expect(dueOffOn(treatment('2025-08-14'))).toBe('2025-09-25');
    expect(withdrawalEndsOn(treatment('2025-08-14'))).toBe('2025-10-09');
  });

  it('expires a certificate on the same day everywhere', () => {
    const certificate = makeCertificate({
      number: 'CA-2025-11884',
      issuedOn: '2025-01-06',
      issuedBy: 'Tulare County',
      originState: 'CA',
      colonies: 480,
    });
    expect(certificate.expiresOn).toBe('2025-03-07');
    expect(isValidOn(certificate, '2025-03-07')).toBe(true);
    expect(isValidOn(certificate, '2025-03-08')).toBe(false);
  });

  it('stands a drop for the same days everywhere', () => {
    const drop = makeDrop({
      id: 'DR-2025-0004',
      contractId: 'CT-2025-0007',
      blockId: 'BK-2025-0001',
      location: { latitude: 36.9, longitude: -120.1 },
      ordered: 24,
      set: 24,
      setOn: '2025-02-04',
      pulledOn: '2025-03-10',
    });
    expect(standingSpan(drop)).toEqual({ start: '2025-02-04', end: '2025-03-10' });
    expect(spanDays(standingSpan(drop))).toBe(35);
  });
});

describe('the fixed clock', () => {
  it('says the day it was given whatever the machine thinks', () => {
    expect(fixedClock('2025-03-08').today()).toBe('2025-03-08');
    expect(fixedClock('2025-11-02').now()).toBe('2025-11-02T12:00:00Z');
  });
});
