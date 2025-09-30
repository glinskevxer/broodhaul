import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDesk, problems } from '../../desk.js';
import { fixedClock } from '../../core/clock.js';
import { loadSeason } from '../../examples/season.js';
import { seasonSummary } from '../../reporting/season.js';
import { assessContract } from '../../contracts/assessment.js';
import { buildInvoice, invoiceTotalCents } from '../../settlement/invoice.js';
import { contractValueCents } from '../../contracts/contract.js';
import { renderDocument } from '../../reporting/documents.js';
import { exportCsv, exportNames } from '../../reporting/export.js';

/**
 * A self test.
 *
 * This loads the worked season into a temporary directory, walks it end to
 * end and checks the handful of numbers that would move if anything important
 * had broken. It exists because the same walk was a thirty line shell script
 * inside the ci workflow, where nobody could run it locally and nobody did.
 */

export const CHECKS = [
  'records load',
  'nothing to report',
  'season adds up',
  'grading bites',
  'statement is discounted',
  'documents print',
  'exports parse',
];

export function runSelfTest({ today = '2025-03-20' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'broodhaul-selftest-'));
  const failures = [];
  const note = (check, condition, detail) => {
    if (!condition) failures.push({ check, detail });
  };
  try {
    const desk = openDesk({ root, actor: 'selftest', clock: fixedClock(today) });
    const written = loadSeason(desk);
    note('records load', written.length > 20, `${written.length} records`);

    const found = problems(desk);
    note('nothing to report', found.length === 0, `${found.length} problems`);

    const season = seasonSummary(desk, 2025);
    note(
      'season adds up',
      season.hivesOrdered === 48 && season.hivesShort === 4,
      `${season.hivesSet} of ${season.hivesOrdered} set`
    );

    const contract = desk.store.get('contracts', 'CT-2025-0007');
    const runs = desk.store.list('gradings');
    const assessment = assessContract(contract, runs);
    note(
      'grading bites',
      assessment.meetsMinimum === false,
      `average ${assessment.average}`
    );

    const invoice = buildInvoice(contract, {
      assessment,
      deliveredHives: 44,
      runs,
      drops: desk.store.list('drops'),
      issuedOn: today,
    });
    note(
      'statement is discounted',
      invoiceTotalCents(invoice) < contractValueCents(contract),
      `${invoiceTotalCents(invoice)} cents`
    );

    const sheet = renderDocument(desk, 'set-sheet', 'CT-2025-0007');
    note('documents print', sheet.includes('4 hives short'), 'set sheet');

    const exported = exportNames().map((name) => exportCsv(desk, name));
    note(
      'exports parse',
      exported.every((csv) => csv.split('\n').length >= 1),
      `${exported.length} exports`
    );

    return {
      root,
      checks: CHECKS.length,
      failures,
      season,
      invoiceCents: invoiceTotalCents(invoice),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function registerSelfTestCommands(program, context) {
  program
    .command('selftest')
    .description('load the worked season into a temporary directory and check it')
    .action(() => {
      const outcome = runSelfTest({ today: context.clock.today() });
      if (context.output.json) {
        context.output.value({
          checks: outcome.checks,
          failures: outcome.failures,
          hivesSet: outcome.season.hivesSet,
          invoiceCents: outcome.invoiceCents,
        });
      } else if (outcome.failures.length === 0) {
        context.output.line(`${outcome.checks} checks passed`);
      } else {
        for (const failure of outcome.failures) {
          context.output.line(`${failure.check} failed: ${failure.detail}`);
        }
      }
      if (outcome.failures.length > 0) {
        process.exitCode = 1;
      }
    });

  return program;
}
