import { useCallback, useEffect, useRef, useState } from 'react';
import { assessGpsPoint } from '../../domain/gps.js';

const WATCH_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 2_000,
  timeout: 15_000,
});

export function useGpsTracker({
  geolocation = globalThis.navigator?.geolocation,
  onReady,
  onDelta,
  onError,
  onVisibilityPause,
} = {}) {
  const [signal, setSignal] = useState('idle');
  const watchIdRef = useRef(null);
  const lastAcceptedPointRef = useRef(null);
  const callbacksRef = useRef({ onReady, onDelta, onError, onVisibilityPause });

  useEffect(() => {
    callbacksRef.current = { onReady, onDelta, onError, onVisibilityPause };
  }, [onDelta, onError, onReady, onVisibilityPause]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      geolocation?.clearWatch?.(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastAcceptedPointRef.current = null;
  }, [geolocation]);

  const pause = useCallback(() => {
    clearWatch();
    setSignal('paused');
  }, [clearWatch]);

  const start = useCallback(() => {
    clearWatch();
    if (!geolocation?.watchPosition) {
      setSignal('unavailable');
      callbacksRef.current.onError?.({ code: 'unavailable' });
      return false;
    }

    setSignal('acquiring');
    watchIdRef.current = geolocation.watchPosition(
      (position) => {
        const point = {
          latitude: position?.coords?.latitude,
          longitude: position?.coords?.longitude,
          accuracy: position?.coords?.accuracy,
          timestamp: position?.timestamp ?? Date.now(),
        };
        const assessment = assessGpsPoint(lastAcceptedPointRef.current, point);
        if (!assessment.accepted) {
          if (assessment.signal === 'weak' || assessment.signal === 'impossible') setSignal('weak');
          return;
        }
        lastAcceptedPointRef.current = point;
        setSignal('good');
        if (assessment.baseline) {
          callbacksRef.current.onReady?.({ timestamp: new Date(point.timestamp).toISOString() });
        } else {
          callbacksRef.current.onDelta?.({
            deltaMeters: assessment.deltaMeters,
            timestamp: new Date(point.timestamp).toISOString(),
          });
        }
      },
      (error) => {
        clearWatch();
        const code = Number(error?.code) === 1 ? 'permission-denied' : 'position-error';
        setSignal(code);
        callbacksRef.current.onError?.({ code });
      },
      WATCH_OPTIONS,
    );
    return true;
  }, [clearWatch, geolocation]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden' || watchIdRef.current === null) return;
      pause();
      callbacksRef.current.onVisibilityPause?.();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pause]);

  useEffect(() => clearWatch, [clearWatch]);

  return { signal, start, pause, stop: pause };
}
