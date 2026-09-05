import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, speedKmh } from './haversine';

describe('Haversine Utility & Speed Validation', () => {
  it('Calculates distance correctly between SF and Oakland (~13 km)', () => {
    const sfLat = 37.7749;
    const sfLon = -122.4194;
    const oakLat = 37.8044;
    const oakLon = -122.2712;

    const dist = haversineDistanceKm(sfLat, sfLon, oakLat, oakLon);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(20);
  });

  it('Rejects movement exceeding 500 km/h', () => {
    const startLat = 37.7749;
    const startLon = -122.4194;
    const startTs = 1000000;

    // London lat/lon (~8700 km away) 10 seconds later
    const endLat = 51.5074;
    const endLon = -0.1278;
    const endTs = startTs + 10_000; // 10s later

    const speed = speedKmh(startLat, startLon, startTs, endLat, endLon, endTs);
    expect(speed).toBeGreaterThan(500);
  });

  it('Accepts normal walking/driving speed (<100 km/h)', () => {
    const startLat = 37.7749;
    const startLon = -122.4194;
    const startTs = 1000000;

    // Moved ~1 km over 2 minutes (30 km/h)
    const endLat = 37.7849;
    const endLon = -122.4194;
    const endTs = startTs + 120_000;

    const speed = speedKmh(startLat, startLon, startTs, endLat, endLon, endTs);
    expect(speed).toBeLessThan(500);
  });
});
