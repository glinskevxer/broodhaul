import { describe, it, expect } from 'vitest';
import {
  GROUNDS,
  STATES,
  ANSWER_DAYS,
  makeDispute,
  answerBy,
  isOverdue,
  daysOpen,
  advance,
  remedyFor,
  checkAnswerable,
  openDisputes,
  exposureCents,
  settledCents,
  describeDispute,
} from '../../src/contracts/dispute.js';

const dispute = (overrides = {}) =>
  makeDispute({
    id: 'ds-1',
    contractId: 'CT-2025-0007',
    grounds: 'grading',
    raisedOn: '2025-03-20',
    amountCents: 250000,
    ...overrides,
  });

describe('makeDispute', () => {
  it('uppercases the identifier and starts open', () => {
    expect(dispute().id).toBe('DS-1');
    expect(dispute().state).toBe('open');
  });

  it('takes every ground the office sees', () => {
    for (const grounds of GROUNDS) {
      expect(dispute({ grounds }).grounds).toBe(grounds);
    }
  });

  it('refuses a ground nobody raises', () => {
    expect(() => dispute({ grounds: 'weather' })).toThrow(/must be one of/);
  });

  it('refuses a settlement larger than the claim', () => {
    expect(() => dispute({ state: 'settled', settledCents: 300000 })).toThrow(
      /cannot settle for more than it claimed/
    );
  });

  it('refuses a settled dispute with no amount', () => {
    expect(() => dispute({ state: 'settled' })).toThrow(/needs a settled amount/);
  });

  it('takes a settlement of nothing, which is a dispute that failed', () => {
    expect(dispute({ state: 'settled', settledCents: 0 }).settledCents).toBe(0);
  });
});

describe('answerBy and isOverdue', () => {
  it('gives a grading dispute five days', () => {
    expect(answerBy(dispute())).toBe('2025-03-25');
    expect(ANSWER_DAYS.grading).toBe(5);
  });

  it('gives a damage claim three weeks', () => {
    expect(answerBy(dispute({ grounds: 'damage' }))).toBe('2025-04-10');
  });

  it('has an answer window for every ground', () => {
    for (const grounds of GROUNDS) {
      expect(ANSWER_DAYS[grounds]).toBeGreaterThan(0);
    }
  });

  it('is not overdue on the last day', () => {
    expect(isOverdue(dispute(), '2025-03-25')).toBe(false);
    expect(isOverdue(dispute(), '2025-03-26')).toBe(true);
  });

  it('is never overdue once it has been answered', () => {
    const answered = advance(dispute(), 'answered');
    expect(isOverdue(answered, '2025-05-01')).toBe(false);
  });

  it('counts the days it has been open', () => {
    expect(daysOpen(dispute(), '2025-03-30')).toBe(10);
    expect(daysOpen(dispute(), '2025-03-01')).toBe(0);
  });
});

describe('advance', () => {
  it('walks open to answered to settled', () => {
    const answered = advance(dispute(), 'answered');
    expect(answered.state).toBe('answered');
    const settled = advance(answered, 'settled', { settledCents: 100000 });
    expect(settled.state).toBe('settled');
    expect(settled.settledCents).toBe(100000);
  });

  it('can be withdrawn from either live state', () => {
    expect(advance(dispute(), 'withdrawn').state).toBe('withdrawn');
    expect(advance(advance(dispute(), 'answered'), 'withdrawn').state).toBe(
      'withdrawn'
    );
  });

  it('refuses to settle straight from open', () => {
    expect(() => advance(dispute(), 'settled', { settledCents: 1 })).toThrow(
      /cannot move a dispute from open to settled/
    );
  });

  it('refuses to move a settled dispute', () => {
    const settled = advance(advance(dispute(), 'answered'), 'settled', {
      settledCents: 1,
    });
    expect(() => advance(settled, 'withdrawn')).toThrow(
      /cannot move a dispute from settled to/
    );
  });

  it('has a rule for every state', () => {
    for (const state of STATES) {
      expect(() => advance({ ...dispute(), state }, 'withdrawn')).toBeTypeOf(
        'function'
      );
    }
  });
});

describe('remedyFor', () => {
  it('sends a grading dispute to a regrade when the window is open', () => {
    expect(remedyFor(dispute(), { regradeOpen: true })).toBe('regrade');
  });

  it('offers nothing once the regrade window has closed', () => {
    expect(remedyFor(dispute())).toContain('regrade window closed');
  });

  it('settles a count dispute off the load sheets', () => {
    expect(remedyFor(dispute({ grounds: 'count' }))).toContain('load sheets');
  });

  it('refers a damage claim', () => {
    expect(remedyFor(dispute({ grounds: 'damage' }))).toContain('insurer');
  });

  it('offers nothing on a rate that was signed', () => {
    expect(remedyFor(dispute({ grounds: 'rate' }))).toContain('the rate is signed');
  });
});

describe('checkAnswerable', () => {
  it('passes an open dispute inside its window', () => {
    expect(checkAnswerable(dispute(), '2025-03-24')).toBe(true);
  });

  it('refuses one that is already answered', () => {
    expect(() => checkAnswerable(advance(dispute(), 'answered'), '2025-03-24')).toThrow(
      /is answered/
    );
  });

  it('refuses one that has gone past its window', () => {
    try {
      checkAnswerable(dispute(), '2025-04-01');
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('DS-1');
      expect(err.details.answerBy).toBe('2025-03-25');
    }
  });
});

describe('the dispute book', () => {
  const book = [
    dispute({ id: 'ds-1', grounds: 'grading', raisedOn: '2025-03-20' }),
    dispute({
      id: 'ds-2',
      grounds: 'damage',
      raisedOn: '2025-03-18',
      amountCents: 90000,
    }),
    makeDispute({
      id: 'ds-3',
      contractId: 'CT-2025-0007',
      grounds: 'count',
      raisedOn: '2025-02-01',
      amountCents: 40000,
      state: 'settled',
      settledCents: 20000,
    }),
  ];

  it('lists the open ones by answer date', () => {
    const open = openDisputes(book, '2025-03-24');
    expect(open.map((row) => row.id)).toEqual(['DS-1', 'DS-2']);
  });

  it('flags the overdue ones and leaves the rest alone', () => {
    const open = openDisputes(book, '2025-04-01');
    expect(open.find((row) => row.id === 'DS-1').overdue).toBe(true);
    expect(open.find((row) => row.id === 'DS-2').overdue).toBe(false);
  });

  it('totals the exposure on the live ones', () => {
    expect(exposureCents(book)).toBe(340000);
  });

  it('totals what has been settled', () => {
    expect(settledCents(book)).toBe(20000);
  });

  it('is quiet on an empty book', () => {
    expect(openDisputes([], '2025-03-24')).toEqual([]);
    expect(exposureCents([])).toBe(0);
    expect(settledCents([])).toBe(0);
  });
});

describe('describeDispute', () => {
  it('reads like the note on the file', () => {
    expect(describeDispute(dispute(), '2025-03-21')).toBe(
      'DS-1 grading for $2,500.00, answer by 2025-03-25'
    );
  });

  it('says when it is overdue', () => {
    expect(describeDispute(dispute(), '2025-04-01')).toContain('overdue');
  });
});
