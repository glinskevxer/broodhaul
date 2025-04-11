import { describe, it, expect } from 'vitest';
import * as broodhaul from '../src/index.js';

/**
 * The barrel is a promise about what other code may import, so it is worth a
 * test of its own. Two things go wrong with a file like this and neither shows
 * up anywhere else: a name gets exported twice from different modules and one
 * silently wins, and a name gets renamed in its own module while the barrel
 * keeps exporting the old spelling.
 */

const EXPECTED = [
  'VERSION',
  'runCli',
  'buildProgram',
  'buildContext',
  'createOutput',
  'captureOutput',
  'BroodhaulError',
  'ValidationError',
  'NotFoundError',
  'ConflictError',
  'RuleViolation',
  'StateError',
  'describeError',
  'exitCodeFor',
  'fixedClock',
  'systemClock',
  'parseMoney',
  'formatMoney',
  'allocate',
  'basisPoints',
  'sumMoney',
  'round',
  'roundTo',
  'parseDate',
  'addDays',
  'diffDays',
  'seasonOf',
  'seasonBounds',
  'makeSpan',
  'spanContains',
  'spansOverlap',
  'mergeSpans',
  'formatSpan',
  'makeId',
  'parseId',
  'issueId',
  'openDesk',
  'problems',
  'problemCounts',
  'requireClean',
  'openStore',
  'collectionNames',
  'storeCounts',
  'openJournal',
  'reconcile',
  'makeYard',
  'ACCESS_GRADES',
  'WATER_SOURCES',
  'makeColony',
  'COLONY_STATUSES',
  'transitionColony',
  'requeen',
  'makePallet',
  'PALLET_PATTERNS',
  'setColony',
  'removeColony',
  'buildRegister',
  'registerProblems',
  'yardOccupancy',
  'distanceMiles',
  'forageOverlap',
  'separationBreaches',
  'makeConditions',
  'methodFor',
  'METHODS',
  'sampleSize',
  'chooseSample',
  'makeReading',
  'clusterToFrames',
  'temperatureCorrection',
  'makeGradingRun',
  'runAverage',
  'summariseRun',
  'makeTerms',
  'tierFor',
  'adjustmentFor',
  'GRADE_BASES',
  'SHORTFALL_RULES',
  'makeContract',
  'contractedHives',
  'contractValueCents',
  'CROPS',
  'assessContract',
  'pooledAverage',
  'applyShortfall',
  'shortfallValueCents',
  'makeBlock',
  'blockTrees',
  'pollinizerShare',
  'recommendedDensity',
  'recommendedHives',
  'explainDensity',
  'makeDrop',
  'shortBy',
  'checkSetInWindow',
  'checkPullInWindow',
  'planContractDrops',
  'planTotal',
  'planShortfall',
  'makeLoad',
  'advanceLoad',
  'coloniesAboard',
  'TRUCK_KINDS',
  'loadWeightLb',
  'isLegal',
  'maxPallets',
  'SEASON_STAGES',
  'makeCertificate',
  'checkMovement',
  'needsEntryPermit',
  'makeWash',
  'correctedRate',
  'yardRate',
  'actionFor',
  'thresholdOn',
  'stageFor',
  'getProduct',
  'allProducts',
  'labelBlockers',
  'makeTreatment',
  'checkLabel',
  'checkRotation',
  'checkSeasonCap',
  'makeInspection',
  'checkYardMovable',
  'holdSpan',
  'makeBatch',
  'batchForColonies',
  'sugarLb',
  'waterGallons',
  'makeDrum',
  'netLb',
  'isSaleable',
  'correctedMoisture',
  'makeLot',
  'lotGrade',
  'lotSummary',
  'makeYardCrop',
  'lbPerColony',
  'seasonTotal',
  'cropValueCents',
  'buildInvoice',
  'invoiceTotalCents',
  'withCommissionLine',
  'buildStatement',
  'renderStatement',
  'statementSummary',
];

describe('the package surface', () => {
  it('exports exactly the names it means to', () => {
    expect(Object.keys(broodhaul).sort()).toEqual([...EXPECTED].sort());
  });

  it('exports no name twice', () => {
    expect(new Set(EXPECTED).size).toBe(EXPECTED.length);
  });

  it('has nothing undefined behind a name', () => {
    for (const name of EXPECTED) {
      expect(broodhaul[name], name).toBeDefined();
    }
  });

  it('exports functions where functions are expected', () => {
    for (const name of ['makeYard', 'buildInvoice', 'openDesk', 'runCli']) {
      expect(typeof broodhaul[name]).toBe('function');
    }
  });

  it('exports the constant tables as arrays or objects', () => {
    expect(Array.isArray(broodhaul.CROPS)).toBe(true);
    expect(Array.isArray(broodhaul.COLONY_STATUSES)).toBe(true);
    expect(typeof broodhaul.PALLET_PATTERNS).toBe('object');
  });

  it('carries a version that looks like one', () => {
    expect(broodhaul.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('using the package the way a caller would', () => {
  it('builds a yard and a contract through the barrel alone', () => {
    const yard = broodhaul.makeYard({
      id: 'YD-2025-0001',
      name: 'home place',
      county: 'Tulare',
      state: 'CA',
      landowner: { name: 'R Wilkins', agreementOn: '2024-11-01' },
      location: { latitude: 36.5, longitude: -119.4 },
      capacity: 96,
      access: 'semi',
      water: 'canal',
    });
    expect(yard.id).toBe('YD-2025-0001');
  });

  it('prices a contract through the barrel alone', () => {
    const contract = broodhaul.makeContract({
      id: 'CT-2025-0007',
      grower: { name: 'Wilkins Farming', county: 'Madera' },
      crop: 'almond',
      blocks: [{ blockId: 'BK-2025-0001', acres: 120, hivesPerAcre: 2 }],
      rateCents: 20500,
      terms: {
        minimumAverage: 8,
        samplePercent: 10,
        tiers: [{ atLeast: 8, adjustmentCents: 0 }],
      },
      delivery: { start: '2025-02-01', end: '2025-02-10' },
      removal: { start: '2025-03-05', end: '2025-03-18' },
      signedOn: '2024-09-14',
    });
    expect(broodhaul.contractedHives(contract)).toBe(240);
    expect(broodhaul.formatMoney(broodhaul.contractValueCents(contract))).toBe(
      '$49,200.00'
    );
  });
});
