import { ValidationError } from '../core/errors.js';
import {
  optional,
  rejectUnknownKeys,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from '../core/validate.js';
import { parseDate } from '../core/dates.js';
import { roundTo } from '../core/rounding.js';

/**
 * Honey drums.
 *
 * A drum is fifty five gallons of steel and about six hundred and forty pounds
 * of honey, and the buyer pays on net weight and grades on moisture. Both
 * numbers come off instruments that need correcting. The scale gives a gross
 * and the tare is stamped on the drum, which is fine until somebody reuses a
 * drum with a different stamp. The refractometer reads high when the honey is
 * warm, and a load graded off an uncorrected reading gets rejected at the
 * packer with freight both ways.
 */

export const FLORAL_SOURCES = [
  'orange blossom',
  'sage',
  'alfalfa',
  'cotton',
  'buckwheat',
  'wildflower',
  'star thistle',
];

export const MAX_MOISTURE_PCT = 18.6;
export const NOMINAL_NET_LB = 640;
export const MAX_NET_LB = 700;

const DRUM_KEYS = [
  'id',
  'lotId',
  'grossLb',
  'tareLb',
  'moisturePct',
  'moistureTempF',
  'floralSource',
  'filledOn',
  'notes',
];

/**
 * Refractometer correction. The instrument is calibrated at 68F and reads
 * about 0.06 percent high for every degree above that.
 */
export const CALIBRATION_TEMP_F = 68;
export const MOISTURE_PER_DEGREE = 0.06;

export function correctedMoisture(reading, temperatureF) {
  const raw = requireNumber(reading, 'reading', { min: 10, max: 30 });
  const degrees = requireNumber(temperatureF, 'temperatureF', { min: 40, max: 130 });
  return roundTo(raw - (degrees - CALIBRATION_TEMP_F) * MOISTURE_PER_DEGREE, 2);
}

export function makeDrum(input) {
  const raw = requireObject(input, 'drum');
  rejectUnknownKeys(raw, 'drum', DRUM_KEYS);
  const grossLb = requireNumber(raw.grossLb, 'drum.grossLb', { min: 50, max: 900 });
  const tareLb = requireNumber(raw.tareLb, 'drum.tareLb', { min: 20, max: 120 });
  if (tareLb >= grossLb) {
    throw new ValidationError('a drum cannot tare heavier than it grosses', {
      grossLb,
      tareLb,
    });
  }
  const net = roundTo(grossLb - tareLb, 1);
  if (net > MAX_NET_LB) {
    throw new ValidationError(`a drum will not hold ${net} lb of honey`, { net });
  }
  const moistureTempF = requireNumber(
    raw.moistureTempF ?? CALIBRATION_TEMP_F,
    'drum.moistureTempF',
    {
      min: 40,
      max: 130,
    }
  );
  return {
    id: requireString(raw.id, 'drum.id', { max: 20 }).toUpperCase(),
    lotId: optional(raw.lotId, (id) =>
      requireString(id, 'drum.lotId', { max: 20 }).toUpperCase()
    ),
    grossLb: roundTo(grossLb, 1),
    tareLb: roundTo(tareLb, 1),
    moisturePct: correctedMoisture(raw.moisturePct, moistureTempF),
    moistureTempF,
    floralSource: requireOneOf(raw.floralSource, 'drum.floralSource', FLORAL_SOURCES),
    filledOn: parseDate(raw.filledOn, 'drum.filledOn'),
    notes: optional(raw.notes, (note) =>
      requireString(note, 'drum.notes', { max: 200 })
    ),
  };
}

export function netLb(drum) {
  return roundTo(drum.grossLb - drum.tareLb, 1);
}

export function isSaleable(drum) {
  return drum.moisturePct <= MAX_MOISTURE_PCT;
}

export function moistureOver(drum) {
  return Math.max(0, roundTo(drum.moisturePct - MAX_MOISTURE_PCT, 2));
}

/** Short of nominal by enough that the buyer will notice on the pallet. */
export function isLightDrum(drum, tolerance = 20) {
  return (
    netLb(drum) < NOMINAL_NET_LB - requireNumber(tolerance, 'tolerance', { min: 0 })
  );
}

export function totalNetLb(drums) {
  return roundTo(
    drums.reduce((total, drum) => total + netLb(drum), 0),
    1
  );
}

export function averageMoisture(drums) {
  if (drums.length === 0) {
    throw new ValidationError('cannot average no drums', {});
  }
  const weighted = drums.reduce(
    (total, drum) => total + drum.moisturePct * netLb(drum),
    0
  );
  return roundTo(weighted / totalNetLb(drums), 2);
}

export function describeDrum(drum) {
  const grade = isSaleable(drum) ? 'saleable' : `over by ${moistureOver(drum)}`;
  return `${drum.id} ${netLb(drum)} lb ${drum.floralSource} at ${drum.moisturePct} percent, ${grade}`;
}
