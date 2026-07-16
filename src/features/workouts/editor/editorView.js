import { createAutomaticWorkoutTitle, normalizeTarget } from '../../../domain/targets.js';

export function getInitialEditorStep(mode, hasPlan) {
  return mode === 'create' && !hasPlan ? 'picker' : 'builder';
}

export function getNextAutomaticTitle(exercises, titleWasEdited) {
  return titleWasEdited ? null : createAutomaticWorkoutTitle(exercises);
}

export function validateExerciseDraft(exercise) {
  if (!String(exercise?.name ?? '').trim()) return 'Укажи название упражнения.';
  const structure = exercise?.structure === 'continuous' ? 'continuous' : 'sets';
  const target = normalizeTarget(exercise?.target);
  if (structure === 'sets') {
    const sets = Number(exercise.sets);
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
      return 'Количество подходов должно быть от 1 до 20.';
    }
    if (target.kind === 'distance') return 'Дистанция доступна для непрерывной тренировки.';
    const rest = Number(exercise.restSeconds);
    if (!Number.isInteger(rest) || (rest !== 0 && (rest < 15 || rest > 900))) {
      return 'Отдых должен быть 0 или от 15 до 900 секунд.';
    }
  } else if (target.kind === 'reps') {
    return 'Для непрерывной тренировки выбери время или дистанцию.';
  }
  return '';
}
