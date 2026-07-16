import { countExerciseProgressUnits } from './targets.js';

const BASE_WORKOUT_POINTS = 20;
const POINTS_PER_SET = 5;

function toSetCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

/** @param {Array<{sets?: number}>} exercises */
export function calculatePlanPoints(exercises = []) {
  const units = exercises.reduce(
    (sum, exercise) => sum + countExerciseProgressUnits(exercise, false),
    0,
  );
  return BASE_WORKOUT_POINTS + units * POINTS_PER_SET;
}

/** @param {Array<{completedSets?: number, setResults?: Array<{status?: string}>}>} exercises */
export function calculateAwardedPoints(exercises = []) {
  const units = exercises.reduce((sum, exercise) => {
    if (exercise?.structure === 'continuous') {
      return sum + (exercise.continuousResult?.status === 'completed' ? 1 : 0);
    }
    if (Array.isArray(exercise?.setResults)) {
      return sum + exercise.setResults.filter((result) => result?.status === 'completed').length;
    }
    return sum + toSetCount(exercise?.completedSets);
  }, 0);
  return BASE_WORKOUT_POINTS + units * POINTS_PER_SET;
}

/** @param {{status?: string, pointsAwarded?: number, exercises?: Array<object>}} workout */
export function getWorkoutPoints(workout) {
  if (workout?.status === 'completed') {
    const awarded = Number(workout.pointsAwarded);
    return Number.isFinite(awarded) && awarded >= 0
      ? awarded
      : calculateAwardedPoints(workout.exercises);
  }
  return calculatePlanPoints(workout?.exercises);
}

export const POINTS_FORMULA = Object.freeze({
  base: BASE_WORKOUT_POINTS,
  perSet: POINTS_PER_SET,
});
