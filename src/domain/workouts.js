import { compareCalendarDates, getToday, isCalendarDate } from './dates.js';
import { makeId } from './id.js';
import { calculateAwardedPoints } from './points.js';
import {
  normalizeExercise,
  normalizePlanSnapshot,
  normalizeTemplate,
  normalizeWorkout,
} from './schema.js';

function nowIso(now) {
  const timestamp = new Date(now ?? Date.now()).getTime();
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
}

/** @param {import('./model.js').Workout} workout */
export function workoutToPlan(workout) {
  return normalizePlanSnapshot(workout);
}

/**
 * @param {import('./model.js').WorkoutPlanSnapshot|object} plan
 * @param {object} overrides
 * @param {{idFactory?: (prefix?: string) => string, today?: string}} options
 */
export function createWorkoutFromPlan(plan, overrides = {}, options = {}) {
  const normalizedPlan = normalizePlanSnapshot({ ...plan, ...overrides }, options);
  const plannedDate = isCalendarDate(overrides.plannedDate)
    ? overrides.plannedDate
    : (isCalendarDate(options.today) ? options.today : getToday());
  const exercises = normalizedPlan.exercises.map((exercise) => normalizeExercise({
    ...exercise,
    id: makeId(options.idFactory, 'exercise'),
  }, { idFactory: options.idFactory, planningOnly: true }));

  return normalizeWorkout({
    ...normalizedPlan,
    ...overrides,
    id: overrides.id || makeId(options.idFactory, 'workout'),
    status: 'planned',
    plannedDate,
    occurrenceDate: isCalendarDate(overrides.occurrenceDate)
      ? overrides.occurrenceDate
      : plannedDate,
    completedAt: null,
    pointsAwarded: 0,
    resultNotes: '',
    exercises,
  }, options);
}

/**
 * Creates a completely independent planned workout. Results, awarded points,
 * series/template provenance, and occurrence identity are reset.
 * @param {import('./model.js').Workout} workout
 * @param {object} overrides
 * @param {{idFactory?: (prefix?: string) => string, today?: string}} options
 */
export function duplicateWorkout(workout, overrides = {}, options = {}) {
  const plannedDate = isCalendarDate(overrides.plannedDate)
    ? overrides.plannedDate
    : workout.plannedDate;
  return createWorkoutFromPlan(workoutToPlan(workout), {
    ...overrides,
    id: overrides.id || makeId(options.idFactory, 'workout'),
    plannedDate,
    occurrenceDate: plannedDate,
    seriesId: null,
    sourceTemplateId: null,
  }, options);
}

/** @param {import('./model.js').Workout} workout @param {string} plannedDate */
export function rescheduleWorkout(workout, plannedDate) {
  if (workout?.status !== 'planned' || !isCalendarDate(plannedDate)) return workout;
  return {
    ...workout,
    plannedDate,
    occurrenceDate: workout.seriesId ? workout.occurrenceDate : plannedDate,
  };
}

/**
 * Applies plan edits only to a planned workout. Series identity is retained so
 * a moved/edited materialized occurrence cannot be generated twice.
 * @param {import('./model.js').Workout} workout
 * @param {object} patch
 */
export function updatePlannedWorkout(workout, patch) {
  if (workout?.status !== 'planned') return workout;
  const plan = normalizePlanSnapshot({ ...workout, ...patch });
  const updated = normalizeWorkout({
    ...workout,
    ...plan,
    plannedDate: isCalendarDate(patch.plannedDate) ? patch.plannedDate : workout.plannedDate,
    exercises: plan.exercises.map((exercise) => {
      const previous = workout.exercises.find((item) => item.id === exercise.id);
      return previous
        ? normalizeExercise({ ...previous, ...exercise })
        : normalizeExercise(exercise, { planningOnly: true });
    }),
  });
  return {
    ...updated,
    occurrenceDate: workout.occurrenceDate,
    seriesId: workout.seriesId,
    sourceTemplateId: workout.sourceTemplateId,
  };
}

/**
 * Toggles a single set using the same "all sets through index" interaction as
 * V1 while keeping one aggregate result per exercise.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 * @param {number} index Zero-based set index.
 */
export function toggleWorkoutSet(workout, exerciseId, index) {
  if (workout?.status !== 'planned') return workout;
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      const safeIndex = Math.min(exercise.sets - 1, Math.max(0, Math.trunc(Number(index) || 0)));
      return {
        ...exercise,
        completedSets: safeIndex < exercise.completedSets ? safeIndex : safeIndex + 1,
      };
    }),
  };
}

/**
 * Stores aggregate in-progress results before completion. Plan fields remain
 * untouched and there is still exactly one result value per exercise.
 * @param {import('./model.js').Workout} workout
 * @param {{resultNotes?: string, exercises?: object[]}} result
 */
