import { useCallback, useEffect, useRef } from 'react';
import { createReminderScheduler } from './scheduler.js';

export function useReminderScheduler({
  enabled = true,
  intervalMs,
  onOverdue,
  onReminderDelivered,
  settings,
  workouts,
} = {}) {
  const workoutsRef = useRef(workouts ?? []);
  const settingsRef = useRef(settings ?? {});
  const overdueRef = useRef(onOverdue);
  const deliveredRef = useRef(onReminderDelivered);
  const schedulerRef = useRef(null);

  useEffect(() => {
    workoutsRef.current = workouts ?? [];
    settingsRef.current = settings ?? {};
    overdueRef.current = onOverdue;
    deliveredRef.current = onReminderDelivered;
  }, [onOverdue, onReminderDelivered, settings, workouts]);

  useEffect(() => {
    if (!enabled) return undefined;

    const scheduler = createReminderScheduler({
      getWorkouts: () => workoutsRef.current,
      getSettings: () => settingsRef.current,
      onOverdue: (items) => overdueRef.current?.(items),
      onReminderDelivered: (key) => deliveredRef.current?.(key),
      ...(intervalMs === undefined ? {} : { intervalMs }),
    });
    schedulerRef.current = scheduler;
    void scheduler.start();

    return () => {
      scheduler.stop();
      schedulerRef.current = null;
    };
  }, [enabled, intervalMs]);

  useEffect(() => {
    if (enabled) void schedulerRef.current?.refresh();
  }, [enabled, settings, workouts]);

  return useCallback(() => schedulerRef.current?.refresh(), []);
}
