import { describe, it, expect } from 'vitest';
import {
  prorateFactor,
  payableShare,
  applyShortfall,
  shortfallValueCents,
  forgoneCents,
} from '../../src/contracts/shortfall.js';
import { assessContract } from '../../src/contracts/assessment.js';
import { aContract, aRun } from '../helpers/contracts.js';

const light = aRun();
const strong = aRun({ frames: [9, 9, 9, 9] });

const assess = (contract, run) => assessContract(contract, [run]);

describe('prorateFactor', () => {
  it('is one when the minimum was met', () => {
    const contract = aContract();
    expect(prorateFactor(contract, assess(contract, strong))).toBe(1);
  });

  it('is the ratio of the average to the minimum', () => {
    const contract = aContract();
    expect(prorateFactor(contract, assess(contract, light))).toBe(0.875);
  });

  it('reports to four places', () => {
    const contract = aContract();
    const uneven = aRun({ frames: [7, 7, 7.25] });
    expect(prorateFactor(contract, assess(contract, uneven))).toBe(0.885);
  });
});

describe('payableShare', () => {
  it('is the share of the sample that made the minimum', () => {
    const contract = aContract();
    expect(payableShare(contract, [light])).toBe(0.5);
  });

  it('is one when every opened hive made it', () => {
    const contract = aContract();
    expect(payableShare(contract, [strong])).toBe(1);
  });

  it('is nothing when none did', () => {
    const contract = aContract();
    expect(payableShare(contract, [aRun({ frames: [4, 5] })])).toBe(0);
  });

  it('refuses a contract with nothing graded', () => {
    expect(() => payableShare(aContract(), [])).toThrow(/has no grading readings/);
  });
});

describe('applyShortfall when the minimum was met', () => {
  it('pays every delivered hive at the tiered rate whatever the rule says', () => {
    for (const shortfall of ['prorate', 'reject', 'tier']) {
      const contract = aContract({ terms: { shortfall } });
      const outcome = applyShortfall(contract, assess(contract, strong), 377, [strong]);
      expect(outcome.payableHives).toBe(377);
      expect(outcome.rateCents).toBe(20500);
      expect(outcome.note).toBe('minimum met');
    }
  });
});

describe('applyShortfall under prorate', () => {
  const contract = aContract({ terms: { shortfall: 'prorate' } });
  const outcome = () => applyShortfall(contract, assess(contract, light), 377, [light]);

  it('keeps every hive payable', () => {
    expect(outcome().payableHives).toBe(377);
  });

  it('scales the tiered rate by the shortfall', () => {
    expect(outcome().rateCents).toBe(15750);
  });

  it('says what percentage was paid', () => {
    expect(outcome().note).toBe('rate prorated to 87.5 percent');
  });

  it('values the delivery at the prorated rate', () => {
    expect(shortfallValueCents(outcome())).toBe(5937750);
  });
});

describe('applyShortfall under reject', () => {
  const contract = aContract({ terms: { shortfall: 'reject' } });
  const outcome = () => applyShortfall(contract, assess(contract, light), 377, [light]);

  it('cuts the payable hives to the share that made weight', () => {
    expect(outcome().payableHives).toBe(188);
  });

  it('rounds the payable count down', () => {
    const odd = applyShortfall(contract, assess(contract, light), 5, [light]);
    expect(odd.payableHives).toBe(2);
  });

  it('leaves the rate at the tiered figure', () => {
    expect(outcome().rateCents).toBe(18000);
  });

  it('says how many hives of how many were paid', () => {
    expect(outcome().note).toBe('188 of 377 hives made the minimum in the sample');
  });

  it('pays nothing at all when no opened hive made weight', () => {
    const dead = aRun({ frames: [4, 4, 4, 4] });
    const nothing = applyShortfall(contract, assess(contract, dead), 377, [dead]);
    expect(nothing.payableHives).toBe(0);
    expect(shortfallValueCents(nothing)).toBe(0);
  });
});

describe('applyShortfall under tier', () => {
  const contract = aContract({ terms: { shortfall: 'tier' } });

  it('leaves the tiered rate to carry it', () => {
    const outcome = applyShortfall(contract, assess(contract, light), 377, [light]);
    expect(outcome.payableHives).toBe(377);
    expect(outcome.rateCents).toBe(18000);
    expect(outcome.factor).toBe(1);
  });
});

describe('the three rules against the same bees', () => {
  it('pay three different amounts', () => {
    const totals = ['prorate', 'reject', 'tier'].map((shortfall) => {
      const contract = aContract({ terms: { shortfall } });
      return shortfallValueCents(
        applyShortfall(contract, assess(contract, light), 377, [light])
      );
    });
    expect(totals).toEqual([5937750, 3384000, 6786000]);
    expect(new Set(totals).size).toBe(3);
  });
});

describe('forgoneCents', () => {
  it('is what the shortfall cost against a clean delivery', () => {
    const contract = aContract({ terms: { shortfall: 'prorate' } });
    const outcome = applyShortfall(contract, assess(contract, light), 377, [light]);
    expect(forgoneCents(contract, outcome, 377)).toBe(1790750);
  });

  it('is nothing when the drop made weight', () => {
    const contract = aContract();
    const outcome = applyShortfall(contract, assess(contract, strong), 377, [strong]);
    expect(forgoneCents(contract, outcome, 377)).toBe(0);
  });
});

describe('applyShortfall input checks', () => {
  it('refuses a fractional delivered count', () => {
    const contract = aContract();
    expect(() =>
      applyShortfall(contract, assess(contract, light), 12.5, [light])
    ).toThrow(/whole number/);
  });

  it('handles a delivery of nothing', () => {
    const contract = aContract({ terms: { shortfall: 'reject' } });
    const outcome = applyShortfall(contract, assess(contract, light), 0, [light]);
    expect(outcome.payableHives).toBe(0);
  });
});
