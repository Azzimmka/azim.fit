import { describe, expect, it } from 'vitest';
import { normalizeSeries, normalizeWorkout, createEmptyAppState } from '../domain/schema.js';
import { materializeSeries } from '../domain/recurrence.js';
import { ActionTypes, appReducer } from './reducer.js';
import { createDeletionSnapshot } from './undo.js';

function sequentialIds() {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

describe('appReducer', () => {
  it('updates only the selected per-set result and preserves note whitespace', () => {
    const workout = normalizeWorkout({
      id: 'w',
      title: 'Тест',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'e',
        name: 'Жим',
        sets: 3,
        plannedReps: '10',
        setResults: [
          { status: 'completed', weightKg: 70, reps: 10, rpe: 7 },
          { status: 'completed', weightKg: 75, reps: 8, rpe: 8 },
          { status: 'skipped' },
        ],
      }],
    });
    const state = { ...createEmptyAppState(), workouts: [workout] };
    const next = appReducer(state, {
      type: ActionTypes.WORKOUT_UPDATE_RESULT,
      payload: {
        workoutId: 'w',
        result: {
          resultNotes: 'Черновик ',
          exercises: [{
            id: 'e', setIndex: 1, actualWeightKg: 77.5, actualReps: 7, rpe: 8.5,
          }],
        },
      },
    });

    expect(next.workouts[0].exercises[0].setResults).toEqual([
      expect.objectContaining({ status: 'completed', weightKg: 70, reps: 10, rpe: 7 }),
      expect.objectContaining({ status: 'completed', weightKg: 77.5, reps: 7, rpe: 8.5 }),
      expect.objectContaining({ status: 'skipped', weightKg: null, reps: null, rpe: null }),
    ]);
    expect(next.workouts[0].exercises[0]).toMatchObject({
      name: 'Жим',
      sets: 3,
      plannedReps: '10',
      completedSets: 2,
      actualWeightKg: 77.5,
      actualReps: 7,
      rpe: 8.5,
    });
    expect(next.workouts[0].resultNotes).toBe('Черновик ');
  });

  it('atomically marks the next set and starts rest without exceeding the plan', () => {
    const workout = normalizeWorkout({
      id: 'rest-workout',
      title: 'Ноги',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'squat',
        name: 'Приседания',
        sets: 3,
        completedSets: 0,
        restSeconds: 90,
      }],
    });
    let state = { ...createEmptyAppState(), workouts: [workout] };

    for (let completedSets = 1; completedSets <= 4; completedSets += 1) {
      state = appReducer(state, {
        type: ActionTypes.WORKOUT_START_REST,
        payload: {
          workoutId: 'rest-workout',
          exerciseId: 'squat',
          now: `2026-07-13T10:0${completedSets}:00.000Z`,
        },
      });
      expect(state.workouts[0].exercises[0].completedSets).toBe(Math.min(completedSets, 3));
    }

    expect(state.activeTimer).toMatchObject({
      status: 'running',
      initialSeconds: 90,
      workoutId: 'rest-workout',
      exerciseId: 'squat',
      endsAt: '2026-07-13T10:05:30.000Z',
    });
  });

  it('rejects invalid rest targets and still marks a set when rest is disabled', () => {
    const completed = normalizeWorkout({
      id: 'completed-workout',
      status: 'completed',
      plannedDate: '2026-07-13',
      completedAt: '2026-07-13T09:00:00.000Z',
      exercises: [{ id: 'press', name: 'Жим', sets: 3, completedSets: 3, restSeconds: 90 }],
    });
    const planned = normalizeWorkout({
      id: 'planned-workout',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'plank', name: 'Планка', sets: 3, completedSets: 0, restSeconds: 0 }],
    });
    const state = { ...createEmptyAppState(), workouts: [completed, planned] };

    expect(appReducer(state, {
      type: ActionTypes.WORKOUT_START_REST,
      payload: { workoutId: 'completed-workout', exerciseId: 'press' },
    })).toBe(state);
    expect(appReducer(state, {
      type: ActionTypes.WORKOUT_START_REST,
      payload: { workoutId: 'planned-workout', exerciseId: 'missing' },
    })).toBe(state);
    const withoutRest = appReducer(state, {
      type: ActionTypes.WORKOUT_START_REST,
      payload: {
        workoutId: 'planned-workout',
        exerciseId: 'plank',
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    expect(withoutRest.workouts[1].exercises[0].completedSets).toBe(1);
    expect(withoutRest.activeTimer).toBeNull();
  });

  it('runs active-session set completion atomically and idempotently', () => {
    const workout = normalizeWorkout({
      id: 'session',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'press', name: 'Жим', sets: 2, restSeconds: 90 }],
    });
    let state = { ...createEmptyAppState(), workouts: [workout] };
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_START,
      payload: { workoutId: 'session', now: '2026-07-13T10:00:00.000Z' },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE_SET,
      payload: {
        workoutId: 'session',
        exerciseId: 'press',
        setIndex: 0,
        result: { weightKg: 80, reps: 8, rpe: 8 },
        now: '2026-07-13T10:01:00.000Z',
      },
    });
    const afterFirst = state;
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE_SET,
      payload: {
        workoutId: 'session',
        exerciseId: 'press',
        setIndex: 0,
        result: { weightKg: 100, reps: 1 },
        now: '2026-07-13T10:02:00.000Z',
      },
    });

    expect(afterFirst.workouts[0]).toMatchObject({
      startedAt: '2026-07-13T10:00:00.000Z',
      exercises: [{ completedSets: 1, actualWeightKg: 80, actualReps: 8 }],
    });
    expect(afterFirst.activeTimer.endsAt).toBe('2026-07-13T10:02:30.000Z');
    expect(state).toBe(afterFirst);
  });

  it('completes a set with rest zero and rejects invalid set values', () => {
    const workout = normalizeWorkout({
      id: 'session-zero',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'plank', name: 'Планка', sets: 1, restSeconds: 0 }],
    });
    const state = { ...createEmptyAppState(), workouts: [workout] };
    const invalid = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE_SET,
      payload: {
        workoutId: 'session-zero',
        exerciseId: 'plank',
        setIndex: 0,
        result: { reps: 0 },
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    const completed = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE_SET,
      payload: {
        workoutId: 'session-zero',
        exerciseId: 'plank',
        setIndex: 0,
        result: { reps: 45 },
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    expect(invalid).toBe(state);
    expect(completed.workouts[0].exercises[0].completedSets).toBe(1);
    expect(completed.activeTimer).toBeNull();
  });

  it('corrects a skipped set without starting rest when skipRest is requested', () => {
    const workout = normalizeWorkout({
      id: 'session-correction',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'press',
        name: 'Жим',
        sets: 1,
        restSeconds: 90,
        setResults: [{ status: 'skipped' }],
      }],
    });
    const state = { ...createEmptyAppState(), workouts: [workout] };
    const corrected = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE_SET,
      payload: {
        workoutId: 'session-correction',
        exerciseId: 'press',
        setIndex: 0,
        result: { weightKg: 80, reps: 8, rpe: 8 },
        now: '2026-07-13T10:00:00.000Z',
        skipRest: true,
      },
    });

    expect(corrected.workouts[0].exercises[0]).toMatchObject({
      completedSets: 1,
      actualWeightKg: 80,
      actualReps: 8,
    });
    expect(corrected.workouts[0].exercises[0].setResults[0].status).toBe('completed');
    expect(corrected.activeTimer).toBeNull();
  });

  it('skips pending sets, requires resolved session results, and finishes timer separately', () => {
    const workout = normalizeWorkout({
      id: 'session-skip',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'row', name: 'Тяга', sets: 2 }],
    });
    let state = { ...createEmptyAppState(), workouts: [workout] };
    const rejected = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE,
      payload: {
        workoutId: 'session-skip',
        completedAt: '2026-07-13T10:00:00.000Z',
        requireResolvedSets: true,
      },
    });
    expect(rejected).toBe(state);

    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SKIP_EXERCISE,
      payload: { workoutId: 'session-skip', exerciseId: 'row' },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE,
      payload: {
        workoutId: 'session-skip',
        completedAt: '2026-07-13T10:00:00.000Z',
        requireResolvedSets: true,
      },
    });
    expect(state.workouts[0].status).toBe('completed');

    const withTimer = {
      ...state,
      activeTimer: {
        status: 'running',
        endsAt: '2026-07-13T10:01:00.000Z',
        remainingSeconds: null,
        initialSeconds: 60,
        workoutId: 'session-skip',
        exerciseId: 'row',
      },
    };
    expect(appReducer(withTimer, { type: ActionTypes.TIMER_FINISH }).activeTimer).toBeNull();
  });

  it('does not start a future workout session', () => {
    const workout = normalizeWorkout({
      id: 'future-session',
      status: 'planned',
      plannedDate: '2026-07-14',
      exercises: [],
    });
    const state = { ...createEmptyAppState(), workouts: [workout] };
    expect(appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_START,
      payload: { workoutId: 'future-session', now: '2026-07-13T10:00:00.000Z' },
    })).toBe(state);
  });

  it('clears linked timers on replacement and workout deletion but keeps standalone timers', () => {
    const workout = normalizeWorkout({
      id: 'timer-workout',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'press', name: 'Жим', sets: 1 }],
    });
    const linkedTimer = {
      status: 'running',
      endsAt: '2026-07-13T10:01:30.000Z',
      remainingSeconds: null,
      initialSeconds: 90,
      workoutId: 'timer-workout',
      exerciseId: 'press',
    };
    const state = { ...createEmptyAppState(), workouts: [workout], activeTimer: linkedTimer };

    const deleted = appReducer(state, {
      type: ActionTypes.WORKOUT_DELETE,
      payload: { workoutId: 'timer-workout' },
    });
    expect(deleted.activeTimer).toBeNull();

    const replaced = appReducer(state, {
      type: ActionTypes.REPLACE_STATE,
      payload: {
        state: {
          ...state,
          activeTimer: { ...linkedTimer, exerciseId: 'missing' },
        },
      },
    });
    expect(replaced.activeTimer).toBeNull();

    const standalone = appReducer({
      ...state,
      activeTimer: { ...linkedTimer, workoutId: null, exerciseId: null },
    }, {
      type: ActionTypes.WORKOUT_DELETE,
      payload: { workoutId: 'timer-workout' },
    });
    expect(standalone.activeTimer).toMatchObject({ workoutId: null, exerciseId: null });
  });

  it('rejects future completion and permits late completion without moving plannedDate', () => {
    const future = normalizeWorkout({
      id: 'future',
      status: 'planned',
      plannedDate: '2026-07-14',
      exercises: [{ id: 'e1', name: 'A', sets: 1, completedSets: 1 }],
    });
    const late = normalizeWorkout({
      id: 'late',
      status: 'planned',
      plannedDate: '2026-07-10',
      exercises: [{ id: 'e2', name: 'B', sets: 1, completedSets: 1 }],
    });
    let state = { ...createEmptyAppState(), workouts: [future, late] };
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE,
      payload: { workoutId: 'future', completedAt: '2026-07-13T10:00:00.000Z' },
    });
    expect(state.workouts[0].status).toBe('planned');
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_COMPLETE,
      payload: { workoutId: 'late', completedAt: '2026-07-13T10:00:00.000Z' },
    });
    expect(state.workouts[1]).toMatchObject({
      status: 'completed',
      plannedDate: '2026-07-10',
      completedAt: '2026-07-13T10:00:00.000Z',
      pointsAwarded: 25,
    });
  });

  it('upserts one body-weight entry per calendar date', () => {
    let state = createEmptyAppState();
    state = appReducer(state, {
      type: ActionTypes.BODY_WEIGHT_UPSERT,
      payload: { date: '2026-07-13', weightKg: 80, now: '2026-07-13T10:00:00.000Z' },
    });
    state = appReducer(state, {
      type: ActionTypes.BODY_WEIGHT_UPSERT,
      payload: { date: '2026-07-13', weightKg: 79.5, now: '2026-07-13T11:00:00.000Z' },
    });
    expect(state.bodyWeightEntries).toEqual([
      expect.objectContaining({ date: '2026-07-13', weightKg: 79.5 }),
    ]);
  });

  it('atomically restores removed workouts and the previous series boundary', () => {
    const idFactory = sequentialIds();
    const series = normalizeSeries({
      id: 'series-a',
      weekdays: [1],
      startsOn: '2026-07-13',
      endsOn: '2026-08-03',
      planSnapshot: {
        title: 'Понедельник',
        exercises: [{ id: 'plan-e', name: 'Присед', sets: 3 }],
      },
    }, { idFactory });
    const workouts = materializeSeries(series, { idFactory });
    const before = { ...createEmptyAppState(), series: [series], workouts };
    const after = appReducer(before, {
      type: ActionTypes.SERIES_DELETE_FOLLOWING,
      payload: { seriesId: 'series-a', occurrenceDate: '2026-07-20' },
    });
    const snapshot = createDeletionSnapshot(before, after, {
      now: '2026-07-13T10:00:00.000Z',
    });
    const restored = appReducer(after, {
      type: ActionTypes.UNDO_DELETE,
      payload: { snapshot, now: '2026-07-13T10:00:07.000Z' },
    });

    expect(after.series[0].endsOn).toBe('2026-07-19');
    expect(restored.series).toEqual(before.series);
    expect(restored.workouts).toEqual(before.workouts);
  });
});
