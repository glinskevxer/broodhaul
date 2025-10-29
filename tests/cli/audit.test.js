import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliRunner } from '../helpers/cli.js';
import { collectionNames } from '../../src/store/repository.js';

let root;

const run = cliRunner(() => root, { today: '2025-03-20' });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'broodhaul-audit-cli-'));
  await run(['example', 'load']);
  await run(['yard', 'remove', 'YD-2025-0002'], { today: '2025-03-21' });
  await run(
    ['colony', 'requeen', 'CY-2025-0011', '--source', 'Olivarez', '--on', '2025-04-02'],
    {
      today: '2025-04-02',
      actor: 'D Rasmussen',
    }
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('audit summary', () => {
  it('adds the journal up', async () => {
    const { status, capture } = await run(['audit', 'summary'], { json: true });
    expect(status).toBe(0);
    expect(capture.parsed.writes).toBe(26);
    expect(capture.parsed.actors).toBe(2);
    expect(capture.parsed.removals).toBe(1);
  });

  it('narrows to a window', async () => {
    const { capture } = await run(['audit', 'summary', '--since', '2025-04-01'], {
      json: true,
    });
    expect(capture.parsed.writes).toBe(1);
  });

  it('names the busiest day', async () => {
    const { capture } = await run(['audit', 'summary']);
    expect(capture.stdout).toContain('busiest day  2025-03-20');
  });
});

describe('audit actors', () => {
  it('counts what each person wrote', async () => {
    const { capture } = await run(['audit', 'actors'], { json: true });
    expect(capture.parsed.map((row) => row.actor)).toEqual(['D Rasmussen', 'M Ojeda']);
    expect(capture.parsed.find((row) => row.actor === 'D Rasmussen').updates).toBe(1);
  });

  it('prints a table', async () => {
    const { capture } = await run(['audit', 'actors']);
    expect(capture.lines[0]).toContain('inserts');
  });
});

describe('audit days and collections', () => {
  it('counts the writes a day', async () => {
    const { capture } = await run(['audit', 'days'], { json: true });
    expect(capture.parsed.map((row) => row.day)).toEqual([
      '2025-03-20',
      '2025-03-21',
      '2025-04-02',
    ]);
  });

  it('reports every collection', async () => {
    const { capture } = await run(['audit', 'collections'], { json: true });
    expect(capture.parsed).toHaveLength(collectionNames().length);
    expect(capture.parsed.find((row) => row.collection === 'colonies').writes).toBe(13);
  });
});

describe('audit history', () => {
  it('walks one record forward', async () => {
    const { capture } = await run(['audit', 'history', 'colonies', 'CY-2025-0011'], {
      json: true,
    });
    expect(capture.parsed.map((row) => row.action)).toEqual(['insert', 'update']);
    expect(capture.parsed[1].changed).toEqual(['queen']);
  });

  it('is empty for a record nobody touched', async () => {
    const { capture } = await run(['audit', 'history', 'colonies', 'CY-2025-0099'], {
      json: true,
    });
    expect(capture.parsed).toEqual([]);
  });

  it('prints the changed fields', async () => {
    const { capture } = await run(['audit', 'history', 'colonies', 'CY-2025-0011']);
    expect(capture.lines[0]).toContain('changed');
    expect(capture.stdout).toContain('queen');
  });
});

describe('audit reworked and removed', () => {
  it('names nothing at the default threshold', async () => {
    const { capture } = await run(['audit', 'reworked'], { json: true });
    expect(capture.parsed).toEqual([]);
  });

  it('names the twice touched records at a lower threshold', async () => {
    const { capture } = await run(['audit', 'reworked', '--at-least', '2'], {
      json: true,
    });
    expect(capture.parsed.map((row) => row.id).sort()).toEqual([
      'CY-2025-0011',
      'YD-2025-0002',
    ]);
  });

  it('names the removed yard', async () => {
    const { capture } = await run(['audit', 'removed'], { json: true });
    expect(capture.parsed).toEqual([
      {
        collection: 'yards',
        id: 'YD-2025-0002',
        removedOn: '2025-03-21',
        by: 'M Ojeda',
        lastState: undefined,
      },
    ]);
  });
});
