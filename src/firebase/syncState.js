import { createEmptyAppState, normalizeAppState } from '../domain/schema.js';

const COLLECTION_CONFIG = Object.freeze({
  workouts: Object.freeze({ key: 'id' }),
  series: Object.freeze({ key: 'id' }),
  templates: Object.freeze({ key: 'id' }),
  bodyWeightEntries: Object.freeze({ key: 'date' }),
});
const DETERMINISTIC_DATE = '1970-01-01';
const DETERMINISTIC_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Removes Firestore-only bookkeeping without changing domain values. */
export function stripPrivateSyncFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateSyncFields);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => (
        !key.startsWith('_sync') && !key.startsWith('__sync') && item !== undefined
      ))
      .map(([key, item]) => [key, stripPrivateSyncFields(item)]),
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableValue(value[key])]),
  );
}

function valuesEqual(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function createDeterministicIdFactory(scope) {
  let counter = 0;
  return (prefix = 'item') => `${prefix}-sync-${scope}-${++counter}`;
}

function normalizeForSync(input, options = {}, scope = 'state') {
  const normalizeOptions = options.normalizeOptions ?? options;
  return normalizeAppState(stripPrivateSyncFields(input), {
    ...normalizeOptions,
    today: normalizeOptions.today ?? DETERMINISTIC_DATE,
    now: normalizeOptions.now ?? DETERMINISTIC_TIMESTAMP,
    idFactory: normalizeOptions.idFactory ?? createDeterministicIdFactory(scope),
  });
}

function stateMeta(state) {
  return {
    schemaVersion: state.schemaVersion,
    settings: state.settings,
    activeTimer: state.activeTimer,
  };
}

function compareStableKeys(left, right) {
  const leftKey = String(left);
  const rightKey = String(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return 0;
}

function mergeEntities(localItems, remoteItems, key) {
  const merged = new Map();
  for (const item of localItems) merged.set(String(item[key]), item);
  for (const item of remoteItems) merged.set(String(item[key]), item);
  return [...merged.values()].sort((left, right) => compareStableKeys(left[key], right[key]));
}

/**
 * True only when there is no user data beyond the canonical V2 defaults.
 * Damaged values are normalized deterministically before the check.
 */
export function isAppStateEmpty(state) {
  const normalized = normalizeForSync(state, {}, 'empty');
  const empty = createEmptyAppState();
  return Object.keys(COLLECTION_CONFIG).every((key) => normalized[key].length === 0)
    && normalized.activeTimer === null
    && valuesEqual(normalized.settings, empty.settings);
}

/**
 * Deterministic first-sync merge. Unique local and remote entities survive;
 * the complete remote entity wins when a stable id/date exists on both sides.
 */
export function mergeAppStates(localState, remoteState, options = {}) {
  const local = normalizeForSync(localState, options, 'local');
  const remote = normalizeForSync(remoteState, options, 'remote');

  let metaSource = isAppStateEmpty(remote) ? local : remote;
  if (options.remoteMetaExists === false) metaSource = local;
  if (options.remoteMetaExists === true) metaSource = remote;

  return normalizeForSync({
    schemaVersion: 2,
    workouts: mergeEntities(local.workouts, remote.workouts, 'id'),
    series: mergeEntities(local.series, remote.series, 'id'),
    templates: mergeEntities(local.templates, remote.templates, 'id'),
    bodyWeightEntries: mergeEntities(
      local.bodyWeightEntries,
      remote.bodyWeightEntries,
      'date',
    ),
    settings: metaSource.settings,
    activeTimer: metaSource.activeTimer,
  }, options, 'merged');
}

function diffEntities(previousItems, nextItems, key) {
  const previous = new Map(previousItems.map((item) => [String(item[key]), item]));
  const next = new Map(nextItems.map((item) => [String(item[key]), item]));
  const sets = [];
  const deletes = [];

  for (const [id, item] of next) {
    if (!previous.has(id) || !valuesEqual(previous.get(id), item)) {
      sets.push({ id, value: item });
    }
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) deletes.push(id);
  }

  sets.sort((left, right) => compareStableKeys(left.id, right.id));
  deletes.sort(compareStableKeys);
  return { sets, deletes };
}

/** Computes document-level changes without touching Firestore. */
export function diffAppStates(previousState, nextState, options = {}) {
  const previous = normalizeForSync(previousState, options, 'previous');
  const next = normalizeForSync(nextState, options, 'next');
  const collections = Object.fromEntries(
    Object.entries(COLLECTION_CONFIG).map(([name, config]) => [
      name,
      diffEntities(previous[name], next[name], config.key),
    ]),
  );
  const meta = stateMeta(next);
  const metaChanged = !valuesEqual(stateMeta(previous), meta);
  const hasChanges = metaChanged || Object.values(collections).some(
    (change) => change.sets.length > 0 || change.deletes.length > 0,
  );

  return {
    previous,
    next,
    collections,
    meta: { changed: metaChanged, value: meta },
    hasChanges,
  };
}

/**
 * Reassembles the five Firestore sources into the canonical runtime model.
 * `bodyWeights` is accepted as the Firestore collection name alias.
 */
export function assembleAppStateSnapshot(sources = {}, options = {}) {
  const meta = stripPrivateSyncFields(sources.meta ?? {});
  return normalizeForSync({
    schemaVersion: meta.schemaVersion ?? 2,
    workouts: stripPrivateSyncFields(sources.workouts ?? []),
    series: stripPrivateSyncFields(sources.series ?? []),
    templates: stripPrivateSyncFields(sources.templates ?? []),
    bodyWeightEntries: stripPrivateSyncFields(
      sources.bodyWeightEntries ?? sources.bodyWeights ?? [],
    ),
    settings: meta.settings,
    activeTimer: meta.activeTimer,
  }, options, 'snapshot');
}
