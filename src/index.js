/**
 * The public surface.
 *
 * Anything imported from `broodhaul` comes through here. The rule is that a
 * name only appears in this file once something outside `src/` needs it, so
 * the list stays short enough to read and the internals stay free to move.
 */

export { VERSION } from './cli/program.js';
export { runCli, buildProgram, buildContext } from './cli/program.js';
export { createOutput, captureOutput } from './cli/io.js';

export {
  BroodhaulError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RuleViolation,
  StateError,
  describeError,
  exitCodeFor,
} from './core/errors.js';
export { fixedClock, systemClock } from './core/clock.js';
export {
  parseMoney,
  formatMoney,
  allocate,
  basisPoints,
  sumMoney,
} from './core/money.js';
export { round, roundTo } from './core/rounding.js';
export { parseDate, addDays, diffDays, seasonOf, seasonBounds } from './core/dates.js';
export {
  makeSpan,
  spanContains,
  spansOverlap,
  mergeSpans,
  formatSpan,
} from './core/span.js';
export { makeId, parseId, issueId } from './core/ids.js';

export { openDesk, problems, problemCounts, requireClean } from './desk.js';
export { openStore, collectionNames, storeCounts } from './store/repository.js';
export { openJournal, reconcile } from './store/journal.js';

export { makeYard, ACCESS_GRADES, WATER_SOURCES } from './apiary/yard.js';
export {
  makeColony,
  COLONY_STATUSES,
  transitionColony,
  requeen,
} from './apiary/colony.js';
export {
  makePallet,
  PALLET_PATTERNS,
  setColony,
  removeColony,
} from './apiary/pallet.js';
export { buildRegister, registerProblems, yardOccupancy } from './apiary/register.js';
export { distanceMiles, forageOverlap, separationBreaches } from './apiary/geo.js';

export { makeConditions, methodFor, METHODS } from './grading/conditions.js';
export { sampleSize, chooseSample } from './grading/sample.js';
export {
  makeReading,
  clusterToFrames,
  temperatureCorrection,
} from './grading/frames.js';
export { makeGradingRun, runAverage, summariseRun } from './grading/run.js';

export {
  makeTerms,
  tierFor,
  adjustmentFor,
  GRADE_BASES,
  SHORTFALL_RULES,
} from './contracts/terms.js';
export {
  makeContract,
  contractedHives,
  contractValueCents,
  CROPS,
} from './contracts/contract.js';
export { assessContract, pooledAverage } from './contracts/assessment.js';
export { applyShortfall, shortfallValueCents } from './contracts/shortfall.js';

export { makeBlock, blockTrees, pollinizerShare } from './placement/block.js';
export {
  recommendedDensity,
  recommendedHives,
  explainDensity,
} from './placement/density.js';
export {
  makeDrop,
  shortBy,
  checkSetInWindow,
  checkPullInWindow,
} from './placement/drop.js';
export { planContractDrops, planTotal, planShortfall } from './placement/plan.js';

export { makeLoad, advanceLoad, coloniesAboard, TRUCK_KINDS } from './movement/load.js';
export { loadWeightLb, isLegal, maxPallets, SEASON_STAGES } from './movement/weight.js';
export { makeCertificate, checkMovement, needsEntryPermit } from './movement/permit.js';

export { makeWash, correctedRate, yardRate } from './health/wash.js';
export { actionFor, thresholdOn, stageFor } from './health/threshold.js';
export { getProduct, allProducts, labelBlockers } from './health/product.js';
export {
  makeTreatment,
  checkLabel,
  checkRotation,
  checkSeasonCap,
} from './health/treatment.js';
export { makeInspection, checkYardMovable, holdSpan } from './health/inspection.js';

export { makeBatch, batchForColonies, sugarLb, waterGallons } from './feeding/syrup.js';
export { makeDrum, netLb, isSaleable, correctedMoisture } from './honey/drum.js';
export { makeLot, lotGrade, lotSummary } from './honey/lot.js';
export {
  makeYardCrop,
  lbPerColony,
  seasonTotal,
  cropValueCents,
} from './honey/crop.js';

export {
  buildInvoice,
  invoiceTotalCents,
  withCommissionLine,
} from './settlement/invoice.js';
export {
  buildStatement,
  renderStatement,
  statementSummary,
} from './settlement/statement.js';

export {
  makeGraft,
  expectedQueens,
  graftsNeeded,
  scheduleFor,
} from './apiary/queen.js';
export { planIncrease, latestMakeDate, willMakeGrade } from './apiary/split.js';
export { inventoryReport, shortfallFor, EQUIPMENT_KINDS } from './apiary/equipment.js';
export { regradeOutcome, governingRun, TOLERANCE_FRAMES } from './grading/regrade.js';
export { renewContract, renewalDifference, renewalBook } from './contracts/renewal.js';
export { instalments, depositCents, lateInterestCents } from './contracts/deposit.js';
export { makeRoute, summariseRoute, checkHours } from './movement/route.js';
export { scheduleLoads, nightsNeeded, LOADS_PER_NIGHT } from './movement/dispatch.js';
export { makeTicket, checkTicket, compareToEstimate } from './movement/scale.js';
export { planDay, supersReturnAfter, latestStartFor } from './health/schedule.js';
export { healthRegister, worstYards, treatmentDueOff } from './health/register.js';
export { feedingPlan, cheapestForProtein, RATION_KINDS } from './feeding/ration.js';
export { syrupRunFor, splitIntoDays, proteinRunFor } from './feeding/schedule.js';
export { makeShipment, checkShippable, shipmentSummary } from './honey/pack.js';
export { makeLedger, balancesByGrower, agingReport } from './settlement/ledger.js';
export { renderSeason, seasonSummary } from './reporting/season.js';
export { renderRegister, registerNames } from './reporting/registers.js';
export { renderDocument, documentNames } from './reporting/documents.js';
export { exportCsv, exportNames } from './reporting/export.js';
export { kpis, kpiRows } from './reporting/kpi.js';
export {
  takeSnapshot,
  restoreSnapshot,
  differenceFromSnapshot,
} from './store/snapshot.js';
export { runMigrations, planMigration, latestVersion } from './store/migrate.js';
export { runSelfTest, CHECKS } from './cli/commands/selftest.js';
export { SEASON, loadSeason } from './examples/season.js';

export { makeRegistration, calendarFor, feeCents } from './apiary/registration.js';
export { makeDispute, openDisputes, remedyFor } from './contracts/dispute.js';
export {
  forecastToBloom,
  splitsNeededFor,
  contractCoverage,
} from './reporting/forecast.js';
export { activityByActor, historyOf, reworked } from './reporting/audit.js';
export { wrapText, truncate, noteBlock, PAGE_WIDTH } from './core/text.js';
export { openBook, byId } from './store/book.js';
