import { isCalendarDate } from '../domain/dates.js';
import {
  acceptContinuousDelta,
  activateContinuousSession,
  buildContinuousResult,
  createContinuousSession,
  pauseContinuousSession,
  resumeContinuousSession,
  reviewContinuousSession,
  tickContinuousSession,
} from '../domain/continuousSession.js';
import { SCHEMA_VERSION } from '../domain/model.js';
import {
  deleteSeriesAndFollowing,
  excludeSeriesOccurrence,
  materializeSeries,
  splitSeriesAndFollowing,
} from '../domain/recurrence.js';
import {
  normalizeAppState,
  normalizeBodyWeightEntry,
  normalizeCustomExercise,
  normalizeSettings,
  normalizeSeries,
  normalizeTemplate,
  normalizeWorkout,
} from '../domain/schema.js';
import { updateTemplate } from '../domain/templates.js';
import {
  addRestTimerSeconds,
  getTimerElapsedSeconds,
  normalizeActiveTimerForWorkouts,
  pauseRestTimer,
  resumeRestTimer,
  startRestTimer,
  startWorkTimer,
} from '../domain/timer.js';
import {
  applyTemplate,
  completeContinuousExercise,
  completeWorkoutSet,
  completeNextWorkoutSet,
  completeWorkout,
  correctWorkoutResult,
  duplicateWorkout,
  findFirstPendingWorkoutSet,
  getPlannedBodyweightSetResult,
  rescheduleWorkout,
  skipRemainingExerciseSets,
  skipWorkout,
  startWorkoutSession,
  toggleWorkoutSet,
  updateWorkoutSetResult,
  updateContinuousExerciseResult,
  updateWorkoutResultDraft,
  updatePlannedWorkout,
} from '../domain/workouts.js';
import { restoreDeletionSnapshot } from './undo.js';

export const ActionTypes = Object.freeze({
  REPLACE_STATE: 'state/replace',
  WORKOUT_ADD: 'workout/add',
  WORKOUT_UPDATE: 'workout/update',
  WORKOUT_DUPLICATE: 'workout/duplicate',
  WORKOUT_RESCHEDULE: 'workout/reschedule',
  WORKOUT_TOGGLE_SET: 'workout/toggle-set',
  WORKOUT_UPDATE_RESULT: 'workout/update-result',
  WORKOUT_COMPLETE: 'workout/complete',
  WORKOUT_CORRECT_RESULT: 'workout/correct-result',
  WORKOUT_SKIP: 'workout/skip',
  WORKOUT_DELETE: 'workout/delete',
  SERIES_ADD: 'series/add',
  SERIES_MATERIALIZE: 'series/materialize',
  SERIES_UPDATE_ONE: 'series/update-one',
  SERIES_UPDATE_FOLLOWING: 'series/update-following',
  SERIES_DELETE_ONE: 'series/delete-one',
  SERIES_DELETE_FOLLOWING: 'series/delete-following',
  TEMPLATE_ADD: 'template/add',
  TEMPLATE_UPDATE: 'template/update',
  TEMPLATE_DELETE: 'template/delete',
  TEMPLATE_APPLY: 'template/apply',
  CUSTOM_EXERCISE_ADD: 'custom-exercise/add',
  CUSTOM_EXERCISE_UPDATE: 'custom-exercise/update',
  CUSTOM_EXERCISE_DELETE: 'custom-exercise/delete',
  BODY_WEIGHT_UPSERT: 'body-weight/upsert',
  BODY_WEIGHT_DELETE: 'body-weight/delete',
  SETTINGS_UPDATE: 'settings/update',
  WORKOUT_START_REST: 'workout/start-rest',
  WORKOUT_SESSION_START: 'workout/session-start',
  WORKOUT_START_SESSION: 'workout/session-start',
  WORKOUT_SESSION_UPDATE_SET: 'workout/session-update-set',
  WORKOUT_UPDATE_SET: 'workout/session-update-set',
  WORKOUT_SESSION_COMPLETE_SET: 'workout/session-complete-set',
  WORKOUT_COMPLETE_SET: 'workout/session-complete-set',
  WORKOUT_SESSION_START_TIMED_SET: 'workout/session-start-timed-set',
  WORKOUT_SESSION_FINISH_TIMED_SET: 'workout/session-finish-timed-set',
  WORKOUT_SESSION_START_CONTINUOUS: 'workout/session-start-continuous',
  WORKOUT_SESSION_CONTINUOUS_GPS_READY: 'workout/session-continuous-gps-ready',
  WORKOUT_SESSION_CONTINUOUS_ACCEPT_DELTA: 'workout/session-continuous-accept-delta',
  WORKOUT_SESSION_CONTINUOUS_TICK: 'workout/session-continuous-tick',
  WORKOUT_SESSION_PAUSE_CONTINUOUS: 'workout/session-pause-continuous',
  WORKOUT_SESSION_RESUME_CONTINUOUS: 'workout/session-resume-continuous',
  WORKOUT_SESSION_REVIEW_CONTINUOUS: 'workout/session-review-continuous',
  WORKOUT_SESSION_COMPLETE_CONTINUOUS: 'workout/session-complete-continuous',
  WORKOUT_SESSION_UPDATE_CONTINUOUS: 'workout/session-update-continuous',
  WORKOUT_SESSION_CANCEL_CONTINUOUS: 'workout/session-cancel-continuous',
  WORKOUT_SESSION_CONTINUE_REST: 'workout/session-continue-rest',
  WORKOUT_CONTINUE_AFTER_REST: 'workout/session-continue-rest',
  WORKOUT_SESSION_SKIP_EXERCISE: 'workout/session-skip-exercise',
  WORKOUT_SKIP_EXERCISE: 'workout/session-skip-exercise',
  TIMER_START: 'timer/start',
  TIMER_PAUSE: 'timer/pause',
  TIMER_RESUME: 'timer/resume',
  TIMER_ADD_SECONDS: 'timer/add-seconds',
  TIMER_CANCEL: 'timer/cancel',
  TIMER_FINISH: 'timer/finish',
  UNDO_DELETE: 'undo/delete',
});

