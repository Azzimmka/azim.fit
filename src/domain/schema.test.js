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

describe('V2 schema normalization and V1 migration', () => {
  it('starts a new profile empty', () => {
    expect(createEmptyAppState()).toMatchObject({
      schemaVersion: 2,
      workouts: [],
      series: [],
      templates: [],
      bodyWeightEntries: [],
      activeTimer: null,
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

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.workouts[0]).toMatchObject({
      status: 'completed',
      plannedDate: '2026-07-10',
      occurrenceDate: '2026-07-10',
      pointsAwarded: 123,
      reminder: null,
    });
    expect(migrated.workouts[0].exercises[0]).toMatchObject({
      plannedReps: '12',
      completedSets: 4,
      actualWeightKg: null,
      actualReps: null,
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

    expect(state).toMatchObject({ schemaVersion: 2, workouts: [], series: [], templates: [] });
    expect(state.bodyWeightEntries).toEqual([
      expect.objectContaining({ date: '2026-07-10', weightKg: 79.5 }),
    ]);
    expect(state.settings.defaultReminder).toBe(15);
    expect(state.settings.deliveredReminderKeys).toEqual(['x']);
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
});

