import {
  collection,
  doc,
  onSnapshot as firestoreOnSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db as defaultDb } from './client.js';
import {
  assembleAppStateSnapshot,
  diffAppStates,
  isAppStateEmpty,
  mergeAppStates,
  stripPrivateSyncFields,
} from './syncState.js';

export {
  assembleAppStateSnapshot,
  diffAppStates,
  isAppStateEmpty,
  mergeAppStates,
  stripPrivateSyncFields,
};

const DEFAULT_FIRESTORE_API = Object.freeze({
  collection,
  doc,
  onSnapshot: firestoreOnSnapshot,
  serverTimestamp,
  writeBatch,
});

const REMOTE_COLLECTIONS = Object.freeze([
  Object.freeze({ source: 'workouts', path: 'workouts', key: 'id' }),
  Object.freeze({ source: 'series', path: 'series', key: 'id' }),
  Object.freeze({ source: 'templates', path: 'templates', key: 'id' }),
  Object.freeze({ source: 'bodyWeights', path: 'bodyWeights', key: 'date' }),
  Object.freeze({ source: 'customExercises', path: 'customExercises', key: 'id' }),
]);
const MAX_BATCH_OPERATIONS = 450;

function normalizeUid(uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.includes('/')) {
    throw new TypeError('Firestore sync requires a valid uid without slashes.');
  }
  return uid.trim();
}

function snapshotMetadata(snapshot) {
  return {
    fromCache: snapshot?.metadata?.fromCache === true,
    hasPendingWrites: snapshot?.metadata?.hasPendingWrites === true,
  };
}

function readCollectionSnapshot(snapshot, stableKey) {
  const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
  return documents.map((documentSnapshot) => {
    const data = stripPrivateSyncFields(documentSnapshot.data?.() ?? {});
    return {
      ...data,
      [stableKey]: documentSnapshot.id || data[stableKey],
    };
  });
}

function readDocumentSnapshot(snapshot) {
  if (typeof snapshot?.exists === 'function' && !snapshot.exists()) return {};
  return stripPrivateSyncFields(snapshot?.data?.() ?? {});
}

function documentSnapshotExists(snapshot) {
  if (typeof snapshot?.exists === 'function') return snapshot.exists();
  return snapshot?.data?.() !== undefined;
}

function withSyncMetadata(value, timestamp) {
  return {
    ...stripPrivateSyncFields(value),
    _sync: { updatedAt: timestamp },
  };
}

function aggregateMetadata(sourceMetadata, ready) {
  const values = Object.values(sourceMetadata);
  return {
    ready,
    fromCache: values.some((metadata) => metadata.fromCache),
    hasPendingWrites: values.some((metadata) => metadata.hasPendingWrites),
    metaExists: sourceMetadata.meta?.metaExists === true,
  };
}

/**
 * Creates a Firestore repository scoped by uid.
 *
 * subscribe callback: `onState({ state, metadata })` where metadata contains
 * `{ ready, fromCache, hasPendingWrites, metaExists }`.
 */
export function createUserRepository({
  db = defaultDb,
  firestoreApi = {},
} = {}) {
  const api = { ...DEFAULT_FIRESTORE_API, ...firestoreApi };

  return Object.freeze({
    subscribe(uid, onState, onError) {
      const normalizedUid = normalizeUid(uid);
      if (typeof onState !== 'function') {
        throw new TypeError('Firestore sync subscribe requires an onSnapshot callback.');
      }

      const sources = {
        workouts: null,
        series: null,
        templates: null,
        bodyWeights: null,
        customExercises: null,
        meta: null,
      };
      const metadataBySource = {};
      const unsubscribers = [];
      let active = true;

      const emitIfReady = () => {
        const ready = Object.values(sources).every((value) => value !== null);
        if (!active || !ready) return;
        onState({
          state: assembleAppStateSnapshot(sources),
          metadata: aggregateMetadata(metadataBySource, ready),
        });
      };

      const subscribeSource = (descriptor) => {
        const reference = descriptor.source === 'meta'
          ? api.doc(db, 'users', normalizedUid, 'meta', 'app')
          : api.collection(db, 'users', normalizedUid, descriptor.path);
        const unsubscribe = api.onSnapshot(
          reference,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!active) return;
            sources[descriptor.source] = descriptor.source === 'meta'
              ? readDocumentSnapshot(snapshot)
              : readCollectionSnapshot(snapshot, descriptor.key);
            metadataBySource[descriptor.source] = {
              ...snapshotMetadata(snapshot),
              ...(descriptor.source === 'meta'
                ? { metaExists: documentSnapshotExists(snapshot) }
                : {}),
            };
            emitIfReady();
          },
          (error) => {
            if (active && typeof onError === 'function') onError(error);
          },
        );
        unsubscribers.push(typeof unsubscribe === 'function' ? unsubscribe : () => {});
      };

      try {
        REMOTE_COLLECTIONS.forEach(subscribeSource);
        subscribeSource({ source: 'meta' });
      } catch (error) {
        active = false;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        if (typeof onError === 'function') onError(error);
        else throw error;
      }

      return () => {
        if (!active) return;
        active = false;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    },

    async sync(previousState, nextState, uid, profile = null) {
      const normalizedUid = normalizeUid(uid);
      const diff = diffAppStates(previousState, nextState);
      const hasProfile = profile && typeof profile === 'object' && !Array.isArray(profile);
      if (!diff.hasChanges && !hasProfile) return { written: false, operations: 0 };

      const timestamp = api.serverTimestamp();
      const pendingOperations = [];

      if (hasProfile) {
        const reference = api.doc(db, 'users', normalizedUid);
        const value = withSyncMetadata(profile, timestamp);
        pendingOperations.push((batch) => batch.set(reference, value, { merge: true }));
      }

      for (const descriptor of REMOTE_COLLECTIONS) {
        const collectionDiff = diff.collections[
          descriptor.source === 'bodyWeights' ? 'bodyWeightEntries' : descriptor.source
        ];
        for (const change of collectionDiff.sets) {
          const reference = api.doc(
            db,
            'users',
            normalizedUid,
            descriptor.path,
            change.id,
          );
          const value = withSyncMetadata(change.value, timestamp);
          pendingOperations.push((batch) => batch.set(reference, value));
        }
        for (const id of collectionDiff.deletes) {
          const reference = api.doc(db, 'users', normalizedUid, descriptor.path, id);
          pendingOperations.push((batch) => batch.delete(reference));
        }
      }

      if (diff.meta.changed) {
        const reference = api.doc(db, 'users', normalizedUid, 'meta', 'app');
        const value = withSyncMetadata(diff.meta.value, timestamp);
        pendingOperations.push((batch) => batch.set(reference, value));
      }

      for (let offset = 0; offset < pendingOperations.length; offset += MAX_BATCH_OPERATIONS) {
        const batch = api.writeBatch(db);
        pendingOperations
          .slice(offset, offset + MAX_BATCH_OPERATIONS)
          .forEach((applyOperation) => applyOperation(batch));
        await batch.commit();
      }

      return { written: true, operations: pendingOperations.length };
    },
  });
}
