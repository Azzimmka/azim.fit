import { getApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = Object.freeze({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const fallbackConfig = Object.freeze({
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  projectId: 'demo-azim-fit',
  appId: 'demo-azim-fit',
});

const singletonKey = '__AZIM_FIT_FIREBASE_APP__';
const existingApp = globalThis[singletonKey];

export const firebaseApp = existingApp
  ?? (getApps().length ? getApp() : initializeApp(firebaseConfigured ? firebaseConfig : fallbackConfig));

globalThis[singletonKey] = firebaseApp;
