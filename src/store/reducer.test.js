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

  it('runs a timed set and atomically moves from work to rest on expiry', () => {
    const workout = normalizeWorkout({
      id: 'timed-session',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'plank',
        name: 'Планка',
        structure: 'sets',
        target: { kind: 'duration', value: 180, unit: 'seconds' },
        sets: 2,
        restSeconds: 60,
      }],
    });
    const initial = { ...createEmptyAppState(), workouts: [workout] };
    const running = appReducer(initial, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'timed-session',
        exerciseId: 'plank',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });

    expect(running.activeTimer).toMatchObject({
      phase: 'work',
      setIndex: 0,
      initialSeconds: 180,
      endsAt: '2026-07-13T10:03:00.000Z',
    });
    const rested = appReducer(running, {
      type: ActionTypes.TIMER_FINISH,
      payload: { now: '2026-07-13T10:03:00.000Z' },
    });
    expect(rested.workouts[0].exercises[0].setResults[0]).toMatchObject({
      status: 'completed',
      reps: null,
      actualValue: 180,
      completedAt: '2026-07-13T10:03:00.000Z',
    });
    expect(rested.activeTimer).toMatchObject({
      phase: 'rest',
      setIndex: null,
      initialSeconds: 60,
      endsAt: '2026-07-13T10:04:00.000Z',
    });
    expect(appReducer(rested, {
      type: ActionTypes.TIMER_FINISH,
      payload: { now: '2026-07-13T10:03:00.000Z' },
    })).toBe(rested);
  });

  it('stores actual elapsed seconds when a timed set finishes early', () => {
    const workout = normalizeWorkout({
      id: 'timed-early',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'plank',
        name: 'Планка',
        structure: 'sets',
        target: { kind: 'duration', value: 180, unit: 'seconds' },
        sets: 1,
        restSeconds: 60,
      }],
    });
    let state = appReducer({ ...createEmptyAppState(), workouts: [workout] }, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'timed-early',
        exerciseId: 'plank',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_FINISH_TIMED_SET,
      payload: { now: '2026-07-13T10:00:45.000Z' },
    });

    expect(state.workouts[0].exercises[0].setResults[0]).toMatchObject({
      status: 'completed',
      actualValue: 45,
    });
    expect(state.activeTimer).toBeNull();
  });

  it('atomically replaces another workout rest with a new timed set', () => {
    const source = normalizeWorkout({
      id: 'source-workout',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'source-plank',
        name: 'Планка',
        structure: 'sets',
        target: { kind: 'duration', value: 60, unit: 'seconds' },
        sets: 2,
        restSeconds: 90,
      }],
    });
    const target = normalizeWorkout({
      id: 'target-workout',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'target-plank',
        name: 'Боковая планка',
        structure: 'sets',
        target: { kind: 'duration', value: 120, unit: 'seconds' },
        sets: 1,
        restSeconds: 30,
      }],
    });
    let state = appReducer({ ...createEmptyAppState(), workouts: [source, target] }, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'source-workout',
        exerciseId: 'source-plank',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_FINISH_TIMED_SET,
      payload: { now: '2026-07-13T10:00:30.000Z' },
    });
    expect(state.activeTimer).toMatchObject({ phase: 'rest', workoutId: 'source-workout' });

    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'target-workout',
        exerciseId: 'target-plank',
        setIndex: 0,
        now: '2026-07-13T10:00:40.000Z',
      },
    });

    expect(state.activeTimer).toMatchObject({
      phase: 'work',
      workoutId: 'target-workout',
      exerciseId: 'target-plank',
      initialSeconds: 120,
    });
  });

  it('does not replace an active work timer from another workout', () => {
    const createTimedWorkout = (id) => normalizeWorkout({
      id,
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: `${id}-exercise`,
        name: 'Планка',
        structure: 'sets',
        target: { kind: 'duration', value: 60, unit: 'seconds' },
        sets: 1,
        restSeconds: 0,
      }],
    });
    const source = createTimedWorkout('active-workout');
    const target = createTimedWorkout('blocked-workout');
    const running = appReducer({ ...createEmptyAppState(), workouts: [source, target] }, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'active-workout',
        exerciseId: 'active-workout-exercise',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    const blocked = appReducer(running, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'blocked-workout',
        exerciseId: 'blocked-workout-exercise',
        setIndex: 0,
        now: '2026-07-13T10:00:10.000Z',
      },
    });

    expect(blocked).toBe(running);
    expect(blocked.activeTimer).toMatchObject({
      phase: 'work',
      workoutId: 'active-workout',
    });
  });

  it('records one second when a timed set is explicitly finished immediately', () => {
    const workout = normalizeWorkout({
      id: 'timed-immediate',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'plank',
        name: 'Планка',
        structure: 'sets',
        target: { kind: 'duration', value: 60, unit: 'seconds' },
        sets: 1,
        restSeconds: 0,
      }],
    });
    let state = appReducer({ ...createEmptyAppState(), workouts: [workout] }, {
      type: ActionTypes.WORKOUT_SESSION_START_TIMED_SET,
      payload: {
        workoutId: 'timed-immediate',
        exerciseId: 'plank',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_FINISH_TIMED_SET,
      payload: { now: '2026-07-13T10:00:00.000Z' },
    });

    expect(state.workouts[0].exercises[0].setResults[0]).toMatchObject({
      status: 'completed',
      actualValue: 1,
    });
    expect(state.activeTimer).toBeNull();
  });

  it('tracks a privacy-safe continuous session and completes one running unit', () => {
    const workout = normalizeWorkout({
      id: 'running',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'run',
        name: 'Бег',
        structure: 'continuous',
        target: { kind: 'distance', value: 3000 },
      }],
    });
    let state = { ...createEmptyAppState(), workouts: [workout] };
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_START_CONTINUOUS,
      payload: { workoutId: 'running', exerciseId: 'run', now: '2026-07-13T10:00:00.000Z' },
    });
    expect(state.activeContinuousSession).toMatchObject({ status: 'acquiring', accumulatedMeters: 0 });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_CONTINUOUS_GPS_READY,
      payload: { workoutId: 'running', now: '2026-07-13T10:00:02.000Z' },
    });
    [
      [900, '2026-07-13T10:04:02.000Z'],
      [900, '2026-07-13T10:08:02.000Z'],
      [900, '2026-07-13T10:12:02.000Z'],
      [312.4, '2026-07-13T10:15:02.000Z'],
    ].forEach(([deltaMeters, now]) => {
      state = appReducer(state, {
        type: ActionTypes.WORKOUT_SESSION_CONTINUOUS_ACCEPT_DELTA,
        payload: { workoutId: 'running', deltaMeters, now },
      });
    });
    expect(state.activeContinuousSession).toMatchObject({
      status: 'active',
      accumulatedMeters: 3012.4,
      activeDurationSeconds: 900,
    });
    expect(JSON.stringify(state.activeContinuousSession)).not.toMatch(/latitude|longitude|coordinates/);

    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_REVIEW_CONTINUOUS,
      payload: { workoutId: 'running', now: '2026-07-13T10:15:02.000Z' },
    });
    state = appReducer(state, {
      type: ActionTypes.WORKOUT_SESSION_COMPLETE_CONTINUOUS,
      payload: { workoutId: 'running', exerciseId: 'run', now: '2026-07-13T10:15:10.000Z' },
    });
    expect(state.activeContinuousSession).toBeNull();
    expect(state.workouts[0].exercises[0].continuousResult).toMatchObject({
      status: 'completed',
      actualValue: 3012,
      activeDurationSeconds: 900,
    });
  });

  it('stores planned bodyweight repetitions and waits for explicit rest continuation', () => {
    const workout = normalizeWorkout({
      id: 'guided-session',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [
        { id: 'push-up', name: 'Отжимания', sets: 1, plannedReps: '12', restSeconds: 60 },
        { id: 'plank', name: 'Планка', sets: 1, plannedReps: '30 сек', restSeconds: 90 },
      ],
    });
    const initial = { ...createEmptyAppState(), workouts: [workout] };
    const afterFirstSet = appReducer(initial, {
      type: ActionTypes.WORKOUT_SESSION_COMPLETE_SET,
      payload: {
        workoutId: 'guided-session',
        exerciseId: 'push-up',
        setIndex: 0,
        now: '2026-07-13T10:00:00.000Z',
      },
    });

    expect(afterFirstSet.workouts[0].exercises[0].setResults[0]).toMatchObject({
      status: 'completed',
      weightKg: null,
      reps: 12,
      rpe: null,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    expect(afterFirstSet.activeTimer).toMatchObject({
      workoutId: 'guided-session',
      exerciseId: 'push-up',
      initialSeconds: 60,
    });

    expect(appReducer(afterFirstSet, {
      type: ActionTypes.WORKOUT_SESSION_CONTINUE_REST,
      payload: { workoutId: 'another-workout' },
    })).toBe(afterFirstSet);

    const afterContinue = appReducer(afterFirstSet, {
      type: ActionTypes.WORKOUT_SESSION_CONTINUE_REST,
      payload: { workoutId: 'guided-session' },
    });
    expect(afterContinue.activeTimer).toBeNull();
    expect(appReducer(afterContinue, {
      type: ActionTypes.WORKOUT_SESSION_CONTINUE_REST,
      payload: { workoutId: 'guided-session' },
    })).toBe(afterContinue);

    const afterLastSet = appReducer(afterContinue, {
      type: ActionTypes.WORKOUT_SESSION_COMPLETE_SET,
      payload: {
        workoutId: 'guided-session',
        exerciseId: 'plank',
        setIndex: 0,
        now: '2026-07-13T10:02:00.000Z',
      },
    });
    expect(afterLastSet.workouts[0].exercises[1].setResults[0]).toMatchObject({
      status: 'completed',
      weightKg: null,
      reps: null,
      rpe: null,
    });
    expect(afterLastSet.activeTimer).toBeNull();
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

  it('adds, updates, and deletes custom exercises without mutating workout snapshots', () => {
    const workout = normalizeWorkout({
      id: 'custom-workout',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'snapshot',
        name: 'Моё упражнение',
        customExerciseId: 'custom-1',
        sets: 3,
        plannedReps: '10',
      }],
    });
    let state = { ...createEmptyAppState(), workouts: [workout] };
    const addAction = {
      type: ActionTypes.CUSTOM_EXERCISE_ADD,
      payload: {
        exercise: {
          id: 'custom-1',
          name: 'Моё упражнение',
          structure: 'sets',
          target: { kind: 'reps', value: 10, unit: 'count' },
          sets: 3,
          restSeconds: 90,
          createdAt: '2026-07-13T10:00:00.000Z',
          updatedAt: '2026-07-13T10:00:00.000Z',
        },
      },
    };

    state = appReducer(state, addAction);
    const afterAdd = state;
    expect(appReducer(state, addAction)).toBe(afterAdd);

    state = appReducer(state, {
      type: ActionTypes.CUSTOM_EXERCISE_UPDATE,
      payload: {
        id: 'custom-1',
        patch: { name: 'Обновлённое упражнение', sets: 4 },
        now: '2026-07-13T11:00:00.000Z',
      },
    });
    expect(state.customExercises[0]).toMatchObject({
      id: 'custom-1',
      name: 'Обновлённое упражнение',
      sets: 4,
      createdAt: '2026-07-13T10:00:00.000Z',
      updatedAt: '2026-07-13T11:00:00.000Z',
    });

    state = appReducer(state, {
      type: ActionTypes.CUSTOM_EXERCISE_DELETE,
      payload: { id: 'custom-1' },
    });
    expect(state.customExercises).toEqual([]);
    expect(state.workouts[0].exercises[0]).toMatchObject({
      name: 'Моё упражнение',
      customExerciseId: 'custom-1',
    });
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
