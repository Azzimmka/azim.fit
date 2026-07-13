import {
  createEmptyAppState,
  migrateV1State,
  normalizeAppState,
} from '../domain/schema.js';

export const STORAGE_KEY_V1 = 'azim-fit-state-v1';
export const STORAGE_KEY_V2 = 'azim-fit-state-v2';

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGet(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeParse(value) {
  if (typeof value !== 'string') return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {Storage|{getItem: Function, setItem: Function}|null} storage
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 */
export function loadAppStateResult(storage, options = {}) {
  const target = resolveStorage(storage);
  const rawV2 = safeGet(target, STORAGE_KEY_V2);
  const parsedV2 = safeParse(rawV2);

  if (parsedV2.ok && isObject(parsedV2.value) && parsedV2.value.schemaVersion === 2) {
    return {
      state: normalizeAppState(parsedV2.value, options),
      source: 'v2',
      migrated: false,
      recovered: false,
    };
  }

  const rawV1 = safeGet(target, STORAGE_KEY_V1);
  const parsedV1 = safeParse(rawV1);
  if (parsedV1.ok && isObject(parsedV1.value) && Array.isArray(parsedV1.value.workouts)) {
    const state = migrateV1State(parsedV1.value, options);
    const persisted = saveAppState(state, target, options);
    return {
      state,
      source: 'v1',
      migrated: true,
      recovered: rawV2 !== null,
      persisted,
    };
  }

  return {
    state: createEmptyAppState(),
    source: 'empty',
    migrated: false,
    recovered: rawV2 !== null || rawV1 !== null,
  };
}

/** @param {Storage|object|null} storage @param {object} options */
export function loadAppState(storage, options = {}) {
  return loadAppStateResult(storage, options).state;
}

/**
 * @param {import('../domain/model.js').AppStateV2} state
 * @param {Storage|{setItem: Function}|null} storage
 * @param {object} options
 */
export function saveAppState(state, storage, options = {}) {
  const target = resolveStorage(storage);
  if (!target?.setItem) return false;
  try {
    target.setItem(STORAGE_KEY_V2, JSON.stringify(normalizeAppState(state, options)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The adapter deliberately has no delete/clear operation, so the V1 key cannot
 * be removed accidentally after migration.
 * @param {Storage|object|null} storage
 * @param {object} options
 */
export function createLocalStorageAdapter(storage, options = {}) {
  return Object.freeze({
    load: () => loadAppState(storage, options),
    loadResult: () => loadAppStateResult(storage, options),
    save: (state) => saveAppState(state, storage, options),
  });
}

export const loadState = loadAppState;
export const saveState = saveAppState;