function getPayload(action) {
  return action?.payload && typeof action.payload === 'object' ? action.payload : action ?? {};
}

function updateWorkoutById(state, id, updater) {
  let changed = false;
  const workouts = state.workouts.map((workout) => {
    if (workout.id !== id) return workout;
    const next = updater(workout);
    changed ||= next !== workout;
    return next;
  });
  return changed ? withWorkouts(state, workouts) : state;
}

function withWorkouts(state, workouts) {
  const activeContinuousSession = state.activeContinuousSession;
  const sessionWorkout = activeContinuousSession
    ? workouts.find((workout) => (
      workout.id === activeContinuousSession.workoutId && workout.status === 'planned'
    ))
    : null;
  const sessionExercise = sessionWorkout?.exercises.find((exercise) => (
    exercise.id === activeContinuousSession.exerciseId && exercise.structure === 'continuous'
  ));
  return {
    ...state,
    workouts,
    activeTimer: normalizeActiveTimerForWorkouts(state.activeTimer, workouts),
    activeContinuousSession: sessionExercise ? activeContinuousSession : null,
  };
}

function replaceSeries(state, seriesId, replacements, workouts = state.workouts) {
  return withWorkouts({
    ...state,
    series: [
      ...state.series.filter((series) => series.id !== seriesId),
      ...replacements.filter(Boolean),
    ],
  }, workouts);
}

