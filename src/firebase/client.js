import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { initializeFirebaseAppCheck } from './appCheck.js';
import { firebaseApp, firebaseConfigured } from './core.js';

function createFirebaseClient() {
  initializeFirebaseAppCheck({ app: firebaseApp, configured: firebaseConfigured });
  const auth = getAuth(firebaseApp);
  const localCache = import.meta.env.MODE === 'test'
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  const db = initializeFirestore(firebaseApp, { localCache });

  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  return Object.freeze({ auth, db });
}

const singletonKey = '__AZIM_FIT_FIREBASE_CLIENT__';
const firebaseClient = globalThis[singletonKey] ?? createFirebaseClient();
globalThis[singletonKey] = firebaseClient;

export const auth = firebaseClient.auth;
export const db = firebaseClient.db;
export { firebaseApp, firebaseConfigured } from './core.js';
