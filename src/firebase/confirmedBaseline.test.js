import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyAppState } from '../domain/schema.js';
import {
  getConfirmedCloudBaselineKey,
  loadConfirmedCloudBaseline,
  saveConfirmedCloudBaseline,
} from './confirmedBaseline.js';

const TODAY = '2026-07-15';

function stateWithWorkout(id) {
  return {
    ...createEmptyAppState(),
    workouts: [{
      id,
      title: id,
      status: 'planned',
      plannedDate: TODAY,
      occurrenceDate: TODAY,
      exercises: [],
    }],
  };
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('confirmed cloud baseline storage', () => {
  it('keeps normalized snapshots isolated by uid', () => {
    const state = stateWithWorkout('confirmed');

    expect(saveConfirmedCloudBaseline('user/one', state, globalThis.localStorage, { today: TODAY }))
      .toBe(true);
    expect(getConfirmedCloudBaselineKey('user/one')).toContain('user%2Fone');
    expect(loadConfirmedCloudBaseline('user/one', globalThis.localStorage, { today: TODAY }))
      .toMatchObject({ workouts: [expect.objectContaining({ id: 'confirmed' })] });
    expect(loadConfirmedCloudBaseline('user-two', globalThis.localStorage, { today: TODAY }))
      .toBeNull();
  });

  it('migrates the legacy V2 baseline without modifying it', () => {
    const uid = 'legacy-user';
    const legacyKey = `azim-fit-cloud-baseline-v2:${encodeURIComponent(uid)}`;
    const legacyBytes = JSON.stringify({
      ...stateWithWorkout('legacy-confirmed'),
      schemaVersion: 2,
    });
    globalThis.localStorage.setItem(legacyKey, legacyBytes);

    const loaded = loadConfirmedCloudBaseline(uid, globalThis.localStorage, { today: TODAY });

    expect(loaded).toMatchObject({
      schemaVersion: 3,
      workouts: [expect.objectContaining({ id: 'legacy-confirmed' })],
    });
    expect(globalThis.localStorage.getItem(legacyKey)).toBe(legacyBytes);
  });

  it('ignores malformed values and storage failures', () => {
    const key = getConfirmedCloudBaselineKey('user-1');
    globalThis.localStorage.setItem(key, '{broken');
    expect(loadConfirmedCloudBaseline('user-1', globalThis.localStorage, { today: TODAY }))
      .toBeNull();

    const failingStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(loadConfirmedCloudBaseline('user-1', failingStorage, { today: TODAY })).toBeNull();
    expect(saveConfirmedCloudBaseline('user-1', stateWithWorkout('w'), failingStorage, {
      today: TODAY,
    })).toBe(false);
  });
});
