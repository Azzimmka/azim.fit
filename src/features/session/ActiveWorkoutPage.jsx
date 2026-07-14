import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Flame,
  ListChecks,
  LockKeyhole,
  ShieldOff,
  SkipForward,
  Timer,
} from 'lucide-react';
import { formatRuCount, pluralizeRu } from '../../domain/plural.js';
import { calculateAwardedPoints } from '../../domain/points.js';
import {
  calculateWorkoutVolume,
  findFirstPendingWorkoutSet,
  getWorkoutSetDefaults,
} from '../../domain/workouts.js';
import { SessionRest } from './SessionRest.jsx';
import { SessionSummary } from './SessionSummary.jsx';
import {
  countWorkoutSets,
  findPreviousCompletedSet,
  findPreviousExerciseResult,
  formatSessionClock,
  formatSetResult,
  getSessionElapsedSeconds,
  getWakeLockLabel,
  toDraft,
  validateSetDraft,
} from './sessionView.js';
import { useScreenWakeLock } from './useScreenWakeLock.js';

const SESSION_TABS = ['exercise', 'plan'];
const FIELD_ORDER = ['weightKg', 'reps', 'rpe'];

function resultStatusLabel(status) {
  if (status === 'completed') return 'выполнен';
  if (status === 'skipped') return 'пропущен';
  return 'ожидает выполнения';
}

