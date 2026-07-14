import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ConfirmScopeDialog, EmptyState, RestTimer, Toast } from './components/index.js';
import {
  addCalendarDays,
  calculatePersonalRecords,
  createEmptyAppState,
  createTemplateFromWorkout,
  differenceInCalendarDays,
  findNewPersonalRecords,
  formatRuCount,
  getIsoWeekday,
  getTimerSnapshot,
  getToday,
  isCalendarDate,
  millisecondsUntilNextDay,
  normalizeAppState,
  selectCompletedWorkouts,
  selectDailyPoints,
  selectMissedWorkouts,
  selectProgressStats,
  selectWorkoutById,
  selectWorkoutsForDate,
} from './domain/index.js';
import { AppLayout, PageHeader } from './features/layout/AppLayout.jsx';
import { PlanPage } from './features/plan/PlanPage.jsx';
import { ProgressPage } from './features/progress/ProgressPage.jsx';
import { SettingsPage } from './features/settings/SettingsPage.jsx';
import { ActiveWorkoutPage } from './features/session/index.js';
import { TodayPage } from './features/today/TodayPage.jsx';
import { prepareTimerSound } from './features/timer/timerSound.js';
import { useTimerCompletionSound } from './features/timer/useTimerCompletionSound.js';
import { WorkoutCard } from './features/workouts/WorkoutCard.jsx';
import { WorkoutEditor } from './features/workouts/WorkoutEditor.jsx';
import { PwaInstallPrompt, PwaUpdatePrompt, requestPersistentStorage } from './pwa/index.js';
import {
  ActionTypes,
  STORAGE_KEY_V2,
  appReducer,
  createDeletionSnapshot,
  loadAppStateResult,
  saveAppState,
} from './store/index.js';

const VALID_PLAN_TABS = new Set(['calendar', 'missed', 'templates']);

function useCurrentCalendarDate() {
  const [today, setToday] = useState(() => getToday());

  useEffect(() => {
    let timeoutId;

    const scheduleRefresh = () => {
      window.clearTimeout(timeoutId);
      setToday(getToday());
      timeoutId = window.setTimeout(scheduleRefresh, millisecondsUntilNextDay() + 250);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const handlePageShow = () => scheduleRefresh();

    timeoutId = window.setTimeout(scheduleRefresh, millisecondsUntilNextDay() + 250);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return today;
}

function createDemoState(today) {
  const yesterday = addCalendarDays(today, -1);
  const missedDate = addCalendarDays(today, -3);
  const tomorrow = addCalendarDays(today, 1);
  const completedAt = new Date(`${yesterday}T19:15:00`).toISOString();
  const baseState = normalizeAppState({
    schemaVersion: 2,
    workouts: [
      {
        id: 'demo-completed',
        title: 'Силовая база',
        type: 'Силовая',
        status: 'completed',
        plannedDate: yesterday,
        time: '18:30',
        intensity: 'Средняя',
        resultNotes: 'Все подходы выполнены уверенно.',
        completedAt,
        pointsAwarded: 80,
        exercises: [
          { id: 'demo-ex-1', name: 'Жим гантелей', sets: 4, plannedReps: '10', plannedWeightKg: 20, restSeconds: 90, completedSets: 4, actualWeightKg: 22, actualReps: 10, rpe: 8 },
          { id: 'demo-ex-2', name: 'Приседания', sets: 4, plannedReps: '12', plannedWeightKg: 40, restSeconds: 120, completedSets: 4, actualWeightKg: 42.5, actualReps: 12, rpe: 8 },
          { id: 'demo-ex-3', name: 'Планка', sets: 4, plannedReps: '45 сек', restSeconds: 60, completedSets: 4 },
        ],
      },
      {
        id: 'demo-today',
        title: 'Верх тела',
        type: 'Силовая',
        status: 'planned',
        plannedDate: today,
        time: '18:30',
        intensity: 'Средняя',
        exercises: [
          { id: 'demo-today-1', name: 'Отжимания', sets: 4, plannedReps: '12', restSeconds: 90 },
          { id: 'demo-today-2', name: 'Тяга гантели', sets: 3, plannedReps: '10', plannedWeightKg: 18, restSeconds: 90 },
        ],
      },
      {
        id: 'demo-missed',
        title: 'Кардио и мобильность',
        type: 'Кардио',
        status: 'planned',
        plannedDate: missedDate,
        time: '08:00',
        intensity: 'Лёгкая',
        exercises: [
          { id: 'demo-missed-1', name: 'Быстрая ходьба', sets: 1, plannedReps: '20 мин', restSeconds: 0 },
          { id: 'demo-missed-2', name: 'Мобильность плеч', sets: 3, plannedReps: '12', restSeconds: 45 },
        ],
      },
    ],
    templates: [
      {
        id: 'demo-template',
        name: 'Короткая тренировка',
        plan: {
          title: 'Короткая тренировка',
          type: 'Силовая',
          time: '18:00',
          intensity: 'Средняя',
          exercises: [
            { id: 'demo-template-1', name: 'Отжимания', sets: 3, plannedReps: '10', restSeconds: 60 },
            { id: 'demo-template-2', name: 'Приседания', sets: 3, plannedReps: '15', restSeconds: 60 },
          ],
        },
      },
    ],
    bodyWeightEntries: [
      { date: addCalendarDays(today, -12), weightKg: 78.2 },
      { date: addCalendarDays(today, -6), weightKg: 77.6 },
      { date: today, weightKg: 77.1 },
    ],
  }, { today });

  return appReducer(baseState, {
    type: ActionTypes.SERIES_ADD,
    payload: {
      series: {
        id: 'demo-series',
        weekdays: [getIsoWeekday(tomorrow)],
        intervalWeeks: 1,
        startsOn: tomorrow,
        endsOn: addCalendarDays(tomorrow, 28),
        planSnapshot: {
          title: 'Восстановление',
          type: 'Мобильность',
          time: '08:30',
          intensity: 'Лёгкая',
          exercises: [
            { name: 'Растяжка ног', sets: 3, plannedReps: '40 сек', restSeconds: 30 },
            { name: 'Мобильность спины', sets: 3, plannedReps: '10', restSeconds: 30 },
          ],
        },
      },
    },
  });
}

function FocusPageHeading() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.requestAnimationFrame(() => document.querySelector('main h1')?.focus({ preventScroll: true }));
  }, [location.pathname]);

  return null;
}

