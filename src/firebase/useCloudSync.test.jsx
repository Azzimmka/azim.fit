import { act, cleanup, renderHook } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppState, normalizeAppState } from '../domain/schema.js';
import { ActionTypes } from '../store/reducer.js';
import {
  loadConfirmedCloudBaseline,
  saveConfirmedCloudBaseline,
} from './confirmedBaseline.js';
import { useCloudSync } from './useCloudSync.js';

vi.mock('./client.js', () => ({ db: { name: 'cloud-sync-test-db' } }));

const TODAY = '2026-07-15';
const VERIFIED_USER = Object.freeze({
  uid: 'user-1',
  email: 'azim@example.com',
  emailVerified: true,
  displayName: 'Azim',
  photoURL: null,
});

function workout(id, title = id) {
  return {
    id,
    title,
    status: 'planned',
    plannedDate: TODAY,
    occurrenceDate: TODAY,
    exercises: [],
  };
}

function appState(entries = []) {
  return normalizeAppState({
    ...createEmptyAppState(),
    workouts: entries.map((entry) => (
      typeof entry === 'string' ? workout(entry) : workout(entry.id, entry.title)
    )),
  }, { today: TODAY, now: `${TODAY}T10:00:00.000Z` });
}

function workoutIds(state) {
  return state.workouts.map((item) => item.id).sort();
}

function createMockRepository(syncImplementation = async () => ({ written: true, operations: 1 })) {
  let snapshotCallback = null;
  let errorCallback = null;
  let subscribed = false;
  const unsubscribe = vi.fn(() => {
    subscribed = false;
  });
  const repository = {
    subscribe: vi.fn((uid, onSnapshot, onError) => {
      snapshotCallback = onSnapshot;
      errorCallback = onError;
      subscribed = true;
      return unsubscribe;
    }),
    sync: vi.fn(syncImplementation),
  };

  return {
    repository,
    unsubscribe,
    emit(state, metadata = {}) {
      if (!subscribed) return;
      snapshotCallback({
        state,
        metadata: {
          ready: true,
          fromCache: false,
          hasPendingWrites: false,
          metaExists: true,
          ...metadata,
        },
      });
    },
    fail(error) {
      if (subscribed) errorCallback(error);
    },
  };
}

function useCloudSyncHarness({
  initialState,
  repository,
  user = VERIFIED_USER,
  onEvent,
  baselineStorage = globalThis.localStorage,
}) {
  const [state, setState] = useState(initialState);
  const dispatch = useCallback((action) => {
    if (action.type === ActionTypes.REPLACE_STATE) setState(action.payload.state);
  }, []);
  const cloud = useCloudSync({
    user,
    state,
    dispatch,
    today: TODAY,
    repository,
    onEvent,
    baselineStorage,
  });

  return { cloud, setState, state };
}

async function emitSnapshot(mockRepository, state, metadata) {
  await act(async () => {
    mockRepository.emit(state, metadata);
    await Promise.resolve();
  });
}

async function advance(milliseconds) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function setOnline(value) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setOnline(true);
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
  vi.useRealTimers();
});

