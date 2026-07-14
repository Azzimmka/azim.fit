import { isCalendarDate } from '../domain/dates.js';
import {
  deleteSeriesAndFollowing,
  excludeSeriesOccurrence,
  materializeSeries,
  splitSeriesAndFollowing,
} from '../domain/recurrence.js';
import { pruneDeliveredReminderKeys } from '../domain/reminders.js';
import {
  normalizeAppState,
  normalizeBodyWeightEntry,
  normalizeSeries,
  normalizeSettings,
  normalizeTemplate,
  normalizeWorkout,
} from '../domain/schema.js';
import { updateTemplate } from '../domain/templates.js';
import {
  addRestTimerSeconds,
  normalizeActiveTimerForWorkouts,
  pauseRestTimer,
  resumeRestTimer,
  startRestTimer,
} from '../domain/timer.js';
import {
  applyTemplate,
  completeWorkoutSet,
  completeNextWorkoutSet,
  completeWorkout,
  correctWorkoutResult,
  duplicateWorkout,
  rescheduleWorkout,
  skipRemainingExerciseSets,
  skipWorkout,
  startWorkoutSession,
  toggleWorkoutSet,
  updateWorkoutSetResult,
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
  BODY_WEIGHT_UPSERT: 'body-weight/upsert',
  BODY_WEIGHT_DELETE: 'body-weight/delete',
  SETTINGS_UPDATE: 'settings/update',
  REMINDER_MARK_DELIVERED: 'reminder/mark-delivered',
  REMINDER_PRUNE: 'reminder/prune',
  WORKOUT_START_REST: 'workout/start-rest',
  WORKOUT_SESSION_START: 'workout/session-start',
  WORKOUT_START_SESSION: 'workout/session-start',
  WORKOUT_SESSION_UPDATE_SET: 'workout/session-update-set',
  WORKOUT_UPDATE_SET: 'workout/session-update-set',
  WORKOUT_SESSION_COMPLETE_SET: 'workout/session-complete-set',
  WORKOUT_COMPLETE_SET: 'workout/session-complete-set',
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
  return {
    ...state,
    workouts,
    activeTimer: normalizeActiveTimerForWorkouts(state.activeTimer, workouts),
    settings: {
      ...state.settings,
      deliveredReminderKeys: pruneDeliveredReminderKeys(
        state.settings.deliveredReminderKeys,
        workouts,
      ),
    },
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

/**
 * Pure state transition function used by React.useReducer.
 * IDs/timestamps can be supplied in action payloads for deterministic tests.
 * @param {import('../domain/model.js').AppStateV2} currentState
 * @param {{type: string, payload?: object}} action
 */
export function appReducer(currentState, action) {
  const state = currentState?.schemaVersion === 2
    ? currentState
    : normalizeAppState(currentState);
  const payload = getPayload(action);

  switch (action?.type) {
    case ActionTypes.REPLACE_STATE:
      return normalizeAppState(payload.state ?? payload);

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

    case ActionTypes.SETTINGS_UPDATE:
      return {
        ...state,
        settings: normalizeSettings({ ...state.settings, ...(payload.patch ?? payload) }),
      };

    case ActionTypes.REMINDER_MARK_DELIVERED: {
      if (!payload.key) return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          deliveredReminderKeys: [...new Set([
            ...state.settings.deliveredReminderKeys,
            payload.key,
          ])],
        },
      };
    }

    case ActionTypes.REMINDER_PRUNE:
      return {
        ...state,
        settings: {
          ...state.settings,
          deliveredReminderKeys: pruneDeliveredReminderKeys(
            state.settings.deliveredReminderKeys,
            state.workouts,
          ),
        },
      };

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
      const result = payload.result ?? payload.values ?? {};
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
      return {
        ...withWorkouts(state, workouts),
        activeTimer: payload.skipRest === true
          ? null
          : startRestTimer(exercise.restSeconds, {
            ...payload,
            workoutId,
            exerciseId: exercise.id,
          }),
      };
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
      return state.activeTimer ? { ...state, activeTimer: null } : state;

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