function findExerciseSelection(exercise) {
  const results = exercise?.setResults ?? [];
  const pendingIndex = results.findIndex((result) => result.status === 'pending');
  if (pendingIndex >= 0) return pendingIndex;
  const completedIndex = results.findLastIndex((result) => result.status === 'completed');
  if (completedIndex >= 0) return completedIndex;
  return results.length ? 0 : null;
}

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
  workouts = [],
  today,
  timerSnapshot = null,
  personalRecords = [],
  onStart,
  onCompleteSet,
  onUpdateSet,
  onSkipExercise,
  onCompleteWorkout,
  onUpdateNotes,
  onTimerPause,
  onTimerResume,
  onTimerAddThirty,
  onSkipRest,
  onBack,
}) {
  const canRun = Boolean(
    workout
    && workout.status === 'planned'
    && (!today || workout.plannedDate <= today),
  );
  const { status: wakeLockStatus } = useScreenWakeLock(canRun);
  const pendingCursor = useMemo(() => findFirstPendingWorkoutSet(workout), [workout]);
  const [tab, setTab] = useState('exercise');
  const [selection, setSelection] = useState(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [draftState, setDraftState] = useState({ key: '', values: {} });
  const [errorState, setErrorState] = useState({ key: '', values: {} });
  const [announcement, setAnnouncement] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const exerciseHeadingRef = useRef(null);
  const planHeadingRef = useRef(null);
  const restHeadingRef = useRef(null);
  const summaryHeadingRef = useRef(null);
  const fieldRefs = useRef({});
  const startedWorkoutIdRef = useRef(null);
  const previousTimerForWorkoutRef = useRef(false);

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

  const effectiveSelection = manualSelection ? selection : pendingCursor;

  const selectedExerciseIndex = workout?.exercises?.findIndex(
    (exercise) => exercise.id === effectiveSelection?.exerciseId,
  ) ?? -1;
  const selectedExercise = selectedExerciseIndex >= 0
    ? workout.exercises[selectedExerciseIndex]
    : null;
  const selectedSetIndex = Number.isInteger(effectiveSelection?.setIndex) ? effectiveSelection.setIndex : null;
  const selectedResult = selectedSetIndex === null
    ? null
    : selectedExercise?.setResults?.[selectedSetIndex] ?? null;

  const defaultResult = useMemo(() => {
    if (!workout || !selectedExercise || selectedSetIndex === null) return {};
    if (selectedResult?.status === 'completed') return selectedResult;
    return getWorkoutSetDefaults(workout, selectedExercise.id, selectedSetIndex, workouts);
  }, [selectedExercise, selectedResult, selectedSetIndex, workout, workouts]);

  const selectionKey = selectedExercise && selectedSetIndex !== null
    ? `${selectedExercise.id}:${selectedSetIndex}:${selectedResult?.status ?? 'missing'}`
    : '';
  const draft = draftState.key === selectionKey ? draftState.values : toDraft(defaultResult);
  const errors = errorState.key === selectionKey ? errorState.values : {};

  const showSummary = Boolean(workout) && !pendingCursor && !timerForWorkout && !manualSelection;
  const activeView = tab === 'plan'
    ? 'plan'
    : timerForWorkout
      ? 'rest'
      : showSummary
        ? 'summary'
        : 'exercise';

  useEffect(() => {
    const timerJustFinished = previousTimerForWorkoutRef.current && !timerForWorkout;
    previousTimerForWorkoutRef.current = timerForWorkout;
    if (!timerJustFinished) return;
    setManualSelection(false);
    setTab('exercise');
  }, [timerForWorkout]);

  useEffect(() => {
    const headings = {
      exercise: exerciseHeadingRef,
      plan: planHeadingRef,
      rest: restHeadingRef,
      summary: summaryHeadingRef,
    };
    const frameId = window.requestAnimationFrame(() => headings[activeView].current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [activeView, selectedExercise?.id, selectedSetIndex]);

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
  const timerExercise = workout.exercises.find((exercise) => exercise.id === timerSnapshot?.exerciseId);
  const nextPendingExercise = pendingCursor
    ? workout.exercises.find((exercise) => exercise.id === pendingCursor.exerciseId)
    : null;
  const nextExercise = selectedExerciseIndex >= 0
    ? workout.exercises.slice(selectedExerciseIndex + 1).find((exercise) => (
      (exercise.setResults ?? []).some((result) => result.status === 'pending')
    ))
    : nextPendingExercise;
  const nextSetIndex = selectedExercise?.setResults?.findIndex((result, index) => (
    index > selectedSetIndex && result.status === 'pending'
  )) ?? -1;
  const previousSet = findPreviousCompletedSet(selectedExercise, selectedSetIndex ?? 0);
  const previousWorkoutResult = selectedExercise
    ? findPreviousExerciseResult(workouts, workout, selectedExercise)
    : null;
  const volume = calculateWorkoutVolume(workout);
  const points = calculateAwardedPoints(workout.exercises);

  const selectSet = (exerciseId, setIndex) => {
    setSelection({ exerciseId, setIndex });
    setManualSelection(true);
    setTab('exercise');
  };

  const selectExercise = (exercise) => {
    const setIndex = findExerciseSelection(exercise);
    if (setIndex === null) return;
    selectSet(exercise.id, setIndex);
  };

  const selectTab = (nextTab) => {
    setTab(nextTab);
  };

  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = SESSION_TABS.indexOf(tab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? SESSION_TABS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + SESSION_TABS.length) % SESSION_TABS.length;
    const nextTab = SESSION_TABS[nextIndex];
    selectTab(nextTab);
    event.currentTarget.querySelector(`#session-tab-${nextTab}`)?.focus();
  };

  const handleDraftChange = (field, value) => {
    setDraftState({ key: selectionKey, values: { ...draft, [field]: value } });
    if (errors[field]) {
      setErrorState({ key: selectionKey, values: { ...errors, [field]: undefined } });
    }
  };

  const handleSaveSet = () => {
    if (!selectedExercise || selectedSetIndex === null || !selectedResult) return;
    const validation = validateSetDraft(draft);
    if (!validation.valid) {
      setErrorState({ key: selectionKey, values: validation.errors });
      const firstError = FIELD_ORDER.find((field) => validation.errors[field]);
      fieldRefs.current[firstError]?.focus();
      return;
    }

    const payload = {
      workoutId: workout.id,
      exerciseId: selectedExercise.id,
      setIndex: selectedSetIndex,
    };
    if (selectedResult.status === 'completed') {
      onUpdateSet?.({ ...payload, patch: validation.result });
      setAnnouncement(`${selectedExercise.name}: результат подхода ${selectedSetIndex + 1} обновлён`);
    } else {
      onCompleteSet?.({
        ...payload,
        result: validation.result,
        skipRest: selectedResult.status === 'skipped',
      });
      setAnnouncement(`${selectedExercise.name}: подход ${selectedSetIndex + 1} выполнен`);
    }
    setManualSelection(false);
  };

  const handleSkipExercise = () => {
    if (!selectedExercise) return;
    onSkipExercise?.({ workoutId: workout.id, exerciseId: selectedExercise.id });
    setAnnouncement(`${selectedExercise.name}: оставшиеся подходы пропущены`);
    setManualSelection(false);
  };

  const handleSkipRest = () => {
    onSkipRest?.();
    setAnnouncement(nextPendingExercise ? `Следующее упражнение: ${nextPendingExercise.name}` : 'Открыты итоги тренировки');
    setManualSelection(false);
  };

  const wakeIcon = wakeLockStatus === 'active'
    ? <LockKeyhole size={15} aria-hidden="true" />
    : <ShieldOff size={15} aria-hidden="true" />;
  const elapsedLabel = elapsedSeconds === null
    ? 'Время тренировки неизвестно'
    : `Прошло ${elapsedSeconds} ${pluralizeRu(elapsedSeconds, ['секунда', 'секунды', 'секунд'])}`;

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

      <div className="session-tabs" role="tablist" aria-label="Режим активной тренировки" onKeyDown={handleTabKeyDown}>
        <button type="button" id="session-tab-exercise" role="tab" aria-selected={tab === 'exercise'} aria-controls="session-panel-exercise" tabIndex={tab === 'exercise' ? 0 : -1} className={tab === 'exercise' ? 'active' : ''} onClick={() => selectTab('exercise')}><Dumbbell size={17} aria-hidden="true" /> Упражнение</button>
        <button type="button" id="session-tab-plan" role="tab" aria-selected={tab === 'plan'} aria-controls="session-panel-plan" tabIndex={tab === 'plan' ? 0 : -1} className={tab === 'plan' ? 'active' : ''} onClick={() => selectTab('plan')}><ListChecks size={17} aria-hidden="true" /> Весь план</button>
      </div>

      {tab === 'plan' ? (
        <section id="session-panel-plan" role="tabpanel" aria-labelledby="session-tab-plan" className="session-plan-panel">
          <div className="session-section-title"><div><p className="session-kicker">Навигация</p><h1 ref={planHeadingRef} tabIndex="-1">План тренировки</h1></div><span>{formatRuCount(workout.exercises.length, 'exercise')}</span></div>
          <div className="session-plan-list">
            {workout.exercises.map((exercise, index) => {
              const completed = (exercise.setResults ?? []).filter((result) => result.status === 'completed').length;
              const skipped = (exercise.setResults ?? []).filter((result) => result.status === 'skipped').length;
              const resolved = completed + skipped === exercise.sets;
              return (
                <button type="button" key={exercise.id} className={resolved ? 'resolved' : ''} onClick={() => selectExercise(exercise)}>
                  <span className="session-plan-number">{resolved ? <Check size={17} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{exercise.name}</strong><small>{completed}/{exercise.sets} выполнено{skipped ? ` · ${skipped} пропущено` : ''}</small></span>
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div id="session-panel-exercise" role="tabpanel" aria-labelledby="session-tab-exercise">
          {timerForWorkout ? (
            <SessionRest
              exercise={timerExercise}
              nextExercise={nextPendingExercise}
              nextSetNumber={pendingCursor?.setNumber}
              timerSnapshot={timerSnapshot}
              headingRef={restHeadingRef}
              onPause={onTimerPause}
              onResume={onTimerResume}
              onAddThirty={onTimerAddThirty}
              onSkip={handleSkipRest}
            />
          ) : showSummary ? (
            <SessionSummary
              workout={workout}
              elapsedSeconds={elapsedSeconds}
              volume={volume}
              points={points}
              personalRecords={personalRecords}
              headingRef={summaryHeadingRef}
              onEditResults={() => setTab('plan')}
              onUpdateNotes={onUpdateNotes}
              onCompleteWorkout={onCompleteWorkout}
            />
          ) : selectedExercise && selectedSetIndex !== null && selectedResult ? (
            <section className="session-exercise" aria-labelledby="session-exercise-title">
              <div className="session-exercise-heading">
                <p className="session-kicker">Упражнение {selectedExerciseIndex + 1} из {workout.exercises.length} · Подход {selectedSetIndex + 1} из {selectedExercise.sets}</p>
                <h1 id="session-exercise-title" ref={exerciseHeadingRef} tabIndex="-1">{selectedExercise.name}</h1>
                <p>{selectedExercise.sets} × {selectedExercise.plannedReps}{selectedExercise.plannedWeightKg ? ` · ${selectedExercise.plannedWeightKg} кг` : ''} · отдых {selectedExercise.restSeconds} сек</p>
              </div>

              <div className="session-set-picker" aria-label="Подходы упражнения">
                {(selectedExercise.setResults ?? []).map((result, index) => (
                  <button
                    type="button"
                    key={result.setNumber ?? index}
                    className={`${result.status} ${index === selectedSetIndex ? 'current' : ''}`}
                    aria-pressed={index === selectedSetIndex}
                    aria-label={`Подход ${index + 1}: ${resultStatusLabel(result.status)}`}
                    onClick={() => selectSet(selectedExercise.id, index)}
                  >
                    {result.status === 'completed' ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : result.status === 'skipped' ? '—' : index + 1}
                  </button>
                ))}
              </div>

              <div className="session-result-editor">
                <label>
                  <span>Вес, кг</span>
                  <input ref={(node) => { fieldRefs.current.weightKg = node; }} type="number" inputMode="decimal" min="0.5" max="1000" step="0.5" value={draft.weightKg} aria-invalid={Boolean(errors.weightKg)} aria-describedby={errors.weightKg ? 'session-error-weight' : undefined} onChange={(event) => handleDraftChange('weightKg', event.target.value)} />
                  {errors.weightKg && <small id="session-error-weight" role="alert">{errors.weightKg}</small>}
                </label>
                <label>
                  <span>Повторы</span>
                  <input ref={(node) => { fieldRefs.current.reps = node; }} type="number" inputMode="numeric" min="1" max="999" step="1" value={draft.reps} aria-invalid={Boolean(errors.reps)} aria-describedby={errors.reps ? 'session-error-reps' : undefined} onChange={(event) => handleDraftChange('reps', event.target.value)} />
                  {errors.reps && <small id="session-error-reps" role="alert">{errors.reps}</small>}
                </label>
                <label>
                  <span>RPE</span>
                  <input ref={(node) => { fieldRefs.current.rpe = node; }} type="number" inputMode="decimal" min="1" max="10" step="0.5" value={draft.rpe} aria-invalid={Boolean(errors.rpe)} aria-describedby={errors.rpe ? 'session-error-rpe' : undefined} onChange={(event) => handleDraftChange('rpe', event.target.value)} />
                  {errors.rpe && <small id="session-error-rpe" role="alert">{errors.rpe}</small>}
                </label>
              </div>

              <div className="session-history-grid">
                <article><span>Предыдущий подход</span><strong>{formatSetResult(previousSet)}</strong></article>
                <article><span>Прошлая тренировка</span><strong>{formatSetResult(previousWorkoutResult?.result)}</strong></article>
              </div>

              <div className="session-up-next">
                <span><Flame size={18} aria-hidden="true" /></span>
                <div><small>Дальше</small><strong>{nextSetIndex >= 0 ? `Подход ${nextSetIndex + 1}` : nextExercise?.name ?? 'Итоги тренировки'}</strong></div>
                <ChevronRight size={18} aria-hidden="true" />
              </div>

              <div className="session-action-dock">
                {(selectedExercise.setResults ?? []).some((result) => result.status === 'pending') && (
                  <button type="button" className="session-skip-exercise" onClick={handleSkipExercise} disabled={!onSkipExercise}><SkipForward size={17} aria-hidden="true" /> Пропустить упражнение</button>
                )}
                <button type="button" className="session-primary-action" onClick={handleSaveSet} disabled={selectedResult.status === 'completed' ? !onUpdateSet : !onCompleteSet}>
                  {selectedResult.status === 'completed' ? <CheckCircle2 size={20} aria-hidden="true" /> : <Timer size={20} aria-hidden="true" />}
                  {selectedResult.status === 'completed'
                    ? 'Сохранить изменения'
                    : selectedExercise.restSeconds > 0
                      ? 'Выполнить подход и начать отдых'
                      : 'Выполнить подход'}
                </button>
              </div>
            </section>
          ) : (
            <SessionUnavailable title="В тренировке нет подходов" description="Вернись к плану и проверь упражнения." onBack={onBack} />
          )}
        </div>
      )}

      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  );
}

export function ActiveWorkoutPage(props) {
  return <ActiveWorkoutSession key={props.workout?.id ?? 'missing-workout'} {...props} />;
}

export default ActiveWorkoutPage;
