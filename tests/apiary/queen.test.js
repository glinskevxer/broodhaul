import { describe, it, expect } from 'vitest';
import {
  CELL_STAGES,
  DAYS_TO_LAYING,
  GRAFT_TAKE,
  MATING_SUCCESS,
  CELL_BUILDER_CAPACITY,
  makeGraft,
  checkBuilderCapacity,
  cappedOn,
  cellsOutOn,
  layingByOn,
  stageOn,
  expectedCells,
  expectedQueens,
  graftsNeeded,
  batchesNeeded,
  latestGraftDate,
  scheduleFor,
  graftBook,
  takeRate,
  describeGraft,
} from '../../src/apiary/queen.js';

const graft = (overrides = {}) =>
  makeGraft({
    id: 'g-1',
    graftedOn: '2025-04-10',
    grafted: 40,
    builderId: 'CB-1',
    ...overrides,
  });

describe('makeGraft', () => {
  it('uppercases the identifier and defaults the grafter', () => {
    expect(graft().id).toBe('G-1');
    expect(graft().grafter).toBe('experienced');
  });

  it('takes a learner', () => {
    expect(graft({ grafter: 'learning' }).grafter).toBe('learning');
  });

  it('refuses a grafter nobody employs', () => {
    expect(() => graft({ grafter: 'hopeful' })).toThrow(/must be one of/);
  });

  it('refuses a batch of nothing', () => {
    expect(() => graft({ grafted: 0 })).toThrow(/at least 1/);
  });
});

describe('checkBuilderCapacity', () => {
  it('passes a batch the builder can hold', () => {
    expect(checkBuilderCapacity(graft())).toBe(true);
  });

  it('refuses one that would overfill it', () => {
    expect(() => checkBuilderCapacity(graft(), 10)).toThrow(
      /holds 45 cells, this makes 50/
    );
  });

  it('allows a batch sitting exactly on the capacity', () => {
    expect(checkBuilderCapacity(graft({ grafted: CELL_BUILDER_CAPACITY }))).toBe(true);
  });

  it('names the rule', () => {
    try {
      checkBuilderCapacity(graft(), 10);
      throw new Error('should have refused');
    } catch (err) {
      expect(err.rule).toBe('QN-1');
    }
  });
});

describe('the calendar', () => {
  it('works the three dates out from the graft', () => {
    expect(cappedOn(graft())).toBe('2025-04-15');
    expect(cellsOutOn(graft())).toBe('2025-04-20');
    expect(layingByOn(graft())).toBe('2025-05-11');
  });

  it('names the stage on any day', () => {
    expect(stageOn(graft(), '2025-04-10')).toBe('grafted');
    expect(stageOn(graft(), '2025-04-14')).toBe('grafted');
    expect(stageOn(graft(), '2025-04-15')).toBe('capped');
    expect(stageOn(graft(), '2025-04-20')).toBe('in nucs');
    expect(stageOn(graft(), '2025-05-11')).toBe('laying');
    expect(stageOn(graft(), '2025-06-01')).toBe('laying');
  });

  it('only ever names a published stage', () => {
    for (const day of ['2025-04-10', '2025-04-16', '2025-04-25', '2025-06-01']) {
      expect(CELL_STAGES).toContain(stageOn(graft(), day));
    }
  });

  it('gives the schedule in order', () => {
    const schedule = scheduleFor(graft());
    expect(schedule.map((entry) => entry.stage)).toEqual(CELL_STAGES);
    expect(schedule.map((entry) => entry.on)).toEqual(
      [...schedule.map((entry) => entry.on)].sort()
    );
  });

  it('works out the latest graft for a deadline', () => {
    expect(latestGraftDate('2025-05-11')).toBe('2025-04-10');
    expect(DAYS_TO_LAYING).toBe(31);
  });
});

describe('expectedCells and expectedQueens', () => {
  it('applies the take rate', () => {
    expect(expectedCells(graft())).toBe(28);
    expect(expectedCells(graft({ grafter: 'learning' }))).toBe(18);
  });

  it('applies the mating rate on top', () => {
    expect(expectedQueens(graft())).toBe(21);
    expect(MATING_SUCCESS).toBe(0.75);
  });

  it('takes another mating rate', () => {
    expect(expectedQueens(graft(), 0.5)).toBe(14);
    expect(expectedQueens(graft(), 0)).toBe(0);
  });

  it('rounds a part queen away', () => {
    expect(expectedQueens(graft({ grafted: 1 }))).toBe(0);
  });

  it('is lower for a learner at every rate', () => {
    expect(expectedQueens(graft({ grafter: 'learning' }))).toBeLessThan(
      expectedQueens(graft())
    );
    expect(GRAFT_TAKE.learning).toBeLessThan(GRAFT_TAKE.experienced);
  });
});

describe('graftsNeeded and batchesNeeded', () => {
  it('works back from the queens wanted', () => {
    expect(graftsNeeded(100)).toBe(191);
    expect(graftsNeeded(100, { grafter: 'learning' })).toBe(297);
  });

  it('needs more batches for more queens', () => {
    expect(batchesNeeded(100)).toBe(5);
    expect(batchesNeeded(20)).toBe(1);
  });

  it('refuses a target of nothing', () => {
    expect(() => graftsNeeded(0)).toThrow(/at least 1/);
  });

  it('refuses a mating rate of nothing, which would need infinite grafts', () => {
    expect(() => graftsNeeded(100, { matingSuccess: 0 })).toThrow(/at least 0.01/);
  });
});

describe('graftBook', () => {
  const grafts = [
    graft({ id: 'g-2', graftedOn: '2025-05-01' }),
    graft({ id: 'g-1', graftedOn: '2025-04-10' }),
  ];

  it('is empty for no grafts', () => {
    expect(graftBook([], '2025-05-01')).toEqual({
      grafts: 0,
      cells: 0,
      queens: 0,
      stages: [],
    });
  });

  it('sorts by graft date', () => {
    expect(graftBook(grafts, '2025-05-05').stages.map((row) => row.id)).toEqual([
      'G-1',
      'G-2',
    ]);
  });

  it('names the stage each batch is at', () => {
    const book = graftBook(grafts, '2025-05-05');
    expect(book.stages[0].stage).toBe('in nucs');
    expect(book.stages[1].stage).toBe('grafted');
  });

  it('totals the cells and the queens', () => {
    const book = graftBook(grafts, '2025-05-05');
    expect(book.cells).toBe(56);
    expect(book.queens).toBe(42);
  });
});

describe('takeRate', () => {
  it('is the share that made it', () => {
    expect(takeRate(40, 21)).toBe(0.525);
    expect(takeRate(40, 0)).toBe(0);
  });

  it('refuses a batch of nothing', () => {
    expect(() => takeRate(0, 0)).toThrow(/at least 1/);
  });
});

describe('describeGraft', () => {
  it('reads like the tag on the builder', () => {
    expect(describeGraft(graft())).toBe(
      'G-1: 40 grafted 2025-04-10, cells out 2025-04-20, laying by 2025-05-11'
    );
  });
});
