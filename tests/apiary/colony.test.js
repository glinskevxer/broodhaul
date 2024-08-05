import { describe, it, expect } from 'vitest';
import {
  COLONY_STATUSES,
  makeColony,
  colonyLabel,
  boxCount,
  isProductive,
  allowedTransitions,
  transitionColony,
  requeen,
} from '../../src/apiary/colony.js';

const base = {
  id: 'CY-2025-0112',
  brand: 'bh-4412',
  yardId: 'YD-2025-0004',
  installedOn: '2024-11-12',
  queen: { source: 'Koehnen', race: 'italian', installedOn: '2024-11-12' },
  boxes: { deeps: 2, mediums: 0 },
};

const colony = (overrides = {}) => makeColony({ ...base, ...overrides });

describe('makeColony', () => {
  it('uppercases the brand because that is how it is burned in', () => {
    expect(colony().brand).toBe('BH-4412');
  });

  it('defaults a new colony to active on the day it went in', () => {
    const built = colony();
    expect(built.status).toBe('active');
    expect(built.statusOn).toBe('2024-11-12');
  });

  it('refuses a brand that is too short to read', () => {
    expect(() => colony({ brand: 'ab' })).toThrow(/at least 3 characters/);
  });

  it('refuses a yard identifier of the wrong kind', () => {
    expect(() => colony({ yardId: 'CY-2025-0001' })).toThrow(
      /expected a yard identifier/
    );
  });

  it('refuses a queen installed before the colony existed', () => {
    expect(() =>
      colony({
        queen: { source: 'Koehnen', race: 'italian', installedOn: '2024-11-01' },
      })
    ).toThrow(/before the colony existed/);
  });

  it('refuses a queen race nobody runs', () => {
    expect(() =>
      colony({
        queen: { source: 'Koehnen', race: 'buckfast', installedOn: '2024-11-12' },
      })
    ).toThrow(/queen.race must be one of/);
  });

  it('takes a marked queen colour', () => {
    const built = colony({
      queen: {
        source: 'Koehnen',
        race: 'carniolan',
        installedOn: '2024-11-12',
        marked: 'blue',
      },
    });
    expect(built.queen.marked).toBe('blue');
  });

  it('refuses a marking colour that is not on the wheel', () => {
    expect(() =>
      colony({
        queen: {
          source: 'Koehnen',
          race: 'italian',
          installedOn: '2024-11-12',
          marked: 'purple',
        },
      })
    ).toThrow(/queen.marked must be one of/);
  });

  it('refuses a colony with no boxes at all', () => {
    expect(() => colony({ boxes: { deeps: 0, mediums: 0 } })).toThrow(
      /at least one box/
    );
  });

  it('caps the stack at what a forklift will carry', () => {
    expect(() => colony({ boxes: { deeps: 5, mediums: 0 } })).toThrow(/at most 4/);
    expect(() => colony({ boxes: { deeps: 1, mediums: 7 } })).toThrow(/at most 6/);
  });

  it('refuses a status change dated before the colony existed', () => {
    expect(() => colony({ status: 'dead', statusOn: '2024-10-01' })).toThrow(
      /before it exists/
    );
  });

  it('refuses an unknown key', () => {
    expect(() => makeColony({ ...base, palletId: 'PL-2025-0001' })).toThrow(
      /colony has unknown keys: palletId/
    );
  });
});

describe('colonyLabel', () => {
  it('leads with the brand, which is what is written on the box', () => {
    expect(colonyLabel(colony())).toBe('BH-4412 (CY-2025-0112)');
  });
});

describe('boxCount', () => {
  it('adds the deeps and the mediums', () => {
    expect(boxCount(colony({ boxes: { deeps: 2, mediums: 3 } }))).toBe(5);
  });
});

describe('isProductive', () => {
  it('is true only while the colony is active', () => {
    expect(isProductive(colony())).toBe(true);
    expect(isProductive(colony({ status: 'dead', statusOn: '2025-01-04' }))).toBe(
      false
    );
  });
});

describe('allowedTransitions', () => {
  it('lets an active colony end four ways', () => {
    expect(allowedTransitions('active').sort()).toEqual([
      'combined',
      'dead',
      'sold',
      'split',
    ]);
  });

  it('leaves a dead colony dead', () => {
    expect(allowedTransitions('dead')).toEqual([]);
  });

  it('lets a split come back to active', () => {
    expect(allowedTransitions('split')).toEqual(['active', 'dead']);
  });

  it('has an entry for every status the record allows', () => {
    for (const status of COLONY_STATUSES) {
      expect(Array.isArray(allowedTransitions(status))).toBe(true);
    }
  });

  it('refuses a status it has never heard of', () => {
    expect(() => allowedTransitions('swarmed')).toThrow(/unknown colony status/);
  });

  it('hands back a copy, so a caller cannot edit the table', () => {
    allowedTransitions('active').push('resurrected');
    expect(allowedTransitions('active')).not.toContain('resurrected');
  });
});

describe('transitionColony', () => {
  it('moves an active colony to dead and stamps the day', () => {
    const dead = transitionColony(colony(), 'dead', '2025-01-04');
    expect(dead.status).toBe('dead');
    expect(dead.statusOn).toBe('2025-01-04');
  });

  it('leaves the original alone', () => {
    const original = colony();
    transitionColony(original, 'dead', '2025-01-04');
    expect(original.status).toBe('active');
  });

  it('refuses a move the table does not allow', () => {
    const dead = transitionColony(colony(), 'dead', '2025-01-04');
    expect(() => transitionColony(dead, 'sold', '2025-02-01')).toThrow(
      /a dead colony cannot become sold/
    );
  });

  it('refuses to move backwards in time', () => {
    const dead = transitionColony(colony(), 'dead', '2025-01-04');
    expect(() =>
      transitionColony({ ...dead, status: 'active' }, 'sold', '2024-12-01')
    ).toThrow(/backwards in time/);
  });

  it('allows a same day change', () => {
    const dead = transitionColony(colony(), 'dead', '2024-11-12');
    expect(dead.statusOn).toBe('2024-11-12');
  });

  it('refuses a status that is not on the list', () => {
    expect(() => transitionColony(colony(), 'absconded', '2025-01-04')).toThrow(
      /must be one of/
    );
  });
});

describe('requeen', () => {
  it('replaces the queen and dates her', () => {
    const done = requeen(
      colony(),
      { source: 'Olivarez', race: 'carniolan' },
      '2025-04-02'
    );
    expect(done.queen).toEqual({
      source: 'Olivarez',
      race: 'carniolan',
      installedOn: '2025-04-02',
      marked: undefined,
    });
  });

  it('leaves everything else alone', () => {
    const done = requeen(
      colony(),
      { source: 'Olivarez', race: 'italian' },
      '2025-04-02'
    );
    expect(done.brand).toBe('BH-4412');
    expect(done.installedOn).toBe('2024-11-12');
  });

  it('refuses to requeen a colony that is not active', () => {
    const dead = transitionColony(colony(), 'dead', '2025-01-04');
    expect(() =>
      requeen(dead, { source: 'Olivarez', race: 'italian' }, '2025-04-02')
    ).toThrow(/cannot requeen a dead colony/);
  });
});
