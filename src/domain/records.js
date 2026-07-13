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
      if (!key || Number(exercise.completedSets) <= 0) continue;
      const record = byExercise.get(key) ?? {
        normalizedName: key,
        displayName: exercise.name.trim(),
        weight: null,
        volume: null,
        reps: null,
      };
      const weight = Number(exercise.actualWeightKg);
      const reps = Number(exercise.actualReps);
      const sets = Number(exercise.completedSets);

      if (Number.isFinite(weight) && weight > 0) {
        record.weight = replaceIfStrictlyGreater(record.weight, weight, workout, exercise);
        if (Number.isFinite(reps) && reps > 0 && Number.isFinite(sets) && sets > 0) {
          record.volume = replaceIfStrictlyGreater(
            record.volume,
            weight * reps * sets,
            workout,
            exercise,
          );
        }
      } else if (Number.isFinite(reps) && reps > 0) {
        record.reps = replaceIfStrictlyGreater(record.reps, reps, workout, exercise);
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

