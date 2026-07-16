import { describe, expect, it } from 'vitest';
import {
  acceptContinuousDelta,
  activateContinuousSession,
  buildContinuousResult,
  createContinuousSession,
  getContinuousSessionSnapshot,
  pauseContinuousSession,
  resumeContinuousSession,
  reviewContinuousSession,
} from './continuousSession.js';

const runExercise = {
  structure: 'continuous',
  target: { kind: 'distance', value: 3000, unit: 'meters' },
};

describe('continuous session domain', () => {
  it('starts from acquisition and counts only active time and accepted deltas', () => {
    let session = createContinuousSession('workout', 'run', '2026-07-16T10:00:00.000Z');
    session = activateContinuousSession(session, '2026-07-16T10:00:02.000Z');
    session = acceptContinuousDelta(session, 12.4, '2026-07-16T10:00:06.000Z');
    session = pauseContinuousSession(session, '2026-07-16T10:00:11.000Z');
    expect(session).toMatchObject({ status: 'paused', accumulatedMeters: 12.4, activeDurationSeconds: 9 });

    session = resumeContinuousSession(session, '2026-07-16T10:01:00.000Z');
    session = activateContinuousSession(session, '2026-07-16T10:01:03.000Z');
    expect(getContinuousSessionSnapshot(session, '2026-07-16T10:01:08.000Z')).toMatchObject({
      accumulatedMeters: 12.4,
      activeDurationSeconds: 14,
    });
  });

  it('moves to an explicit summary without counting paused time', () => {
    let session = createContinuousSession('workout', 'run', '2026-07-16T10:00:00.000Z');
    session = activateContinuousSession(session, '2026-07-16T10:00:01.000Z');
    session = reviewContinuousSession(session, '2026-07-16T10:00:31.000Z');
    expect(session).toMatchObject({ status: 'summary', activeDurationSeconds: 30, activeSince: null });
  });

  it('builds distance and time results without raw location data', () => {
    const session = {
      ...createContinuousSession('workout', 'run', '2026-07-16T10:00:00.000Z'),
      status: 'summary',
      accumulatedMeters: 3210,
      activeDurationSeconds: 960,
    };
    const distanceResult = buildContinuousResult(runExercise, session, {}, '2026-07-16T10:20:00.000Z');
    expect(distanceResult).toMatchObject({
      actualValue: 3210,
      activeDurationSeconds: 960,
      averagePaceSecondsPerKm: 299,
    });
    expect(JSON.stringify(distanceResult)).not.toMatch(/latitude|longitude|coordinates/);

    const durationResult = buildContinuousResult({
      structure: 'continuous',
      target: { kind: 'duration', value: 1200, unit: 'seconds' },
    }, null, { activeDurationSeconds: 900, distanceMeters: 2400 });
    expect(durationResult).toMatchObject({ actualValue: 900, activeDurationSeconds: 900, averagePaceSecondsPerKm: 375 });
  });

  it('rejects an empty manual result', () => {
    expect(buildContinuousResult(runExercise, null, { distanceMeters: 0 })).toBeNull();
  });
});

