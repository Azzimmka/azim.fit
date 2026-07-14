import { useCallback, useEffect, useRef, useState } from 'react';

export const SCREEN_WAKE_LOCK_STATUS = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
  UNAVAILABLE: 'unavailable',
});

function isVisible(documentTarget) {
  return documentTarget?.visibilityState == null
    || documentTarget.visibilityState === 'visible';
}

async function releaseSentinel(sentinel) {
  if (!sentinel || sentinel.released || typeof sentinel.release !== 'function') return true;
  try {
    await sentinel.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps the screen awake while an active workout session is visible.
 *
 * Wake Lock is best-effort: unsupported APIs and rejected requests are exposed
 * as a neutral status and never reject out of the hook.
 *
 * @param {boolean} enabled
 * @param {{
 *   documentTarget?: Document|null,
 *   wakeLock?: {request: (type: 'screen') => Promise<WakeLockSentinel>}|null,
 * }} options
 * @returns {{
 *   status: 'active'|'released'|'unavailable',
 *   isSupported: boolean,
 *   error: unknown|null,
 *   request: () => Promise<boolean>,
 *   release: () => Promise<boolean>,
 * }}
 */
export function useScreenWakeLock(enabled = true, options = {}) {
  const documentTarget = Object.hasOwn(options, 'documentTarget')
    ? options.documentTarget
    : globalThis.document;
  const wakeLock = Object.hasOwn(options, 'wakeLock')
    ? options.wakeLock
    : globalThis.navigator?.wakeLock;
  const isSupported = Boolean(
    documentTarget
    && wakeLock
    && typeof wakeLock.request === 'function',
  );

  const configRef = useRef({
    documentTarget,
    enabled: Boolean(enabled),
    isSupported,
    wakeLock,
  });

  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const operationRef = useRef(null);
  const sentinelRef = useRef(null);
  const sentinelListenerRef = useRef(null);
  const [state, setState] = useState(() => ({
    error: null,
    status: isSupported
      ? SCREEN_WAKE_LOCK_STATUS.RELEASED
      : SCREEN_WAKE_LOCK_STATUS.UNAVAILABLE,
  }));

  const publish = useCallback((status, error = null) => {
    if (!mountedRef.current) return;
    setState((current) => (
      current.status === status && current.error === error
        ? current
        : { error, status }
    ));
  }, []);

  const clearError = useCallback(() => {
    if (!mountedRef.current) return;
    setState((current) => (
      current.error == null ? current : { ...current, error: null }
    ));
  }, []);

  const detachSentinelListener = useCallback((sentinel) => {
    const entry = sentinelListenerRef.current;
    if (!entry || entry.sentinel !== sentinel) return;
    entry.sentinel.removeEventListener?.('release', entry.listener);
    sentinelListenerRef.current = null;
  }, []);

  const takeCurrentSentinel = useCallback(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return null;
    sentinelRef.current = null;
    detachSentinelListener(sentinel);
    return sentinel;
  }, [detachSentinelListener]);

  const cleanupCurrentRequest = useCallback(() => {
    generationRef.current += 1;
    operationRef.current = null;
    const sentinel = takeCurrentSentinel();
    if (sentinel) void releaseSentinel(sentinel);
  }, [takeCurrentSentinel]);

  const release = useCallback(async () => {
    generationRef.current += 1;
    operationRef.current = null;
    const sentinel = takeCurrentSentinel();
    const config = configRef.current;
    const nextStatus = config?.isSupported
      ? SCREEN_WAKE_LOCK_STATUS.RELEASED
      : SCREEN_WAKE_LOCK_STATUS.UNAVAILABLE;

    publish(nextStatus);
    if (!sentinel) return true;

    const released = await releaseSentinel(sentinel);
    if (!released) {
      publish(nextStatus, new Error('Не удалось отключить блокировку экрана.'));
    }
    return released;
  }, [publish, takeCurrentSentinel]);

  const request = useCallback(() => {
    const config = configRef.current;
    if (!config?.enabled || !config.isSupported || !isVisible(config.documentTarget)) {
      publish(config?.isSupported
        ? SCREEN_WAKE_LOCK_STATUS.RELEASED
        : SCREEN_WAKE_LOCK_STATUS.UNAVAILABLE);
      return Promise.resolve(false);
    }

    const currentSentinel = sentinelRef.current;
    if (currentSentinel && !currentSentinel.released) {
      publish(SCREEN_WAKE_LOCK_STATUS.ACTIVE);
      return Promise.resolve(true);
    }
    if (operationRef.current) return operationRef.current;

    const token = generationRef.current + 1;
    generationRef.current = token;
    clearError();

    let operation;
    operation = (async () => {
      try {
        const sentinel = await config.wakeLock.request('screen');
        const latestConfig = configRef.current;
        const stale = token !== generationRef.current
          || !mountedRef.current
          || !latestConfig?.enabled
          || latestConfig.wakeLock !== config.wakeLock
          || !isVisible(latestConfig.documentTarget);

        if (stale) {
          await releaseSentinel(sentinel);
          return false;
        }

        const handleRelease = () => {
          if (sentinelRef.current !== sentinel) return;
          sentinelRef.current = null;
          detachSentinelListener(sentinel);
          if (token === generationRef.current) {
            publish(SCREEN_WAKE_LOCK_STATUS.RELEASED);
          }
        };

        sentinelRef.current = sentinel;
        sentinelListenerRef.current = { listener: handleRelease, sentinel };
        sentinel.addEventListener?.('release', handleRelease, { once: true });

        if (sentinel.released) {
          handleRelease();
          return false;
        }

        publish(SCREEN_WAKE_LOCK_STATUS.ACTIVE);
        return true;
      } catch (error) {
        if (token === generationRef.current && mountedRef.current) {
          publish(SCREEN_WAKE_LOCK_STATUS.UNAVAILABLE, error);
        }
        return false;
      } finally {
        if (operationRef.current === operation) operationRef.current = null;
      }
    })();

    operationRef.current = operation;
    return operation;
  }, [clearError, detachSentinelListener, publish]);

  useEffect(() => {
    configRef.current = {
      documentTarget,
      enabled: Boolean(enabled),
      isSupported,
      wakeLock,
    };
  }, [documentTarget, enabled, isSupported, wakeLock]);

  useEffect(() => {
    mountedRef.current = true;

    const handleVisibilityChange = () => {
      if (isVisible(documentTarget)) void request();
      else void release();
    };

    if (enabled && isSupported) {
      documentTarget.addEventListener('visibilitychange', handleVisibilityChange);
      if (isVisible(documentTarget)) void request();
    } else {
      cleanupCurrentRequest();
    }

    return () => {
      documentTarget?.removeEventListener?.('visibilitychange', handleVisibilityChange);
      mountedRef.current = false;
      cleanupCurrentRequest();
    };
  }, [cleanupCurrentRequest, documentTarget, enabled, isSupported, release, request, wakeLock]);

  const status = !isSupported
    ? SCREEN_WAKE_LOCK_STATUS.UNAVAILABLE
    : enabled
      ? state.status
      : SCREEN_WAKE_LOCK_STATUS.RELEASED;

  return {
    error: enabled ? state.error : null,
    isSupported,
    release,
    request,
    status,
  };
}
