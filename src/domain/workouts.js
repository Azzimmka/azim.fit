import { compareCalendarDates, getToday, isCalendarDate } from './dates.js';
import { makeId } from './id.js';
import { calculateAwardedPoints } from './points.js';
import { normalizeExerciseName } from './records.js';
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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function isBlankOptionalValue(value) {
  return value === null || value === undefined || value === '';
}

function isValidSetValuePatch(result, targetKind = 'reps') {
  if (hasOwn(result, 'weightKg') && !isBlankOptionalValue(result.weightKg)) {
    const weight = Number(result.weightKg);
    if (!Number.isFinite(weight) || weight < 0.5 || weight > 1_000) return false;
  }
  if (hasOwn(result, 'reps') && !isBlankOptionalValue(result.reps)) {
    const reps = Number(result.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > 999) return false;
  }
  if (hasOwn(result, 'actualValue') && !isBlankOptionalValue(result.actualValue)) {
    const actualValue = Number(result.actualValue);
    const maximum = targetKind === 'distance' ? 1_000_000 : targetKind === 'duration' ? 86_400 : 999;
    if (!Number.isInteger(actualValue) || actualValue < 1 || actualValue > maximum) return false;
  }
  if (hasOwn(result, 'rpe') && !isBlankOptionalValue(result.rpe)) {
    const rpe = Number(result.rpe);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) return false;
  }
  return true;
}

/** @param {import('./model.js').Exercise} exercise */
function completedSetResults(exercise) {
  if (Array.isArray(exercise?.setResults)) {
    return exercise.setResults.filter((result) => result.status === 'completed');
  }
  const completedSets = Math.max(0, Math.trunc(Number(exercise?.completedSets) || 0));
  return Array.from({ length: completedSets }, (_, index) => ({
    setNumber: index + 1,
    status: 'completed',
    weightKg: exercise.actualWeightKg ?? null,
    reps: exercise.actualReps ?? null,
    rpe: exercise.rpe ?? null,
    completedAt: null,
  }));
}

/**
 * Applies result-editor patches without flattening genuine per-set data.
 * Aggregate expansion is reserved for a raw legacy exercise that did not have
 * setResults at all; normalized exercises update one selected/completed set.
 */
function applyExerciseResultPatch(exercise, patch = {}) {
  if (Array.isArray(patch.setResults)) {
    const setResults = patch.setResults.map((result, index) => {
      const previous = exercise.setResults?.[index];
      const changedLegacyReps = exercise.target?.kind === 'reps'
        && hasOwn(result, 'reps')
        && result.reps !== previous?.reps
        && (!hasOwn(result, 'actualValue') || result.actualValue === previous?.actualValue);
      return changedLegacyReps ? { ...result, actualValue: result.reps } : result;
    });
    return normalizeExercise({ ...exercise, setResults });
  }

  const hasAggregatePatch = ['completedSets', 'actualWeightKg', 'actualReps', 'rpe']
    .some((key) => hasOwn(patch, key));
  if (!hasAggregatePatch) return exercise;

  if (!Array.isArray(exercise.setResults)) {
    return normalizeExercise({ ...exercise, ...patch });
  }

  const requestedIndex = Number(patch.setIndex);
  const lastCompletedIndex = exercise.setResults.findLastIndex(
    (result) => result.status === 'completed',
  );
  const targetIndex = Number.isInteger(requestedIndex)
    && requestedIndex >= 0
    && requestedIndex < exercise.setResults.length
    ? requestedIndex
    : (lastCompletedIndex >= 0 ? lastCompletedIndex : 0);
  const hasValuePatch = ['actualWeightKg', 'actualReps', 'rpe']
    .some((key) => hasOwn(patch, key));
  if (!hasValuePatch || !exercise.setResults[targetIndex]) return exercise;

  const setResults = exercise.setResults.map((result, index) => index === targetIndex
    ? {
      ...result,
      weightKg: hasOwn(patch, 'actualWeightKg') ? patch.actualWeightKg : result.weightKg,
      reps: hasOwn(patch, 'actualReps') ? patch.actualReps : result.reps,
      actualValue: hasOwn(patch, 'actualReps') ? patch.actualReps : result.actualValue,
      rpe: hasOwn(patch, 'rpe') ? patch.rpe : result.rpe,
    }
    : result);
  return normalizeExercise({ ...exercise, setResults });
}

/** @param {import('./model.js').Workout} workout @param {Date|number|string} now */
export function startWorkoutSession(workout, now = Date.now()) {
  if (workout?.status !== 'planned' || workout.startedAt) return workout;
  const startedAt = nowIso(now);
  if (compareCalendarDates(workout.plannedDate, getToday(startedAt)) > 0) return workout;
  return { ...workout, startedAt };
}

