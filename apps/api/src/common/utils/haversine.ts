/**
 * Haversine formula — returns distance in kilometers between two GPS coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate speed in km/h between two accepted location points.
 * Returns Infinity if elapsed time is zero or negative.
 */
export function speedKmh(
  prevLat: number,
  prevLon: number,
  prevTimestamp: number,
  currLat: number,
  currLon: number,
  currTimestamp: number,
): number {
  const distKm = haversineDistanceKm(prevLat, prevLon, currLat, currLon);
  const elapsedMs = currTimestamp - prevTimestamp;

  if (elapsedMs <= 0) return Infinity;

  const elapsedHours = elapsedMs / 3_600_000;
  return distKm / elapsedHours;
}
