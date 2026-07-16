/* eslint-disable react-hooks/set-state-in-effect -- sync status follows an external subscription lifecycle */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SCHEMA_VERSION } from '../domain/model.js';
import { createEmptyAppState } from '../domain/schema.js';
import { ActionTypes } from '../store/reducer.js';
import {
  createUserRepository,
  diffAppStates,
  isAppStateEmpty,
  mergeAppStates,
} from './firestoreRepository.js';
import {
  loadConfirmedCloudBaseline,
  saveConfirmedCloudBaseline,
} from './confirmedBaseline.js';

const SYNC_DEBOUNCE_MS = 350;

function statesEqual(left, right, today) {
  return !diffAppStates(left, right, { today }).hasChanges;
}

const SYNC_COLLECTION_KEYS = Object.freeze({
  workouts: 'id',
  series: 'id',
  templates: 'id',
  bodyWeightEntries: 'date',
  customExercises: 'id',
});

function applyDocumentChanges(remoteItems, changes, key) {
  const next = new Map(remoteItems.map((item) => [String(item[key]), item]));
  changes.deletes.forEach((id) => next.delete(String(id)));
  changes.sets.forEach(({ id, value }) => next.set(String(id), value));
  return [...next.values()].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

/** Applies only unsynced local document/meta changes over a newer remote base. */
function reconcileRemoteWithLocalChanges(baseline, current, remote, today) {
  const localChanges = diffAppStates(baseline, current, { today });
  const normalizedRemote = diffAppStates(remote, remote, { today }).next;
  const reconciled = {
    ...normalizedRemote,
    ...Object.fromEntries(Object.entries(SYNC_COLLECTION_KEYS).map(([name, key]) => [
      name,
      applyDocumentChanges(normalizedRemote[name], localChanges.collections[name], key),
    ])),
    ...(localChanges.meta.changed ? localChanges.meta.value : {}),
  };
  return diffAppStates(reconciled, reconciled, { today }).next;
}

function preserveLocalMetaWhenRemoteIsMissing(current, remote, metadata) {
  if (metadata.metaExists !== false) return remote;
  return {
    ...remote,
    settings: current.settings,
    activeTimer: current.activeTimer,
    activeContinuousSession: current.activeContinuousSession,
  };
}

function reconcileInitialState(confirmedBaseline, current, remote, metadata, today) {
  if (confirmedBaseline === null) {
    return mergeAppStates(current, remote, {
      today,
      remoteMetaExists: metadata.metaExists,
    });
  }
  if (statesEqual(confirmedBaseline, current, today)) return remote;
  return reconcileRemoteWithLocalChanges(confirmedBaseline, current, remote, today);
}

function createProfile(user, settings = {}) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    avatarId: settings.avatarId ?? null,
    avatarSource: settings.avatarSource ?? null,
    googlePhotoURL: user.photoURL ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

function resolveOnlineStatus() {
  return globalThis.navigator?.onLine === false ? 'offline' : 'synced';
}

/**
 * Bridges the pure app reducer with a per-user Firestore repository.
 * Remote snapshots never enter the reducer until all five data sources are ready.
 */
export function useCloudSync({
  user,
  state,
  dispatch,
  today,
  enabled = true,
  repository: injectedRepository,
  onEvent,
  baselineStorage,
}) {
  const repository = useMemo(
    () => injectedRepository ?? createUserRepository(),
    [injectedRepository],
  );
  const uid = user?.uid ?? '';
  const emailVerified = user?.emailVerified === true;
  const eligible = Boolean(enabled && uid && emailVerified);
  const [syncStatus, setSyncStatus] = useState(() => {
    if (!user) return 'local';
    if (!user.emailVerified) return 'verify-email';
    return globalThis.navigator?.onLine === false ? 'offline' : 'connecting';
  });
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const currentStateRef = useRef(state);
  const userRef = useRef(user);
  const onEventRef = useRef(onEvent);
  const baselineRef = useRef(createEmptyAppState());
  const initializedRef = useRef(false);
  const initialUploadTargetRef = useRef(null);
  const generationRef = useRef(0);
  const remoteRevisionRef = useRef(0);
  const writeSequenceRef = useRef(0);
  const appliedWriteSequenceRef = useRef(0);
  const confirmedBaselineRef = useRef(null);

  useEffect(() => {
    currentStateRef.current = state;
    userRef.current = user;
    onEventRef.current = onEvent;
  }, [onEvent, state, user]);

  useEffect(() => {
    if (!uid) {
      setSyncStatus('local');
      setSyncError('');
      return undefined;
    }
    if (!emailVerified) {
      setSyncStatus('verify-email');
      setSyncError('');
      return undefined;
    }
    if (!enabled) {
      setSyncStatus('local');
      return undefined;
    }

    const generation = ++generationRef.current;
    let active = true;
    initializedRef.current = false;
    initialUploadTargetRef.current = null;
    baselineRef.current = createEmptyAppState();
    confirmedBaselineRef.current = loadConfirmedCloudBaseline(
      uid,
      baselineStorage,
      { today },
    );
    remoteRevisionRef.current = 0;
    appliedWriteSequenceRef.current = 0;
    setSyncError('');
    setSyncStatus(globalThis.navigator?.onLine === false ? 'offline' : 'connecting');

    const emit = (event) => {
      if (active && generation === generationRef.current && typeof onEventRef.current === 'function') {
        onEventRef.current(event);
      }
    };

    const unsubscribe = repository.subscribe(
      uid,
      ({ state: remoteState, metadata = {} }) => {
        if (!active || generation !== generationRef.current) return;
        remoteRevisionRef.current += 1;
        const current = currentStateRef.current;
        const previouslyConfirmedBaseline = confirmedBaselineRef.current;
        const remoteForMerge = preserveLocalMetaWhenRemoteIsMissing(
          current,
          remoteState,
          metadata,
        );
        const confirmedSnapshot = metadata.hasPendingWrites !== true
          && metadata.fromCache !== true;

        if (!initializedRef.current) {
          const localWasEmpty = isAppStateEmpty(current);
          const remoteWasEmpty = isAppStateEmpty(remoteState);
          const merged = reconcileInitialState(
            previouslyConfirmedBaseline,
            current,
            remoteForMerge,
            metadata,
            today,
          );
          initializedRef.current = true;
          baselineRef.current = remoteState;
          const requiresUpload = !statesEqual(remoteState, merged, today);

          if (confirmedSnapshot) {
            saveConfirmedCloudBaseline(uid, remoteState, baselineStorage, { today });
            confirmedBaselineRef.current = remoteState;
          }

          if (!statesEqual(current, merged, today)) {
            currentStateRef.current = merged;
            dispatch({ type: ActionTypes.REPLACE_STATE, payload: { state: merged } });
          }

          if (requiresUpload) {
            initialUploadTargetRef.current = merged;
            const remoteRevision = remoteRevisionRef.current;
            const writeSequence = ++writeSequenceRef.current;
            setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'syncing');
            void repository.sync(remoteState, merged, uid, createProfile(userRef.current, merged.settings))
              .then(() => {
                if (!active || generation !== generationRef.current) return;
                if (
                  remoteRevision === remoteRevisionRef.current
                  && writeSequence > appliedWriteSequenceRef.current
                ) {
                  baselineRef.current = merged;
                  appliedWriteSequenceRef.current = writeSequence;
                }
                if (initialUploadTargetRef.current === merged) {
                  initialUploadTargetRef.current = null;
                }
                setLastSyncedAt(new Date().toISOString());
                setSyncStatus(resolveOnlineStatus());
                if (remoteWasEmpty && !localWasEmpty) emit({ type: 'uploaded-local' });
                else if (!remoteWasEmpty && !localWasEmpty) emit({ type: 'merged' });
                if (!statesEqual(baselineRef.current, currentStateRef.current, today)) {
                  setSyncRevision((value) => value + 1);
                }
              })
              .catch((error) => {
                if (!active || generation !== generationRef.current) return;
                if (initialUploadTargetRef.current === merged) {
                  initialUploadTargetRef.current = null;
                }
                setSyncError(error?.message || 'Ошибка Firestore');
                setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'error');
              });
          } else {
            baselineRef.current = merged;
            setLastSyncedAt(new Date().toISOString());
            setSyncStatus(metadata.fromCache && globalThis.navigator?.onLine === false
              ? 'offline'
              : resolveOnlineStatus());
            if (!remoteWasEmpty && localWasEmpty) emit({ type: 'downloaded-cloud' });
            void repository.sync(merged, merged, uid, createProfile(userRef.current, merged.settings))
              .catch((error) => {
                if (!active || generation !== generationRef.current) return;
                setSyncError(error?.message || 'Ошибка Firestore');
                setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'error');
              });
          }
          return;
        }

        const hadLocalChanges = !statesEqual(baselineRef.current, current, today);
        const merged = hadLocalChanges
          ? reconcileRemoteWithLocalChanges(baselineRef.current, current, remoteForMerge, today)
          : remoteForMerge;
        const requiresUpload = !statesEqual(remoteState, merged, today);
        baselineRef.current = remoteState;
        if (confirmedSnapshot) {
          saveConfirmedCloudBaseline(uid, remoteState, baselineStorage, { today });
          confirmedBaselineRef.current = remoteState;
        }
        if (!statesEqual(current, merged, today)) {
          currentStateRef.current = merged;
          dispatch({ type: ActionTypes.REPLACE_STATE, payload: { state: merged } });
          emit({ type: 'remote-update' });
        }
        if (requiresUpload) setSyncRevision((value) => value + 1);
        setSyncStatus(metadata.fromCache && globalThis.navigator?.onLine === false
          ? 'offline'
          : metadata.hasPendingWrites ? 'syncing' : resolveOnlineStatus());
        if (!metadata.hasPendingWrites && !metadata.fromCache) {
          setLastSyncedAt(new Date().toISOString());
        }
      },
      (error) => {
        if (!active || generation !== generationRef.current) return;
        setSyncError(error?.message || 'Ошибка Firestore');
        setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'error');
      },
    );

    const handleOnline = () => setSyncStatus(initializedRef.current ? 'syncing' : 'connecting');
    const handleOffline = () => setSyncStatus('offline');
    globalThis.addEventListener?.('online', handleOnline);
    globalThis.addEventListener?.('offline', handleOffline);

    return () => {
      active = false;
      generationRef.current += 1;
      initializedRef.current = false;
      initialUploadTargetRef.current = null;
      confirmedBaselineRef.current = null;
      unsubscribe?.();
      globalThis.removeEventListener?.('online', handleOnline);
      globalThis.removeEventListener?.('offline', handleOffline);
    };
  }, [baselineStorage, dispatch, emailVerified, enabled, repository, today, uid]);

  useEffect(() => {
    if (!eligible || !initializedRef.current) return undefined;
    if (
      initialUploadTargetRef.current
      && statesEqual(initialUploadTargetRef.current, state, today)
    ) {
      return undefined;
    }
    if (statesEqual(baselineRef.current, state, today)) return undefined;

    const generation = generationRef.current;
    const timeoutId = globalThis.setTimeout(() => {
      const previous = baselineRef.current;
      const next = currentStateRef.current;
      if (statesEqual(previous, next, today)) return;
      const remoteRevision = remoteRevisionRef.current;
      const writeSequence = ++writeSequenceRef.current;
      setSyncError('');
      setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'syncing');
      void repository.sync(previous, next, uid, createProfile(userRef.current, next.settings))
        .then(() => {
          if (generation !== generationRef.current) return;
          if (
            remoteRevision === remoteRevisionRef.current
            && writeSequence > appliedWriteSequenceRef.current
          ) {
            baselineRef.current = next;
            appliedWriteSequenceRef.current = writeSequence;
          }
          setLastSyncedAt(new Date().toISOString());
          setSyncStatus(resolveOnlineStatus());
          if (!statesEqual(baselineRef.current, currentStateRef.current, today)) {
            setSyncRevision((value) => value + 1);
          }
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          setSyncError(error?.message || 'Ошибка Firestore');
          setSyncStatus(resolveOnlineStatus() === 'offline' ? 'offline' : 'error');
        });
    }, SYNC_DEBOUNCE_MS);

    return () => globalThis.clearTimeout(timeoutId);
  }, [eligible, repository, state, syncRevision, today, uid]);

  return { syncStatus, syncError, lastSyncedAt };
}
