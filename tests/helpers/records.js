import { makeYard } from '../../src/apiary/yard.js';
import { makeColony } from '../../src/apiary/colony.js';
import { makePallet } from '../../src/apiary/pallet.js';

/**
 * Builders for the records the tests need. Everything goes through the real
 * constructors, so a change to a rule shows up here rather than letting a test
 * fixture drift into a shape the desk would never accept.
 */

let counter = 0;
const nextSequence = () => {
  counter += 1;
  return counter;
};

export function resetSequence() {
  counter = 0;
}

export function aYard(overrides = {}) {
  const sequence = String(overrides.sequence ?? nextSequence()).padStart(4, '0');
  const { sequence: _sequence, ...rest } = overrides;
  return makeYard({
    id: `YD-2025-${sequence}`,
    name: `yard ${sequence}`,
    county: 'Tulare',
    state: 'CA',
    landowner: { name: 'R Wilkins', agreementOn: '2024-11-01' },
    location: { latitude: 36.5, longitude: -119.4 },
    capacity: 96,
    access: 'semi',
    water: 'canal',
    ...rest,
  });
}

export function aColony(overrides = {}) {
  const sequence = String(overrides.sequence ?? nextSequence()).padStart(4, '0');
  const { sequence: _sequence, ...rest } = overrides;
  return makeColony({
    id: `CY-2025-${sequence}`,
    brand: `BH-${sequence}`,
    yardId: 'YD-2025-0001',
    installedOn: '2024-11-12',
    queen: { source: 'Koehnen', race: 'italian', installedOn: '2024-11-12' },
    boxes: { deeps: 2, mediums: 0 },
    ...rest,
  });
}

export function aPallet(overrides = {}) {
  const sequence = String(overrides.sequence ?? nextSequence()).padStart(4, '0');
  const { sequence: _sequence, ...rest } = overrides;
  return makePallet({
    id: `PL-2025-${sequence}`,
    pattern: 'four-way',
    yardId: 'YD-2025-0001',
    tareLb: 62,
    builtOn: '2024-10-18',
    ...rest,
  });
}
