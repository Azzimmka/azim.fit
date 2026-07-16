import { describe, expect, it } from 'vitest';
import { createEmptyAppState } from '../domain/schema.js';
import {
  getScopedStorageKey,
  loadAppStateResult,
  loadScopedAppState,
  loadScopedAppStateResult,
  saveAppState,
  saveScopedAppState,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  STORAGE_KEY_V3,
} from './storage.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
    values,
    writes,
  };
}

function stateWithWorkout(id, schemaVersion = 3) {
  return {
    ...createEmptyAppState(),
    schemaVersion,
    workouts: [{
      id,
      title: id,
      status: 'planned',
      plannedDate: '2026-07-15',
      exercises: [],
    }],
  };
}

function legacyScopedKey(scope = 'guest') {
  return `${STORAGE_KEY_V2}:${scope}`;
}

describe('localStorage adapter', () => {
  it('loads normalized V3 before every legacy value', () => {
    const rawV2 = JSON.stringify(stateWithWorkout('v2', 2));
    const storage = fakeStorage({
      [STORAGE_KEY_V3]: JSON.stringify({
        ...stateWithWorkout('v3'),
        settings: { defaultReminder: 30 },
      }),
      [STORAGE_KEY_V2]: rawV2,
    });

    const result = loadAppStateResult(storage);

    expect(result).toMatchObject({ source: 'v3', migrated: false, recovered: false });
    expect(result.state.workouts[0].id).toBe('v3');
    expect(result.state.settings).toEqual({});
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(rawV2);
    expect(storage.writes).toEqual([]);
  });

  it('migrates unscoped V2 into V3 and preserves the V2 bytes', () => {
    const rawV2 = JSON.stringify(stateWithWorkout('legacy-v2', 2));
    const storage = fakeStorage({ [STORAGE_KEY_V2]: rawV2 });

    const result = loadAppStateResult(storage);

    expect(result).toMatchObject({
      source: 'v2',
      migrated: true,
      recovered: false,
      persisted: true,
    });
    expect(result.state.schemaVersion).toBe(3);
    expect(result.state.workouts[0].id).toBe('legacy-v2');
    expect(JSON.parse(storage.values.get(STORAGE_KEY_V3)).schemaVersion).toBe(3);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(rawV2);
  });

  it('recovers corrupt V3 and V2 values from V1 without changing legacy keys', () => {
    const originalV1 = JSON.stringify({
      workouts: [{
        id: 'legacy',
        title: 'Legacy',
        date: '2026-07-12',
        completed: false,
        exercises: [],
      }],
    });
    const storage = fakeStorage({
      [STORAGE_KEY_V3]: '{not v3 json',
      [STORAGE_KEY_V2]: '{not v2 json',
      [STORAGE_KEY_V1]: originalV1,
    });

    const result = loadAppStateResult(storage, { today: '2026-07-13' });

    expect(result).toMatchObject({ source: 'v1', migrated: true, recovered: true, persisted: true });
    expect(result.state.workouts[0].id).toBe('legacy');
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(originalV1);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe('{not v2 json');
    expect(JSON.parse(storage.values.get(STORAGE_KEY_V3)).schemaVersion).toBe(3);
  });

  it('returns an empty profile when values are unusable and tolerates writes throwing', () => {
    const storage = {
      getItem: () => 'broken',
      setItem: () => { throw new Error('quota'); },
    };
    expect(loadAppStateResult(storage).state.workouts).toEqual([]);
    expect(saveAppState(createEmptyAppState(), storage)).toBe(false);
  });

  it('builds stable V3 guest and Firebase UID-safe scoped keys', () => {
    expect(getScopedStorageKey(null)).toBe(`${STORAGE_KEY_V3}:guest`);
    expect(getScopedStorageKey('')).toBe(`${STORAGE_KEY_V3}:guest`);
    expect(getScopedStorageKey('   ')).toBe(`${STORAGE_KEY_V3}:guest`);
    expect(getScopedStorageKey('firebase_UID-123')).toBe(`${STORAGE_KEY_V3}:firebase_UID-123`);

    const escaped = getScopedStorageKey(' user:один ');
    expect(escaped).toBe(getScopedStorageKey('user:один'));
    expect(escaped).toMatch(/^keep-at-it-state-v3:[A-Za-z0-9_-]+$/);
    expect(escaped).not.toBe(getScopedStorageKey('user:два'));
  });

  it('loads scoped guest V3 before unscoped V3 and all legacy keys', () => {
    const scopedGuestKey = getScopedStorageKey(null);
    const unscopedV3 = JSON.stringify(stateWithWorkout('unscoped-v3'));
    const legacyV2 = JSON.stringify(stateWithWorkout('legacy-v2', 2));
    const legacyV1 = JSON.stringify({
      workouts: [{ id: 'legacy-v1', title: 'V1', date: '2026-07-14', exercises: [] }],
    });
    const storage = fakeStorage({
      [scopedGuestKey]: JSON.stringify(stateWithWorkout('scoped-guest')),
      [STORAGE_KEY_V3]: unscopedV3,
      [STORAGE_KEY_V2]: legacyV2,
      [STORAGE_KEY_V1]: legacyV1,
    });

    const result = loadScopedAppStateResult(null, storage);

    expect(result).toMatchObject({ source: 'scoped-v3', migrated: false, recovered: false });
    expect(result.state.workouts[0].id).toBe('scoped-guest');
    expect(storage.writes).toEqual([]);
    expect(storage.values.get(STORAGE_KEY_V3)).toBe(unscopedV3);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(legacyV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
  });

  it('copies unscoped V3 into guest scope without changing its bytes', () => {
    const rawV3 = JSON.stringify(stateWithWorkout('unscoped-v3'));
    const storage = fakeStorage({ [STORAGE_KEY_V3]: rawV3 });

    const result = loadScopedAppStateResult(undefined, storage);

    expect(result).toMatchObject({
      source: 'v3',
      migrated: true,
      recovered: false,
      persisted: true,
    });
    expect(result.state.workouts[0].id).toBe('unscoped-v3');
    expect(JSON.parse(storage.values.get(getScopedStorageKey(null))).schemaVersion).toBe(3);
    expect(storage.values.get(STORAGE_KEY_V3)).toBe(rawV3);
  });

  it('migrates an authenticated user own scoped V2 without reading guest data', () => {
    const ownV2 = JSON.stringify(stateWithWorkout('own-v2', 2));
    const guestV3 = JSON.stringify(stateWithWorkout('guest-v3'));
    const storage = fakeStorage({
      [legacyScopedKey('uid-a')]: ownV2,
      [getScopedStorageKey(null)]: guestV3,
    });

    const result = loadScopedAppStateResult('uid-a', storage);

    expect(result).toMatchObject({
      source: 'scoped-v2',
      migrated: true,
      recovered: false,
      persisted: true,
    });
    expect(result.state.workouts[0].id).toBe('own-v2');
    expect(storage.values.get(legacyScopedKey('uid-a'))).toBe(ownV2);
    expect(JSON.parse(storage.values.get(getScopedStorageKey('uid-a'))).schemaVersion).toBe(3);
  });

  it('copies unscoped V2 into guest scope without changing either legacy key', () => {
    const legacyV2 = JSON.stringify(stateWithWorkout('legacy-v2', 2));
    const legacyV1 = JSON.stringify({ workouts: [] });
    const storage = fakeStorage({
      [STORAGE_KEY_V2]: legacyV2,
      [STORAGE_KEY_V1]: legacyV1,
    });

    const result = loadScopedAppStateResult(undefined, storage);

    expect(result).toMatchObject({
      source: 'v2',
      migrated: true,
      recovered: false,
      persisted: true,
    });
    expect(result.state.workouts[0].id).toBe('legacy-v2');
    expect(JSON.parse(storage.values.get(getScopedStorageKey(null))).schemaVersion).toBe(3);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(legacyV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
  });

  it('migrates V1 after corrupt guest values while preserving their exact bytes', () => {
    const scopedGuestKey = getScopedStorageKey(null);
    const corruptScopedV3 = '{scoped-v3';
    const corruptScopedV2 = '{scoped-v2';
    const corruptV3 = '{unscoped-v3';
    const corruptV2 = '{unscoped-v2';
    const legacyV1 = JSON.stringify({
      workouts: [{
        id: 'legacy-v1',
        title: 'Legacy V1',
        date: '2026-07-14',
        completed: false,
        exercises: [],
      }],
    });
    const storage = fakeStorage({
      [scopedGuestKey]: corruptScopedV3,
      [legacyScopedKey()]: corruptScopedV2,
      [STORAGE_KEY_V3]: corruptV3,
      [STORAGE_KEY_V2]: corruptV2,
      [STORAGE_KEY_V1]: legacyV1,
    });

    const result = loadScopedAppStateResult('', storage, { today: '2026-07-15' });

    expect(result).toMatchObject({ source: 'v1', migrated: true, recovered: true, persisted: true });
    expect(result.state.workouts[0].id).toBe('legacy-v1');
    expect(storage.values.get(legacyScopedKey())).toBe(corruptScopedV2);
    expect(storage.values.get(STORAGE_KEY_V3)).toBe(corruptV3);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(corruptV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
    expect(storage.writes).toHaveLength(1);
    expect(JSON.parse(storage.values.get(scopedGuestKey)).schemaVersion).toBe(3);
  });

  it('keeps authenticated profiles isolated and normalizes every scoped save', () => {
    const storage = fakeStorage();
    expect(saveScopedAppState('uid-a', stateWithWorkout('workout-a'), storage)).toBe(true);
    expect(saveScopedAppState('uid-b', stateWithWorkout('workout-b'), storage)).toBe(true);

    expect(loadScopedAppState('uid-a', storage).workouts[0].id).toBe('workout-a');
    expect(loadScopedAppState('uid-b', storage).workouts[0].id).toBe('workout-b');
    expect(JSON.parse(storage.values.get(getScopedStorageKey('uid-a')))).toMatchObject({
      schemaVersion: 3,
      workouts: [{ id: 'workout-a' }],
    });
    expect(storage.values.has(STORAGE_KEY_V3)).toBe(false);
    expect(storage.values.has(STORAGE_KEY_V2)).toBe(false);
    expect(storage.values.has(STORAGE_KEY_V1)).toBe(false);
  });

  it('never falls back from an authenticated scope to guest or unscoped data', () => {
    const storage = fakeStorage({
      [getScopedStorageKey(null)]: JSON.stringify(stateWithWorkout('guest-workout')),
      [STORAGE_KEY_V3]: JSON.stringify(stateWithWorkout('unscoped-workout')),
      [STORAGE_KEY_V2]: JSON.stringify(stateWithWorkout('legacy-workout', 2)),
      [STORAGE_KEY_V1]: JSON.stringify({
        workouts: [{ id: 'v1-workout', title: 'V1', date: '2026-07-14', exercises: [] }],
      }),
    });

    const missing = loadScopedAppStateResult('uid-new', storage);
    expect(missing).toMatchObject({ source: 'empty', migrated: false, recovered: false });
    expect(missing.state.workouts).toEqual([]);

    storage.values.set(getScopedStorageKey('uid-corrupt'), '{broken');
    const corrupt = loadScopedAppStateResult('uid-corrupt', storage);
    expect(corrupt).toMatchObject({ source: 'empty', migrated: false, recovered: true });
    expect(corrupt.state.workouts).toEqual([]);
    expect(storage.writes).toEqual([]);
  });

  it('recovers safely from unavailable scoped storage reads and writes', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };

    expect(loadScopedAppStateResult('uid-a', storage)).toMatchObject({
      source: 'empty',
      recovered: false,
    });
    expect(saveScopedAppState('uid-a', createEmptyAppState(), storage)).toBe(false);
  });

  it('persists only GPS aggregates and drops raw coordinates', () => {
    const storage = fakeStorage();
    const state = {
      ...stateWithWorkout('run'),
      workouts: [{
        ...stateWithWorkout('run').workouts[0],
        exercises: [{
          id: 'running',
          name: 'Бег',
          structure: 'continuous',
          target: { kind: 'distance', value: 3000, unit: 'meters' },
          sets: 1,
          restSeconds: 0,
        }],
      }],
      activeContinuousSession: {
        workoutId: 'run',
        exerciseId: 'running',
        status: 'active',
        accumulatedMeters: 812.4,
        activeDurationSeconds: 301,
        latitude: 41.311081,
        longitude: 69.240562,
        coordinates: [{ latitude: 41.311081, longitude: 69.240562 }],
      },
    };

    expect(saveScopedAppState(null, state, storage)).toBe(true);
    const persisted = storage.values.get(getScopedStorageKey(null));
    expect(persisted).not.toMatch(/latitude|longitude|coordinates/i);
    expect(JSON.parse(persisted).activeContinuousSession).toMatchObject({
      status: 'paused',
      accumulatedMeters: 812,
      activeDurationSeconds: 301,
    });
  });
});
