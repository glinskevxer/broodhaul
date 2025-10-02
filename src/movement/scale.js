import { RuleViolation, ValidationError } from '../core/errors.js';
import { requireInteger, requireNumber, requireString } from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';
import { sortBy, sumBy } from '../core/collections.js';
import { grossLimitLb } from './weight.js';

/**
 * Scale tickets.
 *
 * A loaded truck crosses a certified scale on the way out and the ticket is
 * the number that matters, not the one the office worked out from pallet
 * weights. The two disagree, always, and the size of the disagreement is worth
 * watching: a load that reads two thousand pounds over the estimate usually
 * means somebody put four more pallets on than the manifest says.
 *
 * Axle weights are the other half. A truck can be legal on the gross and still
 * be over on the drives, which is the ticket that actually gets written.
 */

export const AXLE_LIMITS_LB = {
  steer: 12000,
  drives: 34000,
  trailer: 34000,
};

export const AXLES = Object.keys(AXLE_LIMITS_LB);
export const ESTIMATE_TOLERANCE_LB = 1500;

export function makeTicket(input) {
  const axles = {};
  for (const axle of AXLES) {
    const value = input.axles?.[axle];
    if (value === undefined) continue;
    axles[axle] = requireNumber(value, `axles.${axle}`, { min: 0, max: 60000 });
  }
  const grossLb = requireNumber(input.grossLb, 'grossLb', { min: 1000, max: 200000 });
  const axleTotal = sumBy(Object.values(axles), (value) => value);
  if (
    Object.keys(axles).length === AXLES.length &&
    Math.abs(axleTotal - grossLb) > 500
  ) {
    throw new ValidationError('the axle weights do not add to the gross', {
      axleTotal,
      grossLb,
    });
  }
  return {
    number: requireString(input.number, 'ticket.number', { max: 24 }).toUpperCase(),
    loadId: requireString(input.loadId, 'ticket.loadId', { max: 40 }),
    scale: requireString(input.scale, 'ticket.scale', { max: 60 }),
    weighedOn: parseDate(input.weighedOn, 'weighedOn'),
    grossLb: roundTo(grossLb, 0),
    tareLb: requireNumber(input.tareLb ?? 0, 'tareLb', { min: 0, max: 60000 }),
    axles,
  };
}

export function netLb(ticket) {
  return roundTo(ticket.grossLb - ticket.tareLb, 0);
}

export function axleOverages(ticket) {
  return sortBy(
    Object.entries(ticket.axles)
      .filter(([axle, weight]) => weight > AXLE_LIMITS_LB[axle])
      .map(([axle, weight]) => ({
        axle,
        weightLb: weight,
        limitLb: AXLE_LIMITS_LB[axle],
        overLb: roundTo(weight - AXLE_LIMITS_LB[axle], 0),
      })),
    (row) => row.axle
  );
}

export function grossOverageLb(ticket, kind) {
  return Math.max(0, roundTo(ticket.grossLb - grossLimitLb(kind), 0));
}

export function isTicketLegal(ticket, kind) {
  return grossOverageLb(ticket, kind) === 0 && axleOverages(ticket).length === 0;
}

export function checkTicket(ticket, kind) {
  const overages = axleOverages(ticket);
  if (overages.length > 0) {
    throw new RuleViolation(
      'SC-1',
      `${ticket.number} is over on the ${overages.map((row) => row.axle).join(' and ')}`,
      { ticket: ticket.number, overages }
    );
  }
  const over = grossOverageLb(ticket, kind);
  if (over > 0) {
    throw new RuleViolation('SC-2', `${ticket.number} is ${over} lb over gross`, {
      ticket: ticket.number,
      overLb: over,
    });
  }
  return true;
}

/** What the ticket says against what the office worked out. */
export function compareToEstimate(ticket, estimateLb) {
  const estimate = requireNumber(estimateLb, 'estimateLb', { min: 0, max: 200000 });
  const difference = roundTo(ticket.grossLb - estimate, 0);
  return {
    ticket: ticket.number,
    ticketLb: ticket.grossLb,
    estimateLb: roundTo(estimate, 0),
    differenceLb: difference,
    withinTolerance: Math.abs(difference) <= ESTIMATE_TOLERANCE_LB,
  };
}

/** Pallets the difference suggests, when the ticket and the estimate disagree. */
export function palletsUnaccounted(comparison, palletLb) {
  const each = requireNumber(palletLb, 'palletLb', { min: 1 });
  if (comparison.withinTolerance) return 0;
  return Math.round(comparison.differenceLb / each);
}

export function ticketRegister(tickets) {
  return sortBy(
    tickets,
    (ticket) => ticket.weighedOn,
    (ticket) => ticket.number
  ).map((ticket) => ({
    number: ticket.number,
    loadId: ticket.loadId,
    weighedOn: ticket.weighedOn,
    grossLb: ticket.grossLb,
    netLb: netLb(ticket),
    axlesOver: axleOverages(ticket).length,
  }));
}

export function heaviestTicket(tickets) {
  if (tickets.length === 0) return null;
  return sortBy(
    tickets,
    (ticket) => -ticket.grossLb,
    (ticket) => ticket.number
  )[0];
}

export function averageGrossLb(tickets) {
  if (tickets.length === 0) return 0;
  return roundTo(
    sumBy(tickets, (ticket) => ticket.grossLb) /
      requireInteger(tickets.length, 'tickets', { min: 1 }),
    0
  );
}
