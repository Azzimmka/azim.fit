export const REMINDER_OFFSETS = Object.freeze([0, 5, 15, 30, 60]);
export const DEFAULT_REMINDER_OFFSET = 15;
export const REMINDER_LEDGER_KEY = 'azim-fit-reminder-deliveries-v2';

const MINUTE = 60_000;
const DAY = 86_400_000;
const DEFAULT_GRACE_MS = 5 * MINUTE;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LEDGER_RETENTION_MS = 32 * DAY;
const MAX_TIMEOUT_MS = 2_147_000_000;
const NOTIFICATION_TAG_PREFIX = 'azim-fit-reminder:';

const isAllowedOffset = (value) => REMINDER_OFFSETS.includes(value);

/** Normalize reminder values from forms, migrated state, or settings. */
export function normalizeReminderOffset(value, fallback = DEFAULT_REMINDER_OFFSET) {
  if (value === undefined || value === 'default') {
    const fallbackValue = fallback === undefined || fallback === 'default'
      ? DEFAULT_REMINDER_OFFSET
      : fallback;
    return normalizeReminderOffset(fallbackValue, DEFAULT_REMINDER_OFFSET);
  }

  if (value === null || value === false || value === 'off' || value === 'disabled') return null;
  if (value === true || value === 'at_time' || value === 'on_time' || value === 'on-time') return 0;

  if (typeof value === 'object') {
    if (value.enabled === false) return null;
    return normalizeReminderOffset(
      value.offsetMinutes ?? value.minutesBefore ?? value.value ?? value.mode,
      fallback,
    );
  }

  const numeric = Number(value);
  return isAllowedOffset(numeric) ? numeric : null;
}

const workoutDate = (workout) => workout?.plannedDate ?? workout?.date;
const workoutTime = (workout) => workout?.plannedTime ?? workout?.time;

/** Parse a local calendar date/time without converting it through UTC. */
export function parseLocalWorkoutStart(workout) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(workoutDate(workout) ?? ''));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(workoutTime(workout) ?? ''));
  if (!dateMatch || !timeMatch) return null;

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;

  const result = new Date(year, month, day, hour, minute, 0, 0);
  if (
    result.getFullYear() !== year
    || result.getMonth() !== month
    || result.getDate() !== day
  ) return null;

  return result;
}

const settingsDefaultOffset = (settings) =>
  settings?.defaultReminderMinutes
  ?? settings?.defaultReminder
  ?? settings?.reminderDefault
  ?? DEFAULT_REMINDER_OFFSET;

const canRemindWorkout = (workout) =>
  workout?.status === 'planned'
  || (workout?.status === undefined && !workout?.completed && !workout?.skipped);

const revealWorkoutName = (settings) => Boolean(
  settings?.includeWorkoutTitleInNotifications
  ?? settings?.includeWorkoutNameInNotifications
  ?? settings?.showWorkoutNameInNotifications
  ?? settings?.notificationShowWorkoutName,
);

const notificationCopy = (workout, offset, settings) => {
  const named = revealWorkoutName(settings) && String(workout.title ?? '').trim();
  const timing = offset === 0 ? 'Тренировка начинается сейчас.' : `До тренировки ${offset} мин.`;

  return named
    ? { title: String(workout.title).trim(), body: timing }
    : { title: 'Напоминание о тренировке', body: `${timing} Откройте AZIM.FIT, чтобы посмотреть план.` };
};

/** Build a stable reminder occurrence for one workout. */
export function getReminderCandidate(workout, settings = {}) {
  if (!workout?.id || !canRemindWorkout(workout)) return null;

  const start = parseLocalWorkoutStart(workout);
  if (!start) return null;

  const offset = normalizeReminderOffset(workout.reminder, settingsDefaultOffset(settings));
  if (offset === null) return null;

  const workoutStartMs = start.getTime();
  const fireAtMs = workoutStartMs - offset * MINUTE;
  const key = [workout.id, workoutDate(workout), workoutTime(workout), offset].join('|');
  const copy = notificationCopy(workout, offset, settings);

  return {
    ...copy,
    fireAtMs,
    key,
    offsetMinutes: offset,
    tag: `${NOTIFICATION_TAG_PREFIX}${key}`,
    url: `/workouts/${encodeURIComponent(workout.id)}`,
    workoutId: workout.id,
    workoutStartMs,
  };
}

export function getReminderCandidates(workouts, settings = {}) {
  return (Array.isArray(workouts) ? workouts : [])
    .map((workout) => getReminderCandidate(workout, settings))
    .filter(Boolean)
    .sort((left, right) => left.fireAtMs - right.fireAtMs);
}

const localDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export function getOverdueWorkouts(workouts, now = new Date()) {
  const today = localDateKey(now instanceof Date ? now : new Date(now));
  return (Array.isArray(workouts) ? workouts : []).filter((workout) => {
    const date = workoutDate(workout);
    return canRemindWorkout(workout) && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today;
  });
}

const readLedger = (storage, key) => {
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeLedger = (storage, key, value) => {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // In-memory delivery state still prevents duplicates for the active session.
  }
};

export function createReminderLedger({
  storage = globalThis.localStorage,
  key = REMINDER_LEDGER_KEY,
  retentionMs = DEFAULT_LEDGER_RETENTION_MS,
} = {}) {
  let deliveries = readLedger(storage, key);

  const prune = (nowMs) => {
    const oldest = nowMs - retentionMs;
    deliveries = Object.fromEntries(
      Object.entries(deliveries).filter(([, deliveredAt]) => Number(deliveredAt) >= oldest),
    );
    writeLedger(storage, key, deliveries);
  };

  return {
    has(reminderKey) {
      return Number.isFinite(Number(deliveries[reminderKey]));
    },
    mark(reminderKey, deliveredAt = Date.now()) {
      deliveries[reminderKey] = deliveredAt;
      writeLedger(storage, key, deliveries);
    },
    prune,
    snapshot() {
      return { ...deliveries };
    },
  };
}