/**
 * @param {import('./model.js').Workout} workout
 * @returns {{exerciseId: string, exerciseIndex: number, setIndex: number, setNumber: number}|null}
 */
export function findFirstPendingWorkoutSet(workout) {
  for (let exerciseIndex = 0; exerciseIndex < (workout?.exercises?.length ?? 0); exerciseIndex += 1) {
    const exercise = workout.exercises[exerciseIndex];
    if (exercise.structure === 'continuous') continue;
    const setIndex = exercise.setResults.findIndex((result) => result.status === 'pending');
    if (setIndex >= 0) {
      return {
        exerciseId: exercise.id,
        exerciseIndex,
        setIndex,
        setNumber: setIndex + 1,
      };
    }
  }
  return null;
}

/**
 * Finds the next user-visible progress unit. A continuous exercise is one
 * unit, while a regular exercise exposes each set independently.
 * @param {import('./model.js').Workout} workout
 */
export function findFirstPendingWorkoutUnit(workout) {
  for (let exerciseIndex = 0; exerciseIndex < (workout?.exercises?.length ?? 0); exerciseIndex += 1) {
    const exercise = workout.exercises[exerciseIndex];
    if (exercise.structure === 'continuous') {
      if (exercise.continuousResult?.status === 'pending') {
        return {
          kind: 'continuous',
          exerciseId: exercise.id,
          exerciseIndex,
          setIndex: null,
          setNumber: 1,
        };
      }
      continue;
    }
    const setIndex = exercise.setResults.findIndex((result) => result.status === 'pending');
    if (setIndex >= 0) {
      return {
        kind: 'set',
        exerciseId: exercise.id,
        exerciseIndex,
        setIndex,
        setNumber: setIndex + 1,
      };
    }
  }
  return null;
}

/**
 * Provides initial fields for a pending set without mutating the workout.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 * @param {number} setIndex Zero-based set index.
 * @param {import('./model.js').Workout[]} previousWorkouts
 */
export function getWorkoutSetDefaults(workout, exerciseId, setIndex, previousWorkouts = []) {
  const exercise = workout?.exercises?.find((item) => item.id === exerciseId);
  if (!exercise) return { weightKg: null, reps: null, rpe: null };

  const safeIndex = Math.min(
    exercise.setResults.length,
    Math.max(0, Math.trunc(Number(setIndex) || 0)),
  );
  const previousSet = exercise.setResults
    .slice(0, safeIndex)
    .reverse()
    .find((result) => result.status === 'completed') ?? null;

  const normalizedName = normalizeExerciseName(exercise.name);
  let historicalSet = null;
  const completedWorkouts = previousWorkouts
    .filter((item) => item?.status === 'completed' && item.id !== workout.id)
    .sort((left, right) => (
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
    ));
  for (const previousWorkout of completedWorkouts) {
    const matchingExercise = previousWorkout.exercises?.find((item) => (
      normalizeExerciseName(item.name) === normalizedName
    ));
    historicalSet = completedSetResults(matchingExercise).at(-1) ?? null;
    if (historicalSet) break;
  }

  const plannedRepsText = String(exercise.plannedReps ?? '').trim();
  const plannedReps = /^\d+$/.test(plannedRepsText) ? Number(plannedRepsText) : null;
  return {
    weightKg: previousSet?.weightKg ?? historicalSet?.weightKg ?? exercise.plannedWeightKg ?? null,
    reps: previousSet?.reps ?? historicalSet?.reps ?? plannedReps,
    rpe: previousSet?.rpe ?? historicalSet?.rpe ?? null,
  };
}

/**
 * Converts a bodyweight exercise plan into the result stored by the guided
 * session. Non-numeric plans (for example, "30 сек") deliberately keep reps
 * empty instead of inventing a value.
 * @param {import('./model.js').Exercise} exercise
 */
export function getPlannedBodyweightSetResult(exercise) {
  const targetKind = exercise?.target?.kind === 'duration' ? 'duration' : 'reps';
  const targetValue = Number(exercise?.target?.value);
  const maximum = targetKind === 'duration' ? 86_400 : 999;
  const canonicalValue = Number.isInteger(targetValue)
    && targetValue >= 1
    && targetValue <= maximum
    ? targetValue
    : null;
  const plannedRepsText = String(exercise?.plannedReps ?? '').trim();
  const legacyReps = /^\d+$/.test(plannedRepsText) ? Number(plannedRepsText) : null;
  const plannedValue = canonicalValue ?? (
    targetKind === 'reps'
    && Number.isInteger(legacyReps)
    && legacyReps >= 1
    && legacyReps <= 999
      ? legacyReps
      : null
  );
  return {
    weightKg: null,
    reps: targetKind === 'reps' ? plannedValue : null,
    actualValue: plannedValue,
    rpe: null,
  };
}

