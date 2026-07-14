import { describe, expect, it } from 'vitest';
import {
  calculatePersonalRecords,
  findNewPersonalRecords,
  normalizeExerciseName,
} from './records.js';
import { normalizeWorkout } from './schema.js';
import { correctWorkoutResult } from './workouts.js';

function completedWorkout({ id, completedAt, exercises }) {
  return normalizeWorkout({
    id,
    title: id,
    status: 'completed',
    plannedDate: '2026-07-10',
    completedAt,
    exercises,
  });
}

describe('personal records', () => {
  it('normalizes NFKC, case, whitespace, and ё', () => {
    expect(normalizeExerciseName('  ЖИМ\u00a0  ЛЁЖА  ')).toBe('жим лежа');
  });

  it('computes max weight, volume, and unweighted reps while ignoring RPE', () => {
    const first = completedWorkout({
      id: 'first',
      completedAt: '2026-07-10T10:00:00.000Z',
      exercises: [
        { id: 'a', name: 'Жим лёжа', sets: 3, completedSets: 3, actualWeightKg: 80, actualReps: 10, rpe: 10 },
        { id: 'b', name: 'Отжимания', sets: 2, completedSets: 2, actualReps: 20 },
      ],
    });
    const second = completedWorkout({
      id: 'second',
      completedAt: '2026-07-11T10:00:00.000Z',
      exercises: [
        { id: 'c', name: ' жим   лежа ', sets: 2, completedSets: 2, actualWeightKg: 90, actualReps: 8, rpe: 1 },
        { id: 'd', name: 'ОТЖИМАНИЯ', sets: 2, completedSets: 2, actualReps: 25 },
      ],
    });

    const records = calculatePersonalRecords([second, first]);
    const press = records.find((record) => record.normalizedName === 'жим лежа');
    const pushups = records.find((record) => record.normalizedName === 'отжимания');
    expect(press.weight.value).toBe(90);
    expect(press.volume.value).toBe(2_400);
    expect(pushups.reps.value).toBe(25);
    expect(pushups.weight).toBeNull();
  });

  it('does not treat an equal value as a new record', () => {
    const first = completedWorkout({
      id: 'first',
      completedAt: '2026-07-10T10:00:00.000Z',
      exercises: [{ id: 'a', name: 'Тяга', sets: 1, completedSets: 1, actualWeightKg: 100, actualReps: 5 }],
    });
    const equal = completedWorkout({
      id: 'equal',
      completedAt: '2026-07-11T10:00:00.000Z',
      exercises: [{ id: 'b', name: 'Тяга', sets: 1, completedSets: 1, actualWeightKg: 100, actualReps: 5 }],
    });
    expect(findNewPersonalRecords(equal, [first])).toEqual([]);
    expect(calculatePersonalRecords([first, equal])[0].weight.workoutId).toBe('first');
  });

  it('recalculates after correction and deletion', () => {
    const base = completedWorkout({
      id: 'base',
      completedAt: '2026-07-10T10:00:00.000Z',
      exercises: [{ id: 'base-e', name: 'Тяга', sets: 1, completedSets: 1, actualWeightKg: 90, actualReps: 5 }],
    });
    const peak = completedWorkout({
      id: 'peak',
      completedAt: '2026-07-11T10:00:00.000Z',
      exercises: [{ id: 'peak-e', name: 'Тяга', sets: 1, completedSets: 1, actualWeightKg: 110, actualReps: 5 }],
    });
    const corrected = correctWorkoutResult(peak, {
      exercises: [{ id: 'peak-e', actualWeightKg: 80 }],
    });
    expect(calculatePersonalRecords([base, corrected])[0].weight.value).toBe(90);
    expect(calculatePersonalRecords([base])[0].weight.value).toBe(90);
  });

  it('uses individual completed sets for max weight, summed volume, and reps', () => {
    const workout = completedWorkout({
      id: 'per-set',
      completedAt: '2026-07-12T10:00:00.000Z',
      exercises: [
        {
          id: 'press',
          name: 'Жим',
          sets: 3,
          setResults: [
            { status: 'completed', weightKg: 70, reps: 10, rpe: 10 },
            { status: 'completed', weightKg: 80, reps: 8, rpe: 1 },
            { status: 'skipped', weightKg: 100, reps: 20 },
          ],
        },
        {
          id: 'pushups',
          name: 'Отжимания',
          sets: 3,
          setResults: [
            { status: 'completed', reps: 20 },
            { status: 'completed', reps: 25 },
            { status: 'pending', reps: 99 },
          ],
        },
      ],
    });

    const records = calculatePersonalRecords([workout]);
    const press = records.find((record) => record.normalizedName === 'жим');
    const pushups = records.find((record) => record.normalizedName === 'отжимания');
    expect(press.weight.value).toBe(80);
    expect(press.volume.value).toBe(1_340);
    expect(press.reps).toBeNull();
    expect(pushups.reps.value).toBe(25);
  });
});