export async function requestNotificationPermission() {
  if (!globalThis.Notification?.requestPermission) {
    return { supported: false, permission: 'unsupported' };
  }

  if (globalThis.Notification.permission !== 'default') {
    return { supported: true, permission: globalThis.Notification.permission };
  }

  try {
    return { supported: true, permission: await globalThis.Notification.requestPermission() };
  } catch (error) {
    return { supported: true, permission: 'default', error };
  }
}

/** Show through the SW when possible so notificationclick can deep-link reliably. */
export async function showReminderNotification(reminder) {
  if (!reminder || globalThis.Notification?.permission !== 'granted') return false;

  const options = {
    body: reminder.body,
    tag: reminder.tag,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    renotify: false,
    requireInteraction: false,
    timestamp: reminder.workoutStartMs,
    data: {
      reminderKey: reminder.key,
      url: reminder.url,
      workoutId: reminder.workoutId,
    },
  };

  try {
    const serviceWorker = globalThis.navigator?.serviceWorker;
    const registration = (await serviceWorker?.getRegistration?.('/'))
      ?? (serviceWorker?.controller ? await serviceWorker.ready : undefined);

    if (registration?.showNotification) {
      await registration.showNotification(reminder.title, options);
      return true;
    }

    // Desktop fallback for supported browsers before the SW controls the page.
    if (typeof globalThis.Notification === 'function') {
      new globalThis.Notification(reminder.title, options);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function closeStaleNotifications(activeReminderKeys) {
  try {
    const registration = await globalThis.navigator?.serviceWorker?.getRegistration?.('/');
    if (!registration?.getNotifications) return;
    const notifications = await registration.getNotifications();
    notifications.forEach((notification) => {
      const reminderKey = notification.data?.reminderKey;
      if (reminderKey && !activeReminderKeys.has(reminderKey)) notification.close();
    });
  } catch {
    // Reconciliation is best-effort; pending timers are still replaced synchronously.
  }
}

/**
 * Active-session scheduler. Data mutations call refresh(), replacing the old timer.
 */
export function createReminderScheduler({
  getSettings = () => ({}),
  getWorkouts = () => [],
  graceMs = DEFAULT_GRACE_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  ledger = createReminderLedger(),
  notify = showReminderNotification,
  now = () => Date.now(),
  onOverdue = () => {},
  onReminderDelivered = () => {},
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
  setIntervalFn = globalThis.setInterval?.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  let started = false;
  let intervalId;
  let nextTimeoutId;
  let scanPromise = Promise.resolve();

  const clearNextTimeout = () => {
    if (nextTimeoutId !== undefined) clearTimeoutFn?.(nextTimeoutId);
    nextTimeoutId = undefined;
  };

  const runScan = async () => {
    clearNextTimeout();
    const nowMs = now();
    const workouts = getWorkouts() ?? [];
    const settings = getSettings() ?? {};
    const candidates = getReminderCandidates(workouts, settings);
    const activeKeys = new Set(candidates.map(({ key }) => key));
    const stateDeliveries = new Set(settings.deliveredReminderKeys ?? []);
    const isDelivered = (key) => ledger.has(key) || stateDeliveries.has(key);

    ledger.prune(nowMs);
    try {
      onOverdue(getOverdueWorkouts(workouts, new Date(nowMs)));
    } catch {
      // UI callbacks must not stop future reminder scans.
    }
    await closeStaleNotifications(activeKeys);

    for (const reminder of candidates) {
      const isDue = reminder.fireAtMs <= nowMs && reminder.fireAtMs >= nowMs - graceMs;
      if (!isDue || isDelivered(reminder.key)) continue;
      let delivered = false;
      try {
        delivered = await notify(reminder);
      } catch {
        // A transient notification failure can be retried during the grace window.
      }
      if (delivered) {
        ledger.mark(reminder.key, nowMs);
        try {
          onReminderDelivered(reminder.key);
        } catch {
          // The local ledger already prevents duplicates if state persistence fails.
        }
      }
    }

    const nextReminder = candidates.find(({ fireAtMs, key }) => fireAtMs > nowMs && !isDelivered(key));
    if (started && nextReminder && setTimeoutFn) {
      const delay = Math.min(Math.max(0, nextReminder.fireAtMs - nowMs), MAX_TIMEOUT_MS);
      nextTimeoutId = setTimeoutFn(() => void refresh(), delay);
    }
  };

  const refresh = () => {
    clearNextTimeout();
    scanPromise = scanPromise.then(runScan, runScan);
    return scanPromise;
  };

  const handleVisibility = () => {
    if (!documentTarget || documentTarget.visibilityState === 'visible') void refresh();
  };
  const handlePageShow = () => void refresh();

  const start = () => {
    if (started) return refresh();
    started = true;
    documentTarget?.addEventListener?.('visibilitychange', handleVisibility);
    windowTarget?.addEventListener?.('pageshow', handlePageShow);
    if (setIntervalFn) intervalId = setIntervalFn(() => void refresh(), intervalMs);
    return refresh();
  };

  const stop = () => {
    started = false;
    clearNextTimeout();
    if (intervalId !== undefined) clearIntervalFn?.(intervalId);
    intervalId = undefined;
    documentTarget?.removeEventListener?.('visibilitychange', handleVisibility);
    windowTarget?.removeEventListener?.('pageshow', handlePageShow);
  };

  return { refresh, start, stop };
}

export { NOTIFICATION_TAG_PREFIX };
