import { describe, expect, it } from 'vitest';
import { normalizeWorkout } from './schema.js';
import {
  calculateExerciseVolume,
  calculateWorkoutVolume,
  completeContinuousExercise,
  completeWorkout,
  completeWorkoutSet,
  correctWorkoutResult,
  findFirstPendingWorkoutSet,
  findFirstPendingWorkoutUnit,
  getPlannedBodyweightSetResult,
  getWorkoutSetDefaults,
  skipRemainingExerciseSets,
  startWorkoutSession,
  toggleWorkoutSet,
  updatePlannedWorkout,
  updateWorkoutResultDraft,
  updateWorkoutSetResult,
} from './workouts.js';

function plannedWorkout(overrides = {}) {
  return normalizeWorkout({
    id: 'workout',
    status: 'planned',
    plannedDate: '2026-07-13',
    exercises: [{
      id: 'press',
      name: 'Жим лёжа',
      sets: 3,
      plannedReps: '10',
      plannedWeightKg: 70,
      restSeconds: 90,
    }],
    ...overrides,
  }, { today: '2026-07-13' });
}

describe('per-set workout operations', () => {
  it('derives guided bodyweight results only from valid numeric plans', () => {
    expect(getPlannedBodyweightSetResult({ plannedReps: '15', plannedWeightKg: 80 })).toEqual({
      weightKg: null,
      reps: 15,
      actualValue: 15,
      rpe: null,
    });
    expect(getPlannedBodyweightSetResult({ plannedReps: '30 сек' })).toEqual({
      weightKg: null,
      reps: null,
      actualValue: null,
      rpe: null,
    });
    expect(getPlannedBodyweightSetResult({ plannedReps: '0' }).reps).toBeNull();
    expect(getPlannedBodyweightSetResult({ plannedReps: '1000' }).reps).toBeNull();
  });

  it('uses the canonical target value for reps and timed sets', () => {
    expect(getPlannedBodyweightSetResult({
      target: { kind: 'reps', value: 12, unit: 'count' },
      plannedReps: 'legacy',
    })).toEqual({ weightKg: null, reps: 12, actualValue: 12, rpe: null });
    expect(getPlannedBodyweightSetResult({
      target: { kind: 'duration', value: 180, unit: 'seconds' },
      plannedReps: 'legacy',
    })).toEqual({ weightKg: null, reps: null, actualValue: 180, rpe: null });
  });

  it('starts once and restores the first pending set', () => {
    const initial = plannedWorkout();
    const started = startWorkoutSession(initial, '2026-07-13T10:00:00.000Z');
    const reopened = startWorkoutSession(started, '2026-07-13T11:00:00.000Z');

    expect(started.startedAt).toBe('2026-07-13T10:00:00.000Z');
    expect(reopened).toBe(started);
    expect(findFirstPendingWorkoutSet(started)).toEqual({
      exerciseId: 'press',
      exerciseIndex: 0,
      setIndex: 0,
      setNumber: 1,
    });
  });

  it('completes distinct sets, derives aggregates, and is idempotent', () => {
    const first = completeWorkoutSet(plannedWorkout(), 'press', 0, {
      weightKg: 70,
      reps: 10,
      rpe: 7,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    const duplicate = completeWorkoutSet(first, 'press', 0, {
      weightKg: 100,
      reps: 1,
      completedAt: '2026-07-13T10:01:00.000Z',
    });
    const second = completeWorkoutSet(first, 'press', 1, {
      weightKg: 72.5,
      reps: 8,
      rpe: 8.5,
      completedAt: '2026-07-13T10:02:00.000Z',
    });

    expect(duplicate).toBe(first);
    expect(second.exercises[0]).toMatchObject({
      completedSets: 2,
      actualWeightKg: 72.5,
      actualReps: 8,
      rpe: 8.5,
    });
    expect(second.exercises[0].setResults.map((result) => result.status)).toEqual([
      'completed',
      'completed',
      'pending',
    ]);
    expect(findFirstPendingWorkoutSet(second)?.setIndex).toBe(2);
    expect(calculateExerciseVolume(second.exercises[0])).toBe(1_280);
    expect(calculateWorkoutVolume(second)).toBe(1_280);
  });

  it('rejects filled invalid values instead of silently clearing them', () => {
    const workout = plannedWorkout();
    expect(completeWorkoutSet(workout, 'press', 0, { weightKg: 1_001 })).toBe(workout);
    expect(completeWorkoutSet(workout, 'press', 0, { reps: 2.5 })).toBe(workout);
    expect(completeWorkoutSet(workout, 'press', 0, { rpe: 0 })).toBe(workout);
    expect(updateWorkoutSetResult(workout, 'press', 0, { reps: 1_000 })).toBe(workout);
  });

  it('skips remaining pending sets without touching completed results', () => {
    const completed = completeWorkoutSet(plannedWorkout(), 'press', 0, {
      weightKg: 70,
      reps: 10,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    const skipped = skipRemainingExerciseSets(completed, 'press');
    expect(skipped.exercises[0].setResults.map((result) => result.status)).toEqual([
      'completed',
      'skipped',
      'skipped',
    ]);
    expect(skipped.exercises[0].completedSets).toBe(1);
    expect(findFirstPendingWorkoutSet(skipped)).toBeNull();
  });

  it('toggles only the selected set and keeps non-prefix and skipped results intact', () => {
    const workout = plannedWorkout({
      exercises: [{
        id: 'press',
        name: 'Жим лёжа',
        sets: 3,
        setResults: [
          { status: 'completed', weightKg: 70, reps: 10 },
          { status: 'skipped' },
          { status: 'completed', weightKg: 75, reps: 8 },
        ],
      }],
    });

    const restored = toggleWorkoutSet(workout, 'press', 1);
    expect(restored.exercises[0].setResults.map((result) => result.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(restored.exercises[0].setResults[0]).toMatchObject({ weightKg: 70, reps: 10 });
    expect(restored.exercises[0].setResults[2]).toMatchObject({ weightKg: 75, reps: 8 });

    const toggledBack = toggleWorkoutSet(restored, 'press', 1);
    expect(toggledBack.exercises[0].setResults.map((result) => result.status)).toEqual([
      'completed',
      'pending',
      'completed',
    ]);
    expect(toggledBack.exercises[0].setResults[0]).toMatchObject({ weightKg: 70, reps: 10 });
    expect(toggledBack.exercises[0].setResults[2]).toMatchObject({ weightKg: 75, reps: 8 });
  });

  it('edits one selected or last completed result without flattening per-set data', () => {
    const workout = plannedWorkout({
      exercises: [{
        id: 'press',
        name: 'Жим лёжа',
        sets: 3,
        setResults: [
          { status: 'completed', weightKg: 70, reps: 10, rpe: 7 },
          { status: 'completed', weightKg: 75, reps: 8, rpe: 8 },
          { status: 'skipped' },
        ],
      }],
    });

    const selected = updateWorkoutResultDraft(workout, {
      exercises: [{
        id: 'press', setIndex: 0, completedSets: 3, actualWeightKg: 72.5,
      }],
    });
    expect(selected.exercises[0].setResults[0]).toMatchObject({
      status: 'completed', weightKg: 72.5, reps: 10, rpe: 7,
    });
    expect(selected.exercises[0].setResults[1]).toMatchObject({
      status: 'completed', weightKg: 75, reps: 8, rpe: 8,
    });
    expect(selected.exercises[0].setResults[2].status).toBe('skipped');

    const lastCompleted = updateWorkoutResultDraft(workout, {
      exercises: [{ id: 'press', actualReps: 7 }],
    });
    expect(lastCompleted.exercises[0].setResults[0].reps).toBe(10);
    expect(lastCompleted.exercises[0].setResults[1].reps).toBe(7);
    expect(lastCompleted.exercises[0].setResults[2].status).toBe('skipped');
  });

  it('expands an aggregate result only for a raw legacy exercise without setResults', () => {
    const legacyWorkout = {
      id: 'legacy',
      status: 'planned',
      resultNotes: '',
      exercises: [{
        id: 'press',
        name: 'Жим лёжа',
        sets: 3,
        completedSets: 1,
        actualWeightKg: 60,
        actualReps: 10,
      }],
    };
    const updated = updateWorkoutResultDraft(legacyWorkout, {
      exercises: [{
        id: 'press',
        completedSets: 2,
        actualWeightKg: 70,
        actualReps: 8,
        rpe: 8,
      }],
    });

    expect(updated.exercises[0].setResults.map((result) => result.status)).toEqual([
      'completed',
      'completed',
      'pending',
    ]);
    expect(updated.exercises[0].setResults[0]).toMatchObject({ weightKg: 70, reps: 8, rpe: 8 });
    expect(updated.exercises[0].setResults[1]).toMatchObject({ weightKg: 70, reps: 8, rpe: 8 });
  });

  it('inherits previous set, then history, then numeric plan values', () => {
    const historical = normalizeWorkout({
      id: 'history',
      status: 'completed',
      plannedDate: '2026-07-12',
      completedAt: '2026-07-12T10:00:00.000Z',
      exercises: [{
        id: 'old-press',
        name: ' ЖИМ  ЛЁЖА ',
        sets: 1,
        setResults: [{
          status: 'completed',
          weightKg: 75,
          reps: 8,
          rpe: 9,
          completedAt: '2026-07-12T10:00:00.000Z',
        }],
      }],
    });
    const workout = plannedWorkout();
    expect(getWorkoutSetDefaults(workout, 'press', 0, [historical])).toEqual({
      weightKg: 75,
      reps: 8,
      rpe: 9,
    });

    const first = completeWorkoutSet(workout, 'press', 0, {
      weightKg: 77.5,
      reps: 7,
      rpe: 8,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    expect(getWorkoutSetDefaults(first, 'press', 1, [historical])).toEqual({
      weightKg: 77.5,
      reps: 7,
      rpe: 8,
    });
    expect(getWorkoutSetDefaults(workout, 'press', 0)).toEqual({
      weightKg: 70,
      reps: 10,
      rpe: null,
    });
  });

  it('preserves results by index when planned set count changes', () => {
    const first = completeWorkoutSet(plannedWorkout(), 'press', 0, {
      weightKg: 70,
      reps: 10,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    const expanded = updatePlannedWorkout(first, {
      exercises: [{ ...first.exercises[0], sets: 4 }],
    });
    const reduced = updatePlannedWorkout(expanded, {
      exercises: [{ ...expanded.exercises[0], sets: 1 }],
    });
    expect(expanded.exercises[0].setResults).toHaveLength(4);
    expect(expanded.exercises[0].setResults[0].status).toBe('completed');
    expect(expanded.exercises[0].setResults[3].status).toBe('pending');
    expect(reduced.exercises[0].setResults).toHaveLength(1);
    expect(reduced.exercises[0].setResults[0].weightKg).toBe(70);
  });

  it('requires resolved sets only for explicit active-session completion', () => {
    const pending = plannedWorkout();
    expect(completeWorkout(pending, {
      completedAt: '2026-07-13T10:00:00.000Z',
      requireResolvedSets: true,
    })).toBe(pending);

    const resolved = skipRemainingExerciseSets(pending, 'press');
    expect(completeWorkout(resolved, {
      completedAt: '2026-07-13T10:00:00.000Z',
      requireResolvedSets: true,
    }).status).toBe('completed');
    expect(completeWorkout(pending, {
      completedAt: '2026-07-13T10:00:00.000Z',
    }).status).toBe('completed');
  });

  it('treats a continuous exercise as one pending progress unit', () => {
    const workout = normalizeWorkout({
      id: 'mixed',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [
        {
          id: 'run',
          name: 'Бег',
          structure: 'continuous',
          target: { kind: 'distance', value: 3000 },
        },
        { id: 'press', name: 'Отжимания', sets: 1, plannedReps: '10' },
      ],
    });

    expect(findFirstPendingWorkoutSet(workout)).toMatchObject({ exerciseId: 'press', setIndex: 0 });
    expect(findFirstPendingWorkoutUnit(workout)).toMatchObject({ kind: 'continuous', exerciseId: 'run' });

    const completed = completeContinuousExercise(workout, 'run', {
      status: 'completed',
      actualValue: 3120,
      activeDurationSeconds: 900,
      averagePaceSecondsPerKm: 288,
      completedAt: '2026-07-13T10:15:00.000Z',
    });
    expect(completed.exercises[0].continuousResult).toMatchObject({ status: 'completed', actualValue: 3120 });
    expect(findFirstPendingWorkoutUnit(completed)).toMatchObject({ kind: 'set', exerciseId: 'press' });
  });

  it('requires a continuous result before active-session completion', () => {
    const workout = normalizeWorkout({
      id: 'run-only',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{
        id: 'run',
        name: 'Бег',
        structure: 'continuous',
        target: { kind: 'duration', value: 1200 },
      }],
    });
    expect(completeWorkout(workout, {
      completedAt: '2026-07-13T11:00:00.000Z',
      requireResolvedSets: true,
    })).toBe(workout);
    const skipped = skipRemainingExerciseSets(workout, 'run');
    expect(skipped.exercises[0].continuousResult.status).toBe('skipped');
    expect(completeWorkout(skipped, {
      completedAt: '2026-07-13T11:00:00.000Z',
      requireResolvedSets: true,
    }).status).toBe('completed');
  });

  it('corrects completed per-set results without flattening other sets', () => {
    let workout = completeWorkoutSet(plannedWorkout(), 'press', 0, {
      weightKg: 70,
      reps: 10,
      completedAt: '2026-07-13T10:00:00.000Z',
    });
    workout = completeWorkoutSet(workout, 'press', 1, {
      weightKg: 75,
      reps: 8,
      completedAt: '2026-07-13T10:02:00.000Z',
    });
    workout = skipRemainingExerciseSets(workout, 'press');
    workout = completeWorkout(workout, {
      completedAt: '2026-07-13T10:05:00.000Z',
      requireResolvedSets: true,
    });
    const corrected = correctWorkoutResult(workout, {
      exercises: [{
        id: 'press',
        setResults: workout.exercises[0].setResults.map((result, index) => index === 1
          ? { ...result, weightKg: 77.5, reps: 7 }
          : result),
      }],
    });

    expect(corrected.exercises[0].setResults[0]).toMatchObject({ weightKg: 70, reps: 10 });
    expect(corrected.exercises[0].setResults[1]).toMatchObject({ weightKg: 77.5, reps: 7 });
    expect(corrected.exercises[0]).toMatchObject({
      completedSets: 2,
      actualWeightKg: 77.5,
      actualReps: 7,
    });
    expect(corrected.pointsAwarded).toBe(30);
  });
});