export function updateWorkoutResultDraft(workout, result = {}) {
  if (workout?.status !== 'planned') return workout;
  const patches = new Map(
    (Array.isArray(result.exercises) ? result.exercises : [])
      .filter((exercise) => exercise?.id)
      .map((exercise) => [exercise.id, exercise]),
  );
  return {
    ...workout,
    resultNotes: typeof result.resultNotes === 'string'
      ? result.resultNotes.trim()
      : workout.resultNotes,
    exercises: workout.exercises.map((exercise) => {
      const patch = patches.get(exercise.id);
      if (!patch) return exercise;
      return normalizeExercise({
        ...exercise,
        completedSets: patch.completedSets ?? exercise.completedSets,
        actualWeightKg: Object.prototype.hasOwnProperty.call(patch, 'actualWeightKg')
          ? patch.actualWeightKg
          : exercise.actualWeightKg,
        actualReps: Object.prototype.hasOwnProperty.call(patch, 'actualReps')
          ? patch.actualReps
          : exercise.actualReps,
        rpe: Object.prototype.hasOwnProperty.call(patch, 'rpe') ? patch.rpe : exercise.rpe,
      });
    }),
  };
}

/**
 * Future workouts are deliberately rejected. Late completion retains the
 * original plannedDate while completedAt records the actual event time.
 * @param {import('./model.js').Workout} workout
 * @param {{completedAt?: Date|number|string, resultNotes?: string, exercises?: object[]}} result
 */
export function completeWorkout(workout, result = {}) {
  if (workout?.status !== 'planned') return workout;
  const completedAt = nowIso(result.completedAt);
  const today = getToday(completedAt);
  if (compareCalendarDates(workout.plannedDate, today) > 0) return workout;

  const resultById = new Map(
    (Array.isArray(result.exercises) ? result.exercises : [])
      .filter((exercise) => exercise?.id)
      .map((exercise) => [exercise.id, exercise]),
  );
  const exercises = workout.exercises.map((exercise) => normalizeExercise({
    ...exercise,
    ...(resultById.get(exercise.id) ?? {}),
  }));

  return {
    ...workout,
    status: 'completed',
    completedAt,
    resultNotes: typeof result.resultNotes === 'string'
      ? result.resultNotes.trim()
      : workout.resultNotes,
    exercises,
    pointsAwarded: calculateAwardedPoints(exercises),
  };
}

/**
 * Completed workouts expose only result fields and resultNotes for correction.
 * @param {import('./model.js').Workout} workout
 * @param {{resultNotes?: string, exercises?: object[]}} correction
 */
export function correctWorkoutResult(workout, correction = {}) {
  if (workout?.status !== 'completed') return workout;
  const patches = new Map(
    (Array.isArray(correction.exercises) ? correction.exercises : [])
      .filter((exercise) => exercise?.id)
      .map((exercise) => [exercise.id, exercise]),
  );
  const exercises = workout.exercises.map((exercise) => {
    const patch = patches.get(exercise.id);
    if (!patch) return exercise;
    return normalizeExercise({
      ...exercise,
      completedSets: patch.completedSets ?? exercise.completedSets,
      actualWeightKg: Object.prototype.hasOwnProperty.call(patch, 'actualWeightKg')
        ? patch.actualWeightKg
        : exercise.actualWeightKg,
      actualReps: Object.prototype.hasOwnProperty.call(patch, 'actualReps')
        ? patch.actualReps
        : exercise.actualReps,
      rpe: Object.prototype.hasOwnProperty.call(patch, 'rpe') ? patch.rpe : exercise.rpe,
    });
  });
  return {
    ...workout,
    resultNotes: typeof correction.resultNotes === 'string'
      ? correction.resultNotes.trim()
      : workout.resultNotes,
    exercises,
    pointsAwarded: calculateAwardedPoints(exercises),
  };
}

/** @param {import('./model.js').Workout} workout */
export function skipWorkout(workout) {
  if (workout?.status !== 'planned') return workout;
  return {
    ...workout,
    status: 'skipped',
    completedAt: null,
    pointsAwarded: 0,
  };
}

/**
 * @param {import('./model.js').Workout} workout
 * @param {{id?: string, name?: string, now?: Date|number|string}} input
 * @param {{idFactory?: (prefix?: string) => string}} options
 */
export function createTemplateFromWorkout(workout, input = {}, options = {}) {
  const timestamp = nowIso(input.now);
  return normalizeTemplate({
    id: input.id || makeId(options.idFactory, 'template'),
    name: input.name || workout.title,
    plan: workoutToPlan(workout),
    createdAt: timestamp,
    updatedAt: timestamp,
  }, options);
}

/**
 * @param {import('./model.js').Template} template
 * @param {{plannedDate: string} & object} overrides
 * @param {{idFactory?: (prefix?: string) => string, today?: string}} options
 */
export function applyTemplate(template, overrides = {}, options = {}) {
  return createWorkoutFromPlan(template.plan, {
    ...overrides,
    sourceTemplateId: template.id,
    seriesId: null,
  }, options);
}

export const extractWorkoutPlan = workoutToPlan;
