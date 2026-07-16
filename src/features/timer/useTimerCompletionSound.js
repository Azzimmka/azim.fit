import { useEffect, useRef } from 'react';
import { playTimerFinishedSound } from './timerSound.js';

function timerOccurrenceKey(snapshot) {
  if (!snapshot?.endsAt) return '';
  return [
    snapshot.workoutId ?? '',
    snapshot.exerciseId ?? '',
    snapshot.phase ?? 'rest',
    snapshot.setIndex ?? '',
    snapshot.endsAt,
  ].join('|');
}

function vibrateTimerFinished() {
  return globalThis.navigator?.vibrate?.([180, 100, 180]) ?? false;
}

/**
 * Sounds only when a timer observed with time remaining naturally reaches
 * zero. A timer that is already expired on the first render stays silent.
 */
export function useTimerCompletionSound(
  snapshot,
  { play = playTimerFinishedSound, vibrate = vibrateTimerFinished } = {},
) {
  const previousRef = useRef(null);
  const playedKeyRef = useRef('');

  useEffect(() => {
    const current = {
      endsAt: snapshot?.endsAt ?? null,
      exerciseId: snapshot?.exerciseId ?? null,
      phase: snapshot?.phase ?? 'rest',
      remainingSeconds: Number(snapshot?.remainingSeconds) || 0,
      setIndex: snapshot?.setIndex ?? null,
      status: snapshot?.status ?? 'idle',
      workoutId: snapshot?.workoutId ?? null,
    };
    const previous = previousRef.current;
    const key = timerOccurrenceKey(current);
    const reachedZero = current.status === 'expired'
      && previous?.status === 'running'
      && previous.remainingSeconds > 0
      && timerOccurrenceKey(previous) === key;

    if (key && reachedZero && playedKeyRef.current !== key) {
      playedKeyRef.current = key;
      void play();
      vibrate();
    }
    previousRef.current = current;
  }, [
    play,
    vibrate,
    snapshot?.endsAt,
    snapshot?.exerciseId,
    snapshot?.phase,
    snapshot?.remainingSeconds,
    snapshot?.status,
    snapshot?.setIndex,
    snapshot?.workoutId,
  ]);
}
