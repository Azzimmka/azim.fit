import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppState } from '../domain/schema.js';
import {
  assembleAppStateSnapshot,
  createUserRepository,
  diffAppStates,
  isAppStateEmpty,
  mergeAppStates,
} from './firestoreRepository.js';

vi.mock('./client.js', () => ({ db: { name: 'default-test-db' } }));

function workout(id, title, plannedDate = '2026-07-15') {
  return {
    id,
    title,
    status: 'planned',
    plannedDate,
    occurrenceDate: plannedDate,
    exercises: [{ id: `${id}-exercise`, name: 'Жим', sets: 1 }],
  };
}

function stateWith(overrides = {}) {
  return {
    ...createEmptyAppState(),
    ...overrides,
  };
}

function createFirestoreHarness() {
  const timestamp = { kind: 'server-timestamp' };
  const listeners = new Map();
  const unsubscribeByPath = new Map();
  const operations = [];
  const commits = vi.fn(async () => undefined);
  const batches = [];
  const makeReference = (kind, segments) => ({ kind, path: segments.join('/') });
  const api = {
    collection: vi.fn((database, ...segments) => makeReference('collection', segments)),
    doc: vi.fn((database, ...segments) => makeReference('document', segments)),
    onSnapshot: vi.fn((reference, options, next, error) => {
      listeners.set(reference.path, { error, next, options });
      const unsubscribe = vi.fn();
      unsubscribeByPath.set(reference.path, unsubscribe);
      return unsubscribe;
    }),
    serverTimestamp: vi.fn(() => timestamp),
    writeBatch: vi.fn(() => {
      const batchOperations = [];
      const batch = {
        set: vi.fn((reference, value, options) => {
          const operation = { type: 'set', path: reference.path, value, options };
          operations.push(operation);
          batchOperations.push(operation);
          return batch;
        }),
        delete: vi.fn((reference) => {
          const operation = { type: 'delete', path: reference.path };
          operations.push(operation);
          batchOperations.push(operation);
          return batch;
        }),
        commit: vi.fn(async () => commits()),
      };
      batches.push({ batch, operations: batchOperations });
      return batch;
    }),
  };

  const emitCollection = (path, documents = [], metadata = {}) => {
    listeners.get(path).next({
      docs: documents.map(({ id, data }) => ({ id, data: () => data })),
      metadata,
    });
  };
  const emitDocument = (path, data, metadata = {}) => {
    listeners.get(path).next({
      exists: () => data !== null,
      data: () => data ?? undefined,
      metadata,
    });
  };

  return {
    api,
    batch: { commit: commits },
    batches,
    emitCollection,
    emitDocument,
    listeners,
    operations,
    timestamp,
    unsubscribeByPath,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Firestore sync state helpers', () => {
  it('recognizes only canonical empty application states', () => {
    expect(isAppStateEmpty(null)).toBe(true);
    expect(isAppStateEmpty(createEmptyAppState())).toBe(true);
    expect(isAppStateEmpty(stateWith({ workouts: [workout('w', 'Тренировка')] }))).toBe(false);
    expect(isAppStateEmpty(stateWith({
      activeTimer: {
        status: 'paused',
        endsAt: null,
        remainingSeconds: 30,
        initialSeconds: 90,
        workoutId: null,
        exerciseId: null,
      },
    }))).toBe(false);
  });

  it('merges by stable id/date deterministically with remote collision precedence', () => {
    const local = stateWith({
      workouts: [workout('b', 'Локальная B'), workout('a', 'Только локальная')],
      bodyWeightEntries: [
        { date: '2026-07-13', weightKg: 81 },
        { date: '2026-07-14', weightKg: 80, updatedAt: '2026-07-14T08:00:00.000Z' },
      ],
    });
    const remote = stateWith({
      workouts: [workout('c', 'Только облачная'), workout('b', 'Облачная B')],
      bodyWeightEntries: [
        { date: '2026-07-14', weightKg: 79.5, updatedAt: '2026-07-14T09:00:00.000Z' },
        { date: '2026-07-15', weightKg: 79 },
      ],
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: 'b',
        exerciseId: 'b-exercise',
      },
    });
    const localBefore = structuredClone(local);

    const merged = mergeAppStates(local, remote);

    expect(merged.workouts.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(merged.workouts.find((item) => item.id === 'b').title).toBe('Облачная B');
    expect(merged.bodyWeightEntries.map((item) => item.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
    expect(merged.bodyWeightEntries.find((item) => item.date === '2026-07-14').weightKg)
      .toBe(79.5);
    expect(merged.activeTimer).toMatchObject({
      workoutId: 'b',
      exerciseId: 'b-exercise',
    });
    expect(local).toEqual(localBefore);
    expect(mergeAppStates(local, remote)).toEqual(merged);
    expect(mergeAppStates(local, createEmptyAppState())).toEqual(
      mergeAppStates(local, createEmptyAppState()),
    );
    expect(mergeAppStates(local, createEmptyAppState()).workouts).toHaveLength(2);
  });

  it('keeps local meta when the remote meta document is explicitly absent', () => {
    const local = stateWith({
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: null,
        exerciseId: null,
      },
    });
    const remote = stateWith({ workouts: [workout('cloud', 'Облачная')] });

    expect(mergeAppStates(local, remote, { remoteMetaExists: false }).activeTimer)
      .toMatchObject({ status: 'paused', remainingSeconds: 45 });
    expect(mergeAppStates(local, remote, { remoteMetaExists: true }).activeTimer).toBeNull();
  });

  it('assembles a normalized state and strips private sync metadata', () => {
    const state = assembleAppStateSnapshot({
      workouts: [{
        ...workout('cloud-workout', 'Облачная'),
        _sync: { updatedAt: { seconds: 10 } },
      }],
      series: [],
      templates: [],
      bodyWeights: [{
        date: '2026-07-15',
        weightKg: 78.5,
        updatedAt: '2026-07-15T08:00:00.000Z',
        _sync: { updatedAt: { seconds: 11 } },
      }],
      meta: {
        schemaVersion: 2,
        settings: createEmptyAppState().settings,
        activeTimer: {
          status: 'paused',
          remainingSeconds: 45,
          initialSeconds: 90,
          workoutId: 'cloud-workout',
          exerciseId: 'cloud-workout-exercise',
        },
        _sync: { updatedAt: { seconds: 12 } },
      },
    });

    expect(state.schemaVersion).toBe(2);
    expect(state.workouts[0].id).toBe('cloud-workout');
    expect(state.bodyWeightEntries).toEqual([
      expect.objectContaining({ date: '2026-07-15', weightKg: 78.5 }),
    ]);
    expect(state.activeTimer).toMatchObject({
      workoutId: 'cloud-workout',
      exerciseId: 'cloud-workout-exercise',
    });
    expect(JSON.stringify(state)).not.toContain('_sync');
  });

  it('computes stable document sets, deletes and meta changes', () => {
    const previous = stateWith({
      workouts: [workout('old', 'Удалить'), workout('shared', 'До')],
      bodyWeightEntries: [
        { date: '2026-07-15', weightKg: 80, updatedAt: '2026-07-15T08:00:00.000Z' },
      ],
    });
    const next = stateWith({
      workouts: [workout('shared', 'После'), workout('new', 'Добавить')],
      bodyWeightEntries: previous.bodyWeightEntries,
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: 'shared',
        exerciseId: 'shared-exercise',
      },
    });

    const diff = diffAppStates(previous, next);

    expect(diff.collections.workouts.sets.map((item) => item.id)).toEqual(['new', 'shared']);
    expect(diff.collections.workouts.deletes).toEqual(['old']);
    expect(diff.collections.bodyWeightEntries).toEqual({ sets: [], deletes: [] });
    expect(diff.meta.changed).toBe(true);
    expect(diff.hasChanges).toBe(true);
    expect(diffAppStates(next, structuredClone(next)).hasChanges).toBe(false);
  });
});

