/**
 * A worked season, small enough to read and complete enough to exercise every
 * module. It is used by `broodhaul example load`, by the end to end tests and
 * by anybody trying to work out what shape a record is meant to be.
 *
 * The numbers are from a real February: two yards on the valley floor, a
 * hundred and twenty acres of almonds under one contract, one drop that came
 * up four hives short, and a grading run that landed under the minimum. That
 * last part is deliberate. A worked example where everything goes right does
 * not show anybody what the software is for.
 */

export const YARDS = [
  {
    id: 'YD-2025-0001',
    name: 'Dinuba home place',
    county: 'Tulare',
    state: 'CA',
    landowner: { name: 'R Wilkins', agreementOn: '2024-11-01', rentCents: 25000 },
    location: { latitude: 36.5432, longitude: -119.3871 },
    capacity: 96,
    access: 'semi',
    water: 'canal',
    registration: 'CA-TUL-2211',
  },
  {
    id: 'YD-2025-0002',
    name: 'Traver river bottom',
    county: 'Tulare',
    state: 'CA',
    landowner: { name: 'B Ackerman', agreementOn: '2024-11-01' },
    location: { latitude: 36.6191, longitude: -119.4302 },
    capacity: 64,
    access: 'quad',
    water: 'hauled',
  },
];

const colonyAt = (sequence, yardId) => ({
  id: `CY-2025-${String(sequence).padStart(4, '0')}`,
  brand: `BH-${String(sequence).padStart(4, '0')}`,
  yardId,
  installedOn: '2024-11-12',
  queen: { source: 'Koehnen', race: 'italian', installedOn: '2024-11-12' },
  boxes: { deeps: 2, mediums: 0 },
});

export const COLONIES = [
  ...[11, 12, 13, 14, 15, 16, 17, 18].map((sequence) =>
    colonyAt(sequence, 'YD-2025-0001')
  ),
  ...[21, 22, 23, 24].map((sequence) => colonyAt(sequence, 'YD-2025-0002')),
];

export const PALLETS = [
  {
    id: 'PL-2025-0031',
    pattern: 'four-way',
    yardId: 'YD-2025-0001',
    tareLb: 62,
    builtOn: '2024-10-18',
    positions: ['CY-2025-0011', 'CY-2025-0012', 'CY-2025-0013', 'CY-2025-0014'],
  },
  {
    id: 'PL-2025-0032',
    pattern: 'four-way',
    yardId: 'YD-2025-0001',
    tareLb: 64,
    builtOn: '2024-10-18',
    positions: ['CY-2025-0015', 'CY-2025-0016', 'CY-2025-0017', 'CY-2025-0018'],
  },
  {
    id: 'PL-2025-0041',
    pattern: 'four-way',
    yardId: 'YD-2025-0002',
    tareLb: 61,
    builtOn: '2024-10-20',
    positions: ['CY-2025-0021', 'CY-2025-0022', 'CY-2025-0023', 'CY-2025-0024'],
  },
];

export const BLOCKS = [
  {
    id: 'BK-2025-0001',
    name: 'Avenue 416 north',
    crop: 'almond',
    acres: 24,
    varieties: [
      { name: 'Nonpareil', share: 0.5 },
      { name: 'Monterey', share: 0.25 },
      { name: 'Fritz', share: 0.25 },
    ],
    plantedYear: 2016,
    rowSpacingFt: 22,
    treeSpacingFt: 18,
    location: { latitude: 36.9012, longitude: -120.1044 },
  },
];

export const CONTRACTS = [
  {
    id: 'CT-2025-0007',
    grower: { name: 'Wilkins Farming', ranch: 'Avenue 416', county: 'Madera' },
    crop: 'almond',
    blocks: [{ blockId: 'BK-2025-0001', acres: 24, hivesPerAcre: 2 }],
    rateCents: 20500,
    terms: {
      minimumAverage: 8,
      samplePercent: 25,
      tiers: [
        { atLeast: 10, adjustmentCents: 2500 },
        { atLeast: 8, adjustmentCents: 0 },
        { atLeast: 6, adjustmentCents: -2500 },
      ],
      gradeBy: 'average',
      shortfall: 'prorate',
      regradeWithinDays: 3,
    },
    delivery: { start: '2025-02-01', end: '2025-02-10' },
    removal: { start: '2025-03-05', end: '2025-03-18' },
    broker: { name: 'Central Valley Bee', commissionBps: 750 },
    signedOn: '2024-09-14',
  },
];

