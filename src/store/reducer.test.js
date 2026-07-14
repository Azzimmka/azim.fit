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
  it('updates one aggregate exercise result while planned', () => {
    const workout = normalizeWorkout({
      id: 'w',
      title: 'Тест',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'e', name: 'Жим', sets: 3, plannedReps: '10' }],
    });
    const state = { ...createEmptyAppState(), workouts: [workout] };
    const next = appReducer(state, {
      type: ActionTypes.WORKOUT_UPDATE_RESULT,
      payload: {
        workoutId: 'w',
        result: {
          resultNotes: 'Черновик',
          exercises: [{ id: 'e', completedSets: 2, actualWeightKg: 75, actualReps: 8, rpe: 8.5 }],
        },
      },
    });

    expect(next.workouts[0].exercises[0]).toMatchObject({
      name: 'Жим',
      sets: 3,
      plannedReps: '10',
      completedSets: 2,
      actualWeightKg: 75,
      actualReps: 8,
      rpe: 8.5,
    });
    expect(next.workouts[0].resultNotes).toBe('Черновик');
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

  it('does not mark a set or start rest for invalid targets and disabled rest', () => {
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
    expect(appReducer(state, {
      type: ActionTypes.WORKOUT_START_REST,
      payload: { workoutId: 'planned-workout', exerciseId: 'plank' },
    })).toBe(state);
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
