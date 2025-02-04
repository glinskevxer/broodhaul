import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MINIMUM_YARD_SEPARATION_MILES,
  openDesk,
  separationProblems,
  dropWindowProblems,
  treatmentProblems,
  holdProblems,
  journalProblems,
  problems,
  problemCounts,
  requireClean,
} from '../src/desk.js';
import { fixedClock } from '../src/core/clock.js';
import { aYard, aColony, aPallet } from './helpers/records.js';
import { aContract } from './helpers/contracts.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-desk-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-06-20') });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const aDrop = (overrides = {}) => ({
  id: 'DR-2025-0004',
  contractId: 'CT-2025-0007',
  blockId: 'BK-2025-0001',
  location: { latitude: 36.9, longitude: -120.1 },
  ordered: 24,
  ...overrides,
});

const aTreatment = (overrides = {}) => ({
  id: 'TR-2025-0021',
  yardId: 'YD-2025-0001',
  colonies: ['CY-2025-0011'],
  product: 'apivar',
  appliedOn: '2025-01-14',
  temperatureF: 60,
  applicator: 'M Ojeda',
  units: 2,
  ...overrides,
});

const anInspection = (overrides = {}) => ({
  id: 'IS-2025-0003',
  yardId: 'YD-2025-0001',
  date: '2025-06-12',
  inspector: 'L Prentice',
  coloniesOpened: 24,
  findings: ['afb'],
  coloniesAffected: 2,
  ...overrides,
});

describe('openDesk', () => {
  it('refuses a desk with no root or no actor', () => {
    expect(() => openDesk({ actor: 'M Ojeda' })).toThrow(/root must be a string/);
    expect(() => openDesk({ root })).toThrow(/actor must be a string/);
  });

  it('keeps the actor and the root', () => {
    expect(desk.actor).toBe('M Ojeda');
    expect(desk.root).toBe(root);
  });
});

describe('save and remove', () => {
  it('writes the record and journals an insert', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    const entries = desk.journal.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('insert');
    expect(entries[0].actor).toBe('M Ojeda');
  });

  it('journals the second write as an update', () => {
    desk.save('yards', aYard({ sequence: 1, capacity: 96 }));
    desk.save('yards', aYard({ sequence: 1, capacity: 48 }));
    expect(desk.journal.read().map((entry) => entry.action)).toEqual([
      'insert',
      'update',
    ]);
  });

  it('journals a removal only when something was there', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    expect(desk.remove('yards', 'YD-2025-0001')).toBe(true);
    expect(desk.remove('yards', 'YD-2025-0001')).toBe(false);
    expect(
      desk.journal.read().filter((entry) => entry.action === 'remove')
    ).toHaveLength(1);
  });
});

describe('register', () => {
  it('builds from what is on file', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('colonies', aColony({ sequence: 11 }));
    desk.save('pallets', aPallet({ sequence: 21 }));
    const register = desk.register();
    expect(register.yards.size).toBe(1);
    expect(register.colonies.size).toBe(1);
  });
});

describe('separationProblems', () => {
  it('is quiet with one yard', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    expect(separationProblems(desk)).toEqual([]);
  });

  it('reports two yards on top of each other', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('yards', aYard({ sequence: 2 }));
    const found = separationProblems(desk);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('yards_too_close');
    expect(found[0].minimumMiles).toBe(MINIMUM_YARD_SEPARATION_MILES);
  });

  it('is quiet once they are apart', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save(
      'yards',
      aYard({ sequence: 2, location: { latitude: 36.6, longitude: -119.4 } })
    );
    expect(separationProblems(desk)).toEqual([]);
  });
});

describe('dropWindowProblems', () => {
  it('reports a drop pointing at a contract that is gone', () => {
    desk.save('drops', aDrop());
    expect(dropWindowProblems(desk)[0].kind).toBe('drop_contract_missing');
  });

  it('is quiet on a drop set inside the window', () => {
    desk.save('contracts', aContract());
    desk.save('drops', aDrop({ set: 24, setOn: '2025-02-04' }));
    expect(dropWindowProblems(desk)).toEqual([]);
  });

  it('reports a set outside the delivery window', () => {
    desk.save('contracts', aContract());
    desk.save('drops', aDrop({ set: 24, setOn: '2025-02-20' }));
    const found = dropWindowProblems(desk);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('PL-3');
  });

  it('reports a set and a pull that are both wrong', () => {
    desk.save('contracts', aContract());
    desk.save('drops', aDrop({ set: 24, setOn: '2025-02-20', pulledOn: '2025-04-20' }));
    expect(dropWindowProblems(desk)).toHaveLength(2);
  });
});

