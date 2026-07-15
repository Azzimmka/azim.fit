import { describe, expect, it } from 'vitest';
import {
  addRestTimerSeconds,
  getTimerSnapshot,
  normalizeActiveTimer,
  pauseRestTimer,
  resumeRestTimer,
  startRestTimer,
} from './timer.js';

describe('global rest timer', () => {
  const start = '2026-07-13T10:00:00.000Z';

  it('restores from an absolute endsAt after reload', () => {
    const timer = startRestTimer(90, { now: start, workoutId: 'w', exerciseId: 'e' });
    const restored = normalizeActiveTimer(JSON.parse(JSON.stringify(timer)));
    expect(restored.endsAt).toBe('2026-07-13T10:01:30.000Z');
    expect(getTimerSnapshot(restored, '2026-07-13T10:00:45.000Z')).toMatchObject({
      status: 'running',
      remainingSeconds: 45,
      workoutId: 'w',
    });
  });

  it('pauses, resumes, and adds thirty seconds', () => {
    const timer = startRestTimer(90, { now: start });
    const paused = pauseRestTimer(timer, '2026-07-13T10:00:30.000Z');
    expect(paused).toMatchObject({ status: 'paused', endsAt: null, remainingSeconds: 60 });
    const extended = addRestTimerSeconds(paused, 30);
    expect(extended.remainingSeconds).toBe(90);
    const resumed = resumeRestTimer(extended, '2026-07-13T11:00:00.000Z');
    expect(resumed.endsAt).toBe('2026-07-13T11:01:30.000Z');
  });

  it('reports expiration without producing a negative value', () => {
    const timer = startRestTimer(15, { now: start });
    expect(getTimerSnapshot(timer, '2026-07-13T10:00:15.000Z')).toEqual(expect.objectContaining({
      status: 'expired',
      expired: true,
      remainingSeconds: 0,
    }));
  });

  it('restarts an expired timer when thirty seconds are added', () => {
    const timer = startRestTimer(15, { now: start, workoutId: 'w', exerciseId: 'e' });
    const extended = addRestTimerSeconds(timer, 30, '2026-07-13T10:01:00.000Z');
    expect(extended.endsAt).toBe('2026-07-13T10:01:30.000Z');
    expect(getTimerSnapshot(extended, '2026-07-13T10:01:00.000Z')).toMatchObject({
      status: 'running',
      remainingSeconds: 30,
      workoutId: 'w',
      exerciseId: 'e',
    });
  });
});
