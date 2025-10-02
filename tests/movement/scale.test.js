import { describe, it, expect } from 'vitest';
import {
  AXLE_LIMITS_LB,
  AXLES,
  ESTIMATE_TOLERANCE_LB,
  makeTicket,
  netLb,
  axleOverages,
  grossOverageLb,
  isTicketLegal,
  checkTicket,
  compareToEstimate,
  palletsUnaccounted,
  ticketRegister,
  heaviestTicket,
  averageGrossLb,
} from '../../src/movement/scale.js';

const ticket = (overrides = {}) =>
  makeTicket({
    number: 't-1',
    loadId: 'LD-2025-0143',
    scale: 'Kettleman certified',
    weighedOn: '2025-02-03',
    grossLb: 74000,
    tareLb: 32000,
    axles: { steer: 11000, drives: 32000, trailer: 31000 },
    ...overrides,
  });

describe('makeTicket', () => {
  it('uppercases the ticket number', () => {
    expect(ticket().number).toBe('T-1');
  });

  it('takes a ticket with no axle weights on it', () => {
    expect(
      makeTicket({
        number: 't-2',
        loadId: 'LD-2025-0143',
        scale: 'yard scale',
        weighedOn: '2025-02-03',
        grossLb: 74000,
      }).axles
    ).toEqual({});
  });

  it('refuses axle weights that do not add to the gross', () => {
    expect(() =>
      ticket({ axles: { steer: 11000, drives: 20000, trailer: 20000 } })
    ).toThrow(/do not add to the gross/);
  });

  it('allows a small rounding difference between the two', () => {
    expect(
      ticket({ axles: { steer: 11200, drives: 32000, trailer: 31000 } }).grossLb
    ).toBe(74000);
  });

  it('refuses a gross nobody weighs', () => {
    expect(() => ticket({ grossLb: 500 })).toThrow(/at least 1000/);
  });
});

describe('netLb', () => {
  it('is gross less tare', () => {
    expect(netLb(ticket())).toBe(42000);
  });

  it('is the gross when no tare was taken', () => {
    expect(netLb(ticket({ tareLb: 0 }))).toBe(74000);
  });
});

describe('axleOverages', () => {
  it('is empty on a legal ticket', () => {
    expect(axleOverages(ticket())).toEqual([]);
  });

  it('names an axle that is over', () => {
    const heavy = ticket({
      grossLb: 78000,
      axles: { steer: 12000, drives: 35000, trailer: 31000 },
    });
    expect(axleOverages(heavy)).toEqual([
      { axle: 'drives', weightLb: 35000, limitLb: AXLE_LIMITS_LB.drives, overLb: 1000 },
    ]);
  });

  it('names more than one', () => {
    const heavy = ticket({
      grossLb: 80500,
      axles: { steer: 13000, drives: 35000, trailer: 32500 },
    });
    expect(axleOverages(heavy).map((row) => row.axle)).toEqual(['drives', 'steer']);
  });

  it('has a limit for every axle it knows', () => {
    for (const axle of AXLES) {
      expect(AXLE_LIMITS_LB[axle]).toBeGreaterThan(0);
    }
  });
});

describe('grossOverageLb and isTicketLegal', () => {
  it('is legal on a semi at seventy four thousand', () => {
    expect(grossOverageLb(ticket(), 'semi')).toBe(0);
    expect(isTicketLegal(ticket(), 'semi')).toBe(true);
  });

  it('is over on a bobtail with the same weight', () => {
    expect(grossOverageLb(ticket(), 'bobtail')).toBe(48000);
    expect(isTicketLegal(ticket(), 'bobtail')).toBe(false);
  });

  it('is illegal on an axle even when the gross is fine', () => {
    const heavy = ticket({
      grossLb: 78000,
      axles: { steer: 12000, drives: 35000, trailer: 31000 },
    });
    expect(grossOverageLb(heavy, 'semi')).toBe(0);
    expect(isTicketLegal(heavy, 'semi')).toBe(false);
  });
});

describe('checkTicket', () => {
  it('passes a legal ticket', () => {
    expect(checkTicket(ticket(), 'semi')).toBe(true);
  });

  it('refuses an axle overage first', () => {
    const heavy = ticket({
      grossLb: 82000,
      axles: { steer: 12000, drives: 38000, trailer: 32000 },
    });
    try {
      checkTicket(heavy, 'semi');
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('SC-1');
      expect(err.message).toContain('over on the drives');
    }
  });

  it('refuses a gross overage on a ticket with no axle weights on it', () => {
    const heavy = makeTicket({
      number: 't-9',
      loadId: 'LD-2025-0143',
      scale: 'yard scale',
      weighedOn: '2025-02-03',
      grossLb: 81000,
    });
    try {
      checkTicket(heavy, 'semi');
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('SC-2');
      expect(err.details.overLb).toBe(1000);
    }
  });
});

describe('compareToEstimate', () => {
  it('is within tolerance when the office was close', () => {
    const comparison = compareToEstimate(ticket(), 73200);
    expect(comparison.differenceLb).toBe(800);
    expect(comparison.withinTolerance).toBe(true);
  });

  it('is out when the office was well off', () => {
    const comparison = compareToEstimate(ticket(), 70000);
    expect(comparison.differenceLb).toBe(4000);
    expect(comparison.withinTolerance).toBe(false);
    expect(ESTIMATE_TOLERANCE_LB).toBe(1500);
  });

  it('works when the estimate was the high one', () => {
    expect(compareToEstimate(ticket(), 78000).differenceLb).toBe(-4000);
  });

  it('suggests the pallets the difference accounts for', () => {
    const comparison = compareToEstimate(ticket(), 70000);
    expect(palletsUnaccounted(comparison, 508)).toBe(8);
  });

  it('suggests nothing when the office was close enough', () => {
    expect(palletsUnaccounted(compareToEstimate(ticket(), 73200), 508)).toBe(0);
  });
});

describe('the ticket register', () => {
  const tickets = [
    ticket({
      number: 't-2',
      weighedOn: '2025-02-05',
      grossLb: 76000,
      axles: { steer: 11000, drives: 33000, trailer: 32000 },
    }),
    ticket({ number: 't-1', weighedOn: '2025-02-03' }),
  ];

  it('sorts by date then number', () => {
    expect(ticketRegister(tickets).map((row) => row.number)).toEqual(['T-1', 'T-2']);
  });

  it('carries the net weight and the axle count', () => {
    expect(ticketRegister(tickets)[0]).toMatchObject({ netLb: 42000, axlesOver: 0 });
  });

  it('finds the heaviest', () => {
    expect(heaviestTicket(tickets).number).toBe('T-2');
    expect(heaviestTicket([])).toBeNull();
  });

  it('averages the gross', () => {
    expect(averageGrossLb(tickets)).toBe(75000);
    expect(averageGrossLb([])).toBe(0);
  });
});
