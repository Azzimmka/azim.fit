import { normalizeExerciseName } from './records.js';
import { normalizeTarget } from './targets.js';

function timestamp(value) {
  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function plannedTimestamp(workout) {
  return timestamp(`${workout?.plannedDate ?? '1970-01-01'}T${workout?.time ?? '00:00'}:00`);
}

function identity(value) {
  if (value?.catalogExerciseId) return `catalog:${value.catalogExerciseId}`;
  if (value?.customExerciseId) return `custom:${value.customExerciseId}`;
  if (value?.source === 'catalog') return `catalog:${value.sourceId ?? value.id}`;
  if (value?.source === 'custom') return `custom:${value.sourceId ?? value.id}`;
  return `name:${normalizeExerciseName(value?.name)}`;
}

function matches(item, exercise) {
  const itemIdentity = identity(item);
  const exerciseIdentity = identity(exercise);
  if (!itemIdentity.endsWith(':') && itemIdentity === exerciseIdentity) return true;
  return normalizeExerciseName(item?.name) === normalizeExerciseName(exercise?.name);
}

function compatibleStructure(item, exercise) {
  if (!['catalog', 'custom'].includes(item?.source)) return true;
  const itemStructure = item?.structure === 'continuous' ? 'continuous' : 'sets';
  const exerciseStructure = exercise?.structure === 'continuous' ? 'continuous' : 'sets';
  return itemStructure === exerciseStructure;
}

function snapshot(exercise, fallback = {}) {
  const structure = exercise?.structure === 'continuous' ? 'continuous' : 'sets';
  return {
    name: String(exercise?.name ?? fallback.name ?? '').trim(),
    structure,
    target: normalizeTarget(exercise?.target ?? fallback.target),
    sets: structure === 'continuous' ? 1 : Math.max(1, Number(exercise?.sets) || 3),
    restSeconds: structure === 'continuous' ? 0 : Math.max(0, Number(exercise?.restSeconds) || 0),
    catalogExerciseId: exercise?.catalogExerciseId
      ?? (fallback.source === 'catalog' ? fallback.sourceId ?? fallback.id : null),
    customExerciseId: exercise?.customExerciseId
      ?? (fallback.source === 'custom' ? fallback.sourceId ?? fallback.id : null),
    legacyTargetText: exercise?.legacyTargetText ?? null,
  };
}

function completedCandidates(item, workouts) {
  return workouts
    .filter((workout) => workout?.status === 'completed')
    .flatMap((workout) => (workout.exercises ?? [])
      .filter((exercise) => matches(item, exercise) && compatibleStructure(item, exercise))
      .map((exercise) => ({ exercise, score: timestamp(workout.completedAt) })))
    .sort((left, right) => right.score - left.score);
}

function plannedCandidates(item, state) {
  const workoutCandidates = (state.workouts ?? [])
    .filter((workout) => workout?.status !== 'completed')
    .flatMap((workout) => (workout.exercises ?? [])
      .filter((exercise) => matches(item, exercise) && compatibleStructure(item, exercise))
      .map((exercise) => ({ exercise, score: plannedTimestamp(workout) })));
  const templateCandidates = (state.templates ?? []).flatMap((template) => (
    template?.plan?.exercises ?? []
  ).filter((exercise) => matches(item, exercise) && compatibleStructure(item, exercise)).map((exercise) => ({
    exercise,
    score: timestamp(template.updatedAt ?? template.createdAt),
  })));
  const seriesCandidates = (state.series ?? []).flatMap((series) => (
    series?.planSnapshot?.exercises ?? []
  ).filter((exercise) => matches(item, exercise) && compatibleStructure(item, exercise)).map((exercise) => ({
    exercise,
    score: timestamp(`${series.startsOn ?? '1970-01-01'}T00:00:00`),
  })));
  return [...workoutCandidates, ...templateCandidates, ...seriesCandidates]
    .sort((left, right) => right.score - left.score);
}

/**
 * Resolves defaults in the approved priority: completed history, latest plan,
 * then the selected catalog/custom library item.
 */
export function resolveExerciseDefaults(item, state = {}) {
  const completed = completedCandidates(item, state.workouts ?? [])[0]?.exercise;
  if (completed) return snapshot(completed, item);
  const planned = plannedCandidates(item, state)[0]?.exercise;
  if (planned) return snapshot(planned, item);
  return snapshot(item, item);
}

function recentDescriptor(exercise, state) {
  const catalog = exercise.catalogExerciseId
    ? { source: 'catalog', sourceId: exercise.catalogExerciseId }
    : null;
  const custom = exercise.customExerciseId
    ? (state.customExercises ?? []).find((item) => item.id === exercise.customExerciseId)
    : null;
  return {
    ...snapshot(exercise),
    ...(catalog ?? (custom
      ? { source: 'custom', sourceId: custom.id, aliases: [...(custom.aliases ?? [])], category: custom.category }
      : { source: 'history', sourceId: identity(exercise) })),
    key: catalog
      ? `catalog:${exercise.catalogExerciseId}`
      : custom ? `custom:${custom.id}` : identity(exercise),
  };
}

/** Completed history ranks first by completedAt, then current/future plans. */
export function selectRecentExercises(state = {}, limit = 6) {
  const completed = (state.workouts ?? [])
    .filter((workout) => workout?.status === 'completed')
    .sort((left, right) => timestamp(right.completedAt) - timestamp(left.completedAt));
  const planned = (state.workouts ?? [])
    .filter((workout) => workout?.status !== 'completed')
    .sort((left, right) => plannedTimestamp(right) - plannedTimestamp(left));
  const seen = new Set();
  const results = [];
  for (const workout of [...completed, ...planned]) {
    for (const exercise of workout.exercises ?? []) {
      const key = identity(exercise);
      if (!normalizeExerciseName(exercise.name) || seen.has(key)) continue;
      seen.add(key);
      results.push(recentDescriptor(exercise, state));
      if (results.length >= Math.max(0, limit)) return results;
    }
  }
  return results;
}
