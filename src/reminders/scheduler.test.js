import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReminderLedger,
  createReminderScheduler,
  getOverdueWorkouts,
  getReminderCandidate,
  normalizeReminderOffset,
  parseLocalWorkoutStart,
} from './scheduler.js';

const workout = (overrides = {}) => ({
  id: 'workout-1',
  title: 'Силовая база',
  status: 'planned',
  plannedDate: '2026-07-13',
  time: '18:30',
  reminder: 15,
  ...overrides,
});

describe('reminder domain adapter', () => {
  it.each([
    [0, 0],
    [5, 5],
    ['15', 15],
    ['on_time', 0],
    ['off', null],
    [false, null],
    [45, null],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeReminderOffset(input)).toBe(expected);
  });

  it('uses the global default only when a workout reminder is absent', () => {
    expect(getReminderCandidate(workout({ reminder: undefined }), { defaultReminder: 30 }))
      .toMatchObject({ offsetMinutes: 30 });
    expect(getReminderCandidate(workout({ reminder: null }), { defaultReminder: 30 })).toBeNull();
  });

  it('keeps notification copy neutral unless the privacy setting is enabled', () => {
    expect(getReminderCandidate(workout(), {}).title).toBe('Напоминание о тренировке');
    expect(getReminderCandidate(workout(), {}).body).not.toContain('Силовая база');
    expect(getReminderCandidate(workout(), { includeWorkoutTitleInNotifications: true }).title)
      .toBe('Силовая база');
  });

  it('parses calendar values in local time and rejects rolled dates', () => {
    const parsed = parseLocalWorkoutStart(workout({ plannedDate: '2026-12-31', time: '23:59' }));
    expect(parsed).toEqual(new Date(2026, 11, 31, 23, 59));
    expect(parseLocalWorkoutStart(workout({ plannedDate: '2026-02-30' }))).toBeNull();
  });

  it('finds only planned workouts before the current local date', () => {
    const result = getOverdueWorkouts([
      workout({ id: 'late', plannedDate: '2026-07-12' }),
      workout({ id: 'today', plannedDate: '2026-07-13' }),
      workout({ id: 'done', plannedDate: '2026-07-01', status: 'completed' }),
    ], new Date(2026, 6, 13, 0, 1));
    expect(result.map(({ id }) => id)).toEqual(['late']);
  });
});

describe('reminder delivery ledger', () => {
  beforeEach(() => localStorage.clear());

  it('deduplicates across scheduler instances and recovers corrupted storage', () => {
    localStorage.setItem('broken-ledger', '{');
    const recovered = createReminderLedger({ storage: localStorage, key: 'broken-ledger' });
    expect(recovered.snapshot()).toEqual({});

    recovered.mark('workout-1|2026-07-13|18:30|15', Date.now());
    const reloaded = createReminderLedger({ storage: localStorage, key: 'broken-ledger' });
    expect(reloaded.has('workout-1|2026-07-13|18:30|15')).toBe(true);
  });
});

describe('active-session scheduler', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers a due reminder once and reports overdue workouts', async () => {
    vi.setSystemTime(new Date(2026, 6, 13, 18, 15));
    const notify = vi.fn().mockResolvedValue(true);
    const onOverdue = vi.fn();
    const onReminderDelivered = vi.fn();
    const workouts = [
      workout(),
      workout({ id: 'late', plannedDate: '2026-07-12', time: '10:00' }),
    ];
    const scheduler = createReminderScheduler({
      getWorkouts: () => workouts,
      notify,
      onOverdue,
      onReminderDelivered,
      intervalMs: 3_600_000,
    });

    await scheduler.start();
    await scheduler.refresh();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(onReminderDelivered).toHaveBeenCalledWith('workout-1|2026-07-13|18:30|15');
    expect(onOverdue.mock.calls.at(-1)[0].map(({ id }) => id)).toEqual(['late']);
    scheduler.stop();
  });

  it('replaces the old timeout after a reschedule', async () => {
    vi.setSystemTime(new Date(2026, 6, 13, 9, 0));
    let workouts = [workout({ time: '09:01', reminder: 0 })];
    const notify = vi.fn().mockResolvedValue(true);
    const scheduler = createReminderScheduler({
      getWorkouts: () => workouts,
      notify,
      intervalMs: 3_600_000,
    });

    await scheduler.start();
    workouts = [workout({ time: '09:02', reminder: 0 })];
    await scheduler.refresh();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notify).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
