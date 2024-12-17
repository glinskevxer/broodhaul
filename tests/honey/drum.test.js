import { describe, it, expect } from 'vitest';
import {
  FLORAL_SOURCES,
  MAX_MOISTURE_PCT,
  NOMINAL_NET_LB,
  CALIBRATION_TEMP_F,
  correctedMoisture,
  makeDrum,
  netLb,
  isSaleable,
  moistureOver,
  isLightDrum,
  totalNetLb,
  averageMoisture,
  describeDrum,
} from '../../src/honey/drum.js';

const base = {
  id: 'd-4471',
  grossLb: 690,
  tareLb: 48,
  moisturePct: 17.4,
  floralSource: 'orange blossom',
  filledOn: '2025-05-22',
};

const drum = (overrides = {}) => makeDrum({ ...base, ...overrides });

describe('correctedMoisture', () => {
  it('leaves a reading taken at calibration alone', () => {
    expect(correctedMoisture(17.4, CALIBRATION_TEMP_F)).toBe(17.4);
  });

  it('takes moisture off a warm reading', () => {
    expect(correctedMoisture(18.8, 88)).toBe(17.6);
  });

  it('adds moisture to a cold reading', () => {
    expect(correctedMoisture(17, 58)).toBe(17.6);
  });

  it('reports to two places', () => {
    expect(correctedMoisture(18, 75)).toBe(17.58);
  });

  it('refuses a reading off the instrument scale', () => {
    expect(() => correctedMoisture(5, 68)).toThrow(/at least 10/);
    expect(() => correctedMoisture(40, 68)).toThrow(/at most 30/);
  });
});

describe('makeDrum', () => {
  it('uppercases the drum number', () => {
    expect(drum().id).toBe('D-4471');
  });

  it('assumes the reading was taken at calibration', () => {
    expect(drum().moistureTempF).toBe(CALIBRATION_TEMP_F);
    expect(drum().moisturePct).toBe(17.4);
  });

  it('corrects a warm reading as it comes in', () => {
    expect(drum({ moisturePct: 18.8, moistureTempF: 88 }).moisturePct).toBe(17.6);
  });

  it('refuses a tare heavier than the gross', () => {
    expect(() => drum({ grossLb: 60, tareLb: 60 })).toThrow(/cannot tare heavier/);
  });

  it('refuses a drum holding more honey than a drum holds', () => {
    expect(() => drum({ grossLb: 800, tareLb: 48 })).toThrow(/will not hold 752 lb/);
  });

  it('refuses a floral source nobody sells', () => {
    expect(() => drum({ floralSource: 'lavender' })).toThrow(/must be one of/);
  });

  it('takes every floral source on the list', () => {
    for (const floralSource of FLORAL_SOURCES) {
      expect(drum({ floralSource }).floralSource).toBe(floralSource);
    }
  });

  it('takes an optional lot number and uppercases it', () => {
    expect(drum({ lotId: 'hl-2025-0004' }).lotId).toBe('HL-2025-0004');
    expect(drum().lotId).toBeUndefined();
  });

  it('refuses an unknown key', () => {
    expect(() => makeDrum({ ...base, pallet: 3 })).toThrow(
      /drum has unknown keys: pallet/
    );
  });
});

describe('netLb', () => {
  it('is gross less tare', () => {
    expect(netLb(drum())).toBe(642);
  });

  it('reports to a tenth', () => {
    expect(netLb(drum({ grossLb: 690.55, tareLb: 48.2 }))).toBe(642.4);
  });
});

describe('isSaleable and moistureOver', () => {
  it('passes honey at or under the limit', () => {
    expect(isSaleable(drum())).toBe(true);
    expect(isSaleable(drum({ moisturePct: MAX_MOISTURE_PCT }))).toBe(true);
    expect(moistureOver(drum())).toBe(0);
  });

  it('fails honey over the limit and says by how much', () => {
    const wet = drum({ moisturePct: 19.2 });
    expect(isSaleable(wet)).toBe(false);
    expect(moistureOver(wet)).toBe(0.6);
  });

  it('can be saved by the temperature correction', () => {
    const warm = drum({ moisturePct: 19.2, moistureTempF: 90 });
    expect(warm.moisturePct).toBe(17.88);
    expect(isSaleable(warm)).toBe(true);
  });
});

describe('isLightDrum', () => {
  it('is false on a full drum', () => {
    expect(isLightDrum(drum())).toBe(false);
  });

  it('is true well under nominal', () => {
    expect(isLightDrum(drum({ grossLb: 600, tareLb: 48 }))).toBe(true);
  });

  it('takes a tighter tolerance', () => {
    expect(isLightDrum(drum({ grossLb: 675, tareLb: 48 }), 5)).toBe(true);
    expect(isLightDrum(drum({ grossLb: 675, tareLb: 48 }))).toBe(false);
    expect(NOMINAL_NET_LB).toBe(640);
  });
});

describe('totalNetLb and averageMoisture', () => {
  const drums = [
    drum({ id: 'd-1', grossLb: 690, tareLb: 48, moisturePct: 17 }),
    drum({ id: 'd-2', grossLb: 500, tareLb: 48, moisturePct: 18 }),
  ];

  it('adds the net weights', () => {
    expect(totalNetLb(drums)).toBe(1094);
  });

  it('is zero over no drums', () => {
    expect(totalNetLb([])).toBe(0);
  });

  it('weights the moisture average by net weight', () => {
    expect(averageMoisture(drums)).toBe(17.41);
  });

  it('refuses to average nothing', () => {
    expect(() => averageMoisture([])).toThrow(/cannot average no drums/);
  });
});

describe('describeDrum', () => {
  it('reads like the tag on the drum', () => {
    expect(describeDrum(drum())).toBe(
      'D-4471 642 lb orange blossom at 17.4 percent, saleable'
    );
  });

  it('says how far over a wet drum is', () => {
    expect(describeDrum(drum({ moisturePct: 19.2 }))).toContain('over by 0.6');
  });
});
