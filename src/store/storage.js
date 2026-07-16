import {
  createEmptyAppState,
  migrateV1State,
  normalizeAppState,
} from '../domain/schema.js';

export const STORAGE_KEY_V1 = 'azim-fit-state-v1';
export const STORAGE_KEY_V2 = 'azim-fit-state-v2';
export const STORAGE_KEY_V3 = 'keep-at-it-state-v3';
const GUEST_STORAGE_SCOPE = 'guest';

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

function isGuestScope(scope) {
  return scope === null
    || scope === undefined
    || String(scope).trim() === '';
}

function sanitizeStorageScope(scope) {
  if (isGuestScope(scope)) return GUEST_STORAGE_SCOPE;
  return Array.from(String(scope).trim().normalize('NFKC'), (character) => {
    if (/^[A-Za-z0-9_-]$/.test(character)) return character;
    return `_u${character.codePointAt(0).toString(16)}_`;
  }).join('');
}

function parseVersionedState(raw, schemaVersion, options) {
  const parsed = safeParse(raw);
  if (!parsed.ok || !isObject(parsed.value) || parsed.value.schemaVersion !== schemaVersion) {
    return null;
  }
  return normalizeAppState(parsed.value, options);
}

function legacyScopedStorageKey(scope) {
  return `${STORAGE_KEY_V2}:${sanitizeStorageScope(scope)}`;
}

/**
 * Returns a stable localStorage key for a guest or Firebase user. Unsafe UID
 * characters are escaped instead of removed to avoid collapsing distinct IDs.
 * @param {string|null|undefined} scope
 */
export function getScopedStorageKey(scope) {
  return `${STORAGE_KEY_V3}:${sanitizeStorageScope(scope)}`;
}

/**
 * Loads the unscoped local profile, migrating V2 or V1 into V3 without
 * modifying or deleting either legacy key.
 * @param {Storage|{getItem: Function, setItem: Function}|null} storage
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 */
export function loadAppStateResult(storage, options = {}) {
  const target = resolveStorage(storage);
  const rawV3 = safeGet(target, STORAGE_KEY_V3);
  const stateV3 = parseVersionedState(rawV3, 3, options);
  if (stateV3) {
    return {
      state: stateV3,
      source: 'v3',
      migrated: false,
      recovered: false,
    };
  }

  const rawV2 = safeGet(target, STORAGE_KEY_V2);
  const stateV2 = parseVersionedState(rawV2, 2, options);
  if (stateV2) {
    const persisted = saveAppState(stateV2, target, options);
    return {
      state: stateV2,
      source: 'v2',
      migrated: true,
      recovered: rawV3 !== null,
      persisted,
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
      recovered: rawV3 !== null || rawV2 !== null,
      persisted,
    };
  }

  return {
    state: createEmptyAppState(),
    source: 'empty',
    migrated: false,
    recovered: rawV3 !== null || rawV2 !== null || rawV1 !== null,
  };
}

/** @param {Storage|object|null} storage @param {object} options */
export function loadAppState(storage, options = {}) {
  return loadAppStateResult(storage, options).state;
}

/**
 * @param {import('../domain/model.js').AppStateV3} state
 * @param {Storage|{setItem: Function}|null} storage
 * @param {object} options
 */
export function saveAppState(state, storage, options = {}) {
  const target = resolveStorage(storage);
  if (!target?.setItem) return false;
  try {
    target.setItem(STORAGE_KEY_V3, JSON.stringify(normalizeAppState(state, options)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads an isolated local profile. Authenticated users can migrate only their
 * own scoped V2 profile. Guests additionally migrate unscoped V3/V2 and V1.
 * Every legacy value is preserved byte-for-byte.
 * @param {string|null|undefined} scope
 * @param {Storage|{getItem: Function, setItem: Function}|null} storage
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 */
export function loadScopedAppStateResult(scope, storage, options = {}) {
  const target = resolveStorage(storage);
  const scopedKey = getScopedStorageKey(scope);
  const rawScopedV3 = safeGet(target, scopedKey);
  const scopedV3 = parseVersionedState(rawScopedV3, 3, options);
  if (scopedV3) {
    return {
      state: scopedV3,
      source: 'scoped-v3',
      migrated: false,
      recovered: false,
    };
  }

  const scopedV2Key = legacyScopedStorageKey(scope);
  const rawScopedV2 = safeGet(target, scopedV2Key);
  const scopedV2 = parseVersionedState(rawScopedV2, 2, options);
  if (scopedV2) {
    const persisted = saveScopedAppState(scope, scopedV2, target, options);
    return {
      state: scopedV2,
      source: 'scoped-v2',
      migrated: true,
      recovered: rawScopedV3 !== null,
      persisted,
    };
  }

  if (!isGuestScope(scope)) {
    return {
      state: createEmptyAppState(),
      source: 'empty',
      migrated: false,
      recovered: rawScopedV3 !== null || rawScopedV2 !== null,
    };
  }

  const rawV3 = safeGet(target, STORAGE_KEY_V3);
  const unscopedV3 = parseVersionedState(rawV3, 3, options);
  if (unscopedV3) {
    const persisted = saveScopedAppState(scope, unscopedV3, target, options);
    return {
      state: unscopedV3,
      source: 'v3',
      migrated: true,
      recovered: rawScopedV3 !== null || rawScopedV2 !== null,
      persisted,
    };
  }

  const rawV2 = safeGet(target, STORAGE_KEY_V2);
  const unscopedV2 = parseVersionedState(rawV2, 2, options);
  if (unscopedV2) {
    const persisted = saveScopedAppState(scope, unscopedV2, target, options);
    return {
      state: unscopedV2,
      source: 'v2',
      migrated: true,
      recovered: rawScopedV3 !== null || rawScopedV2 !== null || rawV3 !== null,
      persisted,
    };
  }

  const rawV1 = safeGet(target, STORAGE_KEY_V1);
  const parsedV1 = safeParse(rawV1);
  if (parsedV1.ok && isObject(parsedV1.value) && Array.isArray(parsedV1.value.workouts)) {
    const state = migrateV1State(parsedV1.value, options);
    const persisted = saveScopedAppState(scope, state, target, options);
    return {
      state,
      source: 'v1',
      migrated: true,
      recovered: rawScopedV3 !== null
        || rawScopedV2 !== null
        || rawV3 !== null
        || rawV2 !== null,
      persisted,
    };
  }

  return {
    state: createEmptyAppState(),
    source: 'empty',
    migrated: false,
    recovered: rawScopedV3 !== null
      || rawScopedV2 !== null
      || rawV3 !== null
      || rawV2 !== null
      || rawV1 !== null,
  };
}

/**
 * @param {string|null|undefined} scope
 * @param {Storage|object|null} storage
 * @param {object} options
 */
export function loadScopedAppState(scope, storage, options = {}) {
  return loadScopedAppStateResult(scope, storage, options).state;
}

/**
 * @param {string|null|undefined} scope
 * @param {import('../domain/model.js').AppStateV3} state
 * @param {Storage|{setItem: Function}|null} storage
 * @param {object} options
 */
export function saveScopedAppState(scope, state, storage, options = {}) {
  const target = resolveStorage(storage);
  if (!target?.setItem) return false;
  try {
    target.setItem(
      getScopedStorageKey(scope),
      JSON.stringify(normalizeAppState(state, options)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The adapter deliberately has no delete/clear operation, so legacy keys
 * cannot be removed accidentally after migration.
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
