import { makeId } from './id.js';
import { normalizeExerciseName } from './records.js';
import { normalizeTarget } from './targets.js';

export const EXERCISE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'strength', label: 'Сила' }),
  Object.freeze({ id: 'core', label: 'Кор' }),
  Object.freeze({ id: 'cardio', label: 'Кардио' }),
  Object.freeze({ id: 'mobility', label: 'Мобильность' }),
]);

const CATALOG = [
  {
    id: 'push-ups', name: 'Отжимания', aliases: ['отжимание', 'push ups'], category: 'strength', iconKey: 'push-ups',
    structure: 'sets', target: { kind: 'reps', value: 10, unit: 'count' }, sets: 3, restSeconds: 90,
  },
  {
    id: 'pull-ups', name: 'Подтягивания', aliases: ['турник', 'подтягивание', 'pull ups'], category: 'strength', iconKey: 'pull-ups',
    structure: 'sets', target: { kind: 'reps', value: 6, unit: 'count' }, sets: 3, restSeconds: 120,
  },
  {
    id: 'squats', name: 'Приседания', aliases: ['присед', 'squats'], category: 'strength', iconKey: 'squats',
    structure: 'sets', target: { kind: 'reps', value: 15, unit: 'count' }, sets: 3, restSeconds: 90,
  },
  {
    id: 'lunges', name: 'Выпады', aliases: ['выпад', 'lunges'], category: 'strength', iconKey: 'lunges',
    structure: 'sets', target: { kind: 'reps', value: 10, unit: 'count' }, sets: 3, restSeconds: 90,
  },
  {
    id: 'plank', name: 'Планка', aliases: ['plank'], category: 'core', iconKey: 'plank',
    structure: 'sets', target: { kind: 'duration', value: 60, unit: 'seconds' }, sets: 3, restSeconds: 60,
  },
  {
    id: 'side-plank', name: 'Боковая планка', aliases: ['планка на боку', 'side plank'], category: 'core', iconKey: 'side-plank',
    structure: 'sets', target: { kind: 'duration', value: 45, unit: 'seconds' }, sets: 3, restSeconds: 60,
  },
  {
    id: 'crunches', name: 'Скручивания', aliases: ['пресс', 'crunches'], category: 'core', iconKey: 'crunches',
    structure: 'sets', target: { kind: 'reps', value: 15, unit: 'count' }, sets: 3, restSeconds: 60,
  },
  {
    id: 'burpees', name: 'Берпи', aliases: ['бурпи', 'burpees'], category: 'cardio', iconKey: 'burpees',
    structure: 'sets', target: { kind: 'reps', value: 10, unit: 'count' }, sets: 3, restSeconds: 90,
  },
  {
    id: 'running', name: 'Бег', aliases: ['пробежка', 'бегать', 'run', 'running'], category: 'cardio', iconKey: 'running',
    structure: 'continuous', target: { kind: 'distance', value: 3000, unit: 'meters' }, sets: 1, restSeconds: 0,
  },
  {
    id: 'walking', name: 'Ходьба', aliases: ['прогулка', 'walking', 'walk'], category: 'cardio', iconKey: 'walking',
    structure: 'continuous', target: { kind: 'duration', value: 1800, unit: 'seconds' }, sets: 1, restSeconds: 0,
  },
  {
    id: 'stretching', name: 'Растяжка', aliases: ['стретчинг', 'stretching'], category: 'mobility', iconKey: 'stretching',
    structure: 'continuous', target: { kind: 'duration', value: 600, unit: 'seconds' }, sets: 1, restSeconds: 0,
  },
];

function cloneLibraryItem(item, source = 'catalog') {
  return {
    ...item,
    source,
    sourceId: item.id,
    key: `${source}:${item.id}`,
    aliases: [...(item.aliases ?? [])],
    target: normalizeTarget(item.target),
  };
}

export const EXERCISE_CATALOG = Object.freeze(
  CATALOG.map((item) => Object.freeze({
    ...item,
    aliases: Object.freeze([...item.aliases]),
    target: Object.freeze({ ...item.target }),
  })),
);

export function getExerciseCatalog() {
  return EXERCISE_CATALOG.map((item) => cloneLibraryItem(item));
}

export function getCatalogExerciseById(id) {
  const item = EXERCISE_CATALOG.find((candidate) => candidate.id === id);
  return item ? cloneLibraryItem(item) : null;
}

export function mergeExerciseLibrary(customExercises = []) {
  const catalog = getExerciseCatalog();
  const custom = customExercises.map((item) => cloneLibraryItem({
    ...item,
    category: item.category || 'custom',
    iconKey: item.iconKey || 'custom',
  }, 'custom'));
  return [...catalog, ...custom];
}

export function searchExerciseLibrary(query, customExercises = [], options = {}) {
  const normalizedQuery = normalizeExerciseName(query);
  const category = typeof options.category === 'string' ? options.category : '';
  return mergeExerciseLibrary(customExercises).filter((item) => {
    if (category && item.category !== category) return false;
    if (!normalizedQuery) return true;
    return [item.name, ...(item.aliases ?? [])]
      .some((value) => normalizeExerciseName(value).includes(normalizedQuery));
  });
}

export function createExerciseFromLibraryItem(item, options = {}) {
  const source = item?.source === 'custom' ? 'custom' : 'catalog';
  const structure = item?.structure === 'continuous' ? 'continuous' : 'sets';
  return {
    id: makeId(options.idFactory, 'exercise'),
    name: String(item?.name ?? '').trim(),
    structure,
    target: normalizeTarget(item?.target),
    sets: structure === 'continuous' ? 1 : Number(item?.sets) || 3,
    restSeconds: structure === 'continuous' ? 0 : Number(item?.restSeconds) || 90,
    catalogExerciseId: source === 'catalog' ? item?.sourceId ?? item?.id ?? null : null,
    customExerciseId: source === 'custom' ? item?.sourceId ?? item?.id ?? null : null,
    legacyTargetText: null,
  };
}
