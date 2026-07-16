import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGpsTracker } from './useGpsTracker.js';

function createGeolocation() {
  let success;
  let failure;
  return {
    api: {
      watchPosition: vi.fn((nextSuccess, nextFailure) => {
        success = nextSuccess;
        failure = nextFailure;
        return 17;
      }),
      clearWatch: vi.fn(),
    },
    emit(coords, timestamp) {
      success?.({ coords, timestamp });
    },
    fail(error) {
      failure?.(error);
    },
  };
}

describe('useGpsTracker', () => {
  it('requests permission only on start and emits privacy-safe deltas', () => {
    const geolocation = createGeolocation();
    const onReady = vi.fn();
    const onDelta = vi.fn();
    const { result } = renderHook(() => useGpsTracker({
      geolocation: geolocation.api,
      onReady,
      onDelta,
    }));

    expect(geolocation.api.watchPosition).not.toHaveBeenCalled();
    act(() => result.current.start());
    expect(geolocation.api.watchPosition).toHaveBeenCalledOnce();
    act(() => geolocation.emit({ latitude: 41.311081, longitude: 69.240562, accuracy: 8 }, 1_000));
    act(() => geolocation.emit({ latitude: 41.311171, longitude: 69.240562, accuracy: 8 }, 5_000));

    expect(onReady).toHaveBeenCalledOnce();
    expect(onDelta).toHaveBeenCalledWith(expect.objectContaining({ deltaMeters: expect.any(Number) }));
    expect(JSON.stringify([...onReady.mock.calls, ...onDelta.mock.calls])).not.toMatch(/latitude|longitude|coordinates/);
  });

  it('clears the watch on pause, permission denial, and unmount', () => {
    const geolocation = createGeolocation();
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useGpsTracker({
      geolocation: geolocation.api,
      onError,
    }));
    act(() => result.current.start());
    act(() => result.current.pause());
    expect(geolocation.api.clearWatch).toHaveBeenCalledWith(17);

    act(() => result.current.start());
    act(() => geolocation.fail({ code: 1 }));
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied' });

    act(() => result.current.start());
    unmount();
    expect(geolocation.api.clearWatch).toHaveBeenCalledTimes(3);
  });

  it('pauses and clears coordinates when the page becomes hidden', () => {
    const geolocation = createGeolocation();
    const onVisibilityPause = vi.fn();
    const { result } = renderHook(() => useGpsTracker({
      geolocation: geolocation.api,
      onVisibilityPause,
    }));
    act(() => result.current.start());
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(onVisibilityPause).toHaveBeenCalledOnce();
    expect(geolocation.api.clearWatch).toHaveBeenCalledWith(17);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
});

