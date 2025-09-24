import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDesk, problems } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason, SEASON } from '../../src/examples/season.js';
import { collectionNames } from '../../src/store/repository.js';
import { stableStringify } from '../../src/core/serial.js';
import { exportCsv, exportNames } from '../../src/reporting/export.js';
import { renderSeason } from '../../src/reporting/season.js';
import { renderRegister, registerNames } from '../../src/reporting/registers.js';
import { renderDocument, documentNames } from '../../src/reporting/documents.js';
import { buildInvoice } from '../../src/settlement/invoice.js';
import { assessContract } from '../../src/contracts/assessment.js';
import { chooseSample } from '../../src/grading/sample.js';

/**
 * The same inputs have to give the same bytes.
 *
 * Two offices sync the record directory, and a report that comes out in a
 * different order on the two machines produces a conflict that looks like a
 * data problem and is not. Everything here is a check that some piece of the
 * program does not depend on hash order, insertion order or the wall clock.
 */

let first;
let second;

const build = (root) => {
  const desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
  return desk;
};

beforeEach(() => {
  first = mkdtempSync(join(tmpdir(), 'broodhaul-determinism-a-'));
  second = mkdtempSync(join(tmpdir(), 'broodhaul-determinism-b-'));
});

afterEach(() => {
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
});

describe('two loads of the same season', () => {
  it('write the same bytes for every record', () => {
    const one = build(first);
    const two = build(second);
    for (const collection of collectionNames()) {
      for (const record of one.store.list(collection)) {
        const path = join(first, collection, `${record.id}.json`);
        const other = join(second, collection, `${record.id}.json`);
        expect(readFileSync(path, 'utf8')).toBe(readFileSync(other, 'utf8'));
      }
      expect(two.store.count(collection)).toBe(one.store.count(collection));
    }
  });

  it('report the same problems', () => {
    expect(problems(build(first))).toEqual(problems(build(second)));
  });
});

describe('loading in a different order', () => {
  it('leaves the same records behind', () => {
    const forward = build(first);
    const backward = openDesk({
      root: second,
      actor: 'M Ojeda',
      clock: fixedClock('2025-03-20'),
    });
    for (const collection of [...collectionNames()].reverse()) {
      for (const record of [...SEASON[collection]].reverse()) {
        backward.store.put(collection, record);
      }
    }
    for (const collection of collectionNames()) {
      expect(stableStringify(backward.store.list(collection))).toBe(
        stableStringify(forward.store.list(collection))
      );
    }
  });
});

describe('the reports', () => {
  it('render identically twice', () => {
    const desk = build(first);
    expect(renderSeason(desk, 2025)).toBe(renderSeason(desk, 2025));
    for (const name of registerNames()) {
      expect(renderRegister(desk, name)).toBe(renderRegister(desk, name));
    }
  });

  it('render identically on two machines', () => {
    const one = build(first);
    const two = build(second);
    expect(renderSeason(one, 2025)).toBe(renderSeason(two, 2025));
    for (const name of registerNames()) {
      expect(renderRegister(one, name)).toBe(renderRegister(two, name));
    }
  });

  it('export the same csv on two machines', () => {
    const one = build(first);
    const two = build(second);
    for (const name of exportNames()) {
      expect(exportCsv(one, name)).toBe(exportCsv(two, name));
    }
  });

  it('print the same documents on two machines', () => {
    const one = build(first);
    const two = build(second);
    const ids = {
      'set-sheet': 'CT-2025-0007',
      manifest: 'LD-2025-0143',
      certificate: 'GR-2025-0009',
    };
    for (const name of documentNames()) {
      expect(renderDocument(one, name, ids[name])).toBe(
        renderDocument(two, name, ids[name])
      );
    }
  });
});

describe('the money', () => {
  it('settles to the same cent twice', () => {
    const desk = build(first);
    const contract = desk.store.get('contracts', 'CT-2025-0007');
    const runs = desk.store.list('gradings');
    const build1 = buildInvoice(contract, {
      assessment: assessContract(contract, runs),
      deliveredHives: 44,
      runs,
      drops: desk.store.list('drops'),
      issuedOn: '2025-03-20',
    });
    const build2 = buildInvoice(contract, {
      assessment: assessContract(contract, runs),
      deliveredHives: 44,
      runs,
      drops: desk.store.list('drops'),
      issuedOn: '2025-03-20',
    });
    expect(stableStringify(build1)).toBe(stableStringify(build2));
  });
});

describe('the grading sample', () => {
  const colonies = Array.from({ length: 60 }, (_unused, at) => ({
    id: `CY-2025-${String(at + 1).padStart(4, '0')}`,
    brand: `BH-${String(at + 1).padStart(4, '0')}`,
  }));

  it('picks the same hives from the same seed', () => {
    expect(chooseSample(colonies, 12, 'DR-2025-0004')).toEqual(
      chooseSample(colonies, 12, 'DR-2025-0004')
    );
  });

  it('picks the same hives whatever order the register hands them over', () => {
    expect(chooseSample([...colonies].reverse(), 12, 'DR-2025-0004')).toEqual(
      chooseSample(colonies, 12, 'DR-2025-0004')
    );
  });

  it('picks differently for a different drop', () => {
    expect(chooseSample(colonies, 12, 'DR-2025-0005')).not.toEqual(
      chooseSample(colonies, 12, 'DR-2025-0004')
    );
  });
});
