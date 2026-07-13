import { localDateTimeToTimestamp } from './dates.js';
import { DEFAULT_REMINDER, REMINDER_OFFSETS } from './model.js';

/** @param {unknown} value */
export function normalizeReminder(value, fallback = null) {
  if (value === null || value === undefined || value === false || value === 'off') return null;
  const number = Number(value);
  if (REMINDER_OFFSETS.includes(number)) return number;
  return fallback;
}

/** @param {{plannedDate?: string, time?: string}} workout */
export function getWorkoutStartTimestamp(workout) {
  return localDateTimeToTimestamp(workout?.plannedDate, workout?.time);
}

/** @param {{reminder?: unknown, plannedDate?: string, time?: string}} workout */
export function getReminderTimestamp(workout) {
  const reminder = normalizeReminder(workout?.reminder);
  const startsAt = getWorkoutStartTimestamp(workout);
  if (reminder === null || !Number.isFinite(startsAt)) return Number.NaN;
  return startsAt - reminder * 60_000;
}

/** @param {{id?: string, plannedDate?: string, time?: string, reminder?: unknown}} workout */
export function getReminderKey(workout) {
  const reminder = normalizeReminder(workout?.reminder);
  if (!workout?.id || reminder === null) return '';
  return [workout.id, workout.plannedDate, workout.time, reminder].join('|');
}

/** @param {Array<object>} workouts */
export function buildReminderJobs(workouts = []) {
  return workouts
    .filter((workout) => workout?.status === 'planned')
    .map((workout) => ({
      key: getReminderKey(workout),
      workoutId: workout.id,
      scheduledAt: getReminderTimestamp(workout),
      startsAt: getWorkoutStartTimestamp(workout),
      title: workout.title,
      plannedDate: workout.plannedDate,
    }))
    .filter((job) => job.key && Number.isFinite(job.scheduledAt))
    .sort((left, right) => left.scheduledAt - right.scheduledAt || left.key.localeCompare(right.key));
}

/**
 * @param {Array<object>} workouts
 * @param {{now?: Date|number|string, deliveredKeys?: Iterable<string>}} options
 */
export function selectDueReminders(workouts = [], options = {}) {
  const now = options.now instanceof Date
    ? options.now.getTime()
    : new Date(options.now ?? Date.now()).getTime();
  const delivered = new Set(options.deliveredKeys ?? []);
  return buildReminderJobs(workouts).filter((job) => job.scheduledAt <= now && !delivered.has(job.key));
}

/**
 * Removes ledger keys for reminders that no longer exist after completion,
 * reschedule, skip, or deletion.
 * @param {Iterable<string>} deliveredKeys
 * @param {Array<object>} workouts
 */
export function pruneDeliveredReminderKeys(deliveredKeys, workouts = []) {
  const active = new Set(buildReminderJobs(workouts).map((job) => job.key));
  return [...new Set(deliveredKeys ?? [])].filter((key) => active.has(key));
}

/** @param {{title?: string}} workout @param {{includeWorkoutTitleInNotifications?: boolean}} settings */
export function getReminderNotificationCopy(workout, settings = {}) {
  return {
    title: 'Время тренировки',
    body: settings.includeWorkoutTitleInNotifications && workout?.title
      ? `Пора начать: ${workout.title}`
      : 'Откройте AZIM.FIT, чтобы посмотреть запланированную тренировку.',
  };
}

export { DEFAULT_REMINDER };

