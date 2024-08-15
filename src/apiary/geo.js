import { ValidationError } from '../core/errors.js';
import { requireNumber } from '../core/validate.js';

/**
 * Distance between yards, and what that distance means for the bees.
 *
 * A colony forages roughly two miles in every direction, so two yards three
 * miles apart share very little and two yards a mile apart are effectively one
 * yard as far as the forage is concerned. The county wants yards registered
 * with a separation, the landowner wants to know who else is on the section,
 * and the placement side wants to know how many hives are really competing
 * for a block. All three questions are this file.
 */

const EARTH_RADIUS_MILES = 3958.7613;
export const DEFAULT_FORAGE_RADIUS_MILES = 2;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function distanceMiles(from, to) {
  const lat1 = requireNumber(from.latitude, 'from.latitude', { min: -90, max: 90 });
  const lon1 = requireNumber(from.longitude, 'from.longitude', { min: -180, max: 180 });
  const lat2 = requireNumber(to.latitude, 'to.latitude', { min: -90, max: 90 });
  const lon2 = requireNumber(to.longitude, 'to.longitude', { min: -180, max: 180 });
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function roundMiles(miles, places = 2) {
  const factor = 10 ** places;
  return Math.round(miles * factor) / factor;
}

/**
 * Fraction of one yard's forage circle that another yard's circle covers.
 *
 * Two circles of the same radius, centres `d` apart. At `d` of zero the
 * overlap is the whole circle; at `d` of twice the radius or more it is
 * nothing. In between it is the usual lens area, which is worth writing out
 * because everyone reaches for a linear guess and the linear guess is wrong
 * by a third in the middle of the range.
 */
export function forageOverlap(from, to, radiusMiles = DEFAULT_FORAGE_RADIUS_MILES) {
  const radius = requireNumber(radiusMiles, 'radiusMiles', { min: 0.1, max: 20 });
  const distance = distanceMiles(from, to);
  if (distance >= radius * 2) return 0;
  if (distance === 0) return 1;
  const ratio = distance / (2 * radius);
  const lens = 2 * Math.acos(ratio) - Math.sin(2 * Math.acos(ratio));
  // Reported to six places. A pair of yards a hair inside two forage radii
  // otherwise comes back as a millionth of a circle, which rounds a competing
  // hive count up by one and makes a placement report look wrong for nothing.
  return Math.round((lens / Math.PI) * 1e6) / 1e6;
}

/** Yards within `miles` of a point, nearest first, each with its distance. */
export function yardsWithin(yards, centre, miles) {
  const radius = requireNumber(miles, 'miles', { min: 0 });
  return yards
    .map((yard) => ({ yard, miles: roundMiles(distanceMiles(yard.location, centre)) }))
    .filter((entry) => entry.miles <= radius)
    .sort(
      (left, right) =>
        left.miles - right.miles || left.yard.id.localeCompare(right.yard.id)
    );
}

/**
 * Effective competing colonies for a point: every yard inside two forage radii
 * counts, weighted by how much of its circle overlaps the one at the point.
 */
export function competingColonies(
  placements,
  centre,
  radiusMiles = DEFAULT_FORAGE_RADIUS_MILES
) {
  let total = 0;
  for (const placement of placements) {
    const share = forageOverlap(placement.location, centre, radiusMiles);
    total += share * placement.colonies;
  }
  return Math.round(total);
}

export function stockingDensity(colonies, radiusMiles = DEFAULT_FORAGE_RADIUS_MILES) {
  const radius = requireNumber(radiusMiles, 'radiusMiles', { min: 0.1 });
  const count = requireNumber(colonies, 'colonies', { min: 0 });
  return count / (Math.PI * radius * radius);
}

/** The separation the county registration asks for between two registered yards. */
export function separationBreaches(yards, minimumMiles) {
  const minimum = requireNumber(minimumMiles, 'minimumMiles', { min: 0 });
  if (yards.length < 2) return [];
  const breaches = [];
  for (let left = 0; left < yards.length; left += 1) {
    for (let right = left + 1; right < yards.length; right += 1) {
      const miles = distanceMiles(yards[left].location, yards[right].location);
      if (miles < minimum) {
        breaches.push({
          yards: [yards[left].id, yards[right].id],
          miles: roundMiles(miles),
          minimumMiles: minimum,
        });
      }
    }
  }
  return breaches;
}

export function centroid(points) {
  if (points.length === 0) {
    throw new ValidationError('cannot take the centroid of no points', {});
  }
  const latitude =
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const longitude =
    points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  return { latitude, longitude };
}
