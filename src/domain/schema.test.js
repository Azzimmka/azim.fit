import { describe, expect, it } from 'vitest';
import { calculatePlanPoints } from './points.js';
import {
  createEmptyAppState,
  migrateV1State,
  normalizeAppState,
  normalizeExercise,
} from './schema.js';

function sequentialIds() {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

describe('V3 schema normalization and legacy migration', () => {
  it('starts a new profile empty', () => {
    expect(createEmptyAppState()).toMatchObject({
      schemaVersion: 3,
      workouts: [],
      series: [],
      templates: [],
      customExercises: [],
      bodyWeightEntries: [],
      activeTimer: null,
      activeContinuousSession: null,
    });
  });

  it('preserves completed sets and exact historical points from V1', () => {
    const migrated = migrateV1State({
      workouts: [
        {
          id: 'old-completed',
          title: 'Полное тело',
          type: 'Силовая',
          date: '2026-07-10',
          time: '19:00',
          duration: 50,
          completed: true,
          completedAt: '2026-07-11T08:00:00.000Z',
          points: 123,
          exercises: [{ id: 'old-e', name: 'Присед', sets: 5, reps: '12', completedSets: 4 }],
        },
        {
          id: 'old-planned',
          title: 'План',
          date: '2026-07-14',
          completed: false,
          points: 999,
          exercises: [{ id: 'old-p', name: 'Планка', sets: 3, reps: '40 сек', completedSets: 1 }],
        },
      ],
    }, { today: '2026-07-13' });

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.workouts[0]).toMatchObject({
      status: 'completed',
      plannedDate: '2026-07-10',
      occurrenceDate: '2026-07-10',
      pointsAwarded: 123,
    });
    expect(migrated.workouts[0]).not.toHaveProperty('durationMinutes');
    expect(migrated.workouts[0]).not.toHaveProperty('planNotes');
    expect(migrated.workouts[0]).not.toHaveProperty('reminder');
    expect(migrated.workouts[0].exercises[0]).toMatchObject({
      structure: 'sets',
      target: { kind: 'reps', value: 12, unit: 'count' },
      plannedReps: '12',
      completedSets: 4,
      actualWeightKg: null,
      actualReps: null,
    });
    expect(migrated.workouts[0].exercises[0].setResults).toHaveLength(5);
    expect(migrated.workouts[0].exercises[0].setResults.map((set) => set.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'pending',
    ]);
    expect(migrated.workouts[0].exercises[0].setResults[0].completedAt)
      .toBe('2026-07-11T08:00:00.000Z');
    expect(migrated.workouts[1].exercises[0].setResults[0].completedAt).toBeNull();
    expect(migrated.workouts[1].exercises[0]).toMatchObject({
      structure: 'sets',
      target: { kind: 'duration', value: 40, unit: 'seconds' },
    });
    expect(migrated.workouts[1].pointsAwarded).toBe(0);
    expect(calculatePlanPoints(migrated.workouts[1].exercises)).toBe(35);
  });

  it('safely repairs damaged values and enforces one body weight per date', () => {
    const state = normalizeAppState({
      schemaVersion: 2,
      workouts: 'bad',
      series: [null, 'bad'],
      templates: {},
      bodyWeightEntries: [
        { date: '2026-07-10', weightKg: 80 },
        { date: '2026-07-10', weightKg: 79.5 },
        { date: 'not-a-date', weightKg: 72 },
      ],
      settings: { defaultReminder: 999, deliveredReminderKeys: ['x', 'x', 3] },
      activeTimer: { status: 'running', endsAt: 'broken' },
    });

    expect(state).toMatchObject({
      schemaVersion: 3,
      workouts: [],
      series: [],
      templates: [],
      customExercises: [],
      activeContinuousSession: null,
    });
    expect(state.bodyWeightEntries).toEqual([
      expect.objectContaining({ date: '2026-07-10', weightKg: 79.5 }),
    ]);
    expect(state.settings).toEqual({});
    expect(state.activeTimer).toBeNull();
  });

  it('clamps exercise inputs to the supported aggregate-result model', () => {
    expect(normalizeExercise({
      name: 'Жим',
      sets: 99,
      completedSets: 40,
      restSeconds: 1,
      actualWeightKg: -10,
      actualReps: 8,
      rpe: 11,
    }, { idFactory: sequentialIds() })).toMatchObject({
      sets: 20,
      completedSets: 20,
      restSeconds: 15,
      actualWeightKg: null,
      actualReps: 8,
      rpe: null,
    });
  });

  it('repairs malformed setResults to the exact plan length and derives aggregates', () => {
    const exercise = normalizeExercise({
      name: 'Жим',
      sets: 3,
      completedSets: 99,
      actualWeightKg: 999,
      setResults: [
        {
          setNumber: 99,
          status: 'completed',
          weightKg: 70,
          reps: 10,
          rpe: 7,
          completedAt: '2026-07-13T10:00:00.000Z',
        },
        {
          status: 'broken',
          weightKg: 2_000,
          reps: 1_000,
          rpe: 11,
        },
        {
          status: 'completed',
          weightKg: 75,
          reps: 8,
          rpe: 8.5,
          completedAt: 'broken',
        },
        { status: 'completed', weightKg: 100 },
      ],
    });

    expect(exercise.setResults).toEqual([
      {
        setNumber: 1,
        status: 'completed',
        weightKg: 70,
        reps: 10,
        actualValue: 10,
        rpe: 7,
        completedAt: '2026-07-13T10:00:00.000Z',
      },
      {
        setNumber: 2,
        status: 'pending',
        weightKg: null,
        reps: null,
        actualValue: null,
        rpe: null,
        completedAt: null,
      },
      {
        setNumber: 3,
        status: 'completed',
        weightKg: 75,
        reps: 8,
        actualValue: 8,
        rpe: 8.5,
        completedAt: null,
      },
    ]);
    expect(exercise).toMatchObject({
      completedSets: 2,
      actualWeightKg: 75,
      actualReps: 8,
      rpe: 8.5,
    });
  });

  it('normalizes startedAt while upgrading schemaVersion', () => {
    const state = normalizeAppState({
      schemaVersion: 2,
      workouts: [{
        id: 'active',
        status: 'planned',
        plannedDate: '2026-07-13',
        startedAt: '2026-07-13T10:00:00Z',
        exercises: [],
      }],
    }, { today: '2026-07-13' });
    expect(state.schemaVersion).toBe(3);
    expect(state.workouts[0].startedAt).toBe('2026-07-13T10:00:00.000Z');
  });

  it('keeps only timers linked to an existing planned workout and exercise', () => {
    const timer = {
      status: 'running',
      endsAt: '2026-07-13T10:01:30.000Z',
      initialSeconds: 90,
      workoutId: 'active',
      exerciseId: 'press',
    };
    const workout = {
      id: 'active',
      status: 'planned',
      plannedDate: '2026-07-13',
      exercises: [{ id: 'press', name: 'Жим', sets: 1 }],
    };

    expect(normalizeAppState({ workouts: [workout], activeTimer: timer }).activeTimer)
      .toMatchObject({ workoutId: 'active', exerciseId: 'press' });
    expect(normalizeAppState({ workouts: [workout], activeTimer: { ...timer, exerciseId: 'missing' } }).activeTimer)
      .toBeNull();
    expect(normalizeAppState({
      workouts: [{ ...workout, status: 'completed', completedAt: '2026-07-13T10:00:00.000Z' }],
      activeTimer: timer,
    }).activeTimer).toBeNull();
  });

  it('preserves a valid standalone timer without workoutId', () => {
    const state = normalizeAppState({
      workouts: [],
      activeTimer: {
        status: 'paused',
        remainingSeconds: 45,
        initialSeconds: 90,
        workoutId: null,
        exerciseId: null,
      },
    });

    expect(state.activeTimer).toMatchObject({
      status: 'paused',
      remainingSeconds: 45,
      workoutId: null,
    });
  });

  it('normalizes custom exercises and continuous results without inventing sets', () => {
    const state = normalizeAppState({
      schemaVersion: 3,
      customExercises: [{
        id: 'custom-run',
        name: 'Мой бег',
        aliases: ['Пробежка', 'Пробежка', 1],
        category: 'Кардио',
        structure: 'continuous',
        target: { kind: 'distance', value: 3000 },
        sets: 9,
        restSeconds: 90,
      }],
      workouts: [{
        id: 'run',
        status: 'planned',
        plannedDate: '2026-07-13',
        exercises: [{
          id: 'run-exercise',
          name: 'Бег',
          structure: 'continuous',
          target: { kind: 'distance', value: 3000 },
          sets: 4,
          setResults: [{ status: 'completed', actualValue: 100 }],
          continuousResult: {
            status: 'completed',
            actualValue: 3080,
            activeDurationSeconds: 1086,
            averagePaceSecondsPerKm: 353,
            completedAt: '2026-07-13T10:18:06.000Z',
          },
        }],
      }],
    }, { today: '2026-07-13' });

    expect(state.customExercises[0]).toMatchObject({
      aliases: ['Пробежка'],
      structure: 'continuous',
      target: { kind: 'distance', value: 3000, unit: 'meters' },
      sets: 1,
      restSeconds: 0,
    });
    expect(state.workouts[0].exercises[0]).toMatchObject({
      structure: 'continuous',
      sets: 1,
      setResults: [],
      continuousResult: {
        status: 'completed',
        actualValue: 3080,
        distanceMeters: 3080,
        activeDurationSeconds: 1086,
        averagePaceSecondsPerKm: 353,
      },
    });
  });

  it('keeps only a privacy-safe continuous session linked to a planned exercise', () => {
    const state = normalizeAppState({
      workouts: [{
        id: 'run',
        status: 'planned',
        plannedDate: '2026-07-13',
        exercises: [{
          id: 'run-exercise',
          name: 'Бег',
          structure: 'continuous',
          target: { kind: 'distance', value: 3000 },
        }],
      }],
      activeContinuousSession: {
        workoutId: 'run',
        exerciseId: 'run-exercise',
        status: 'active',
        accumulatedMeters: 1840.4,
        activeDurationSeconds: 652.2,
        startedAt: '2026-07-13T10:00:00.000Z',
        activeSince: '2026-07-13T10:10:00.000Z',
        latitude: 41.2,
        longitude: 69.2,
      },
    }, { today: '2026-07-13' });

    expect(state.activeContinuousSession).toEqual({
      workoutId: 'run',
      exerciseId: 'run-exercise',
      status: 'paused',
      accumulatedMeters: 1840,
      activeDurationSeconds: 652,
      startedAt: '2026-07-13T10:00:00.000Z',
      activeSince: null,
      pausedAt: null,
      updatedAt: null,
    });
    expect(JSON.stringify(state)).not.toMatch(/latitude|longitude/);
  });
});
