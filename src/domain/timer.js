import { MAX_REST_SECONDS, MIN_REST_SECONDS } from './model.js';

function toTimestamp(now) {
  const value = now instanceof Date ? now.getTime() : new Date(now ?? Date.now()).getTime();
  return Number.isFinite(value) ? value : Date.now();
}

/** @param {unknown} value */
export function normalizeRestSeconds(value, fallback = 90) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return fallback;
  if (seconds === 0) return 0;
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, Math.round(seconds)));
}

/**
 * @param {number} seconds
 * @param {{now?: Date|number|string, workoutId?: string|null, exerciseId?: string|null}} options
 */
export function startRestTimer(seconds, options = {}) {
  const duration = normalizeRestSeconds(seconds, 0);
  if (duration === 0) return null;
  const nowTimestamp = toTimestamp(options.now);
  return {
    status: 'running',
    endsAt: new Date(nowTimestamp + duration * 1_000).toISOString(),
    remainingSeconds: null,
    initialSeconds: duration,
    workoutId: options.workoutId ? String(options.workoutId) : null,
    exerciseId: options.exerciseId ? String(options.exerciseId) : null,
  };
}

/** @param {unknown} input */
export function normalizeActiveTimer(input) {
  if (!input || typeof input !== 'object') return null;
  const initialSeconds = normalizeRestSeconds(input.initialSeconds ?? input.durationSeconds, 0);
  if (initialSeconds === 0) return null;

  if (input.status === 'paused') {
    const remaining = Math.min(
      MAX_REST_SECONDS,
      Math.max(0, Math.ceil(Number(input.remainingSeconds) || 0)),
    );
    return {
      status: 'paused',
      endsAt: null,
      remainingSeconds: remaining,
      initialSeconds,
      workoutId: input.workoutId ? String(input.workoutId) : null,
      exerciseId: input.exerciseId ? String(input.exerciseId) : null,
    };
  }

  const endsAtTimestamp = new Date(input.endsAt).getTime();
  if (!Number.isFinite(endsAtTimestamp)) return null;
  return {
    status: 'running',
    endsAt: new Date(endsAtTimestamp).toISOString(),
    remainingSeconds: null,
    initialSeconds,
    workoutId: input.workoutId ? String(input.workoutId) : null,
    exerciseId: input.exerciseId ? String(input.exerciseId) : null,
  };
}

/** @param {import('./model.js').ActiveTimer|null} timer @param {Date|number|string} now */
export function getTimerRemainingSeconds(timer, now = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return 0;
  if (normalized.status === 'paused') return normalized.remainingSeconds;
  return Math.max(0, Math.ceil((new Date(normalized.endsAt).getTime() - toTimestamp(now)) / 1_000));
}

/** @param {import('./model.js').ActiveTimer|null} timer @param {Date|number|string} now */
export function getTimerSnapshot(timer, now = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return { status: 'idle', remainingSeconds: 0, expired: false };
  const remainingSeconds = getTimerRemainingSeconds(normalized, now);
  const expired = normalized.status === 'running' && remainingSeconds === 0;
  return {
    status: expired ? 'expired' : normalized.status,
    remainingSeconds,
    expired,
    endsAt: normalized.endsAt,
    workoutId: normalized.workoutId,
    exerciseId: normalized.exerciseId,
  };
}

/** @param {import('./model.js').ActiveTimer|null} timer @param {Date|number|string} now */
export function pauseRestTimer(timer, now = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return null;
  if (normalized.status === 'paused') return normalized;
  return {
    ...normalized,
    status: 'paused',
    endsAt: null,
    remainingSeconds: getTimerRemainingSeconds(normalized, now),
  };
}

/** @param {import('./model.js').ActiveTimer|null} timer @param {Date|number|string} now */
export function resumeRestTimer(timer, now = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return null;
  if (normalized.status === 'running') return normalized;
  return {
    ...normalized,
    status: 'running',
    endsAt: new Date(toTimestamp(now) + normalized.remainingSeconds * 1_000).toISOString(),
    remainingSeconds: null,
  };
}

/**
 * @param {import('./model.js').ActiveTimer|null} timer
 * @param {number} seconds
 * @param {Date|number|string} now
 */
export function addRestTimerSeconds(timer, seconds = 30, now = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return null;
  const addition = Math.max(0, Math.round(Number(seconds) || 0));

  if (normalized.status === 'paused') {
    return {
      ...normalized,
      remainingSeconds: Math.min(MAX_REST_SECONDS, normalized.remainingSeconds + addition),
    };
  }

  const remaining = Math.min(MAX_REST_SECONDS, getTimerRemainingSeconds(normalized, now) + addition);
  return {
    ...normalized,
    endsAt: new Date(toTimestamp(now) + remaining * 1_000).toISOString(),
  };
}

export function cancelRestTimer() {
  return null;
}

export const startTimer = startRestTimer;
export const pauseTimer = pauseRestTimer;
export const resumeTimer = resumeRestTimer;
export const addTimerSeconds = addRestTimerSeconds;
