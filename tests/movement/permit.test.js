import { describe, it, expect } from 'vitest';
import {
  CERTIFICATE_DAYS,
  PERMIT_STATES,
  makeCertificate,
  certificateSpan,
  isValidOn,
  daysLeft,
  needsEntryPermit,
  crossesStateLine,
  checkMovement,
} from '../../src/movement/permit.js';

const base = {
  number: 'ca-2025-11884',
  issuedOn: '2025-01-06',
  issuedBy: 'Tulare County Agricultural Commissioner',
  originState: 'ca',
  colonies: 480,
};

const certificate = (overrides = {}) => makeCertificate({ ...base, ...overrides });

describe('makeCertificate', () => {
  it('uppercases the number and the state', () => {
    const built = certificate();
    expect(built.number).toBe('CA-2025-11884');
    expect(built.originState).toBe('CA');
  });

  it('expires sixty days out when no date is written on it', () => {
    expect(certificate().expiresOn).toBe('2025-03-07');
    expect(CERTIFICATE_DAYS).toBe(60);
  });

  it('takes an expiry written on the face of it', () => {
    expect(certificate({ expiresOn: '2025-02-01' }).expiresOn).toBe('2025-02-01');
  });

  it('refuses an expiry before the issue date', () => {
    expect(() => certificate({ expiresOn: '2025-01-01' })).toThrow(
      /cannot expire before it was issued/
    );
  });

  it('refuses a colony count outside what an inspector writes', () => {
    expect(() => certificate({ colonies: 0 })).toThrow(/at least 1/);
    expect(() => certificate({ colonies: 9000 })).toThrow(/at most 5000/);
  });

  it('refuses an unknown key', () => {
    expect(() => makeCertificate({ ...base, fee: 40 })).toThrow(
      /certificate has unknown keys: fee/
    );
  });
});

describe('certificateSpan and isValidOn', () => {
  it('runs from the issue day to the expiry day inclusive', () => {
    expect(certificateSpan(certificate())).toEqual({
      start: '2025-01-06',
      end: '2025-03-07',
    });
    expect(isValidOn(certificate(), '2025-01-06')).toBe(true);
    expect(isValidOn(certificate(), '2025-03-07')).toBe(true);
  });

  it('is not valid the day before or the day after', () => {
    expect(isValidOn(certificate(), '2025-01-05')).toBe(false);
    expect(isValidOn(certificate(), '2025-03-08')).toBe(false);
  });
});

describe('daysLeft', () => {
  it('counts down to the expiry', () => {
    expect(daysLeft(certificate(), '2025-03-01')).toBe(6);
    expect(daysLeft(certificate(), '2025-03-07')).toBe(0);
  });

  it('is nothing once it has expired', () => {
    expect(daysLeft(certificate(), '2025-04-01')).toBe(0);
  });
});

describe('needsEntryPermit', () => {
  it('is true for the states that ask for one', () => {
    for (const state of PERMIT_STATES) {
      expect(needsEntryPermit(state)).toBe(true);
    }
  });

  it('is false elsewhere', () => {
    expect(needsEntryPermit('CA')).toBe(false);
    expect(needsEntryPermit('TX')).toBe(false);
  });

  it('does not care about case', () => {
    expect(needsEntryPermit('nd')).toBe(true);
  });

  it('refuses something that is not a state code', () => {
    expect(() => needsEntryPermit('Idaho')).toThrow(/at most 2 characters/);
  });
});

describe('crossesStateLine', () => {
  it('is false inside one state whatever the case', () => {
    expect(crossesStateLine('CA', 'ca')).toBe(false);
  });

  it('is true between two', () => {
    expect(crossesStateLine('CA', 'ND')).toBe(true);
  });
});

describe('checkMovement', () => {
  const move = (overrides = {}) =>
    checkMovement({
      certificate: certificate(),
      originState: 'CA',
      destinationState: 'ND',
      colonies: 416,
      movedOn: '2025-02-03',
      entryPermit: 'nd-4471',
      ...overrides,
    });

  it('asks for nothing on a move inside one state', () => {
    expect(
      checkMovement({
        originState: 'CA',
        destinationState: 'CA',
        colonies: 416,
        movedOn: '2025-02-03',
      })
    ).toEqual({ required: false });
  });

  it('passes a clean interstate move', () => {
    expect(move()).toEqual({
      required: true,
      certificate: 'CA-2025-11884',
      entryPermit: 'ND-4471',
    });
  });

  it('refuses a move with no certificate at all', () => {
    expect(() => move({ certificate: undefined })).toThrow(
      /needs a certificate of inspection/
    );
  });

  it('refuses a certificate issued in the wrong state', () => {
    expect(() => move({ certificate: certificate({ originState: 'OR' }) })).toThrow(
      /was issued in OR, the load left CA/
    );
  });

  it('refuses a certificate that has gone stale', () => {
    expect(() => move({ movedOn: '2025-03-20' })).toThrow(
      /was not valid on 2025-03-20/
    );
  });

  it('refuses a load carrying more than the certificate covers', () => {
    expect(() => move({ colonies: 500 })).toThrow(
      /load carries 500 colonies, certificate CA-2025-11884 covers 480/
    );
  });

  it('allows a load sitting exactly on the certified count', () => {
    expect(move({ colonies: 480 }).required).toBe(true);
  });

  it('refuses a permit state with no entry permit', () => {
    expect(() => move({ entryPermit: undefined })).toThrow(
      /ND wants an entry permit before the load rolls/
    );
  });

  it('does not ask for a permit where none is wanted', () => {
    const outcome = move({ destinationState: 'TX', entryPermit: undefined });
    expect(outcome.required).toBe(true);
    expect(outcome.entryPermit).toBeUndefined();
  });

  it('names the rule on every refusal', () => {
    const cases = [
      [{ certificate: undefined }, 'MV-1'],
      [{ certificate: certificate({ originState: 'OR' }) }, 'MV-2'],
      [{ movedOn: '2025-03-20' }, 'MV-3'],
      [{ colonies: 500 }, 'MV-4'],
      [{ entryPermit: undefined }, 'MV-5'],
    ];
    for (const [overrides, rule] of cases) {
      try {
        move(overrides);
        throw new Error(`expected ${rule} to fire`);
      } catch (err) {
        expect(err.rule).toBe(rule);
      }
    }
  });
});
