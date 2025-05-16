import { describe, it, expect } from 'vitest';
import {
  candidateProducts,
  planYard,
  planDay,
  yardsToTreat,
  yardsBlocked,
  yardsWithNothingToUse,
  supersReturnAfter,
  latestStartFor,
  fitsBeforeBloom,
  describePlanRow,
  seasonOfPlan,
} from '../../src/health/schedule.js';
import { makeWash } from '../../src/health/wash.js';
import { makeTreatment } from '../../src/health/treatment.js';

const wash = (yardId, colonySequence, mites) =>
  makeWash({
    colonyId: `CY-2025-${String(colonySequence).padStart(4, '0')}`,
    yardId,
    date: '2025-08-14',
    mites,
  });

const treatment = (overrides = {}) =>
  makeTreatment({
    id: 'TR-2025-0021',
    yardId: 'YD-2025-0001',
    colonies: ['CY-2025-0011'],
    product: 'apivar',
    appliedOn: '2025-08-01',
    temperatureF: 80,
    applicator: 'M Ojeda',
    units: 2,
    ...overrides,
  });

const conditions = { temperatureF: 80, date: '2025-08-14' };

/** Every product the cold end of the shelf allows, used up for the season. */
const shelfUsedUp = (yardId) => [
  treatment({
    id: 'TR-2025-0001',
    yardId,
    product: 'apivar',
    appliedOn: '2025-01-04',
    temperatureF: 55,
  }),
  treatment({
    id: 'TR-2025-0002',
    yardId,
    product: 'oxalic-dribble',
    appliedOn: '2025-02-04',
    temperatureF: 55,
  }),
  treatment({
    id: 'TR-2025-0003',
    yardId,
    product: 'apivar',
    appliedOn: '2025-03-04',
    temperatureF: 55,
  }),
  treatment({
    id: 'TR-2025-0004',
    yardId,
    product: 'oxalic-dribble',
    appliedOn: '2025-04-04',
    temperatureF: 55,
  }),
  treatment({
    id: 'TR-2025-0005',
    yardId,
    product: 'oxalic-dribble',
    appliedOn: '2025-05-04',
    temperatureF: 55,
  }),
];

describe('candidateProducts', () => {
  it('offers what the label allows when nothing has gone on yet', () => {
    const codes = candidateProducts('YD-2025-0001', conditions, []).map(
      (product) => product.code
    );
    expect(codes).toEqual([
      'apiguard',
      'apistan',
      'apivar',
      'formic-pro',
      'oxalic-dribble',
    ]);
  });

  it('narrows to one product with the supers up', () => {
    const codes = candidateProducts(
      'YD-2025-0001',
      { ...conditions, supersOn: true },
      []
    ).map((product) => product.code);
    expect(codes).toEqual(['formic-pro']);
  });

  it('drops the class that just went on', () => {
    const codes = candidateProducts('YD-2025-0001', conditions, [treatment()]).map(
      (product) => product.code
    );
    expect(codes).not.toContain('apivar');
  });

  it('drops a product that has used its season cap', () => {
    const used = [
      treatment({
        id: 'TR-2025-0021',
        product: 'apistan',
        appliedOn: '2025-01-04',
        temperatureF: 60,
      }),
    ];
    const codes = candidateProducts('YD-2025-0001', conditions, used).map(
      (product) => product.code
    );
    expect(codes).not.toContain('apistan');
  });

  it('offers nothing at all in the wrong weather with supers on', () => {
    const codes = candidateProducts(
      'YD-2025-0001',
      { ...conditions, temperatureF: 95, supersOn: true },
      []
    );
    expect(codes).toEqual([]);
  });
});

describe('planYard', () => {
  it('says so when a yard was never sampled', () => {
    expect(planYard('YD-2025-0001', [], conditions, [])).toEqual({
      yardId: 'YD-2025-0001',
      sampled: 0,
      rate: null,
      action: 'no samples',
      products: [],
    });
  });

  it('reads the rate off the washes and calls it', () => {
    const washes = [wash('YD-2025-0001', 11, 9), wash('YD-2025-0001', 12, 21)];
    const row = planYard('YD-2025-0001', washes, conditions, []);
    expect(row.sampled).toBe(2);
    expect(row.rate).toBe(5);
    expect(row.action).toBe('urgent');
    expect(row.products.length).toBeGreaterThan(0);
  });

  it('offers nothing for a yard that does not need treating', () => {
    const washes = [wash('YD-2025-0001', 11, 3)];
    const row = planYard('YD-2025-0001', washes, conditions, []);
    expect(row.action).toBe('none');
    expect(row.products).toEqual([]);
  });

  it('reports a blocked yard rather than a treatable one', () => {
    const washes = [wash('YD-2025-0001', 11, 12)];
    const row = planYard('YD-2025-0001', washes, { ...conditions, supersOn: true }, []);
    expect(row.blocked).toBe(true);
    expect(row.products).toEqual([]);
  });

  it('leaves out washes from another yard', () => {
    const washes = [wash('YD-2025-0002', 21, 30)];
    expect(planYard('YD-2025-0001', washes, conditions, []).sampled).toBe(0);
  });
});

