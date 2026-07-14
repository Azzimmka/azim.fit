import { normalizeExerciseName } from '../../domain/records.js';

export function formatSessionClock(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getSessionElapsedSeconds(startedAt, now = Date.now()) {
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(current) || current < started) return null;
  return Math.floor((current - started) / 1_000);
}

export function countWorkoutSets(workout) {
  return (workout?.exercises ?? []).reduce((summary, exercise) => {
    const results = exercise.setResults ?? [];
    const total = Math.max(Number(exercise.sets) || 0, results.length);
    return {
      total: summary.total + total,
      completed: summary.completed + results.filter((result) => result?.status === 'completed').length,
      skipped: summary.skipped + results.filter((result) => result?.status === 'skipped').length,
    };
  }, { total: 0, completed: 0, skipped: 0 });
}

export function findPreviousCompletedSet(exercise, setIndex) {
  return (exercise?.setResults ?? [])
    .slice(0, Math.max(0, setIndex))
    .reverse()
    .find((result) => result?.status === 'completed') ?? null;
}

export function findPreviousExerciseResult(workouts, workout, exercise) {
  const normalizedName = normalizeExerciseName(exercise?.name);
  if (!normalizedName) return null;

  const candidates = (workouts ?? [])
    .filter((item) => item?.id !== workout?.id && item?.status === 'completed')
    .sort((left, right) => (
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
    ));

  for (const candidate of candidates) {
    const previousExercise = (candidate.exercises ?? []).find(
      (item) => normalizeExerciseName(item?.name) === normalizedName,
    );
    const result = previousExercise?.setResults
      ?.slice()
      .reverse()
      .find((item) => item?.status === 'completed');
    if (result) return { result, workout: candidate };
  }
  return null;
}

export function formatSetResult(result) {
  if (!result) return 'Нет данных';
  const values = [];
  if (Number.isFinite(Number(result.weightKg)) && Number(result.weightKg) > 0) {
    values.push(`${Number(result.weightKg)} кг`);
  }
  if (Number.isFinite(Number(result.reps)) && Number(result.reps) > 0) {
    values.push(`${Number(result.reps)} повт.`);
  }
  if (Number.isFinite(Number(result.rpe)) && Number(result.rpe) > 0) {
    values.push(`RPE ${Number(result.rpe)}`);
  }
  return values.length ? values.join(' · ') : 'Без веса и повторов';
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function validateSetDraft(draft) {
  const result = {
    weightKg: optionalNumber(draft?.weightKg),
    reps: optionalNumber(draft?.reps),
    rpe: optionalNumber(draft?.rpe),
  };
  const errors = {};

  if (result.weightKg !== null && (!Number.isFinite(result.weightKg) || result.weightKg < 0.5 || result.weightKg > 1000)) {
    errors.weightKg = 'Укажи вес от 0,5 до 1000 кг';
  }
  if (result.reps !== null && (!Number.isInteger(result.reps) || result.reps < 1 || result.reps > 999)) {
    errors.reps = 'Укажи целое число от 1 до 999';
  }
  if (result.rpe !== null && (!Number.isFinite(result.rpe) || result.rpe < 1 || result.rpe > 10)) {
    errors.rpe = 'Укажи RPE от 1 до 10';
  }

  return { result, errors, valid: Object.keys(errors).length === 0 };
}

export function toDraft(result = {}) {
  return {
    weightKg: result.weightKg ?? '',
    reps: result.reps ?? '',
    rpe: result.rpe ?? '',
  };
}

export function getWakeLockLabel(status) {
  if (status === 'active') return 'Экран не погаснет';
  if (status === 'released') return 'Защита экрана приостановлена';
  return 'Защита экрана недоступна';
}
