import { formatPace } from './targets.js';

function toIso(now) {
  const timestamp = new Date(now ?? Date.now()).getTime();
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
}

function elapsedSeconds(from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 1_000);
}

function syncActiveTime(session, now) {
  const timestamp = toIso(now);
  if (session?.status !== 'active' || !session.activeSince) {
    return { ...session, updatedAt: timestamp };
  }
  return {
    ...session,
    activeDurationSeconds: Math.max(0, Number(session.activeDurationSeconds) || 0)
      + elapsedSeconds(session.activeSince, timestamp),
    activeSince: timestamp,
    updatedAt: timestamp,
  };
}

export function createContinuousSession(workoutId, exerciseId, now = Date.now()) {
  if (!workoutId || !exerciseId) return null;
  const timestamp = toIso(now);
  return {
    workoutId,
    exerciseId,
    status: 'acquiring',
    accumulatedMeters: 0,
    activeDurationSeconds: 0,
    startedAt: timestamp,
    activeSince: null,
    pausedAt: null,
    updatedAt: timestamp,
  };
}

export function activateContinuousSession(session, now = Date.now()) {
  if (!session || !['acquiring', 'paused'].includes(session.status)) return session;
  const timestamp = toIso(now);
  return {
    ...session,
    status: 'active',
    activeSince: timestamp,
    pausedAt: null,
    updatedAt: timestamp,
  };
}

export function acceptContinuousDelta(session, deltaMeters, now = Date.now()) {
  const delta = Number(deltaMeters);
  if (session?.status !== 'active' || !Number.isFinite(delta) || delta <= 0 || delta > 1_000) {
    return session;
  }
  const synced = syncActiveTime(session, now);
  return {
    ...synced,
    accumulatedMeters: Math.round((Number(session.accumulatedMeters) + delta) * 10) / 10,
  };
}

export function tickContinuousSession(session, now = Date.now()) {
  if (session?.status !== 'active') return session;
  return syncActiveTime(session, now);
}

export function pauseContinuousSession(session, now = Date.now()) {
  if (!session || !['active', 'acquiring'].includes(session.status)) return session;
  const timestamp = toIso(now);
  const synced = syncActiveTime(session, timestamp);
  return {
    ...synced,
    status: 'paused',
    activeSince: null,
    pausedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function resumeContinuousSession(session, now = Date.now()) {
  if (session?.status !== 'paused') return session;
  const timestamp = toIso(now);
  return {
    ...session,
    status: 'acquiring',
    activeSince: null,
    pausedAt: null,
    updatedAt: timestamp,
  };
}

export function reviewContinuousSession(session, now = Date.now()) {
  if (!session || !['active', 'acquiring', 'paused'].includes(session.status)) return session;
  const timestamp = toIso(now);
  const synced = syncActiveTime(session, timestamp);
  return {
    ...synced,
    status: 'summary',
    activeSince: null,
    pausedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getContinuousSessionSnapshot(session, now = Date.now()) {
  if (!session) return null;
  const timestamp = toIso(now);
  const activeDurationSeconds = Math.max(0, Number(session.activeDurationSeconds) || 0)
    + (session.status === 'active' ? elapsedSeconds(session.activeSince, timestamp) : 0);
  const accumulatedMeters = Math.max(0, Number(session.accumulatedMeters) || 0);
  const paceSecondsPerKm = accumulatedMeters > 0 && activeDurationSeconds > 0
    ? activeDurationSeconds / (accumulatedMeters / 1_000)
    : null;
  return {
    status: session.status,
    accumulatedMeters,
    activeDurationSeconds,
    paceSecondsPerKm,
    paceLabel: formatPace(paceSecondsPerKm),
  };
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function buildContinuousResult(exercise, session, input = {}, now = Date.now()) {
  const targetKind = exercise?.target?.kind;
  if (exercise?.structure !== 'continuous' || !['distance', 'duration'].includes(targetKind)) return null;
  const snapshot = getContinuousSessionSnapshot(session, now) ?? {
    accumulatedMeters: 0,
    activeDurationSeconds: 0,
  };
  const distanceMeters = boundedInteger(
    input.distanceMeters ?? Math.round(snapshot.accumulatedMeters),
    targetKind === 'distance' ? 1 : 0,
    1_000_000,
  );
  const activeDurationSeconds = boundedInteger(
    input.activeDurationSeconds ?? snapshot.activeDurationSeconds,
    targetKind === 'duration' ? 1 : 0,
    86_400,
  );
  const actualValue = targetKind === 'distance' ? distanceMeters : activeDurationSeconds;
  if (!actualValue) return null;
  const averagePaceSecondsPerKm = distanceMeters > 0 && activeDurationSeconds > 0
    ? Math.round(activeDurationSeconds / (distanceMeters / 1_000))
    : null;
  return {
    status: 'completed',
    actualValue,
    distanceMeters: distanceMeters || null,
    activeDurationSeconds: activeDurationSeconds || null,
    averagePaceSecondsPerKm,
    completedAt: toIso(now),
  };
}
