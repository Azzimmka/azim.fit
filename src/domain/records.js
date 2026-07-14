/** @param {unknown} name */
export function normalizeExerciseName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function completionTimestamp(workout) {
  const timestamp = new Date(workout.completedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function createRecord(value, workout, exercise) {
  return {
    value,
    workoutId: workout.id,
    exerciseId: exercise.id,
    achievedAt: workout.completedAt,
  };
}

function replaceIfStrictlyGreater(current, value, workout, exercise) {
  if (!Number.isFinite(value) || value <= 0) return current;
  if (current && value <= current.value) return current;
  return createRecord(value, workout, exercise);
}

function getCompletedSetResults(exercise) {
  if (Array.isArray(exercise?.setResults)) {
    return exercise.setResults.filter((result) => result?.status === 'completed');
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
 * Recomputes PRs entirely from current completed workouts, so deletion and
 * result correction need no special invalidation path. Equal values never
 * replace the original record holder.
 * @param {Array<import('./model.js').Workout>} workouts
 */
export function calculatePersonalRecords(workouts = []) {
  const byExercise = new Map();
  const completed = workouts
    .filter((workout) => workout?.status === 'completed')
    .sort((left, right) => (
      completionTimestamp(left) - completionTimestamp(right)
      || String(left.id).localeCompare(String(right.id))
    ));

  for (const workout of completed) {
    for (const exercise of workout.exercises ?? []) {
      const key = normalizeExerciseName(exercise.name);
      const setResults = getCompletedSetResults(exercise);
      if (!key || setResults.length === 0) continue;
      const record = byExercise.get(key) ?? {
        normalizedName: key,
        displayName: exercise.name.trim(),
        weight: null,
        volume: null,
        reps: null,
      };
      const weightedSets = setResults.filter((result) => (
        Number.isFinite(Number(result.weightKg)) && Number(result.weightKg) > 0
      ));

      if (weightedSets.length > 0) {
        const maxWeight = Math.max(...weightedSets.map((result) => Number(result.weightKg)));
        const volume = weightedSets.reduce((sum, result) => {
          const reps = Number(result.reps);
          return Number.isFinite(reps) && reps > 0
            ? sum + Number(result.weightKg) * reps
            : sum;
        }, 0);
        record.weight = replaceIfStrictlyGreater(record.weight, maxWeight, workout, exercise);
        record.volume = replaceIfStrictlyGreater(record.volume, volume, workout, exercise);
      } else {
        const maxReps = Math.max(
          0,
          ...setResults.map((result) => Number(result.reps)).filter((reps) => (
            Number.isFinite(reps) && reps > 0
          )),
        );
        record.reps = replaceIfStrictlyGreater(record.reps, maxReps, workout, exercise);
      }

      byExercise.set(key, record);
    }
  }

  return [...byExercise.values()].sort((left, right) => (
    left.displayName.localeCompare(right.displayName, 'ru-RU')
  ));
}

/**
 * Returns strict PR improvements introduced by a completed candidate workout.
 * @param {import('./model.js').Workout} candidate
 * @param {Array<import('./model.js').Workout>} previousWorkouts
 */
export function findNewPersonalRecords(candidate, previousWorkouts = []) {
  if (candidate?.status !== 'completed') return [];
  const before = new Map(
    calculatePersonalRecords(previousWorkouts).map((record) => [record.normalizedName, record]),
  );
  const after = calculatePersonalRecords([...previousWorkouts, candidate]);
  const newRecords = [];

  for (const record of after) {
    const previous = before.get(record.normalizedName);
    for (const metric of ['weight', 'volume', 'reps']) {
      const nextMetric = record[metric];
      const previousMetric = previous?.[metric];
      if (
        nextMetric?.workoutId === candidate.id
        && (!previousMetric || nextMetric.value > previousMetric.value)
      ) {
        newRecords.push({
          normalizedName: record.normalizedName,
          displayName: record.displayName,
          metric,
          ...nextMetric,
        });
      }
    }
  }
  return newRecords;
}

export const getPersonalRecords = calculatePersonalRecords;
