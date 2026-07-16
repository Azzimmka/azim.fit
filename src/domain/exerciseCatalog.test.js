import { describe, expect, it } from 'vitest';
import {
  createExerciseFromLibraryItem,
  EXERCISE_CATALOG,
  getCatalogExerciseById,
  mergeExerciseLibrary,
  searchExerciseLibrary,
} from './exerciseCatalog.js';

describe('exercise catalog', () => {
  it('contains the approved offline exercise set with stable unique ids', () => {
    expect(EXERCISE_CATALOG.map((item) => item.name)).toEqual(expect.arrayContaining([
      'Отжимания',
      'Подтягивания',
      'Приседания',
      'Выпады',
      'Планка',
      'Боковая планка',
      'Скручивания',
      'Берпи',
      'Бег',
      'Ходьба',
      'Растяжка',
    ]));
    expect(new Set(EXERCISE_CATALOG.map((item) => item.id)).size).toBe(EXERCISE_CATALOG.length);
  });

  it('searches normalized names and aliases', () => {
    expect(searchExerciseLibrary('ТУРНИК').map((item) => item.id)).toEqual(['pull-ups']);
    expect(searchExerciseLibrary('пробежка').map((item) => item.id)).toEqual(['running']);
    expect(searchExerciseLibrary('боковая').map((item) => item.id)).toEqual(['side-plank']);
  });

  it('keeps custom and catalog ids distinct even when raw ids collide', () => {
    const items = mergeExerciseLibrary([{
      id: 'running',
      name: 'Мой интервальный бег',
      aliases: [],
      category: 'cardio',
      structure: 'continuous',
      target: { kind: 'duration', value: 900, unit: 'seconds' },
      sets: 1,
      restSeconds: 0,
    }]);

    expect(items.filter((item) => item.sourceId === 'running').map((item) => item.key))
      .toEqual(['catalog:running', 'custom:running']);
  });

  it('returns independent snapshots for workout plans', () => {
    const catalogItem = getCatalogExerciseById('plank');
    const first = createExerciseFromLibraryItem(catalogItem, { idFactory: () => 'exercise-1' });
    const second = createExerciseFromLibraryItem(catalogItem, { idFactory: () => 'exercise-2' });

    first.target.value = 180;
    expect(second).toMatchObject({
      id: 'exercise-2',
      catalogExerciseId: 'plank',
      customExerciseId: null,
      structure: 'sets',
      target: { kind: 'duration', value: 60, unit: 'seconds' },
    });
  });
});
