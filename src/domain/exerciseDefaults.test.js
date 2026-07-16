import { describe, expect, it } from 'vitest';
import { getCatalogExerciseById } from './exerciseCatalog.js';
import { resolveExerciseDefaults, selectRecentExercises } from './exerciseDefaults.js';

function exercise(overrides = {}) {
  return {
    id: overrides.id ?? 'exercise',
    name: overrides.name ?? 'Отжимания',
    catalogExerciseId: overrides.catalogExerciseId ?? 'push-ups',
    customExerciseId: overrides.customExerciseId ?? null,
    structure: overrides.structure ?? 'sets',
    target: overrides.target ?? { kind: 'reps', value: 10, unit: 'count' },
    sets: overrides.sets ?? 3,
    restSeconds: overrides.restSeconds ?? 90,
  };
}

describe('exercise defaults', () => {
  it('prefers the latest completed workout over newer plans and catalog defaults', () => {
    const item = getCatalogExerciseById('push-ups');
    const state = {
      workouts: [
        {
          status: 'completed', completedAt: '2026-07-14T10:00:00.000Z',
          exercises: [exercise({ sets: 5, target: { kind: 'reps', value: 12, unit: 'count' }, restSeconds: 75 })],
        },
        {
          status: 'planned', plannedDate: '2026-07-20', time: '18:00',
          exercises: [exercise({ sets: 4, target: { kind: 'reps', value: 20, unit: 'count' }, restSeconds: 120 })],
        },
      ],
      templates: [],
      series: [],
    };

    expect(resolveExerciseDefaults(item, state)).toMatchObject({
      sets: 5,
      target: { kind: 'reps', value: 12, unit: 'count' },
      restSeconds: 75,
    });
  });

  it('uses the latest plan/template when completed history is absent', () => {
    const item = getCatalogExerciseById('plank');
    const state = {
      workouts: [],
      templates: [{
        updatedAt: '2026-07-15T09:00:00.000Z',
        plan: { exercises: [exercise({
          name: 'Планка',
          catalogExerciseId: 'plank',
          target: { kind: 'duration', value: 180, unit: 'seconds' },
          restSeconds: 60,
        })] },
      }],
      series: [],
    };

    expect(resolveExerciseDefaults(item, state).target.value).toBe(180);
  });

  it('falls back to an independent catalog snapshot', () => {
    const item = getCatalogExerciseById('running');
    const first = resolveExerciseDefaults(item, {});
    const second = resolveExerciseDefaults(item, {});
    first.target.value = 10_000;
    expect(second).toMatchObject({
      structure: 'continuous',
      target: { kind: 'distance', value: 3000, unit: 'meters' },
      sets: 1,
      restSeconds: 0,
    });
  });

  it('never lets old history change a catalog exercise from continuous to sets', () => {
    const item = getCatalogExerciseById('running');
    const defaults = resolveExerciseDefaults(item, {
      workouts: [{
        status: 'completed',
        completedAt: '2026-07-15T10:00:00.000Z',
        exercises: [exercise({
          name: 'Бег',
          catalogExerciseId: 'running',
          structure: 'sets',
          target: { kind: 'duration', value: 1200, unit: 'seconds' },
        })],
      }],
    });
    expect(defaults).toMatchObject({
      structure: 'continuous',
      target: { kind: 'distance', value: 3000, unit: 'meters' },
    });
  });

  it('ranks completed recents before plans and removes duplicates', () => {
    const state = {
      customExercises: [],
      workouts: [
        {
          id: 'planned', status: 'planned', plannedDate: '2026-07-20', time: '18:00',
          exercises: [exercise({ id: 'planned-pushups' }), exercise({ name: 'Планка', catalogExerciseId: 'plank' })],
        },
        {
          id: 'completed-old', status: 'completed', completedAt: '2026-07-13T10:00:00.000Z',
          exercises: [exercise({ id: 'old-pushups' })],
        },
        {
          id: 'completed-new', status: 'completed', completedAt: '2026-07-15T10:00:00.000Z',
          exercises: [exercise({ name: 'Бег', catalogExerciseId: 'running', structure: 'continuous', target: { kind: 'distance', value: 5000, unit: 'meters' } })],
        },
      ],
    };

    expect(selectRecentExercises(state, 3).map((item) => item.key)).toEqual([
      'catalog:running',
      'catalog:push-ups',
      'catalog:plank',
    ]);
  });
});
