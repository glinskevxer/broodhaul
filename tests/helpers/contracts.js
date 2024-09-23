import { makeContract } from '../../src/contracts/contract.js';
import { makeGradingRun } from '../../src/grading/run.js';

/**
 * Contract and grading run builders. The defaults are a two block almond job
 * at a fair rate with the tier table this outfit actually uses, so a test only
 * has to say what is different about its case.
 */

export const DEFAULT_TERMS = {
  minimumAverage: 8,
  samplePercent: 10,
  tiers: [
    { atLeast: 10, adjustmentCents: 2500 },
    { atLeast: 8, adjustmentCents: 0 },
    { atLeast: 6, adjustmentCents: -2500 },
  ],
};

export const WARM = {
  date: '2025-02-14',
  time: '11:30',
  temperatureF: 68,
  windMph: 5,
  precipitation: 'none',
};

export const COLD = { ...WARM, temperatureF: 52, time: '08:30' };

export function aContract(overrides = {}) {
  const { terms, ...rest } = overrides;
  return makeContract({
    id: 'CT-2025-0007',
    grower: { name: 'Wilkins Farming', ranch: 'Avenue 416', county: 'Madera' },
    crop: 'almond',
    blocks: [
      { blockId: 'BK-2025-0001', acres: 120, hivesPerAcre: 2 },
      { blockId: 'BK-2025-0002', acres: 68.5, hivesPerAcre: 2 },
    ],
    rateCents: 20500,
    terms: { ...DEFAULT_TERMS, ...terms },
    delivery: { start: '2025-02-01', end: '2025-02-10' },
    removal: { start: '2025-03-05', end: '2025-03-18' },
    signedOn: '2024-09-14',
    ...rest,
  });
}

export function aReading(sequence, frames, extra = {}) {
  return {
    colonyId: `CY-2025-${String(sequence).padStart(4, '0')}`,
    frames,
    ...extra,
  };
}

export function aRun(overrides = {}) {
  const { frames, ...rest } = overrides;
  const readings = frames
    ? frames.map((value, at) => aReading(11 + at, value))
    : [aReading(11, 8), aReading(12, 6), aReading(13, 10), aReading(14, 4)];
  return makeGradingRun({
    id: 'GR-2025-0009',
    contractId: 'CT-2025-0007',
    dropId: 'DR-2025-0004',
    grader: 'M Ojeda',
    conditions: WARM,
    readings,
    ...rest,
  });
}
