import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from './useScreenWakeLock.js';

class VisibilityTarget extends EventTarget {
  constructor(visibilityState = 'visible') {
    super();
    this.visibilityState = visibilityState;
  }

  setVisibility(visibilityState) {
    this.visibilityState = visibilityState;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function createSentinel() {
  const sentinel = new EventTarget();
  sentinel.released = false;
  sentinel.release = vi.fn(async () => {
    if (sentinel.released) return;
    sentinel.released = true;
    sentinel.dispatchEvent(new Event('release'));
  });
  return sentinel;
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useScreenWakeLock', () => {
  it('reports unavailable without requesting when the API is missing', async () => {
    const documentTarget = new VisibilityTarget();
    const { result } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock: null,
    }));

    expect(result.current.status).toBe('unavailable');
    expect(result.current.isSupported).toBe(false);
    await expect(result.current.request()).resolves.toBe(false);
  });

  it('requests on mount and releases on unmount', async () => {
    const documentTarget = new VisibilityTarget();
    const sentinel = createSentinel();
    const wakeLock = { request: vi.fn().mockResolvedValue(sentinel) };
    const { result, unmount } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock,
    }));

    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(wakeLock.request).toHaveBeenCalledWith('screen');

    unmount();
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
  });

  it('releases while hidden and requests a new lock after becoming visible', async () => {
    const documentTarget = new VisibilityTarget();
    const firstSentinel = createSentinel();
    const secondSentinel = createSentinel();
    const wakeLock = {
      request: vi.fn()
        .mockResolvedValueOnce(firstSentinel)
        .mockResolvedValueOnce(secondSentinel),
    };
    const { result } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock,
    }));

    await waitFor(() => expect(result.current.status).toBe('active'));
    act(() => documentTarget.setVisibility('hidden'));
    await waitFor(() => expect(result.current.status).toBe('released'));
    expect(firstSentinel.release).toHaveBeenCalledOnce();

    act(() => documentTarget.setVisibility('visible'));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('active'));
  });

  it('reflects an automatic release and reacquires on the next visible event', async () => {
    const documentTarget = new VisibilityTarget();
    const firstSentinel = createSentinel();
    const secondSentinel = createSentinel();
    const wakeLock = {
      request: vi.fn()
        .mockResolvedValueOnce(firstSentinel)
        .mockResolvedValueOnce(secondSentinel),
    };
    const { result } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock,
    }));

    await waitFor(() => expect(result.current.status).toBe('active'));
    act(() => {
      firstSentinel.released = true;
      firstSentinel.dispatchEvent(new Event('release'));
    });
    expect(result.current.status).toBe('released');

    act(() => documentTarget.setVisibility('visible'));
    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('turns request failures into an unavailable state without rejecting', async () => {
    const documentTarget = new VisibilityTarget();
    const denied = new Error('NotAllowedError');
    const wakeLock = { request: vi.fn().mockRejectedValue(denied) };
    const { result } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock,
    }));

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.error).toBe(denied);
    await expect(result.current.request()).resolves.toBe(false);
  });

  it('releases a stale sentinel that resolves after the session is disabled', async () => {
    const documentTarget = new VisibilityTarget();
    const pending = deferred();
    const sentinel = createSentinel();
    const wakeLock = { request: vi.fn().mockReturnValue(pending.promise) };
    const { result, rerender } = renderHook(
      ({ enabled }) => useScreenWakeLock(enabled, { documentTarget, wakeLock }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    await act(async () => pending.resolve(sentinel));

    await waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
    expect(result.current.status).toBe('released');
  });

  it('keeps only the latest sentinel during the StrictMode effect replay', async () => {
    const documentTarget = new VisibilityTarget();
    const staleSentinel = createSentinel();
    const activeSentinel = createSentinel();
    const wakeLock = {
      request: vi.fn()
        .mockResolvedValueOnce(staleSentinel)
        .mockResolvedValueOnce(activeSentinel),
    };
    const { result } = renderHook(() => useScreenWakeLock(true, {
      documentTarget,
      wakeLock,
    }), { reactStrictMode: true });

    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(staleSentinel.release).toHaveBeenCalledOnce();
    expect(activeSentinel.release).not.toHaveBeenCalled();
  });
});
