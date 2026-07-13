import { describe, expect, it } from 'vitest';
import { createEmptyAppState } from '../domain/schema.js';
import {
  loadAppStateResult,
  saveAppState,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
} from './storage.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
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
    expect(result.state.settings.defaultReminder).toBe(30);
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
});