export const DROPS = [
  {
    id: 'DR-2025-0004',
    contractId: 'CT-2025-0007',
    blockId: 'BK-2025-0001',
    location: { latitude: 36.9012, longitude: -120.1044 },
    ordered: 48,
    set: 44,
    pattern: 'road',
    setOn: '2025-02-04',
    notes: 'four short, two deadouts and two left in the yard',
  },
];

export const LOADS = [
  {
    id: 'LD-2025-0143',
    truck: { unit: 'BH-7', kind: 'semi', plate: '4XY1234' },
    driver: 'D Rasmussen',
    originYardId: 'YD-2025-0001',
    destination: { kind: 'drop', id: 'DR-2025-0004' },
    pallets: ['PL-2025-0031', 'PL-2025-0032'],
    loadedOn: '2025-02-03',
    deliveredOn: '2025-02-04',
    state: 'delivered',
  },
];

export const GRADINGS = [
  {
    id: 'GR-2025-0009',
    contractId: 'CT-2025-0007',
    dropId: 'DR-2025-0004',
    grader: 'M Ojeda',
    witness: 'Wilkins foreman',
    conditions: {
      date: '2025-02-14',
      time: '11:30',
      temperatureF: 63,
      windMph: 7,
      precipitation: 'none',
    },
    readings: [
      { colonyId: 'CY-2025-0011', frames: 9 },
      { colonyId: 'CY-2025-0012', frames: 7.5 },
      { colonyId: 'CY-2025-0013', frames: 6 },
      { colonyId: 'CY-2025-0014', frames: 10 },
      { colonyId: 'CY-2025-0015', frames: 5, brood: false },
      { colonyId: 'CY-2025-0016', frames: 8.25 },
      { colonyId: 'CY-2025-0017', frames: 4, queenright: false },
      { colonyId: 'CY-2025-0018', frames: 8 },
    ],
  },
];

export const TREATMENTS = [
  {
    id: 'TR-2025-0021',
    yardId: 'YD-2025-0001',
    colonies: ['CY-2025-0011', 'CY-2025-0012', 'CY-2025-0013', 'CY-2025-0014'],
    product: 'apivar',
    appliedOn: '2024-11-14',
    removedOn: '2024-12-26',
    temperatureF: 58,
    applicator: 'M Ojeda',
    units: 8,
  },
];

export const INSPECTIONS = [
  {
    id: 'IS-2025-0003',
    yardId: 'YD-2025-0002',
    date: '2025-06-12',
    inspector: 'L Prentice',
    coloniesOpened: 4,
    findings: ['shb'],
    coloniesAffected: 1,
    notes: 'a few beetles, nothing the colonies are not handling',
  },
];

export const SEASON = {
  yards: YARDS,
  colonies: COLONIES,
  pallets: PALLETS,
  blocks: BLOCKS,
  contracts: CONTRACTS,
  drops: DROPS,
  loads: LOADS,
  gradings: GRADINGS,
  treatments: TREATMENTS,
  inspections: INSPECTIONS,
};

/** Load the worked season into a desk, in an order that keeps the checks quiet. */
export function loadSeason(desk) {
  const written = [];
  for (const collection of [
    'yards',
    'colonies',
    'pallets',
    'blocks',
    'contracts',
    'drops',
    'loads',
    'gradings',
    'treatments',
    'inspections',
  ]) {
    for (const record of SEASON[collection]) {
      desk.save(collection, record);
      written.push({ collection, id: record.id });
    }
  }
  return written;
}
