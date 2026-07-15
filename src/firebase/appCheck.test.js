import { describe, expect, it, vi } from 'vitest';

vi.mock('./core.js', () => ({
  firebaseApp: { name: 'default-test-app' },
  firebaseConfigured: true,
}));

import { initializeFirebaseAppCheck } from './appCheck.js';

function createHarness() {
  const instance = { name: 'app-check-instance' };
  const ReCaptchaEnterpriseProvider = vi.fn(function Provider(siteKey) {
    this.siteKey = siteKey;
  });
  const initializeAppCheck = vi.fn(() => instance);
  return {
    api: { initializeAppCheck, ReCaptchaEnterpriseProvider },
    globalObject: {},
    initializeAppCheck,
    instance,
    ReCaptchaEnterpriseProvider,
  };
}

describe('initializeFirebaseAppCheck', () => {
  it.each([
    ['Firebase is unconfigured', { configured: false, siteKey: 'site-key', testMode: false }],
    ['the site key is missing', { configured: true, siteKey: '   ', testMode: false }],
    ['the app runs in test mode', { configured: true, siteKey: 'site-key', testMode: true }],
  ])('does nothing when %s', (description, options) => {
    const harness = createHarness();

    expect(initializeFirebaseAppCheck({
      ...options,
      api: harness.api,
      globalObject: harness.globalObject,
    })).toBeNull();
    expect(harness.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(harness.initializeAppCheck).not.toHaveBeenCalled();
    expect(harness.globalObject).toEqual({});
  });

  it('defaults to a no-op in the Vitest environment', () => {
    const harness = createHarness();

    expect(initializeFirebaseAppCheck({
      siteKey: 'site-key',
      api: harness.api,
      globalObject: harness.globalObject,
    })).toBeNull();
    expect(harness.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('uses the Enterprise provider and automatic token refresh in production', () => {
    const harness = createHarness();
    const app = { name: 'production-app' };

    const result = initializeFirebaseAppCheck({
      app,
      configured: true,
      siteKey: '  enterprise-site-key  ',
      testMode: false,
      api: harness.api,
      globalObject: harness.globalObject,
    });

    expect(result).toBe(harness.instance);
    expect(harness.ReCaptchaEnterpriseProvider).toHaveBeenCalledOnce();
    expect(harness.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('enterprise-site-key');
    expect(harness.initializeAppCheck).toHaveBeenCalledWith(app, {
      provider: expect.objectContaining({ siteKey: 'enterprise-site-key' }),
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('initializes only once for the same app across repeated StrictMode or HMR calls', () => {
    const harness = createHarness();
    const app = { name: 'stable-app' };
    const options = {
      app,
      configured: true,
      siteKey: 'site-key',
      testMode: false,
      api: harness.api,
      globalObject: harness.globalObject,
    };

    const first = initializeFirebaseAppCheck(options);
    const second = initializeFirebaseAppCheck({
      ...options,
      api: createHarness().api,
    });

    expect(first).toBe(harness.instance);
    expect(second).toBe(first);
    expect(harness.ReCaptchaEnterpriseProvider).toHaveBeenCalledOnce();
    expect(harness.initializeAppCheck).toHaveBeenCalledOnce();
  });

  it('does not cache skipped or failed attempts and can initialize later', () => {
    const harness = createHarness();
    const app = { name: 'retry-app' };
    const failingApi = {
      ...harness.api,
      initializeAppCheck: vi.fn(() => { throw new Error('unavailable'); }),
    };

    expect(initializeFirebaseAppCheck({
      app,
      configured: false,
      siteKey: 'site-key',
      testMode: false,
      api: harness.api,
      globalObject: harness.globalObject,
    })).toBeNull();
    expect(initializeFirebaseAppCheck({
      app,
      configured: true,
      siteKey: 'site-key',
      testMode: false,
      api: failingApi,
      globalObject: harness.globalObject,
    })).toBeNull();

    expect(initializeFirebaseAppCheck({
      app,
      configured: true,
      siteKey: 'site-key',
      testMode: false,
      api: harness.api,
      globalObject: harness.globalObject,
    })).toBe(harness.instance);
    expect(harness.initializeAppCheck).toHaveBeenCalledOnce();
  });
});