function PlanRoute({ state, today, points, workoutActions, onAdd, templateActions }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const requestedTab = searchParams.get('tab');
  const selectedDate = isCalendarDate(requestedDate) ? requestedDate : today;
  const tab = VALID_PLAN_TABS.has(requestedTab) ? requestedTab : 'calendar';
  const missedWorkouts = useMemo(() => selectMissedWorkouts(state, today), [state, today]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  };

  return (
    <PlanPage
      today={today}
      points={points}
      selectedDate={selectedDate}
      tab={tab}
      workouts={state.workouts}
      missedWorkouts={missedWorkouts}
      templates={state.templates}
      onSelectDate={(date) => setParam('date', date)}
      onSelectTab={(nextTab) => setParam('tab', nextTab)}
      onAdd={onAdd}
      onCreateTemplate={templateActions.onCreate}
      onApplyTemplate={templateActions.onApply}
      onEditTemplate={templateActions.onEdit}
      onDeleteTemplate={templateActions.onDelete}
      workoutActions={workoutActions}
    />
  );
}

function WorkoutRoute({ state, today, points, workoutActions }) {
  const { id } = useParams();
  const workout = selectWorkoutById(state, id);
  if (!workout) {
    return (
      <>
        <PageHeader eyebrow="Тренировка не найдена" title="Такой записи больше нет" points={points} />
        <EmptyState title="Тренировка недоступна" description="Возможно, она была удалена или ссылка устарела." />
        <p className="empty-route-action"><Link className="primary-button" to="/plan"><CalendarDays size={18} /> Открыть план</Link></p>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={workout.plannedDate} title={workout.title} points={points}>
        <Link className="secondary-button header-link" to={`/plan?date=${workout.plannedDate}`}><ArrowLeft size={17} /> К календарю</Link>
      </PageHeader>
      <WorkoutCard workout={workout} today={today} {...workoutActions} />
    </>
  );
}

function WorkoutSessionRoute({
  state,
  today,
  timerSnapshot,
  sessionActions,
}) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const workout = selectWorkoutById(state, id);
  const personalRecords = useMemo(() => {
    if (!workout) return [];
    const candidate = {
      ...workout,
      status: 'completed',
      completedAt: workout.startedAt ?? `${today}T23:59:59.999`,
    };
    return findNewPersonalRecords(
      candidate,
      state.workouts.filter((item) => item.id !== candidate.id),
    );
  }, [state.workouts, today, workout]);
  const requestedReturnTo = location.state?.returnTo;
  const returnTo = typeof requestedReturnTo === 'string'
    && requestedReturnTo.startsWith('/')
    && !requestedReturnTo.includes('/session')
    ? requestedReturnTo
    : `/workouts/${id}`;

  if (!workout || workout.status !== 'planned' || workout.plannedDate > today) {
    return <Navigate to={`/workouts/${id}`} replace />;
  }

  return (
    <ActiveWorkoutPage
      workout={workout}
      workouts={state.workouts}
      today={today}
      timerSnapshot={timerSnapshot}
      personalRecords={personalRecords}
      onBack={() => navigate(returnTo, { replace: true })}
      {...sessionActions}
    />
  );
}