describe('createUserRepository', () => {
  it('subscribes to every collection and meta, then emits one normalized payload', () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ db: { name: 'db' }, firestoreApi: harness.api });
    const onState = vi.fn();
    const onError = vi.fn();

    const unsubscribe = repository.subscribe('user-1', onState, onError);

    expect(harness.listeners.size).toBe(5);
    harness.emitCollection('users/user-1/workouts', [{
      id: 'workout-1',
      data: { ...workout('workout-1', 'Firestore'), id: undefined, _sync: { updatedAt: 1 } },
    }], { fromCache: true });
    harness.emitCollection('users/user-1/series', []);
    harness.emitCollection('users/user-1/templates', []);
    harness.emitCollection('users/user-1/bodyWeights', [{
      id: '2026-07-15',
      data: {
        weightKg: 79,
        updatedAt: '2026-07-15T08:00:00.000Z',
        _sync: { updatedAt: 2 },
      },
    }]);
    expect(onState).not.toHaveBeenCalled();

    harness.emitDocument('users/user-1/meta/app', {
      schemaVersion: 2,
      settings: createEmptyAppState().settings,
      activeTimer: null,
      _sync: { updatedAt: 3 },
    }, { hasPendingWrites: true });

    expect(onError).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledOnce();
    const payload = onState.mock.calls[0][0];
    expect(payload.state.workouts[0].id).toBe('workout-1');
    expect(payload.state.bodyWeightEntries[0].date).toBe('2026-07-15');
    expect(payload.metadata).toEqual({
      ready: true,
      fromCache: true,
      hasPendingWrites: true,
      metaExists: true,
    });
    expect(JSON.stringify(payload.state)).not.toContain('_sync');
    expect([...harness.listeners.values()].every(
      (listener) => listener.options.includeMetadataChanges === true,
    )).toBe(true);

    unsubscribe();
    expect([...harness.unsubscribeByPath.values()].every(
      (sourceUnsubscribe) => sourceUnsubscribe.mock.calls.length === 1,
    )).toBe(true);
  });

  it('skips equal states and commits one offline-safe batch for document diffs', async () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ db: { name: 'db' }, firestoreApi: harness.api });
    const empty = createEmptyAppState();

    await expect(repository.sync(empty, structuredClone(empty), 'user-1'))
      .resolves.toEqual({ written: false, operations: 0 });
    expect(harness.api.writeBatch).not.toHaveBeenCalled();

    const previous = stateWith({ workouts: [workout('old', 'Старая')] });
    const next = stateWith({
      workouts: [workout('new', 'Новая')],
      bodyWeightEntries: [
        { date: '2026-07-15', weightKg: 78, updatedAt: '2026-07-15T08:00:00.000Z' },
      ],
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: 'new',
        exerciseId: 'new-exercise',
      },
    });
    const result = await repository.sync(previous, next, 'user-1', {
      email: 'azim@example.com',
      _sync: { updatedAt: 'forged' },
    });

    expect(result).toEqual({ written: true, operations: 5 });
    expect(harness.api.writeBatch).toHaveBeenCalledOnce();
    expect(harness.api.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.batch.commit).toHaveBeenCalledOnce();
    expect(harness.operations.map((operation) => `${operation.type}:${operation.path}`)).toEqual([
      'set:users/user-1',
      'set:users/user-1/workouts/new',
      'delete:users/user-1/workouts/old',
      'set:users/user-1/bodyWeights/2026-07-15',
      'set:users/user-1/meta/app',
    ]);
    expect(harness.operations[0]).toMatchObject({
      options: { merge: true },
      value: {
        email: 'azim@example.com',
        _sync: { updatedAt: harness.timestamp },
      },
    });
    expect(harness.operations.filter((operation) => operation.type === 'set').every(
      (operation) => operation.value._sync.updatedAt === harness.timestamp,
    )).toBe(true);
  });

  it('writes the verified user profile even when AppState has no document diff', async () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ db: { name: 'db' }, firestoreApi: harness.api });
    const empty = createEmptyAppState();

    await expect(repository.sync(empty, structuredClone(empty), 'user-1', {
      uid: 'user-1',
      email: 'azim@example.com',
    })).resolves.toEqual({ written: true, operations: 1 });

    expect(harness.operations).toEqual([
      expect.objectContaining({
        type: 'set',
        path: 'users/user-1',
        options: { merge: true },
        value: expect.objectContaining({
          uid: 'user-1',
          email: 'azim@example.com',
          _sync: { updatedAt: harness.timestamp },
        }),
      }),
    ]);
    expect(harness.batch.commit).toHaveBeenCalledOnce();
  });

  it('reports an absent meta document without replacing it with implicit presence', () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ db: { name: 'db' }, firestoreApi: harness.api });
    const onState = vi.fn();

    repository.subscribe('user-1', onState);
    harness.emitCollection('users/user-1/workouts', []);
    harness.emitCollection('users/user-1/series', []);
    harness.emitCollection('users/user-1/templates', []);
    harness.emitCollection('users/user-1/bodyWeights', []);
    harness.emitDocument('users/user-1/meta/app', null);

    expect(onState).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ metaExists: false }),
    }));
  });

  it('splits more than 500 writes into batches capped at 450 operations', async () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ db: { name: 'db' }, firestoreApi: harness.api });
    const previous = createEmptyAppState();
    const next = stateWith({
      workouts: Array.from({ length: 600 }, (_, index) => (
        workout(`workout-${index}`, `Тренировка ${index}`)
      )),
    });

    await expect(repository.sync(previous, next, 'user-1', { uid: 'user-1' }))
      .resolves.toEqual({ written: true, operations: 601 });

    expect(harness.api.writeBatch).toHaveBeenCalledTimes(2);
    expect(harness.batch.commit).toHaveBeenCalledTimes(2);
    expect(harness.batches.map(({ operations }) => operations.length)).toEqual([450, 151]);
    expect(harness.batches.every(({ operations }) => operations.length <= 450)).toBe(true);
  });

  it('validates uid before opening listeners or writes', async () => {
    const harness = createFirestoreHarness();
    const repository = createUserRepository({ firestoreApi: harness.api });

    expect(() => repository.subscribe('', vi.fn())).toThrow(/valid uid/i);
    expect(() => repository.subscribe('bad/user', vi.fn())).toThrow(/valid uid/i);
    await expect(repository.sync(createEmptyAppState(), createEmptyAppState(), 'bad/user'))
      .rejects.toThrow(/valid uid/i);
    expect(harness.api.onSnapshot).not.toHaveBeenCalled();
    expect(harness.api.writeBatch).not.toHaveBeenCalled();
  });
});
