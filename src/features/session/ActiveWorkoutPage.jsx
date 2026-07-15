import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dumbbell, LockKeyhole, ShieldOff, Timer } from 'lucide-react';
import { pluralizeRu } from '../../domain/plural.js';
import { calculateAwardedPoints } from '../../domain/points.js';
import { calculateWorkoutVolume, findFirstPendingWorkoutSet } from '../../domain/workouts.js';
import { SessionRest } from './SessionRest.jsx';
import { SessionResultsEditor } from './SessionResultsEditor.jsx';
import { SessionSetFocus } from './SessionSetFocus.jsx';
import { SessionSummary } from './SessionSummary.jsx';
import {
  countWorkoutSets,
  formatSessionClock,
  getSessionElapsedSeconds,
  getWakeLockLabel,
} from './sessionView.js';
import { useScreenWakeLock } from './useScreenWakeLock.js';

function SessionUnavailable({ title, description, onBack }) {
  return (
    <section className="session-unavailable" role="status">
      <span aria-hidden="true"><Dumbbell size={28} /></span>
      <h1>{title}</h1>
      <p>{description}</p>
      <button type="button" className="session-primary-action" onClick={onBack}>Вернуться к тренировке</button>
    </section>
  );
}

function ActiveWorkoutSession({
  workout,
  today,
  timerSnapshot = null,
  personalRecords = [],
  onStart,
  onCompleteSet,
  onUpdateSet,
  onCompleteWorkout,
  onUpdateNotes,
  onTimerPause,
  onTimerResume,
  onTimerAddThirty,
  onContinueRest,
  onBack,
}) {
  const canRun = Boolean(
    workout
    && workout.status === 'planned'
    && (!today || workout.plannedDate <= today),
  );
  const { status: wakeLockStatus } = useScreenWakeLock(canRun);
  const pendingCursor = useMemo(() => findFirstPendingWorkoutSet(workout), [workout]);
  const [editingResults, setEditingResults] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const focusHeadingRef = useRef(null);
  const restHeadingRef = useRef(null);
  const summaryHeadingRef = useRef(null);
  const resultsHeadingRef = useRef(null);
  const startedWorkoutIdRef = useRef(null);
  const previousFocusTargetRef = useRef('');

  const timerForWorkout = Boolean(
    workout
    && timerSnapshot
    && timerSnapshot.status !== 'idle'
    && timerSnapshot.workoutId === workout.id,
  );

  useEffect(() => {
    if (!canRun || workout.startedAt || startedWorkoutIdRef.current === workout.id) return;
    startedWorkoutIdRef.current = workout.id;
    onStart?.(workout.id);
  }, [canRun, onStart, workout]);

  useEffect(() => {
    if (!workout?.startedAt) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [workout?.startedAt]);

  const activeView = editingResults
    ? 'results'
    : timerForWorkout
      ? 'rest'
      : pendingCursor ? 'set' : 'summary';

  useEffect(() => {
    const headings = {
      set: focusHeadingRef,
      rest: restHeadingRef,
      summary: summaryHeadingRef,
      results: resultsHeadingRef,
    };
    const focusTarget = `${activeView}:${pendingCursor?.exerciseId ?? ''}:${pendingCursor?.setIndex ?? ''}`;
    if (previousFocusTargetRef.current === focusTarget) return undefined;
    previousFocusTargetRef.current = focusTarget;
    const frameId = window.requestAnimationFrame(() => headings[activeView].current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [activeView, pendingCursor?.exerciseId, pendingCursor?.setIndex]);

  if (!workout) {
    return <div className="active-session"><SessionUnavailable title="Тренировка не найдена" description="Возможно, она была удалена в другой вкладке." onBack={onBack} /></div>;
  }

  if (!canRun) {
    const future = workout.status === 'planned' && today && workout.plannedDate > today;
    return (
      <div className="active-session">
        <SessionUnavailable
          title={future ? 'Ещё не время тренироваться' : 'Активный режим недоступен'}
          description={future ? 'Будущую тренировку можно открыть, когда наступит её плановая дата.' : 'Эта тренировка уже завершена или пропущена.'}
          onBack={onBack}
        />
      </div>
    );
  }

  const totals = countWorkoutSets(workout);
  const progress = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  const elapsedSeconds = getSessionElapsedSeconds(workout.startedAt, workout.completedAt ?? now);
  const selectedExercise = pendingCursor
    ? workout.exercises[pendingCursor.exerciseIndex]
    : null;
  const timerExercise = workout.exercises.find((exercise) => exercise.id === timerSnapshot?.exerciseId);
  const nextPendingExercise = pendingCursor
    ? workout.exercises[pendingCursor.exerciseIndex]
    : null;
  const volume = calculateWorkoutVolume(workout);
  const points = calculateAwardedPoints(workout.exercises);
  const elapsedLabel = elapsedSeconds === null
    ? 'Время тренировки неизвестно'
    : `Прошло ${elapsedSeconds} ${pluralizeRu(elapsedSeconds, ['секунда', 'секунды', 'секунд'])}`;
  const wakeIcon = wakeLockStatus === 'active'
    ? <LockKeyhole size={15} aria-hidden="true" />
    : <ShieldOff size={15} aria-hidden="true" />;

  const completeSet = (payload) => {
    onCompleteSet?.(payload);
    setAnnouncement(`${selectedExercise.name}: подход ${pendingCursor.setIndex + 1} выполнен`);
  };

  const continueAfterRest = () => {
    onContinueRest?.(workout.id);
    setAnnouncement(nextPendingExercise
      ? `${nextPendingExercise.name}: подход ${pendingCursor.setIndex + 1}`
      : 'Открыты итоги тренировки');
  };

  return (
    <div className="active-session">
      <header className="session-header">
        <button type="button" className="session-back" onClick={onBack} aria-label="Выйти из активной тренировки">
          <ArrowLeft size={21} aria-hidden="true" />
        </button>
        <div className="session-title">
          <span>Активная тренировка</span>
          <strong>{workout.title}</strong>
        </div>
        <div className="session-elapsed" aria-label={elapsedLabel}>
          <Timer size={16} aria-hidden="true" />
          <span>{elapsedSeconds === null ? '—' : formatSessionClock(elapsedSeconds)}</span>
        </div>
        <div className={`session-wake-lock ${wakeLockStatus}`} title={getWakeLockLabel(wakeLockStatus)}>
          {wakeIcon}<span>{wakeLockStatus === 'active' ? 'Экран включён' : 'Wake Lock'}</span>
        </div>
      </header>

      <div className="session-progress" role="progressbar" aria-label="Прогресс тренировки" aria-valuemin="0" aria-valuemax={totals.total} aria-valuenow={totals.completed}>
        <div><span>Общий прогресс</span><strong>{totals.completed}/{totals.total} · {progress}%</strong></div>
        <div><span style={{ width: `${progress}%` }} /></div>
      </div>

      {editingResults ? (
        <SessionResultsEditor
          workout={workout}
          headingRef={resultsHeadingRef}
          onUpdateSet={onUpdateSet}
          onDone={() => setEditingResults(false)}
        />
      ) : timerForWorkout ? (
        <SessionRest
          exercise={timerExercise}
          nextExercise={nextPendingExercise}
          nextSetNumber={pendingCursor?.setNumber}
          timerSnapshot={timerSnapshot}
          headingRef={restHeadingRef}
          onPause={onTimerPause}
          onResume={onTimerResume}
          onAddThirty={onTimerAddThirty}
          onContinue={continueAfterRest}
        />
      ) : selectedExercise ? (
        <SessionSetFocus
          key={`${selectedExercise.id}:${pendingCursor.setIndex}`}
          workoutId={workout.id}
          exercise={selectedExercise}
          exerciseIndex={pendingCursor.exerciseIndex}
          exerciseCount={workout.exercises.length}
          setIndex={pendingCursor.setIndex}
          headingRef={focusHeadingRef}
          onComplete={completeSet}
        />
      ) : (
        <SessionSummary
          workout={workout}
          elapsedSeconds={elapsedSeconds}
          volume={volume}
          points={points}
          personalRecords={personalRecords}
          headingRef={summaryHeadingRef}
          onEditResults={() => setEditingResults(true)}
          onUpdateNotes={onUpdateNotes}
          onCompleteWorkout={onCompleteWorkout}
        />
      )}

      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  );
}

export function ActiveWorkoutPage(props) {
  return <ActiveWorkoutSession key={props.workout?.id ?? 'missing-workout'} {...props} />;
}

export default ActiveWorkoutPage;
