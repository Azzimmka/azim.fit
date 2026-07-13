import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSIST_ATTEMPT_KEY, requestPersistentStorage } from './persistence.js';
import { isIOSDevice, isStandaloneDisplay } from './usePwaInstall.js';

describe('persistent storage request', () => {
  beforeEach(() => localStorage.clear());

  it('requests persistence only once unless forced', async () => {
    const storageManager = {
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    };

    expect(await requestPersistentStorage({ storageManager, storage: localStorage }))
      .toMatchObject({ supported: true, persisted: false, requested: true });
    expect(localStorage.getItem(PERSIST_ATTEMPT_KEY)).toBe('1');

    expect(await requestPersistentStorage({ storageManager, storage: localStorage }))
      .toMatchObject({ requested: false });
    expect(storageManager.persist).toHaveBeenCalledTimes(1);

    await requestPersistentStorage({ storageManager, storage: localStorage, force: true });
    expect(storageManager.persist).toHaveBeenCalledTimes(2);
  });

  it('does not claim support when the StorageManager API is missing', async () => {
    expect(await requestPersistentStorage({ storageManager: {} }))
      .toEqual({ supported: false, persisted: false, requested: false });
  });
});

describe('install environment detection', () => {
  it('recognizes iPhones and touch-capable iPads reporting as Mac', () => {
    expect(isIOSDevice({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 1 })).toBe(true);
    expect(isIOSDevice({ userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: 'Chrome', platform: 'Linux', maxTouchPoints: 0 })).toBe(false);
  });

  it('recognizes standalone display mode', () => {
    const windowLike = { matchMedia: () => ({ matches: true }) };
    expect(isStandaloneDisplay(windowLike, {})).toBe(true);
  });
});