export default function App() {
  const today = useCurrentCalendarDate();
  const location = useLocation();
  const navigate = useNavigate();
  const sessionRouteActive = /^\/workouts\/[^/]+\/session\/?$/.test(location.pathname);
  const [loadResult] = useState(() => loadAppStateResult(globalThis.localStorage, { today }));
  const [state, dispatch] = useReducer(appReducer, loadResult.state);
  const [editor, setEditor] = useState(null);
  const [scopeRequest, setScopeRequest] = useState(null);
  const [undo, setUndo] = useState(null);
  const [notice, setNotice] = useState(() => {
    if (loadResult.migrated) return { variant: 'success', title: 'Данные обновлены', message: 'Тренировки V1 перенесены в новый формат.' };
    if (loadResult.recovered) return { variant: 'info', title: 'Хранилище восстановлено', message: 'Повреждённые данные были безопасно сброшены.' };
    return null;
  });
  const [storageStatus, setStorageStatus] = useState('unknown');
  const [, setTimerClock] = useState(() => Date.now());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const stats = useMemo(() => selectProgressStats(state, today), [state, today]);
  const todayWorkouts = useMemo(() => selectWorkoutsForDate(state, today), [state, today]);
  const tomorrow = addCalendarDays(today, 1);
  const tomorrowWorkouts = useMemo(() => selectWorkoutsForDate(state, tomorrow), [state, tomorrow]);
  const completedWorkouts = useMemo(() => selectCompletedWorkouts(state), [state]);
  const weekData = useMemo(() => selectDailyPoints(state, today, 7).map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
      .format(new Date(`${item.date}T12:00:00`))
      .replace('.', ''),
  })), [state, today]);
  const todayPoints = selectDailyPoints(state, today, 1)[0]?.points ?? 0;
  const remainingPoints = 250 - (stats.totalPoints % 250);

  useEffect(() => {
    const saved = saveAppState(state, globalThis.localStorage, { today });
    let cancelled = false;
    const persistenceRequest = saved
      ? requestPersistentStorage()
      : Promise.resolve({ supported: true, persisted: false });
    void persistenceRequest.then((result) => {
      if (!cancelled) setStorageStatus(result.persisted ? 'persisted' : result.supported ? 'denied' : 'unsupported');
    });
    return () => { cancelled = true; };
  }, [state, today]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY_V2 || event.storageArea !== globalThis.localStorage) return;
      const nextState = loadAppStateResult(globalThis.localStorage, { today }).state;
      if (JSON.stringify(nextState) === JSON.stringify(stateRef.current)) return;
      dispatch({ type: ActionTypes.REPLACE_STATE, payload: { state: nextState } });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [today]);

  useEffect(() => {
    if (!undo) return undefined;
    const delay = Math.max(0, new Date(undo.snapshot.expiresAt).getTime() - Date.now());
    const timeoutId = window.setTimeout(() => setUndo(null), delay);
    return () => window.clearTimeout(timeoutId);
  }, [undo]);

  useEffect(() => {
    if (!state.activeTimer || state.activeTimer.status !== 'running') return undefined;
    const intervalId = window.setInterval(() => setTimerClock(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [state.activeTimer]);

  useEffect(() => {
    if (!state.activeTimer) return undefined;
    const refreshTimer = () => setTimerClock(Date.now());
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshTimer();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', refreshTimer);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', refreshTimer);
    };
  }, [state.activeTimer]);

  const closeEditor = () => setEditor(null);
  const openCreate = (date = today) => setEditor({ mode: 'create', initialDate: date });
  const openTemplateCreate = () => setEditor({ mode: 'template', initialDate: today, template: null });
  const openTemplateEdit = (template) => setEditor({ mode: 'template', initialDate: today, template });

  const performDeletion = useCallback((action, label) => {
    const nextState = appReducer(state, action);
    const snapshot = createDeletionSnapshot(state, nextState);
    dispatch(action);
    setUndo({ snapshot, label });
    setNotice(null);
  }, [state]);

  const requestWorkoutDeletion = (workout) => {
    if (workout.seriesId && workout.status === 'planned') {
      setScopeRequest({ kind: 'delete', workout });
      return;
    }
    performDeletion(
      { type: ActionTypes.WORKOUT_DELETE, payload: { workoutId: workout.id } },
      `«${workout.title}» удалена`,
    );
  };

  const submitEditor = (payload, recurrence = null) => {
    if (!editor) return;

    if (editor.mode === 'template') {
      if (editor.template) {
        dispatch({ type: ActionTypes.TEMPLATE_UPDATE, payload: { templateId: editor.template.id, patch: payload } });
        setNotice({ variant: 'success', title: 'Шаблон обновлён' });
      } else {
        dispatch({ type: ActionTypes.TEMPLATE_ADD, payload: { template: payload } });
        setNotice({ variant: 'success', title: 'Шаблон создан' });
      }
      closeEditor();
      return;
    }

    if (editor.mode === 'create') {
      if (recurrence) {
        dispatch({
          type: ActionTypes.SERIES_ADD,
          payload: { series: { ...recurrence, planSnapshot: payload } },
        });
        setNotice({ variant: 'success', title: 'Серия создана', message: 'Тренировки добавлены в календарь.' });
      } else {
        dispatch({ type: ActionTypes.WORKOUT_ADD, payload: { workout: payload } });
        setNotice({ variant: 'success', title: 'Тренировка запланирована' });
      }
      closeEditor();
      return;
    }

    const workout = editor.workout;
    if (editor.mode === 'duplicate') {
      dispatch({
        type: ActionTypes.WORKOUT_DUPLICATE,
        payload: { workoutId: workout.id, overrides: payload },
      });
      setNotice({ variant: 'success', title: 'Независимая копия создана' });
      closeEditor();
      return;
    }

    if (editor.mode === 'result') {
      dispatch({
        type: ActionTypes.WORKOUT_CORRECT_RESULT,
        payload: { workoutId: workout.id, correction: { resultNotes: payload.resultNotes, exercises: payload.exercises } },
      });
      setNotice({ variant: 'success', title: 'Результат исправлен', message: 'Баллы и рекорды пересчитаны.' });
      closeEditor();
      return;
    }

    if (workout.seriesId) {
      setScopeRequest({ kind: editor.mode, workout, patch: payload });
      closeEditor();
      return;
    }

    if (editor.mode === 'reschedule') {
      dispatch({ type: ActionTypes.WORKOUT_RESCHEDULE, payload: { workoutId: workout.id, plannedDate: payload.plannedDate } });
      if (payload.time !== workout.time) {
        dispatch({ type: ActionTypes.WORKOUT_UPDATE, payload: { workoutId: workout.id, patch: { time: payload.time } } });
      }
      setNotice({ variant: 'success', title: 'Тренировка перенесена' });
    } else {
      dispatch({ type: ActionTypes.WORKOUT_UPDATE, payload: { workoutId: workout.id, patch: payload } });
      setNotice({ variant: 'success', title: 'План обновлён' });
    }
    closeEditor();
  };

  const confirmScope = (scope) => {
    if (!scopeRequest) return;
    const { kind, workout, patch } = scopeRequest;

    if (kind === 'delete') {
      const action = scope === 'following'
        ? {
          type: ActionTypes.SERIES_DELETE_FOLLOWING,
          payload: { seriesId: workout.seriesId, occurrenceDate: workout.occurrenceDate },
        }
        : { type: ActionTypes.SERIES_DELETE_ONE, payload: { workoutId: workout.id } };
      performDeletion(action, scope === 'following' ? 'Тренировки серии удалены' : `«${workout.title}» удалена`);
    } else if (scope === 'single') {
      if (kind === 'reschedule') {
        dispatch({ type: ActionTypes.WORKOUT_RESCHEDULE, payload: { workoutId: workout.id, plannedDate: patch.plannedDate } });
        if (patch.time !== workout.time) {
          dispatch({ type: ActionTypes.SERIES_UPDATE_ONE, payload: { workoutId: workout.id, patch: { time: patch.time } } });
        }
      } else {
        dispatch({ type: ActionTypes.SERIES_UPDATE_ONE, payload: { workoutId: workout.id, patch } });
      }
      setNotice({ variant: 'success', title: 'Изменена одна тренировка' });
    } else {
      let changes = { planSnapshot: patch };
      if (kind === 'reschedule') {
        const series = state.series.find((item) => item.id === workout.seriesId);
        const shift = differenceInCalendarDays(patch.plannedDate, workout.occurrenceDate);
        changes = {
          startsOn: patch.plannedDate,
          weekdays: series?.weekdays.map((weekday) => ((weekday - 1 + shift) % 7 + 7) % 7 + 1),
          planSnapshot: { ...series?.planSnapshot, time: patch.time },
        };
      }
      dispatch({
        type: ActionTypes.SERIES_UPDATE_FOLLOWING,
        payload: {
          seriesId: workout.seriesId,
          occurrenceDate: workout.occurrenceDate,
          changes,
        },
      });
      setNotice({ variant: 'success', title: 'Эта и следующие обновлены' });
    }
    setScopeRequest(null);
  };

  const updateResultDraft = (workoutId, exerciseId, setIndex, field, value) => {
    const parsed = value === '' ? null : Number(value);
    dispatch({
      type: ActionTypes.WORKOUT_UPDATE_RESULT,
      payload: {
        workoutId,
        result: { exercises: [{ id: exerciseId, setIndex, [field]: parsed }] },
      },
    });
  };

  const completeWorkout = (workout, options = {}) => {
    const action = {
      type: ActionTypes.WORKOUT_COMPLETE,
      payload: {
        workoutId: workout.id,
        requireResolvedSets: options.requireResolvedSets === true,
        result: {
          completedAt: new Date().toISOString(),
          resultNotes: workout.resultNotes,
          exercises: workout.exercises,
          requireResolvedSets: options.requireResolvedSets === true,
        },
      },
    };
    const nextState = appReducer(state, action);
    const nextWorkout = selectWorkoutById(nextState, workout.id);
    if (nextWorkout?.status !== 'completed') {
      setNotice({ variant: 'info', title: 'Тренировка ещё не готова', message: 'Выполни или пропусти оставшиеся подходы.' });
      return false;
    }
    const beforeRecords = new Map(calculatePersonalRecords(state.workouts).map((item) => [item.normalizedName, item]));
    const record = calculatePersonalRecords(nextState.workouts).find((item) => {
      const previous = beforeRecords.get(item.normalizedName);
      return ['weight', 'volume', 'reps'].some((metric) => (
        item[metric]?.workoutId === nextWorkout?.id
        && (!previous?.[metric] || item[metric].value > previous[metric].value)
      ));
    });
    dispatch(action);
    setNotice(record
      ? { variant: 'success', title: 'Новый личный рекорд!', message: record.displayName }
      : { variant: 'success', title: 'Тренировка завершена', message: `+${formatRuCount(nextWorkout?.pointsAwarded ?? 0, 'point')}` });
    return true;
  };

  const workoutActions = {
    onOpen: (workout) => {
      const destination = workout.status === 'planned' && workout.plannedDate <= today
        ? `/workouts/${workout.id}/session`
        : `/workouts/${workout.id}`;
      navigate(destination, {
        state: { returnTo: `${location.pathname}${location.search}` },
      });
    },
    onToggleSet: (workoutId, exerciseId, index) => dispatch({ type: ActionTypes.WORKOUT_TOGGLE_SET, payload: { workoutId, exerciseId, index } }),
    onComplete: completeWorkout,
    onEdit: (workout) => setEditor({ mode: 'edit', workout, initialDate: workout.plannedDate }),
    onReschedule: (workout) => setEditor({ mode: 'reschedule', workout, initialDate: workout.plannedDate }),
    onDuplicate: (workout) => setEditor({ mode: 'duplicate', workout, initialDate: workout.plannedDate }),
    onSaveTemplate: (workout) => {
      dispatch({ type: ActionTypes.TEMPLATE_ADD, payload: { template: createTemplateFromWorkout(workout) } });
      setNotice({ variant: 'success', title: 'Сохранено как шаблон' });
    },
    onDelete: requestWorkoutDeletion,
    onSkip: (workout) => {
      dispatch({ type: ActionTypes.WORKOUT_SKIP, payload: { workoutId: workout.id } });
      setNotice({ variant: 'info', title: 'Тренировка отмечена пропущенной' });
    },
    onCorrectResult: (workout) => setEditor({ mode: 'result', workout, initialDate: workout.plannedDate }),
    onUpdateResult: updateResultDraft,
    onUpdateResultNotes: (workoutId, resultNotes) => dispatch({
      type: ActionTypes.WORKOUT_UPDATE_RESULT,
      payload: { workoutId, result: { resultNotes } },
    }),
    onStartTimer: (workout, exercise) => {
      void prepareTimerSound();
      dispatch({
        type: ActionTypes.WORKOUT_START_REST,
        payload: {
          workoutId: workout.id,
          exerciseId: exercise.id,
        },
      });
    },
  };

  const templateActions = {
    onCreate: openTemplateCreate,
    onEdit: openTemplateEdit,
    onApply: (template, date) => {
      dispatch({ type: ActionTypes.TEMPLATE_APPLY, payload: { templateId: template.id, overrides: { plannedDate: date } } });
      setNotice({ variant: 'success', title: 'Тренировка создана из шаблона' });
    },
    onDelete: (template) => performDeletion(
      { type: ActionTypes.TEMPLATE_DELETE, payload: { templateId: template.id } },
      `Шаблон «${template.name}» удалён`,
    ),
  };

  const timerSnapshot = getTimerSnapshot(state.activeTimer);
  useTimerCompletionSound(timerSnapshot);
  useEffect(() => {
    if (!timerSnapshot.expired) return;
    dispatch({ type: ActionTypes.TIMER_FINISH });
  }, [timerSnapshot.endsAt, timerSnapshot.expired]);
  const timerWorkout = state.workouts.find((workout) => workout.id === timerSnapshot.workoutId);
  const timerExercise = timerWorkout?.exercises.find((exercise) => exercise.id === timerSnapshot.exerciseId);
  const sessionActions = {
    onStart: (workoutId) => dispatch({
      type: ActionTypes.WORKOUT_SESSION_START,
      payload: { workoutId, now: new Date().toISOString() },
    }),
    onCompleteSet: (payload) => {
      void prepareTimerSound();
      dispatch({
        type: ActionTypes.WORKOUT_SESSION_COMPLETE_SET,
        payload: { ...payload, now: new Date().toISOString() },
      });
    },
    onUpdateSet: (payload) => dispatch({
      type: ActionTypes.WORKOUT_SESSION_UPDATE_SET,
      payload,
    }),
    onSkipExercise: (payload) => dispatch({
      type: ActionTypes.WORKOUT_SESSION_SKIP_EXERCISE,
      payload,
    }),
    onCompleteWorkout: (workout) => {
      if (completeWorkout(workout, { requireResolvedSets: true })) {
        navigate(`/workouts/${workout.id}`, { replace: true });
      }
    },
    onUpdateNotes: (workoutId, resultNotes) => dispatch({
      type: ActionTypes.WORKOUT_UPDATE_RESULT,
      payload: { workoutId, result: { resultNotes } },
    }),
    onTimerPause: () => dispatch({ type: ActionTypes.TIMER_PAUSE }),
    onTimerResume: () => dispatch({ type: ActionTypes.TIMER_RESUME }),
    onTimerAddThirty: () => dispatch({
      type: ActionTypes.TIMER_ADD_SECONDS,
      payload: { seconds: 30 },
    }),
    onSkipRest: () => dispatch({ type: ActionTypes.TIMER_FINISH }),
  };

  return (
    <AppLayout
      immersive={sessionRouteActive}
      points={stats.totalPoints}
      level={stats.level}
      levelProgress={stats.levelProgress}
      remainingPoints={remainingPoints}
      missedCount={stats.missedWorkouts}
    >
      {!sessionRouteActive && <FocusPageHeading />}
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route
          path="/today"
          element={(
            <TodayPage
              today={today}
              tomorrow={tomorrow}
              workouts={todayWorkouts}
              tomorrowWorkouts={tomorrowWorkouts}
              missedCount={stats.missedWorkouts}
              points={stats.totalPoints}
              streak={stats.streakDays}
              todayPoints={todayPoints}
              onAdd={openCreate}
              workoutActions={workoutActions}
            />
          )}
        />
        <Route
          path="/plan"
          element={(
            <PlanRoute
              state={state}
              today={today}
              points={stats.totalPoints}
              onAdd={openCreate}
              workoutActions={workoutActions}
              templateActions={templateActions}
            />
          )}
        />
        <Route
          path="/progress"
          element={(
            <ProgressPage
              today={today}
              points={stats.totalPoints}
              level={stats.level}
              streak={stats.streakDays}
              completedWorkouts={completedWorkouts}
              workouts={state.workouts}
              weekData={weekData}
              bodyWeightEntries={state.bodyWeightEntries}
              onSaveWeight={(entry) => dispatch({ type: ActionTypes.BODY_WEIGHT_UPSERT, payload: entry })}
              onDeleteWeight={(date) => performDeletion(
                { type: ActionTypes.BODY_WEIGHT_DELETE, payload: { date } },
                'Запись веса удалена',
              )}
              onAdd={openCreate}
            />
          )}
        />
        <Route
          path="/settings"
          element={(
            <SettingsPage
              points={stats.totalPoints}
              onLoadDemo={() => {
                dispatch({ type: ActionTypes.REPLACE_STATE, payload: { state: createDemoState(today) } });
                setNotice({ variant: 'success', title: 'Демо загружено', message: 'Можно изучить все основные сценарии.' });
              }}
              onReset={() => {
                if (!window.confirm('Очистить все локальные данные AZIM.FIT?')) return;
                dispatch({ type: ActionTypes.REPLACE_STATE, payload: { state: createEmptyAppState() } });
                setNotice({ variant: 'info', title: 'Локальные данные очищены' });
              }}
              storageStatus={storageStatus}
            />
          )}
        />
        <Route
          path="/workouts/:id/session"
          element={(
            <WorkoutSessionRoute
              state={state}
              today={today}
              timerSnapshot={timerSnapshot}
              sessionActions={sessionActions}
            />
          )}
        />
        <Route path="/workouts/:id" element={<WorkoutRoute state={state} today={today} points={stats.totalPoints} workoutActions={workoutActions} />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>

      {state.activeTimer && !sessionRouteActive && (
        <RestTimer
          remainingSeconds={timerSnapshot.remainingSeconds}
          status={timerSnapshot.status}
          label={timerExercise ? `Отдых · ${timerExercise.name}` : 'Таймер отдыха'}
          onPause={() => dispatch({ type: ActionTypes.TIMER_PAUSE })}
          onResume={() => dispatch({ type: ActionTypes.TIMER_RESUME })}
          onAddThirty={() => dispatch({ type: ActionTypes.TIMER_ADD_SECONDS, payload: { seconds: 30 } })}
          onCancel={() => dispatch({ type: ActionTypes.TIMER_CANCEL })}
        />
      )}

      <WorkoutEditor
        open={Boolean(editor)}
        mode={editor?.mode}
        initialDate={editor?.initialDate ?? today}
        workout={editor?.workout}
        template={editor?.template}
        onClose={closeEditor}
        onSubmit={submitEditor}
      />
      <ConfirmScopeDialog
        open={Boolean(scopeRequest)}
        title={scopeRequest?.kind === 'delete' ? 'Удалить тренировку из серии?' : 'Изменить тренировку из серии?'}
        description={scopeRequest?.kind === 'delete'
          ? 'Завершённые и уже пропущенные тренировки останутся в истории.'
          : 'Выбери область изменения повторяющегося плана.'}
        confirmLabel={scopeRequest?.kind === 'delete' ? 'Удалить' : 'Применить'}
        onConfirm={confirmScope}
        onClose={() => setScopeRequest(null)}
      />

      {undo && (
        <Toast
          variant="info"
          title={undo.label}
          message="Отменить можно в течение 8 секунд."
          onUndo={() => {
            dispatch({ type: ActionTypes.UNDO_DELETE, payload: { snapshot: undo.snapshot } });
            setUndo(null);
            setNotice({ variant: 'success', title: 'Удаление отменено' });
          }}
          onDismiss={() => setUndo(null)}
        />
      )}
      {!undo && notice && <Toast {...notice} onDismiss={() => setNotice(null)} />}
      {!sessionRouteActive && <PwaInstallPrompt />}
      {!sessionRouteActive && <PwaUpdatePrompt />}
    </AppLayout>
  );
}
