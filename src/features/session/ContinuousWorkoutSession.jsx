import { useEffect, useMemo, useState } from 'react';
import { Check, Flag, LocateFixed, Pause, Play, Route, Timer } from 'lucide-react';
import { getContinuousSessionSnapshot } from '../../domain/continuousSession.js';
import { formatDistance, formatDuration, formatTargetValue } from '../../domain/targets.js';
import { ContinuousResultEditor } from './ContinuousResultEditor.jsx';
import { GpsStatus } from './GpsStatus.jsx';
import { useGpsTracker } from './useGpsTracker.js';

export function ContinuousWorkoutSession({
  workoutId,
  exercise,
  exerciseIndex,
  exerciseCount,
  session,
  headingRef,
  onStart,
  onGpsReady,
  onGpsDelta,
  onTick,
  onPause,
  onResume,
  onReview,
  onComplete,
  onCancel,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [manualResult, setManualResult] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const snapshot = useMemo(() => getContinuousSessionSnapshot(session, now), [now, session]);
  const {
    signal: gpsSignal,
    start: startGps,
    pause: pauseGps,
    stop: stopGps,
  } = useGpsTracker({
    onReady: ({ timestamp }) => onGpsReady?.({ workoutId, now: timestamp }),
    onDelta: ({ deltaMeters, timestamp }) => onGpsDelta?.({ workoutId, deltaMeters, now: timestamp }),
    onError: ({ code }) => {
      setGpsError(code);
      setManualResult(true);
    },
    onVisibilityPause: () => onPause?.({ workoutId, now: new Date().toISOString() }),
  });

  useEffect(() => {
    if (session?.status !== 'active') return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [session?.status]);

  useEffect(() => {
    if (session?.status !== 'active' || !onTick) return undefined;
    const intervalId = window.setInterval(() => onTick({
      workoutId,
      now: new Date().toISOString(),
    }), 5_000);
    return () => window.clearInterval(intervalId);
  }, [onTick, session?.status, workoutId]);

  useEffect(() => () => stopGps(), [stopGps]);

  const targetReached = exercise.target.kind === 'distance'
    ? Number(snapshot?.accumulatedMeters) >= Number(exercise.target.value)
    : Number(snapshot?.activeDurationSeconds) >= Number(exercise.target.value);
  const ready = !session;
  const acquiring = session?.status === 'acquiring';
  const active = session?.status === 'active';
  const paused = session?.status === 'paused';
  const reviewing = session?.status === 'summary' || manualResult;

  const start = () => {
    setGpsError('');
    setManualResult(false);
    onStart?.({ workoutId, exerciseId: exercise.id, now: new Date().toISOString() });
    startGps();
  };
  const resume = () => {
    setGpsError('');
    onResume?.({ workoutId, now: new Date().toISOString() });
    startGps();
  };
  const pause = () => {
    pauseGps();
    onPause?.({ workoutId, now: new Date().toISOString() });
  };
  const review = () => {
    pauseGps();
    onReview?.({ workoutId, now: new Date().toISOString() });
  };
  const cancel = () => {
    stopGps();
    onCancel?.({ workoutId });
  };

  if (reviewing) {
    return (
      <section className="session-continuous session-continuous-review">
        <ContinuousResultEditor
          exercise={exercise}
          snapshot={snapshot}
          onBack={session ? () => {
            setGpsError('');
            setManualResult(false);
          } : undefined}
          onSubmit={(values) => onComplete?.({
            workoutId,
            exerciseId: exercise.id,
            ...values,
            now: new Date().toISOString(),
          })}
        />
        {gpsError && <button type="button" className="session-link-button" onClick={cancel}>Отменить и вернуться к упражнению</button>}
      </section>
    );
  }

  return (
    <section className={`session-continuous ${active ? 'active' : ''}`} aria-labelledby="session-continuous-title">
      <div className="session-continuous-heading">
        <p className="session-kicker">Упражнение {exerciseIndex + 1} из {exerciseCount}</p>
        <h1 id="session-continuous-title" ref={headingRef} tabIndex="-1">{exercise.name}</h1>
        <p>Цель: {formatTargetValue(exercise.target)}</p>
      </div>

      <GpsStatus signal={ready ? 'idle' : paused ? 'paused' : gpsSignal} />

      <div className="continuous-live-metrics">
        <article className="primary">
          <Route size={22} aria-hidden="true" />
          <span>Дистанция</span>
          <strong>{formatDistance(snapshot?.accumulatedMeters ?? 0)}</strong>
        </article>
        <article>
          <Timer size={20} aria-hidden="true" />
          <span>Активное время</span>
          <strong>{formatDuration(snapshot?.activeDurationSeconds ?? 0)}</strong>
        </article>
        <article>
          <LocateFixed size={20} aria-hidden="true" />
          <span>Средний темп</span>
          <strong>{snapshot?.paceLabel ?? '—'}</strong>
        </article>
      </div>

      {targetReached && (
        <div className="continuous-goal-reached" role="status"><Check size={20} aria-hidden="true" /><span><strong>Цель достигнута</strong><small>Заверши, когда будешь готов.</small></span></div>
      )}

      <div className="session-set-action-dock continuous-actions">
        {ready && (
          <button type="button" className="session-primary-action" onClick={start} disabled={!onStart}>
            <Play size={21} fill="currentColor" aria-hidden="true" /> Начать и включить GPS
          </button>
        )}
        {acquiring && (
          <>
            <button type="button" className="session-secondary-action" onClick={cancel}>Отменить</button>
            <button type="button" className="session-primary-action" onClick={() => setManualResult(true)}>Ввести итог вручную</button>
          </>
        )}
        {active && (
          <>
            <button type="button" className="session-secondary-action" onClick={pause}><Pause size={20} aria-hidden="true" /> Пауза</button>
            <button type="button" className="session-primary-action" onClick={review}><Flag size={20} aria-hidden="true" /> Завершить</button>
          </>
        )}
        {paused && (
          <>
            <button type="button" className="session-secondary-action" onClick={review}><Flag size={19} aria-hidden="true" /> Завершить</button>
            <button type="button" className="session-primary-action" onClick={resume}><Play size={20} aria-hidden="true" /> Продолжить</button>
          </>
        )}
      </div>
    </section>
  );
}

export default ContinuousWorkoutSession;
