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

function stateWithWorkout(id) {
  return {
    ...createEmptyAppState(),
    workouts: [{
      id,
      title: id,
      status: 'planned',
      plannedDate: '2026-07-15',
      exercises: [],
    }],
  };
}

describe('localStorage adapter', () => {
  it('loads normalized V2 first', () => {
    const storage = fakeStorage({
      [STORAGE_KEY_V2]: JSON.stringify({
        ...createEmptyAppState(),
        settings: { defaultReminder: 30 },
      }),
    });
    const result = loadAppStateResult(storage);
    expect(result.source).toBe('v2');
    expect(result.state.settings).toEqual({});
  });

  it('recovers a corrupt V2 value from V1 and never removes the V1 key', () => {
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
      [STORAGE_KEY_V2]: '{not json',
      [STORAGE_KEY_V1]: originalV1,
    });

    const result = loadAppStateResult(storage, { today: '2026-07-13' });
    expect(result).toMatchObject({ source: 'v1', migrated: true, recovered: true, persisted: true });
    expect(result.state.workouts[0].id).toBe('legacy');
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(originalV1);
    expect(JSON.parse(storage.values.get(STORAGE_KEY_V2)).schemaVersion).toBe(2);
  });

  it('returns an empty profile when both values are unusable and tolerates writes throwing', () => {
    const storage = {
      getItem: () => 'broken',
      setItem: () => { throw new Error('quota'); },
    };
    expect(loadAppStateResult(storage).state.workouts).toEqual([]);
    expect(saveAppState(createEmptyAppState(), storage)).toBe(false);
  });

  it('builds stable guest and Firebase UID-safe scoped keys', () => {
    expect(getScopedStorageKey(null)).toBe(`${STORAGE_KEY_V2}:guest`);
    expect(getScopedStorageKey('')).toBe(`${STORAGE_KEY_V2}:guest`);
    expect(getScopedStorageKey('   ')).toBe(`${STORAGE_KEY_V2}:guest`);
    expect(getScopedStorageKey('firebase_UID-123')).toBe(`${STORAGE_KEY_V2}:firebase_UID-123`);

    const escaped = getScopedStorageKey(' user:один ');
    expect(escaped).toBe(getScopedStorageKey('user:один'));
    expect(escaped).toMatch(/^azim-fit-state-v2:[A-Za-z0-9_-]+$/);
    expect(escaped).not.toBe(getScopedStorageKey('user:два'));
  });

  it('loads the scoped guest before either legacy key', () => {
    const scopedGuestKey = getScopedStorageKey(null);
    const legacyV2 = JSON.stringify(stateWithWorkout('legacy-v2'));
    const legacyV1 = JSON.stringify({
      workouts: [{ id: 'legacy-v1', title: 'V1', date: '2026-07-14', exercises: [] }],
    });
    const storage = fakeStorage({
      [scopedGuestKey]: JSON.stringify(stateWithWorkout('scoped-guest')),
      [STORAGE_KEY_V2]: legacyV2,
      [STORAGE_KEY_V1]: legacyV1,
    });

    const result = loadScopedAppStateResult(null, storage);

    expect(result).toMatchObject({ source: 'scoped', migrated: false, recovered: false });
    expect(result.state.workouts[0].id).toBe('scoped-guest');
    expect(storage.writes).toEqual([]);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(legacyV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
  });

  it('copies legacy V2 into the guest scope without changing either legacy key', () => {
    const legacyV2 = JSON.stringify(stateWithWorkout('legacy-v2'));
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
    expect(JSON.parse(storage.values.get(getScopedStorageKey(null))).schemaVersion).toBe(2);
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(legacyV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
  });

  it('migrates V1 after corrupt guest and V2 values while preserving their exact bytes', () => {
    const scopedGuestKey = getScopedStorageKey(null);
    const corruptScoped = '{scoped';
    const corruptV2 = '{legacy-v2';
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
      [scopedGuestKey]: corruptScoped,
      [STORAGE_KEY_V2]: corruptV2,
      [STORAGE_KEY_V1]: legacyV1,
    });

    const result = loadScopedAppStateResult('', storage, { today: '2026-07-15' });

    expect(result).toMatchObject({ source: 'v1', migrated: true, recovered: true, persisted: true });
    expect(result.state.workouts[0].id).toBe('legacy-v1');
    expect(storage.values.get(STORAGE_KEY_V2)).toBe(corruptV2);
    expect(storage.values.get(STORAGE_KEY_V1)).toBe(legacyV1);
    expect(storage.writes).toHaveLength(1);
    expect(JSON.parse(storage.values.get(scopedGuestKey)).schemaVersion).toBe(2);
  });

  it('keeps authenticated profiles isolated and normalizes every scoped save', () => {
    const storage = fakeStorage();
    expect(saveScopedAppState('uid-a', stateWithWorkout('workout-a'), storage)).toBe(true);
    expect(saveScopedAppState('uid-b', stateWithWorkout('workout-b'), storage)).toBe(true);

    expect(loadScopedAppState('uid-a', storage).workouts[0].id).toBe('workout-a');
    expect(loadScopedAppState('uid-b', storage).workouts[0].id).toBe('workout-b');
    expect(JSON.parse(storage.values.get(getScopedStorageKey('uid-a')))).toMatchObject({
      schemaVersion: 2,
      workouts: [{ id: 'workout-a' }],
    });
    expect(storage.values.has(STORAGE_KEY_V2)).toBe(false);
    expect(storage.values.has(STORAGE_KEY_V1)).toBe(false);
  });

  it('never falls back from an authenticated scope to guest or legacy data', () => {
    const guestState = JSON.stringify(stateWithWorkout('guest-workout'));
    const legacyState = JSON.stringify(stateWithWorkout('legacy-workout'));
    const storage = fakeStorage({
      [getScopedStorageKey(null)]: guestState,
      [STORAGE_KEY_V2]: legacyState,
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
});