function finishTimedSet(state, payload, { requireExpiry = false } = {}) {
  const timer = normalizeActiveTimerForWorkouts(state.activeTimer, state.workouts);
  if (!timer || timer.phase !== 'work') return state;
  const elapsedSeconds = getTimerElapsedSeconds(timer, payload.now);
  if (requireExpiry && elapsedSeconds < timer.initialSeconds) return state;
  const measuredValue = Number.isInteger(Number(payload.actualValue))
    ? Number(payload.actualValue)
    : elapsedSeconds;
  const actualValue = requireExpiry ? measuredValue : Math.max(1, measuredValue);
  if (actualValue < 1 || actualValue > timer.initialSeconds) return state;

  const target = state.workouts.find((workout) => workout.id === timer.workoutId);
  const exercise = target?.exercises.find((item) => item.id === timer.exerciseId);
  if (!target || !exercise) return state;
  const nextWorkout = completeWorkoutSet(
    target,
    exercise.id,
    timer.setIndex,
    { actualValue, completedAt: payload.now },
  );
  if (nextWorkout === target) return state;

  const workouts = state.workouts.map((workout) => (
    workout.id === target.id ? nextWorkout : workout
  ));
  const nextPendingSet = findFirstPendingWorkoutSet(nextWorkout);
  const activeTimer = nextPendingSet && Number(exercise.restSeconds) > 0
    ? startRestTimer(exercise.restSeconds, {
      now: payload.now,
      workoutId: target.id,
      exerciseId: exercise.id,
    })
    : null;
  return {
    ...withWorkouts(state, workouts),
    activeTimer,
  };
}

/**
 * Pure state transition function used by React.useReducer.
 * IDs/timestamps can be supplied in action payloads for deterministic tests.
 * @param {import('../domain/model.js').AppStateV3} currentState
 * @param {{type: string, payload?: object}} action
 */