/** @param {import('./model.js').Exercise} exercise */
export function calculateExerciseVolume(exercise) {
  return completedSetResults(exercise).reduce((sum, result) => {
    const weight = Number(result.weightKg);
    const reps = Number(result.reps);
    return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0
      ? sum + weight * reps
      : sum;
  }, 0);
}

/** @param {import('./model.js').Workout} workout */
export function calculateWorkoutVolume(workout) {
  return (workout?.exercises ?? []).reduce(
    (sum, exercise) => sum + calculateExerciseVolume(exercise),
    0,
  );
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
    startedAt: null,
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
 * Toggles exactly one set. Other completed, pending, or skipped results keep
 * their status and values.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 * @param {number} index Zero-based set index.
 */
export function toggleWorkoutSet(workout, exerciseId, index) {
  if (workout?.status !== 'planned') return workout;
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0) return workout;
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (exercise.structure === 'continuous' || exercise.id !== exerciseId || numericIndex >= exercise.setResults.length) return exercise;
    const setResults = exercise.setResults.map((result, resultIndex) => resultIndex === numericIndex
      ? {
        ...result,
        status: result.status === 'completed' ? 'pending' : 'completed',
        completedAt: null,
      }
      : result);
    changed = true;
    return normalizeExercise({ ...exercise, setResults });
  });
  return changed ? { ...workout, exercises } : workout;
}

/**
 * Updates values of one set without changing its completion status.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 * @param {number} setIndex Zero-based set index.
 * @param {{weightKg?: number|null, reps?: number|null, rpe?: number|null}} patch
 */
export function updateWorkoutSetResult(workout, exerciseId, setIndex, patch = {}) {
  if (workout?.status !== 'planned') return workout;
  const numericIndex = Number(setIndex);
  if (!Number.isInteger(numericIndex) || numericIndex < 0) return workout;

  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (exercise.structure === 'continuous' || exercise.id !== exerciseId || numericIndex >= exercise.setResults.length) return exercise;
    if (!isValidSetValuePatch(patch, exercise.target?.kind)) return exercise;
    const setResults = exercise.setResults.map((result, index) => {
      if (index !== numericIndex) return result;
      changed = true;
      const actualValue = hasOwn(patch, 'actualValue')
        ? patch.actualValue
        : hasOwn(patch, 'reps') ? patch.reps : result.actualValue;
      return {
        ...result,
        weightKg: hasOwn(patch, 'weightKg') ? patch.weightKg : result.weightKg,
        reps: exercise.target?.kind === 'reps' ? actualValue : null,
        actualValue,
        rpe: hasOwn(patch, 'rpe') ? patch.rpe : result.rpe,
      };
    });
    return normalizeExercise({ ...exercise, setResults });
  });
  return changed ? { ...workout, exercises } : workout;
}

/**
 * Completes exactly one set. Repeating the same completion is idempotent;
 * corrections use updateWorkoutSetResult instead.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 * @param {number} setIndex Zero-based set index.
 * @param {{weightKg?: number|null, reps?: number|null, rpe?: number|null, completedAt?: Date|number|string}} result
 */
export function completeWorkoutSet(workout, exerciseId, setIndex, result = {}) {
  if (workout?.status !== 'planned') return workout;
  const numericIndex = Number(setIndex);
  if (!Number.isInteger(numericIndex) || numericIndex < 0) return workout;

  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (exercise.structure === 'continuous' || exercise.id !== exerciseId || numericIndex >= exercise.setResults.length) return exercise;
    if (!isValidSetValuePatch(result, exercise.target?.kind)) return exercise;
    if (exercise.setResults[numericIndex].status === 'completed') return exercise;
    const setResults = exercise.setResults.map((setResult, index) => {
      if (index !== numericIndex) return setResult;
      const actualValue = hasOwn(result, 'actualValue')
        ? result.actualValue
        : hasOwn(result, 'reps') ? result.reps : setResult.actualValue;
      return {
        ...setResult,
        status: 'completed',
        weightKg: hasOwn(result, 'weightKg') ? result.weightKg : setResult.weightKg,
        reps: exercise.target?.kind === 'reps' ? actualValue : null,
        actualValue,
        rpe: hasOwn(result, 'rpe') ? result.rpe : setResult.rpe,
        completedAt: nowIso(result.completedAt),
      };
    });
    changed = true;
    return normalizeExercise({ ...exercise, setResults });
  });
  return changed ? { ...workout, exercises } : workout;
}