describe('planDay', () => {
  const washes = [
    wash('YD-2025-0001', 11, 6),
    wash('YD-2025-0002', 21, 21),
    wash('YD-2025-0003', 31, 0),
  ];
  const yards = ['YD-2025-0001', 'YD-2025-0002', 'YD-2025-0003', 'YD-2025-0004'];

  it('puts the worst yard first', () => {
    const plan = planDay(yards, washes, conditions, []);
    expect(plan.map((row) => row.yardId)).toEqual([
      'YD-2025-0002',
      'YD-2025-0001',
      'YD-2025-0003',
      'YD-2025-0004',
    ]);
  });

  it('keeps the unsampled yards on the list', () => {
    const plan = planDay(yards, washes, conditions, []);
    expect(plan.find((row) => row.yardId === 'YD-2025-0004').action).toBe('no samples');
  });

  it('names the yards that need treating', () => {
    const plan = planDay(yards, washes, conditions, []);
    expect(yardsToTreat(plan).map((row) => row.yardId)).toEqual([
      'YD-2025-0002',
      'YD-2025-0001',
    ]);
  });

  it('names the yards that are blocked by supers', () => {
    const plan = planDay(yards, washes, { ...conditions, supersOn: true }, []);
    expect(yardsBlocked(plan).map((row) => row.yardId)).toEqual([
      'YD-2025-0002',
      'YD-2025-0001',
    ]);
    expect(yardsToTreat(plan)).toEqual([]);
  });

  it('names the yards with nothing left to use', () => {
    const plan = planDay(
      yards,
      washes,
      { ...conditions, temperatureF: 42 },
      shelfUsedUp('YD-2025-0002')
    );
    const stuck = yardsWithNothingToUse(plan);
    expect(stuck.map((row) => row.yardId)).toContain('YD-2025-0002');
  });
});

describe('supers and bloom', () => {
  it('works out when the supers can go back', () => {
    expect(supersReturnAfter('apivar', '2025-08-14')).toBe('2025-10-10');
    expect(supersReturnAfter('formic-pro', '2025-08-14')).toBe('2025-08-29');
  });

  it('works out the latest start for a deadline', () => {
    expect(latestStartFor('apivar', '2025-10-10')).toBe('2025-08-14');
  });

  it('round trips the two', () => {
    for (const code of ['apivar', 'apiguard', 'formic-pro', 'apistan']) {
      const start = latestStartFor(code, '2026-02-01');
      expect(supersReturnAfter(code, start)).toBe('2026-02-01');
    }
  });

  it('says whether a treatment clears before bloom', () => {
    expect(fitsBeforeBloom('apivar', '2025-11-01', '2026-02-01')).toBe(true);
    expect(fitsBeforeBloom('apistan', '2026-01-01', '2026-02-01')).toBe(false);
  });
});

describe('describePlanRow', () => {
  it('says there were no samples', () => {
    expect(describePlanRow(planYard('YD-2025-0001', [], conditions, []))).toBe(
      'YD-2025-0001: no samples'
    );
  });

  it('names the products to use', () => {
    const washes = [wash('YD-2025-0001', 11, 12)];
    const line = describePlanRow(planYard('YD-2025-0001', washes, conditions, []));
    expect(line).toContain('use apiguard or');
  });

  it('says when there is nothing that fits', () => {
    const washes = [wash('YD-2025-0001', 11, 12)];
    const row = planYard(
      'YD-2025-0001',
      washes,
      { ...conditions, temperatureF: 42 },
      shelfUsedUp('YD-2025-0001')
    );
    expect(describePlanRow(row)).toContain('nothing on the shelf fits');
  });

  it('says nothing extra for a quiet yard', () => {
    const washes = [wash('YD-2025-0001', 11, 3)];
    expect(describePlanRow(planYard('YD-2025-0001', washes, conditions, []))).toBe(
      'YD-2025-0001: 1 per hundred, none'
    );
  });
});

describe('seasonOfPlan', () => {
  it('lists the seasons the treatments fall in', () => {
    expect(seasonOfPlan([treatment(), treatment({ appliedOn: '2024-11-14' })])).toEqual(
      [2025]
    );
  });

  it('is empty for no treatments', () => {
    expect(seasonOfPlan([])).toEqual([]);
  });
});