export function appReducer(currentState, action) {
  const state = currentState?.schemaVersion === SCHEMA_VERSION
    ? currentState
    : normalizeAppState(currentState);
  const payload = getPayload(action);

  switch (action?.type) {
    case ActionTypes.REPLACE_STATE:
      return normalizeAppState(payload.state ?? payload);

    case ActionTypes.SETTINGS_UPDATE:
      return {
        ...state,
        settings: normalizeSettings({ ...state.settings, ...(payload.settings ?? payload) }),
      };

    case ActionTypes.WORKOUT_ADD: {
      const workout = normalizeWorkout(payload.workout ?? payload, payload.options);
      return withWorkouts(state, [...state.workouts, workout]);
    }

    case ActionTypes.WORKOUT_UPDATE:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        updatePlannedWorkout(workout, payload.patch ?? payload.changes ?? {})
      ));

    case ActionTypes.WORKOUT_DUPLICATE: {
      const source = state.workouts.find((workout) => workout.id === (payload.id ?? payload.workoutId));
      if (!source) return state;
      const duplicate = duplicateWorkout(source, payload.overrides ?? {}, payload.options ?? {});
      return withWorkouts(state, [...state.workouts, duplicate]);
    }

    case ActionTypes.WORKOUT_RESCHEDULE:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        rescheduleWorkout(workout, payload.plannedDate)
      ));

    case ActionTypes.WORKOUT_TOGGLE_SET:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        toggleWorkoutSet(workout, payload.exerciseId, payload.index)
      ));

    case ActionTypes.WORKOUT_UPDATE_RESULT:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        updateWorkoutResultDraft(workout, payload.result ?? payload)
      ));

    case ActionTypes.WORKOUT_COMPLETE:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        completeWorkout(workout, { ...payload, ...(payload.result ?? {}) })
      ));

    case ActionTypes.WORKOUT_CORRECT_RESULT:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        correctWorkoutResult(workout, payload.correction ?? payload)
      ));

    case ActionTypes.WORKOUT_SKIP:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, skipWorkout);

    case ActionTypes.WORKOUT_DELETE: {
      const id = payload.id ?? payload.workoutId;
      const target = state.workouts.find((workout) => workout.id === id);
      if (!target) return state;
      let series = state.series;
      if (target.seriesId) {
        series = series.map((item) => item.id === target.seriesId
          ? {
            ...item,
            excludedOccurrenceDates: [...new Set([
              ...item.excludedOccurrenceDates,
              target.occurrenceDate,
            ])].sort(),
          }
          : item);
      }
      return withWorkouts({ ...state, series }, state.workouts.filter((workout) => workout.id !== id));
    }

    case ActionTypes.SERIES_ADD: {
      const series = normalizeSeries(payload.series ?? payload, payload.options);
      const existingSeries = state.series.filter((item) => item.id !== series.id);
      const workouts = materializeSeries(series, {
        ...(payload.options ?? {}),
        existingWorkouts: state.workouts,
      });
      return withWorkouts(
        { ...state, series: [...existingSeries, series] },
        [...state.workouts, ...workouts],
      );
    }

    case ActionTypes.SERIES_MATERIALIZE: {
      const series = state.series.find((item) => item.id === (payload.id ?? payload.seriesId));
      if (!series) return state;
      const created = materializeSeries(series, {
        ...(payload.options ?? {}),
        from: payload.from,
        through: payload.through,
        existingWorkouts: state.workouts,
      });
      return created.length ? withWorkouts(state, [...state.workouts, ...created]) : state;
    }

    case ActionTypes.SERIES_UPDATE_ONE:
      return updateWorkoutById(state, payload.workoutId ?? payload.id, (workout) => (
        updatePlannedWorkout(workout, payload.patch ?? payload.changes ?? {})
      ));

    case ActionTypes.SERIES_UPDATE_FOLLOWING: {
      const seriesId = payload.seriesId ?? payload.id;
      const series = state.series.find((item) => item.id === seriesId);
      if (!series) return state;
      const split = splitSeriesAndFollowing(
        series,
        state.workouts,
        payload.occurrenceDate,
        payload.changes ?? payload.patch ?? {},
        payload.options ?? {},
      );
      return replaceSeries(state, seriesId, [split.oldSeries, split.newSeries], split.workouts);
    }

    case ActionTypes.SERIES_DELETE_ONE: {
      const workout = state.workouts.find((item) => item.id === (payload.workoutId ?? payload.id));
      if (!workout) return state;
      const series = state.series.find((item) => item.id === workout.seriesId);
      if (!series) {
        return withWorkouts(state, state.workouts.filter((item) => item.id !== workout.id));
      }
      const result = excludeSeriesOccurrence(series, state.workouts, workout.occurrenceDate);
      return replaceSeries(
        state,
        series.id,
        [result.series],
        result.workouts.filter((item) => item.id !== workout.id),
      );
    }

    case ActionTypes.SERIES_DELETE_FOLLOWING: {
      const seriesId = payload.seriesId ?? payload.id;
      const series = state.series.find((item) => item.id === seriesId);
      if (!series) return state;
      const result = deleteSeriesAndFollowing(series, state.workouts, payload.occurrenceDate);
      return replaceSeries(state, seriesId, [result.series], result.workouts);
    }

    case ActionTypes.TEMPLATE_ADD: {
      const template = normalizeTemplate(payload.template ?? payload, payload.options);
      return {
        ...state,
        templates: [...state.templates.filter((item) => item.id !== template.id), template],
      };
    }

    case ActionTypes.TEMPLATE_UPDATE: {
      const id = payload.id ?? payload.templateId;
      return {
        ...state,
        templates: state.templates.map((template) => template.id === id
          ? updateTemplate(template, payload.patch ?? payload.changes ?? {})
          : template),
      };
    }

    case ActionTypes.TEMPLATE_DELETE:
      return {
        ...state,
        templates: state.templates.filter((template) => template.id !== (payload.id ?? payload.templateId)),
      };

    case ActionTypes.TEMPLATE_APPLY: {
      const template = state.templates.find((item) => item.id === (payload.id ?? payload.templateId));
      if (!template) return state;
      const workout = applyTemplate(template, payload.overrides ?? payload, payload.options ?? {});
      return withWorkouts(state, [...state.workouts, workout]);
    }

    case ActionTypes.CUSTOM_EXERCISE_ADD: {
      const exercise = normalizeCustomExercise(
        payload.exercise ?? payload,
        payload.options ?? { now: payload.now },
      );
      if (state.customExercises.some((item) => item.id === exercise.id)) return state;
      return { ...state, customExercises: [...state.customExercises, exercise] };
    }

    case ActionTypes.CUSTOM_EXERCISE_UPDATE: {
      const id = payload.id ?? payload.exerciseId;
      const existing = state.customExercises.find((item) => item.id === id);
      if (!existing) return state;
      const exercise = normalizeCustomExercise({
        ...existing,
        ...(payload.patch ?? payload.changes ?? {}),
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: payload.now ?? payload.updatedAt ?? existing.updatedAt,
      }, payload.options ?? { now: payload.now });
      if (JSON.stringify(exercise) === JSON.stringify(existing)) return state;
      return {
        ...state,
        customExercises: state.customExercises.map((item) => item.id === id ? exercise : item),
      };
    }

    case ActionTypes.CUSTOM_EXERCISE_DELETE: {
      const id = payload.id ?? payload.exerciseId;
      if (!state.customExercises.some((item) => item.id === id)) return state;
      return {
        ...state,
        customExercises: state.customExercises.filter((item) => item.id !== id),
      };
    }

    case ActionTypes.BODY_WEIGHT_UPSERT: {
      const entry = normalizeBodyWeightEntry(payload.entry ?? payload, { now: payload.now });
      if (!entry) return state;
      return {
        ...state,
        bodyWeightEntries: [
          ...state.bodyWeightEntries.filter((item) => item.date !== entry.date),
          entry,
        ].sort((left, right) => left.date.localeCompare(right.date)),
      };
    }

    case ActionTypes.BODY_WEIGHT_DELETE: {
      const date = payload.date;
      if (!isCalendarDate(date)) return state;
      return {
        ...state,
        bodyWeightEntries: state.bodyWeightEntries.filter((entry) => entry.date !== date),
      };
    }

    case ActionTypes.WORKOUT_SESSION_START:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        startWorkoutSession(workout, payload.now ?? payload.startedAt)
      ));

    case ActionTypes.WORKOUT_SESSION_UPDATE_SET:
      return updateWorkoutById(state, payload.id ?? payload.workoutId, (workout) => (
        updateWorkoutSetResult(
          workout,
          payload.exerciseId,
          payload.setIndex ?? (Number(payload.setNumber) - 1),
          payload.patch ?? payload.result ?? payload.values ?? {},
        )
      ));

    case ActionTypes.WORKOUT_SESSION_COMPLETE_SET: {
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      if (!target || target.status !== 'planned') return state;
      const exercise = target.exercises.find((item) => item.id === payload.exerciseId);
      if (!exercise) return state;
      const result = payload.result
        ?? payload.values
        ?? getPlannedBodyweightSetResult(exercise);
      const nextWorkout = completeWorkoutSet(
        target,
        exercise.id,
        payload.setIndex ?? (Number(payload.setNumber) - 1),
        {
          ...result,
          completedAt: result.completedAt ?? payload.now,
        },
      );
      if (nextWorkout === target) return state;
      const workouts = state.workouts.map((workout) => (
        workout.id === workoutId ? nextWorkout : workout
      ));
      const nextPendingSet = findFirstPendingWorkoutSet(nextWorkout);
      const shouldStartRest = payload.skipRest !== true
        && Boolean(nextPendingSet)
        && Number(exercise.restSeconds) > 0;
      return {
        ...withWorkouts(state, workouts),
        activeTimer: shouldStartRest
          ? startRestTimer(exercise.restSeconds, {
            ...payload,
            workoutId,
            exerciseId: exercise.id,
          })
          : null,
      };
    }

    case ActionTypes.WORKOUT_SESSION_START_TIMED_SET: {
      const activeTimerBlocksStart = state.activeTimer && state.activeTimer.phase !== 'rest';
      if (activeTimerBlocksStart || state.activeContinuousSession) return state;
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      const exercise = target?.exercises.find((item) => item.id === payload.exerciseId);
      const setIndex = Number(payload.setIndex ?? (Number(payload.setNumber) - 1));
      if (
        !target
        || target.status !== 'planned'
        || exercise?.structure !== 'sets'
        || exercise?.target?.kind !== 'duration'
        || !Number.isInteger(setIndex)
        || exercise.setResults?.[setIndex]?.status !== 'pending'
      ) return state;
      const startedWorkout = startWorkoutSession(target, payload.now);
      if (!startedWorkout.startedAt) return state;
      const activeTimer = startWorkTimer(exercise.target.value, {
        ...payload,
        workoutId,
        exerciseId: exercise.id,
        setIndex,
      });
      if (!activeTimer) return state;
      const workouts = startedWorkout === target
        ? state.workouts
        : state.workouts.map((workout) => workout.id === workoutId ? startedWorkout : workout);
      return { ...withWorkouts(state, workouts), activeTimer };
    }

    case ActionTypes.WORKOUT_SESSION_FINISH_TIMED_SET:
      return finishTimedSet(state, payload);

    case ActionTypes.WORKOUT_SESSION_START_CONTINUOUS: {
      if (state.activeTimer || state.activeContinuousSession) return state;
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      const exercise = target?.exercises.find((item) => item.id === payload.exerciseId);
      if (
        !target
        || target.status !== 'planned'
        || exercise?.structure !== 'continuous'
        || exercise.continuousResult?.status !== 'pending'
      ) return state;
      const startedWorkout = startWorkoutSession(target, payload.now);
      const activeContinuousSession = createContinuousSession(
        workoutId,
        exercise.id,
        payload.now,
      );
      if (!startedWorkout.startedAt || !activeContinuousSession) return state;
      const workouts = startedWorkout === target
        ? state.workouts
        : state.workouts.map((workout) => workout.id === workoutId ? startedWorkout : workout);
      return { ...withWorkouts(state, workouts), activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_CONTINUOUS_GPS_READY: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = activateContinuousSession(session, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_CONTINUOUS_ACCEPT_DELTA: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = acceptContinuousDelta(session, payload.deltaMeters, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_CONTINUOUS_TICK: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = tickContinuousSession(session, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_PAUSE_CONTINUOUS: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = pauseContinuousSession(session, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_RESUME_CONTINUOUS: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = resumeContinuousSession(session, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_REVIEW_CONTINUOUS: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      const activeContinuousSession = reviewContinuousSession(session, payload.now);
      return activeContinuousSession === session ? state : { ...state, activeContinuousSession };
    }

    case ActionTypes.WORKOUT_SESSION_COMPLETE_CONTINUOUS: {
      const session = state.activeContinuousSession;
      const workoutId = payload.workoutId ?? session?.workoutId;
      const exerciseId = payload.exerciseId ?? session?.exerciseId;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      const exercise = target?.exercises.find((item) => item.id === exerciseId);
      if (!target || !exercise || (session && (
        session.workoutId !== workoutId || session.exerciseId !== exerciseId
      ))) return state;
      const result = buildContinuousResult(exercise, session, payload, payload.now);
      if (!result) return state;
      const nextWorkout = completeContinuousExercise(target, exerciseId, result);
      if (nextWorkout === target) return state;
      const workouts = state.workouts.map((workout) => workout.id === workoutId ? nextWorkout : workout);
      return { ...withWorkouts(state, workouts), activeContinuousSession: null };
    }

    case ActionTypes.WORKOUT_SESSION_UPDATE_CONTINUOUS: {
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      const exercise = target?.exercises.find((item) => item.id === payload.exerciseId);
      if (!target || exercise?.structure !== 'continuous' || exercise.continuousResult?.status !== 'completed') return state;
      const distanceMeters = Number(payload.distanceMeters ?? exercise.continuousResult.distanceMeters);
      const activeDurationSeconds = Number(payload.activeDurationSeconds ?? exercise.continuousResult.activeDurationSeconds);
      const actualValue = exercise.target.kind === 'distance' ? distanceMeters : activeDurationSeconds;
      const averagePaceSecondsPerKm = distanceMeters > 0 && activeDurationSeconds > 0
        ? Math.round(activeDurationSeconds / (distanceMeters / 1_000))
        : null;
      const nextWorkout = updateContinuousExerciseResult(target, exercise.id, {
        actualValue,
        distanceMeters: distanceMeters > 0 ? distanceMeters : null,
        activeDurationSeconds: activeDurationSeconds > 0 ? activeDurationSeconds : null,
        averagePaceSecondsPerKm,
      });
      if (nextWorkout === target) return state;
      const workouts = state.workouts.map((workout) => workout.id === workoutId ? nextWorkout : workout);
      return withWorkouts(state, workouts);
    }

    case ActionTypes.WORKOUT_SESSION_CANCEL_CONTINUOUS: {
      const session = state.activeContinuousSession;
      if (!session || (payload.workoutId && payload.workoutId !== session.workoutId)) return state;
      return { ...state, activeContinuousSession: null };
    }

    case ActionTypes.WORKOUT_SESSION_CONTINUE_REST: {
      const workoutId = payload.workoutId ?? payload.id;
      if (!state.activeTimer || state.activeTimer.workoutId !== workoutId) return state;
      return { ...state, activeTimer: null };
    }

    case ActionTypes.WORKOUT_SESSION_SKIP_EXERCISE: {
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      if (!target) return state;
      const nextWorkout = skipRemainingExerciseSets(target, payload.exerciseId);
      if (nextWorkout === target) return state;
      const workouts = state.workouts.map((workout) => (
        workout.id === workoutId ? nextWorkout : workout
      ));
      const timerMatchesExercise = state.activeTimer?.workoutId === workoutId
        && state.activeTimer?.exerciseId === payload.exerciseId;
      return {
        ...withWorkouts(state, workouts),
        activeTimer: timerMatchesExercise ? null : state.activeTimer,
        activeContinuousSession: state.activeContinuousSession?.workoutId === workoutId
          && state.activeContinuousSession?.exerciseId === payload.exerciseId
          ? null
          : state.activeContinuousSession,
      };
    }

    case ActionTypes.WORKOUT_START_REST: {
      const workoutId = payload.workoutId ?? payload.id;
      const target = state.workouts.find((workout) => workout.id === workoutId);
      if (!target || target.status !== 'planned') return state;

      const exercise = target.exercises.find((item) => item.id === payload.exerciseId);
      if (!exercise) return state;

      const activeTimer = startRestTimer(exercise.restSeconds, {
        ...payload,
        workoutId,
        exerciseId: exercise.id,
      });
      const nextWorkout = completeNextWorkoutSet(target, exercise.id, {
        completedAt: payload.now,
      });
      if (nextWorkout === target && !activeTimer) return state;
      const workouts = nextWorkout === target
        ? state.workouts
        : state.workouts.map((workout) => (workout.id === workoutId ? nextWorkout : workout));

      return {
        ...withWorkouts(state, workouts),
        activeTimer,
      };
    }

    case ActionTypes.TIMER_START:
      return {
        ...state,
        activeTimer: startRestTimer(payload.seconds, payload),
      };

    case ActionTypes.TIMER_PAUSE:
      return { ...state, activeTimer: pauseRestTimer(state.activeTimer, payload.now) };

    case ActionTypes.TIMER_RESUME:
      return { ...state, activeTimer: resumeRestTimer(state.activeTimer, payload.now) };

    case ActionTypes.TIMER_ADD_SECONDS:
      return {
        ...state,
        activeTimer: addRestTimerSeconds(state.activeTimer, payload.seconds ?? 30, payload.now),
      };

    case ActionTypes.TIMER_CANCEL:
      return { ...state, activeTimer: null };

    case ActionTypes.TIMER_FINISH:
      if (!state.activeTimer) return state;
      if (state.activeTimer.phase === 'work') {
        return finishTimedSet(state, payload, { requireExpiry: true });
      }
      if (state.activeTimer.workoutId) {
        const validTimer = normalizeActiveTimerForWorkouts(state.activeTimer, state.workouts);
        return validTimer ? state : { ...state, activeTimer: null };
      }
      return { ...state, activeTimer: null };

    case ActionTypes.UNDO_DELETE:
      return restoreDeletionSnapshot(state, payload.snapshot ?? payload, {
        now: payload.now,
        ignoreExpiry: payload.ignoreExpiry,
      });

    default:
      return state;
  }
}

export const reducer = appReducer;
