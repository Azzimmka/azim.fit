import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { firebaseApp, firebaseConfigured } from './core.js';

const APP_CHECK_SINGLETON_KEY = '__AZIM_FIT_FIREBASE_APP_CHECK__';
const DEFAULT_APP_CHECK_API = Object.freeze({
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
});

function resolveSiteKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Best-effort Firebase App Check bootstrap.
 *
 * Production defaults come from Vite and `client.js`. Tests can inject every
 * side-effectful dependency through `options` without contacting Firebase.
 * Repeated calls for the same app return the HMR-safe global singleton.
 *
 * @param {{
 *   app?: object,
 *   configured?: boolean,
 *   siteKey?: string,
 *   mode?: string,
 *   testMode?: boolean,
 *   api?: {
 *     initializeAppCheck: Function,
 *     ReCaptchaEnterpriseProvider: Function,
 *   },
 *   globalObject?: object,
 * }} options
 * @returns {object|null}
 */
export function initializeFirebaseAppCheck(options = {}) {
  const configured = options.configured ?? firebaseConfigured;
  const siteKey = resolveSiteKey(
    options.siteKey ?? import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY,
  );
  const testMode = options.testMode ?? (options.mode ?? import.meta.env.MODE) === 'test';

  if (!configured || !siteKey || testMode) return null;

  const app = options.app ?? firebaseApp;
  const api = options.api ?? DEFAULT_APP_CHECK_API;
  const globalObject = options.globalObject ?? globalThis;
  const existing = globalObject?.[APP_CHECK_SINGLETON_KEY];
  if (existing?.app === app) return existing.instance;

  try {
    const provider = new api.ReCaptchaEnterpriseProvider(siteKey);
    const instance = api.initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    globalObject[APP_CHECK_SINGLETON_KEY] = Object.freeze({ app, instance });
    return instance;
  } catch {
    return null;
  }
}