describe('treatmentProblems', () => {
  it('reports a treatment that is past due and still on', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('treatments', aTreatment());
    expect(treatmentProblems(desk)[0].kind).toBe('treatment_overdue');
  });

  it('is quiet once it has been pulled', () => {
    desk.save('treatments', aTreatment({ removedOn: '2025-02-25' }));
    expect(treatmentProblems(desk)).toEqual([]);
  });

  it('is quiet while it is still inside its run', () => {
    desk.save('treatments', aTreatment({ appliedOn: '2025-06-01' }));
    expect(treatmentProblems(desk)).toEqual([]);
  });
});

describe('holdProblems', () => {
  it('reports a load planned out of a held yard', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('inspections', anInspection());
    desk.save('loads', {
      id: 'LD-2025-0143',
      truck: { unit: 'BH-7', kind: 'semi' },
      driver: 'D Rasmussen',
      originYardId: 'YD-2025-0001',
      destination: { kind: 'yard', id: 'YD-2025-0002' },
      pallets: ['PL-2025-0031'],
    });
    expect(holdProblems(desk)[0].kind).toBe('load_out_of_held_yard');
  });

  it('is quiet when the hold has run out', () => {
    desk.save('inspections', anInspection({ date: '2025-01-01' }));
    desk.save('loads', {
      id: 'LD-2025-0143',
      truck: { unit: 'BH-7', kind: 'semi' },
      driver: 'D Rasmussen',
      originYardId: 'YD-2025-0001',
      destination: { kind: 'yard', id: 'YD-2025-0002' },
      pallets: ['PL-2025-0031'],
    });
    expect(holdProblems(desk)).toEqual([]);
  });

  it('is quiet for a load already delivered', () => {
    desk.save('inspections', anInspection());
    desk.save('loads', {
      id: 'LD-2025-0143',
      truck: { unit: 'BH-7', kind: 'semi' },
      driver: 'D Rasmussen',
      originYardId: 'YD-2025-0001',
      destination: { kind: 'yard', id: 'YD-2025-0002' },
      pallets: ['PL-2025-0031'],
      state: 'delivered',
      loadedOn: '2025-06-13',
      deliveredOn: '2025-06-14',
    });
    expect(holdProblems(desk)).toEqual([]);
  });
});

describe('journalProblems', () => {
  it('is quiet when everything went through the desk', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    expect(journalProblems(desk)).toEqual([]);
  });

  it('reports a record written behind the desk', () => {
    desk.store.put('yards', aYard({ sequence: 1 }));
    expect(journalProblems(desk)).toEqual([]);
  });

  it('reports a record the store has moved on from', () => {
    desk.save('yards', aYard({ sequence: 1, capacity: 96 }));
    desk.store.update('yards', 'YD-2025-0001', { capacity: 48 });
    expect(journalProblems(desk)[0].kind).toBe('record_ahead_of_journal');
  });

  it('reports a record the journal has and the store lost', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.store.remove('yards', 'YD-2025-0001');
    expect(journalProblems(desk)[0].kind).toBe('record_missing_from_store');
  });
});

describe('problems and problemCounts', () => {
  it('is empty on an empty desk', () => {
    expect(problems(desk)).toEqual([]);
    expect(problemCounts(desk)).toEqual([]);
    expect(requireClean(desk)).toBe(true);
  });

  it('gathers every check into one sorted list', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('yards', aYard({ sequence: 2 }));
    desk.save('drops', aDrop());
    const found = problems(desk);
    expect(found.map((problem) => problem.kind)).toEqual([
      'drop_contract_missing',
      'yards_too_close',
    ]);
  });

  it('counts by kind', () => {
    desk.save('yards', aYard({ sequence: 1 }));
    desk.save('yards', aYard({ sequence: 2 }));
    expect(problemCounts(desk)).toEqual([{ kind: 'yards_too_close', count: 1 }]);
  });

  it('refuses to call a dirty desk clean', () => {
    desk.save('drops', aDrop());
    expect(() => requireClean(desk)).toThrow(/the desk has 1 problems/);
  });
});
