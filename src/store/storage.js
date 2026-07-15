import {
  createEmptyAppState,
  migrateV1State,
  normalizeAppState,
} from '../domain/schema.js';

export const STORAGE_KEY_V1 = 'azim-fit-state-v1';
export const STORAGE_KEY_V2 = 'azim-fit-state-v2';
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

function parseV2State(raw, options) {
  const parsed = safeParse(raw);
  if (!parsed.ok || !isObject(parsed.value) || parsed.value.schemaVersion !== 2) {
    return null;
  }
  return normalizeAppState(parsed.value, options);
}

/**
 * Returns a stable localStorage key for a guest or Firebase user. Unsafe UID
 * characters are escaped instead of removed to avoid collapsing distinct IDs.
 * @param {string|null|undefined} scope
 */
export function getScopedStorageKey(scope) {
  return `${STORAGE_KEY_V2}:${sanitizeStorageScope(scope)}`;
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
 * Loads an isolated local profile. Guests may migrate from the legacy keys;
 * authenticated users only ever read their own scoped key.
 * @param {string|null|undefined} scope
 * @param {Storage|{getItem: Function, setItem: Function}|null} storage
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 */
export function loadScopedAppStateResult(scope, storage, options = {}) {
  const target = resolveStorage(storage);
  const scopedKey = getScopedStorageKey(scope);
  const rawScoped = safeGet(target, scopedKey);
  const scopedState = parseV2State(rawScoped, options);

  if (scopedState) {
    return {
      state: scopedState,
      source: 'scoped',
      migrated: false,
      recovered: false,
    };
  }

  if (!isGuestScope(scope)) {
    return {
      state: createEmptyAppState(),
      source: 'empty',
      migrated: false,
      recovered: rawScoped !== null,
    };
  }

  const rawV2 = safeGet(target, STORAGE_KEY_V2);
  const legacyV2State = parseV2State(rawV2, options);
  if (legacyV2State) {
    const persisted = saveScopedAppState(scope, legacyV2State, target, options);
    return {
      state: legacyV2State,
      source: 'v2',
      migrated: true,
      recovered: rawScoped !== null,
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
      recovered: rawScoped !== null || rawV2 !== null,
      persisted,
    };
  }

  return {
    state: createEmptyAppState(),
    source: 'empty',
    migrated: false,
    recovered: rawScoped !== null || rawV2 !== null || rawV1 !== null,
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
 * @param {import('../domain/model.js').AppStateV2} state
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
