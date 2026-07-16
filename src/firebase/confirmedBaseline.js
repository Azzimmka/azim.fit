import { normalizeAppState } from '../domain/schema.js';

const BASELINE_KEY_PREFIX = 'keep-at-it-cloud-baseline-v3:';
const LEGACY_BASELINE_KEY_PREFIX = 'azim-fit-cloud-baseline-v2:';
const DETERMINISTIC_DATE = '1970-01-01';
const DETERMINISTIC_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function normalizeUid(uid) {
  if (typeof uid !== 'string' || !uid.trim()) return null;
  return uid.trim();
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeBaseline(state, options = {}) {
  let generatedId = 0;
  return normalizeAppState(state, {
    ...options,
    today: options.today ?? DETERMINISTIC_DATE,
    now: options.now ?? DETERMINISTIC_TIMESTAMP,
    idFactory: options.idFactory ?? ((prefix = 'item') => `${prefix}-baseline-${++generatedId}`),
  });
}

/** Returns the per-Firebase-user key used for the last confirmed cloud state. */
export function getConfirmedCloudBaselineKey(uid) {
  const normalizedUid = normalizeUid(uid);
  return normalizedUid ? `${BASELINE_KEY_PREFIX}${encodeURIComponent(normalizedUid)}` : null;
}

/**
 * Loads the last server-confirmed cloud snapshot. Cache/pending snapshots must
 * never be passed to the matching save helper.
 */
export function loadConfirmedCloudBaseline(uid, storage, options = {}) {
  const key = getConfirmedCloudBaselineKey(uid);
  const target = resolveStorage(storage);
  if (!key || !target?.getItem) return null;

  try {
    const encodedUid = key.slice(BASELINE_KEY_PREFIX.length);
    const candidates = [
      { raw: target.getItem(key), schemaVersion: 3 },
      {
        raw: target.getItem(`${LEGACY_BASELINE_KEY_PREFIX}${encodedUid}`),
        schemaVersion: 2,
      },
    ];
    for (const candidate of candidates) {
      if (!candidate.raw) continue;
      try {
        const parsed = JSON.parse(candidate.raw);
        if (
          parsed
          && typeof parsed === 'object'
          && parsed.schemaVersion === candidate.schemaVersion
        ) {
          return normalizeBaseline(parsed, options);
        }
      } catch {
        // A damaged new baseline must not prevent a safe legacy fallback.
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Persists one server-confirmed cloud snapshot for three-way reconciliation. */
export function saveConfirmedCloudBaseline(uid, state, storage, options = {}) {
  const key = getConfirmedCloudBaselineKey(uid);
  const target = resolveStorage(storage);
  if (!key || !target?.setItem) return false;

  try {
    target.setItem(key, JSON.stringify(normalizeBaseline(state, options)));
    return true;
  } catch {
    return false;
  }
}
