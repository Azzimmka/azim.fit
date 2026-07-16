import { describe, expect, it } from 'vitest';
import {
  assessGpsPoint,
  GPS_MAX_ACCURACY_METERS,
  haversineDistanceMeters,
} from './gps.js';

const baseline = {
  latitude: 41.311081,
  longitude: 69.240562,
  accuracy: 8,
  timestamp: 1_000,
};

describe('GPS domain', () => {
  it('calculates Haversine distance in meters', () => {
    const distance = haversineDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.001 },
    );
    expect(distance).toBeCloseTo(111.2, 0);
  });

  it('accepts a private in-memory baseline without emitting coordinates', () => {
    const assessment = assessGpsPoint(null, baseline);
    expect(assessment).toEqual({
      accepted: true,
      baseline: true,
      deltaMeters: 0,
      signal: 'good',
    });
    expect(JSON.stringify(assessment)).not.toMatch(/latitude|longitude/);
  });

  it('filters weak accuracy, stale points, duplicates, and impossible jumps', () => {
    expect(assessGpsPoint(baseline, {
      ...baseline,
      accuracy: GPS_MAX_ACCURACY_METERS + 1,
      timestamp: 2_000,
    }).signal).toBe('weak');
    expect(assessGpsPoint(baseline, { ...baseline, timestamp: 1_000 }).signal).toBe('stale');
    expect(assessGpsPoint(baseline, {
      ...baseline,
      latitude: baseline.latitude + 0.000001,
      timestamp: 2_000,
    }).signal).toBe('stationary');
    expect(assessGpsPoint(baseline, {
      ...baseline,
      latitude: baseline.latitude + 0.01,
      timestamp: 2_000,
    }).signal).toBe('impossible');
  });

  it('accepts realistic running movement and emits only a delta', () => {
    const assessment = assessGpsPoint(baseline, {
      ...baseline,
      latitude: baseline.latitude + 0.00009,
      timestamp: 5_000,
    });
    expect(assessment.accepted).toBe(true);
    expect(assessment.baseline).toBe(false);
    expect(assessment.deltaMeters).toBeGreaterThan(9);
    expect(assessment.deltaMeters).toBeLessThan(11);
    expect(JSON.stringify(assessment)).not.toMatch(/latitude|longitude/);
  });
});

