import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DOCUMENTS,
  documentNames,
  renderDocument,
  setSheet,
  loadManifest,
  gradingCertificate,
} from '../../src/reporting/documents.js';
import { openDesk } from '../../src/desk.js';
import { fixedClock } from '../../src/core/clock.js';
import { loadSeason } from '../../src/examples/season.js';

let root;
let desk;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-documents-'));
  desk = openDesk({ root, actor: 'M Ojeda', clock: fixedClock('2025-03-20') });
  loadSeason(desk);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const noTrailingSpace = (text) => {
  for (const line of text.split('\n')) {
    expect(line).toBe(line.replace(/\s+$/, ''));
  }
};

describe('setSheet', () => {
  const sheet = () => setSheet(desk, 'CT-2025-0007');

  it('heads with the contract', () => {
    expect(sheet().split('\n')[0]).toBe('set sheet CT-2025-0007');
  });

  it('names the grower and the windows', () => {
    expect(sheet()).toContain('Wilkins Farming');
    expect(sheet()).toContain('2025-02-01 to 2025-02-10');
  });

  it('shows the drop and what it came up short', () => {
    expect(sheet()).toContain('DR-2025-0004');
    expect(sheet()).toContain('4 hives short');
  });

  it('says nothing short when the drop was filled', () => {
    const drop = desk.store.get('drops', 'DR-2025-0004');
    desk.save('drops', { ...drop, set: drop.ordered });
    expect(sheet()).toContain('nothing short');
  });

  it('prints the drop notes underneath, wrapped', () => {
    expect(sheet()).toContain('DR-2025-0004 notes');
    for (const line of sheet().split('\n')) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
  });

  it('never leaves a trailing space', () => {
    noTrailingSpace(sheet());
  });

  it('refuses a contract that is not on file', () => {
    expect(() => setSheet(desk, 'CT-2025-0099')).toThrow(/no contract with id/);
  });
});

describe('loadManifest', () => {
  const manifest = () => loadManifest(desk, 'LD-2025-0143');

  it('heads with the load', () => {
    expect(manifest().split('\n')[0]).toBe('manifest LD-2025-0143');
  });

  it('names the truck, the driver and the plate', () => {
    expect(manifest()).toContain('BH-7 (4XY1234)');
    expect(manifest()).toContain('D Rasmussen');
  });

  it('counts the pallets and the colonies aboard', () => {
    expect(manifest()).toMatch(/pallets +2/);
    expect(manifest()).toMatch(/colonies +8/);
  });

  it('lists the brands so the inspector can read them off the trailer', () => {
    expect(manifest()).toContain('brands aboard');
    expect(manifest()).toContain('CY-2025-0011');
  });

  it('says there is no permit when there is none', () => {
    expect(manifest()).toMatch(/permit +none/);
  });

  it('refuses a load naming a pallet that is gone', () => {
    desk.store.remove('pallets', 'PL-2025-0031');
    expect(() => manifest()).toThrow(/no pallet with id PL-2025-0031/);
  });

  it('never leaves a trailing space', () => {
    noTrailingSpace(manifest());
  });
});

describe('gradingCertificate', () => {
  const certificate = () => gradingCertificate(desk, 'GR-2025-0009');

  it('heads with the run', () => {
    expect(certificate().split('\n')[0]).toBe('grading certificate GR-2025-0009');
  });

  it('shows the conditions and the method they gave', () => {
    expect(certificate()).toContain('2025-02-14 11:30, 63F');
    expect(certificate()).toMatch(/method +frame/);
  });

  it('shows what was called and what it counted for', () => {
    expect(certificate()).toContain('called');
    expect(certificate()).toContain('counted');
  });

  it('flags the queenless colony', () => {
    expect(certificate()).toContain('queenless');
  });

  it('shows the average against the contract minimum', () => {
    expect(certificate()).toMatch(/minimum +8/);
  });

  it('ends with somewhere for the grower to sign', () => {
    expect(certificate().trim().split('\n').pop()).toContain('grower signature');
  });

  it('never leaves a trailing space', () => {
    noTrailingSpace(certificate());
  });
});

describe('renderDocument', () => {
  it('names the documents it can print', () => {
    expect(documentNames()).toEqual(['certificate', 'manifest', 'set-sheet']);
    expect(Object.keys(DOCUMENTS).sort()).toEqual(documentNames());
  });

  it('dispatches to the right one', () => {
    expect(renderDocument(desk, 'set-sheet', 'CT-2025-0007')).toBe(
      setSheet(desk, 'CT-2025-0007')
    );
    expect(renderDocument(desk, 'manifest', 'LD-2025-0143')).toBe(
      loadManifest(desk, 'LD-2025-0143')
    );
  });

  it('refuses a document nobody prints', () => {
    expect(() => renderDocument(desk, 'invoice', 'x')).toThrow(
      /no document with id invoice/
    );
  });
});
