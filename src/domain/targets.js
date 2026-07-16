import { pluralizeRu } from './plural.js';

export const TARGET_KINDS = Object.freeze(['reps', 'duration', 'distance']);
export const EXERCISE_STRUCTURES = Object.freeze(['sets', 'continuous']);

export const TARGET_UNITS = Object.freeze({
  reps: 'count',
  duration: 'seconds',
  distance: 'meters',
});

export const TARGET_DEFAULTS = Object.freeze({
  reps: 10,
  duration: 60,
  distance: 1000,
});

const TARGET_LIMITS = Object.freeze({
  reps: Object.freeze({ minimum: 1, maximum: 999 }),
  duration: Object.freeze({ minimum: 1, maximum: 86_400 }),
  distance: Object.freeze({ minimum: 1, maximum: 1_000_000 }),
});

const REP_FORMS = Object.freeze(['повтор', 'повтора', 'повторов']);
const MORE_FORMS = Object.freeze(['ещё', 'ещё', 'ещё']);

function toInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number);
  return rounded >= minimum && rounded <= maximum ? rounded : fallback;
}

function normalizeKind(value, fallback = 'reps') {
  return TARGET_KINDS.includes(value) ? value : fallback;
}

export function normalizeTarget(input, fallbackKind = 'reps') {
  const source = input && typeof input === 'object' ? input : {};
  const kind = normalizeKind(source.kind, normalizeKind(fallbackKind));
  const limits = TARGET_LIMITS[kind];
  return {
    kind,
    value: toInteger(
      source.value,
      TARGET_DEFAULTS[kind],
      limits.minimum,
      limits.maximum,
    ),
    unit: TARGET_UNITS[kind],
  };
}

function normalizeLegacyText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

export function parseLegacyPlannedTarget(value) {
  const text = normalizeLegacyText(value);
  const repsMatch = text.match(/^\d+$/u);
  if (repsMatch) {
    return { target: normalizeTarget({ kind: 'reps', value: Number(text) }), legacyTargetText: null };
  }

  const secondsMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:с|сек|секунда|секунды|секунд)$/iu);
  if (secondsMatch) {
    return {
      target: normalizeTarget({ kind: 'duration', value: Number(secondsMatch[1].replace(',', '.')) }),
      legacyTargetText: null,
    };
  }

  const minutesMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:м|мин|минута|минуты|минут)$/iu);
  if (minutesMatch) {
    const minutes = Number(minutesMatch[1].replace(',', '.'));
    return {
      target: normalizeTarget({ kind: 'duration', value: minutes * 60 }),
      legacyTargetText: null,
    };
  }

  const clockMatch = text.match(/^(\d{1,2}):(\d{2})$/u);
  if (clockMatch && Number(clockMatch[2]) < 60) {
    return {
      target: normalizeTarget({
        kind: 'duration',
        value: Number(clockMatch[1]) * 60 + Number(clockMatch[2]),
      }),
      legacyTargetText: null,
    };
  }

  return {
    target: normalizeTarget({ kind: 'reps', value: TARGET_DEFAULTS.reps }),
    legacyTargetText: text || null,
  };
}

export function normalizeExerciseStructure(value, target) {
  const normalizedTarget = normalizeTarget(target);
  if (normalizedTarget.kind === 'distance') return 'continuous';
  if (normalizedTarget.kind === 'reps') return 'sets';
  return EXERCISE_STRUCTURES.includes(value) ? value : 'sets';
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ч`);
  if (minutes) parts.push(`${minutes} мин`);
  if (remainder || !parts.length) parts.push(`${remainder} сек`);
  return parts.join(' ');
}

export function formatDistance(value) {
  const meters = Math.max(0, Math.round(Number(value) || 0));
  if (meters < 1000) return `${meters} м`;
  const kilometers = meters / 1000;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(kilometers)} км`;
}

export function formatTargetValue(target) {
  const normalized = normalizeTarget(target);
  if (normalized.kind === 'duration') return formatDuration(normalized.value);
  if (normalized.kind === 'distance') return formatDistance(normalized.value);
  return `${normalized.value} ${pluralizeRu(normalized.value, REP_FORMS)}`;
}

export function formatPace(secondsPerKilometer) {
  if (!Number.isFinite(Number(secondsPerKilometer)) || Number(secondsPerKilometer) <= 0) return '—';
  const seconds = Math.round(Number(secondsPerKilometer));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/км`;
}

export function countExerciseProgressUnits(exercise) {
  if (exercise?.structure === 'continuous') return 1;
  return Math.max(1, Math.min(20, Math.round(Number(exercise?.sets) || 1)));
}

export function formatExerciseTarget(exercise) {
  const target = normalizeTarget(exercise?.target);
  const targetLabel = formatTargetValue(target);
  if (normalizeExerciseStructure(exercise?.structure, target) === 'continuous') return targetLabel;
  const sets = countExerciseProgressUnits(exercise);
  const restSeconds = Math.max(0, Math.round(Number(exercise?.restSeconds) || 0));
  return `${sets} × ${targetLabel}${restSeconds > 0 ? ` · отдых ${formatDuration(restSeconds)}` : ''}`;
}

export function createAutomaticWorkoutTitle(exercises) {
  const names = (Array.isArray(exercises) ? exercises : [])
    .map((exercise) => String(exercise?.name ?? '').trim())
    .filter(Boolean);
  if (!names.length) return 'Тренировка';
  const visible = names
    .slice(0, 2)
    .map((name, index) => index === 0 ? name : `${name.charAt(0).toLocaleLowerCase('ru-RU')}${name.slice(1)}`)
    .join(' + ');
  const remaining = names.length - 2;
  return remaining > 0
    ? `${visible} + ${pluralizeRu(remaining, MORE_FORMS)} ${remaining}`
    : visible;
}