describe('useCloudSync', () => {
  it('uploads nonempty local state when the initial cloud snapshot is empty', async () => {
    const mock = createMockRepository();
    const onEvent = vi.fn();
    const local = appState(['local']);
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: local,
      repository: mock.repository,
      onEvent,
    }));

    await emitSnapshot(mock, appState());

    expect(mock.repository.subscribe).toHaveBeenCalledWith(
      VERIFIED_USER.uid,
      expect.any(Function),
      expect.any(Function),
    );
    expect(mock.repository.sync).toHaveBeenCalledOnce();
    const [previous, next, uid, profile] = mock.repository.sync.mock.calls[0];
    expect(workoutIds(previous)).toEqual([]);
    expect(workoutIds(next)).toEqual(['local']);
    expect(uid).toBe(VERIFIED_USER.uid);
    expect(profile).toMatchObject({ uid: VERIFIED_USER.uid, email: VERIFIED_USER.email });
    expect(result.current.state).toEqual(local);
    expect(result.current.cloud.syncStatus).toBe('synced');
    expect(onEvent).toHaveBeenCalledWith({ type: 'uploaded-local' });
  });

  it('downloads cloud state and writes only the user profile when AppState is unchanged', async () => {
    const mock = createMockRepository();
    const onEvent = vi.fn();
    const cloud = appState(['cloud']);
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
      onEvent,
    }));

    await emitSnapshot(mock, cloud);
    await advance(400);

    expect(workoutIds(result.current.state)).toEqual(['cloud']);
    expect(mock.repository.sync).toHaveBeenCalledOnce();
    expect(workoutIds(mock.repository.sync.mock.calls[0][0])).toEqual(['cloud']);
    expect(workoutIds(mock.repository.sync.mock.calls[0][1])).toEqual(['cloud']);
    expect(onEvent).toHaveBeenCalledWith({ type: 'downloaded-cloud' });
  });

  it('merges nonempty local and cloud profiles once on first connection', async () => {
    const mock = createMockRepository();
    const onEvent = vi.fn();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(['local']),
      repository: mock.repository,
      onEvent,
    }));

    await emitSnapshot(mock, appState(['cloud']));
    await advance(400);

    expect(workoutIds(result.current.state)).toEqual(['cloud', 'local']);
    expect(mock.repository.sync).toHaveBeenCalledOnce();
    expect(workoutIds(mock.repository.sync.mock.calls[0][1])).toEqual(['cloud', 'local']);
    expect(onEvent).toHaveBeenCalledWith({ type: 'merged' });
  });

  it('replays offline edits and deletions from the confirmed baseline after reload', async () => {
    const confirmed = appState([
      { id: 'shared', title: 'Подтверждённая версия' },
      'deleted-offline',
    ]);
    const localAfterReload = appState([
      { id: 'shared', title: 'Локальная offline-правка' },
    ]);
    saveConfirmedCloudBaseline(
      VERIFIED_USER.uid,
      confirmed,
      globalThis.localStorage,
      { today: TODAY },
    );
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: localAfterReload,
      repository: mock.repository,
    }));

    await emitSnapshot(mock, confirmed, { fromCache: true });

    expect(workoutIds(result.current.state)).toEqual(['shared']);
    expect(result.current.state.workouts[0].title).toBe('Локальная offline-правка');
    expect(mock.repository.sync).toHaveBeenCalledOnce();
    const [previous, next] = mock.repository.sync.mock.calls[0];
    expect(workoutIds(previous)).toEqual(['deleted-offline', 'shared']);
    expect(workoutIds(next)).toEqual(['shared']);
  });

  it('persists a baseline only for snapshots confirmed by the server', async () => {
    const mock = createMockRepository();
    renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));

    await emitSnapshot(mock, appState(['cached']), { fromCache: true });
    expect(loadConfirmedCloudBaseline(
      VERIFIED_USER.uid,
      globalThis.localStorage,
      { today: TODAY },
    )).toBeNull();

    await emitSnapshot(mock, appState(['pending']), { hasPendingWrites: true });
    expect(loadConfirmedCloudBaseline(
      VERIFIED_USER.uid,
      globalThis.localStorage,
      { today: TODAY },
    )).toBeNull();

    await emitSnapshot(mock, appState(['confirmed']));
    expect(workoutIds(loadConfirmedCloudBaseline(
      VERIFIED_USER.uid,
      globalThis.localStorage,
      { today: TODAY },
    ))).toEqual(['confirmed']);
  });

  it('keeps local timer metadata when the remote meta document does not exist', async () => {
    const local = normalizeAppState({
      ...appState(['local']),
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: null,
        exerciseId: null,
      },
    }, { today: TODAY });
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: local,
      repository: mock.repository,
    }));

    await emitSnapshot(mock, appState(['cloud']), { metaExists: false });

    expect(workoutIds(result.current.state)).toEqual(['cloud', 'local']);
    expect(result.current.state.activeTimer).toMatchObject({
      status: 'paused',
      remainingSeconds: 45,
    });
    expect(mock.repository.sync.mock.calls[0][1].activeTimer).toMatchObject({
      remainingSeconds: 45,
    });
  });

  it('debounces consecutive reducer changes into one upload of the latest state', async () => {
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));
    await emitSnapshot(mock, appState());
    expect(mock.repository.sync).toHaveBeenCalledOnce();
    expect(workoutIds(mock.repository.sync.mock.calls[0][0])).toEqual([]);
    expect(workoutIds(mock.repository.sync.mock.calls[0][1])).toEqual([]);
    mock.repository.sync.mockClear();

    act(() => result.current.setState(appState(['first'])));
    await advance(200);
    act(() => result.current.setState(appState(['first', 'second'])));
    await advance(349);
    expect(mock.repository.sync).not.toHaveBeenCalled();

    await advance(1);

    expect(mock.repository.sync).toHaveBeenCalledOnce();
    expect(workoutIds(mock.repository.sync.mock.calls[0][1])).toEqual(['first', 'second']);
  });

  it('applies clean remote updates and deletions without uploading them back', async () => {
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));
    await emitSnapshot(mock, appState(['cloud-a']));
    mock.repository.sync.mockClear();

    await emitSnapshot(mock, appState(['cloud-a', 'cloud-b']));
    expect(workoutIds(result.current.state)).toEqual(['cloud-a', 'cloud-b']);
    await advance(400);
    expect(mock.repository.sync).not.toHaveBeenCalled();

    await emitSnapshot(mock, appState());
    expect(workoutIds(result.current.state)).toEqual([]);
    await advance(400);
    expect(mock.repository.sync).not.toHaveBeenCalled();
  });

  it('preserves and uploads local-only edits when remote changes before debounce', async () => {
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));
    await emitSnapshot(mock, appState([
      { id: 'shared', title: 'База' },
      'remote-deleted',
    ]));
    mock.repository.sync.mockClear();

    act(() => result.current.setState(appState([
      { id: 'shared', title: 'Локальное изменение' },
      'local-only',
      'remote-deleted',
    ])));
    await advance(200);
    await emitSnapshot(mock, appState([
      { id: 'shared', title: 'Изменение из облака' },
      'remote-only',
    ]));

    expect(workoutIds(result.current.state)).toEqual(['local-only', 'remote-only', 'shared']);
    expect(result.current.state.workouts.find((item) => item.id === 'shared').title)
      .toBe('Локальное изменение');
    await advance(349);
    expect(mock.repository.sync).not.toHaveBeenCalled();

    await advance(1);

    expect(mock.repository.sync).toHaveBeenCalledOnce();
    const [previous, next] = mock.repository.sync.mock.calls[0];
    expect(workoutIds(previous)).toEqual(['remote-only', 'shared']);
    expect(workoutIds(next)).toEqual(['local-only', 'remote-only', 'shared']);
  });

  it('does not let an older write completion overwrite a newer remote baseline', async () => {
    const pendingWrites = [];
    const mock = createMockRepository((previous, next) => {
      if (workoutIds(previous).join() === workoutIds(next).join()) {
        return Promise.resolve({ written: true, operations: 1 });
      }
      return new Promise((resolve) => {
        pendingWrites.push(resolve);
      });
    });
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));
    await emitSnapshot(mock, appState());
    mock.repository.sync.mockClear();

    act(() => result.current.setState(appState(['local'])));
    await advance(350);
    expect(mock.repository.sync).toHaveBeenCalledOnce();

    await emitSnapshot(mock, appState(['remote']));
    expect(workoutIds(result.current.state)).toEqual(['local', 'remote']);
    await act(async () => {
      pendingWrites[0]({ written: true, operations: 1 });
      await Promise.resolve();
    });
    await advance(349);
    expect(mock.repository.sync).toHaveBeenCalledOnce();

    await advance(1);

    expect(mock.repository.sync).toHaveBeenCalledTimes(2);
    const [previous, next] = mock.repository.sync.mock.calls[1];
    expect(workoutIds(previous)).toEqual(['remote']);
    expect(workoutIds(next)).toEqual(['local', 'remote']);
  });

  it('reports listener errors and follows offline/online browser state', async () => {
    const mock = createMockRepository();
    const { result } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));

    act(() => mock.fail(new Error('Firestore недоступен')));
    expect(result.current.cloud).toMatchObject({
      syncStatus: 'error',
      syncError: 'Firestore недоступен',
    });

    act(() => {
      setOnline(false);
      globalThis.dispatchEvent(new Event('offline'));
    });
    expect(result.current.cloud.syncStatus).toBe('offline');

    act(() => {
      setOnline(true);
      globalThis.dispatchEvent(new Event('online'));
    });
    expect(result.current.cloud.syncStatus).toBe('connecting');

    await emitSnapshot(mock, appState(), { fromCache: true });
    act(() => {
      setOnline(false);
      globalThis.dispatchEvent(new Event('offline'));
    });
    expect(result.current.cloud.syncStatus).toBe('offline');
  });

  it('unsubscribes and cancels a pending debounce on cleanup', async () => {
    const mock = createMockRepository();
    const { result, unmount } = renderHook(() => useCloudSyncHarness({
      initialState: appState(),
      repository: mock.repository,
    }));
    await emitSnapshot(mock, appState());
    mock.repository.sync.mockClear();
    act(() => result.current.setState(appState(['pending'])));

    unmount();
    await advance(1_000);

    expect(mock.unsubscribe).toHaveBeenCalledOnce();
    expect(mock.repository.sync).not.toHaveBeenCalled();
  });
});