/** Completes the one progress unit of a distance/time continuous exercise. */
export function completeContinuousExercise(workout, exerciseId, result = {}) {
  if (workout?.status !== 'planned' || result?.status !== 'completed') return workout;
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (
      exercise.id !== exerciseId
      || exercise.structure !== 'continuous'
      || exercise.continuousResult?.status !== 'pending'
    ) return exercise;
    const actualValue = Number(result.actualValue);
    const maximum = exercise.target?.kind === 'distance' ? 1_000_000 : 86_400;
    if (!Number.isInteger(actualValue) || actualValue < 1 || actualValue > maximum) return exercise;
    changed = true;
    return normalizeExercise({
      ...exercise,
      continuousResult: {
        status: 'completed',
        actualValue,
        distanceMeters: result.distanceMeters,
        activeDurationSeconds: result.activeDurationSeconds,
        averagePaceSecondsPerKm: result.averagePaceSecondsPerKm,
        completedAt: result.completedAt,
      },
    });
  });
  return changed ? { ...workout, exercises } : workout;
}

/** Corrects a completed continuous result without changing the plan. */
export function updateContinuousExerciseResult(workout, exerciseId, result = {}) {
  if (!['planned', 'completed'].includes(workout?.status)) return workout;
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (
      exercise.id !== exerciseId
      || exercise.structure !== 'continuous'
      || exercise.continuousResult?.status !== 'completed'
    ) return exercise;
    const actualValue = Number(result.actualValue);
    const maximum = exercise.target?.kind === 'distance' ? 1_000_000 : 86_400;
    if (!Number.isInteger(actualValue) || actualValue < 1 || actualValue > maximum) return exercise;
    changed = true;
    return normalizeExercise({
      ...exercise,
      continuousResult: {
        ...exercise.continuousResult,
        ...result,
        status: 'completed',
      },
    });
  });
  return changed ? { ...workout, exercises } : workout;
}

/**
 * Marks only remaining pending sets of an exercise as skipped.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 */
export function skipRemainingExerciseSets(workout, exerciseId) {
  if (workout?.status !== 'planned') return workout;
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (exercise.id !== exerciseId) return exercise;
    if (exercise.structure === 'continuous') {
      if (exercise.continuousResult?.status !== 'pending') return exercise;
      changed = true;
      return normalizeExercise({
        ...exercise,
        continuousResult: { status: 'skipped' },
      });
    }
    let exerciseChanged = false;
    const setResults = exercise.setResults.map((result) => {
      if (result.status !== 'pending') return result;
      changed = true;
      exerciseChanged = true;
      return {
        ...result,
        status: 'skipped',
        weightKg: null,
        reps: null,
        actualValue: null,
        rpe: null,
        completedAt: null,
      };
    });
    return exerciseChanged ? normalizeExercise({ ...exercise, setResults }) : exercise;
  });
  return changed ? { ...workout, exercises } : workout;
}

/**
 * Marks exactly one next set for an exercise. The aggregate result is capped
 * at the planned set count, so starting another rest after the last set only
 * restarts the timer.
 * @param {import('./model.js').Workout} workout
 * @param {string} exerciseId
 */
export function completeNextWorkoutSet(workout, exerciseId, result = {}) {
  if (workout?.status !== 'planned') return workout;
  const exercise = workout.exercises.find((item) => item.id === exerciseId);
  const setIndex = exercise?.setResults.findIndex((item) => item.status === 'pending') ?? -1;
  return setIndex >= 0
    ? completeWorkoutSet(workout, exerciseId, setIndex, result)
    : workout;
}

/**
 * Stores in-progress results before completion. Aggregate editor patches are
 * expanded to per-set results for backwards compatibility.
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
      ? result.resultNotes
      : workout.resultNotes,
    exercises: workout.exercises.map((exercise) => {
      const patch = patches.get(exercise.id);
      if (!patch) return exercise;
      return applyExerciseResultPatch(exercise, patch);
    }),
  };
}

/**
 * Future workouts are deliberately rejected. Late completion retains the
 * original plannedDate while completedAt records the actual event time.
 * @param {import('./model.js').Workout} workout
 * @param {{completedAt?: Date|number|string, resultNotes?: string, exercises?: object[], requireResolvedSets?: boolean}} result
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
  const exercises = workout.exercises.map((exercise) => {
    const patch = resultById.get(exercise.id);
    return patch ? applyExerciseResultPatch(exercise, patch) : exercise;
  });
  if (
    result.requireResolvedSets === true
    && exercises.some((exercise) => exercise.structure === 'continuous'
      ? exercise.continuousResult?.status === 'pending'
      : exercise.setResults.some((set) => set.status === 'pending'))
  ) {
    return workout;
  }

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
    return applyExerciseResultPatch(exercise, patch);
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
