const DEFAULT_UNDO_TTL_MS = 8_000;

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function capturedById(before, after) {
  const afterById = new Map(after.map((item) => [item.id, item]));
  return before.filter((item) => {
    const next = afterById.get(item.id);
    return !next || JSON.stringify(next) !== JSON.stringify(item);
  });
}

function capturedByDate(before, after) {
  const afterByDate = new Map(after.map((item) => [item.date, item]));
  return before.filter((item) => {
    const next = afterByDate.get(item.date);
    return !next || JSON.stringify(next) !== JSON.stringify(item);
  });
}

function addedKeys(before, after, key) {
  const existing = new Set(before.map((item) => item[key]));
  return after.filter((item) => !existing.has(item[key])).map((item) => item[key]);
}

/**
 * Captures all entities removed by one reducer operation in a single snapshot.
 * @param {import('../domain/model.js').AppStateV2} before
 * @param {import('../domain/model.js').AppStateV2} after
 * @param {{now?: Date|number|string, ttlMs?: number}} options
 */
export function createDeletionSnapshot(before, after, options = {}) {
  const timestamp = new Date(options.now ?? Date.now()).getTime();
  const now = Number.isFinite(timestamp) ? timestamp : Date.now();
  const ttlMs = Math.max(0, Number(options.ttlMs ?? DEFAULT_UNDO_TTL_MS));
  const snapshot = {
    kind: 'deletion',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    workouts: capturedById(before.workouts, after.workouts),
    series: capturedById(before.series, after.series),
    templates: capturedById(before.templates, after.templates),
    bodyWeightEntries: capturedByDate(before.bodyWeightEntries, after.bodyWeightEntries),
    addedWorkoutIds: addedKeys(before.workouts, after.workouts, 'id'),
    addedSeriesIds: addedKeys(before.series, after.series, 'id'),
    addedTemplateIds: addedKeys(before.templates, after.templates, 'id'),
    addedBodyWeightDates: addedKeys(before.bodyWeightEntries, after.bodyWeightEntries, 'date'),
    settings: JSON.stringify(before.settings) === JSON.stringify(after.settings)
      ? null
      : before.settings,
  };
  return clone(snapshot);
}

/** @param {unknown} snapshot @param {Date|number|string} now */
export function isDeletionSnapshotActive(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.kind !== 'deletion') return false;
  const expiration = new Date(snapshot.expiresAt).getTime();
  const timestamp = new Date(now).getTime();
  return Number.isFinite(expiration) && Number.isFinite(timestamp) && timestamp <= expiration;
}

function restoreCaptured(current, restored, addedKeysToRemove, key) {
  const restoredByKey = new Map(restored.map((item) => [item[key], item]));
  const added = new Set(addedKeysToRemove);
  const kept = current
    .filter((item) => !added.has(item[key]))
    .map((item) => restoredByKey.get(item[key]) ?? item);
  const currentKeys = new Set(kept.map((item) => item[key]));
  return [...kept, ...restored.filter((item) => !currentKeys.has(item[key]))];
}

/**
 * @param {import('../domain/model.js').AppStateV2} state
 * @param {object} snapshot
 * @param {{now?: Date|number|string, ignoreExpiry?: boolean}} options
 */
export function restoreDeletionSnapshot(state, snapshot, options = {}) {
  if (!options.ignoreExpiry && !isDeletionSnapshotActive(snapshot, options.now)) return state;
  return {
    ...state,
    workouts: restoreCaptured(
      state.workouts,
      snapshot.workouts ?? [],
      snapshot.addedWorkoutIds ?? [],
      'id',
    ),
    series: restoreCaptured(
      state.series,
      snapshot.series ?? [],
      snapshot.addedSeriesIds ?? [],
      'id',
    ),
    templates: restoreCaptured(
      state.templates,
      snapshot.templates ?? [],
      snapshot.addedTemplateIds ?? [],
      'id',
    ),
    bodyWeightEntries: restoreCaptured(
      state.bodyWeightEntries,
      snapshot.bodyWeightEntries ?? [],
      snapshot.addedBodyWeightDates ?? [],
      'date',
    ).sort((left, right) => left.date.localeCompare(right.date)),
    settings: snapshot.settings ? clone(snapshot.settings) : state.settings,
  };
}

export { DEFAULT_UNDO_TTL_MS };
