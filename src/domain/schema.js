import {
  addCalendarDays,
  addCalendarYears,
  compareCalendarDates,
  getIsoWeekday,
  getToday,
  isCalendarDate,
  localDateTimeToTimestamp,
  normalizeClockTime,
} from './dates.js';
import { makeId } from './id.js';
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_SERIES_WEEKS,
  MAX_EXERCISE_SETS,
  SCHEMA_VERSION,
  SET_RESULT_STATUSES,
  WORKOUT_STATUSES,
} from './model.js';
import { calculateAwardedPoints } from './points.js';
import { normalizeActiveTimerForWorkouts, normalizeRestSeconds } from './timer.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toNullableId(value) {
  const normalized = toText(value);
  return normalized || null;
}

function toBoundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function toPositiveNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toWeightOrNull(value) {
  const number = toPositiveNumberOrNull(value);
  return number !== null && number >= 0.5 && number <= 1_000 ? number : null;
}

function toRepsOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 999 ? number : null;
}

function toRpeOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 10 ? number : null;
}

function toIsoTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function ensureUniqueIds(items, prefix, idFactory) {
  const seen = new Set();
  return items.map((item) => {
    let id = item.id;
    if (!id || seen.has(id)) id = makeId(idFactory, prefix);
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

/**
 * @param {unknown} input
 * @param {number} setNumber
 * @param {{completedAt?: string|null, forcePending?: boolean}} options
 * @returns {import('./model.js').SetResult}
 */
export function normalizeSetResult(input, setNumber, options = {}) {
  const source = isRecord(input) ? input : {};
  const status = options.forcePending === true
    ? 'pending'
    : (SET_RESULT_STATUSES.includes(source.status) ? source.status : 'pending');
  const keepValues = status !== 'skipped';

  return {
    setNumber,
    status,
    weightKg: keepValues ? toWeightOrNull(source.weightKg ?? source.actualWeightKg) : null,
    reps: keepValues ? toRepsOrNull(source.reps ?? source.actualReps) : null,
    rpe: keepValues ? toRpeOrNull(source.rpe) : null,
    completedAt: status === 'completed'
      ? toIsoTimestamp(source.completedAt, options.completedAt ?? null)
      : null,
  };
}

/** @param {import('./model.js').SetResult[]} setResults */
function aggregateSetResults(setResults) {
  const completed = setResults.filter((result) => result.status === 'completed');
  const lastCompleted = completed.at(-1) ?? null;
  return {
    completedSets: completed.length,
    actualWeightKg: lastCompleted?.weightKg ?? null,
    actualReps: lastCompleted?.reps ?? null,
    rpe: lastCompleted?.rpe ?? null,
  };
}

/**
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, planningOnly?: boolean, completedAt?: string|null}} options
 * @returns {import('./model.js').Exercise}
 */
export function normalizeExercise(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const sets = toBoundedInteger(source.sets, 1, 1, MAX_EXERCISE_SETS);
  const plannedRepsValue = source.plannedReps ?? source.reps ?? '10';
  const plannedReps = String(plannedRepsValue ?? '').trim() || '10';
  const planningOnly = options.planningOnly === true;
  let setResults;

  if (planningOnly) {
    setResults = Array.from({ length: sets }, (_, index) => normalizeSetResult(
      null,
      index + 1,
      { forcePending: true },
    ));
  } else if (Array.isArray(source.setResults)) {
    setResults = Array.from({ length: sets }, (_, index) => normalizeSetResult(
      source.setResults[index],
      index + 1,
      { completedAt: options.completedAt ?? null },
    ));
  } else {
    const completedSets = toBoundedInteger(source.completedSets, 0, 0, sets);
    const legacyResult = {
      weightKg: toWeightOrNull(source.actualWeightKg),
      reps: toRepsOrNull(source.actualReps),
      rpe: toRpeOrNull(source.rpe),
    };
    setResults = Array.from({ length: sets }, (_, index) => normalizeSetResult(
      index < completedSets
        ? { ...legacyResult, status: 'completed' }
        : { status: 'pending' },
      index + 1,
      { completedAt: options.completedAt ?? null },
    ));
  }

  const aggregates = aggregateSetResults(setResults);

  return {
    id: toText(source.id) || makeId(options.idFactory, 'exercise'),
    name: toText(source.name, 'Упражнение') || 'Упражнение',
    sets,
    plannedReps,
    plannedWeightKg: toWeightOrNull(
      source.plannedWeightKg ?? source.weightKg ?? source.weight,
    ),
    restSeconds: normalizeRestSeconds(source.restSeconds, DEFAULT_REST_SECONDS),
    ...aggregates,
    setResults,
  };
}

/**
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string}} options
 * @returns {import('./model.js').WorkoutPlanSnapshot}
 */
export function normalizePlanSnapshot(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const exercises = Array.isArray(source.exercises)
    ? source.exercises.map((exercise) => normalizeExercise(exercise, {
      idFactory: options.idFactory,
      planningOnly: true,
    }))
    : [];

  return {
    title: toText(source.title, 'Тренировка') || 'Тренировка',
    type: toText(source.type, 'Силовая') || 'Силовая',
    time: normalizeClockTime(source.time, '18:00'),
    intensity: toText(source.intensity, 'Средняя') || 'Средняя',
    exercises: ensureUniqueIds(exercises, 'exercise', options.idFactory).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      plannedReps: exercise.plannedReps,
      plannedWeightKg: exercise.plannedWeightKg,
      restSeconds: exercise.restSeconds,
    })),
  };
}

/**
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, today?: string}} options
 * @returns {import('./model.js').Workout}
 */
export function normalizeWorkout(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const today = isCalendarDate(options.today) ? options.today : getToday();
  const plannedDateCandidate = source.plannedDate ?? source.date;
  const plannedDate = isCalendarDate(plannedDateCandidate) ? plannedDateCandidate : today;
  const occurrenceCandidate = source.occurrenceDate;
  const occurrenceDate = isCalendarDate(occurrenceCandidate) ? occurrenceCandidate : plannedDate;
  const inferredStatus = source.completed === true ? 'completed' : 'planned';
  const status = WORKOUT_STATUSES.includes(source.status) ? source.status : inferredStatus;
  const time = normalizeClockTime(source.time, '18:00');
  const fallbackCompletionTimestamp = localDateTimeToTimestamp(plannedDate, time);
  const fallbackCompletedAt = Number.isFinite(fallbackCompletionTimestamp)
    ? new Date(fallbackCompletionTimestamp).toISOString()
    : new Date().toISOString();
  const completedAt = status === 'completed'
    ? toIsoTimestamp(source.completedAt, fallbackCompletedAt)
    : null;
  const exercises = ensureUniqueIds(
    (Array.isArray(source.exercises) ? source.exercises : []).map((exercise) => normalizeExercise(
      exercise,
      { idFactory: options.idFactory, completedAt },
    )),
    'exercise',
    options.idFactory,
  );
  const inputPoints = Number(source.pointsAwarded ?? source.points);
  const pointsAwarded = status === 'completed'
    ? (Number.isFinite(inputPoints) && inputPoints >= 0
      ? inputPoints
      : calculateAwardedPoints(exercises))
    : 0;

  return {
    id: toText(source.id) || makeId(options.idFactory, 'workout'),
    title: toText(source.title, 'Тренировка') || 'Тренировка',
    type: toText(source.type, 'Силовая') || 'Силовая',
    status,
    plannedDate,
    occurrenceDate,
    time,
    intensity: toText(source.intensity, 'Средняя') || 'Средняя',
    resultNotes: toText(source.resultNotes),
    startedAt: toIsoTimestamp(source.startedAt, null),
    completedAt,
    seriesId: toNullableId(source.seriesId),
    sourceTemplateId: toNullableId(source.sourceTemplateId),
    pointsAwarded,
    exercises,
  };
}

/**
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, today?: string}} options
 * @returns {import('./model.js').RecurrenceSeries}
 */
export function normalizeSeries(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const today = isCalendarDate(options.today) ? options.today : getToday();
  const startsOn = isCalendarDate(source.startsOn ?? source.startDate)
    ? (source.startsOn ?? source.startDate)
    : today;
  const defaultEndsOn = addCalendarDays(startsOn, DEFAULT_SERIES_WEEKS * 7 - 1);
  const maxEndsOn = addCalendarDays(addCalendarYears(startsOn, 1), -1);
  let endsOn = isCalendarDate(source.endsOn ?? source.endDate)
    ? (source.endsOn ?? source.endDate)
    : defaultEndsOn;
  if (compareCalendarDates(endsOn, startsOn) < 0) endsOn = defaultEndsOn;
  if (compareCalendarDates(endsOn, maxEndsOn) > 0) endsOn = maxEndsOn;

  const weekdays = [...new Set(
    (Array.isArray(source.weekdays) ? source.weekdays : [])
      .map(Number)
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7),
  )].sort((left, right) => left - right);

  const exclusions = [...new Set(
    (Array.isArray(source.excludedOccurrenceDates) ? source.excludedOccurrenceDates : [])
      .filter(isCalendarDate)
      .filter((date) => compareCalendarDates(date, startsOn) >= 0 && compareCalendarDates(date, endsOn) <= 0),
  )].sort();

  return {
    id: toText(source.id) || makeId(options.idFactory, 'series'),
    weekdays: weekdays.length ? weekdays : [getIsoWeekday(startsOn)],
    intervalWeeks: toBoundedInteger(source.intervalWeeks, 1, 1, 4),
    startsOn,
    endsOn,
    excludedOccurrenceDates: exclusions,
    planSnapshot: normalizePlanSnapshot(source.planSnapshot ?? source.plan, options),
  };
}

/**
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, now?: Date|number|string}} options
 * @returns {import('./model.js').Template}
 */
export function normalizeTemplate(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const now = toIsoTimestamp(options.now, new Date().toISOString());
  const createdAt = toIsoTimestamp(source.createdAt, now);
  return {
    id: toText(source.id) || makeId(options.idFactory, 'template'),
    name: toText(source.name ?? source.title, 'Шаблон') || 'Шаблон',
    plan: normalizePlanSnapshot(source.plan ?? source.planSnapshot ?? source, options),
    createdAt,
    updatedAt: toIsoTimestamp(source.updatedAt, createdAt),
  };
}

/** @param {unknown} input @param {{now?: Date|number|string}} options */
export function normalizeBodyWeightEntry(input, options = {}) {
  if (!isRecord(input) || !isCalendarDate(input.date)) return null;
  const weightKg = Number(input.weightKg ?? input.weight);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1_000) return null;
  return {
    date: input.date,
    weightKg,
    updatedAt: toIsoTimestamp(input.updatedAt, toIsoTimestamp(options.now, new Date().toISOString())),
  };
}

/** @param {unknown} input */
export function normalizeSettings() {
  return {};
}

/** @returns {import('./model.js').AppStateV2} */
export function createEmptyAppState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    workouts: [],
    series: [],
    templates: [],
    bodyWeightEntries: [],
    settings: normalizeSettings(null),
    activeTimer: null,
  };
}

/**
 * Runtime-normalizes partially damaged V2 values without throwing.
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 * @returns {import('./model.js').AppStateV2}
 */
export function normalizeAppState(input, options = {}) {
  if (!isRecord(input)) return createEmptyAppState();
  const settings = normalizeSettings(input.settings);
  const workouts = ensureUniqueIds(
    (Array.isArray(input.workouts) ? input.workouts : [])
      .filter(isRecord)
      .map((workout) => normalizeWorkout(workout, options)),
    'workout',
    options.idFactory,
  );
  const series = ensureUniqueIds(
    (Array.isArray(input.series) ? input.series : [])
      .filter(isRecord)
      .map((item) => normalizeSeries(item, options)),
    'series',
    options.idFactory,
  );
  const templates = ensureUniqueIds(
    (Array.isArray(input.templates) ? input.templates : [])
      .filter(isRecord)
      .map((template) => normalizeTemplate(template, options)),
    'template',
    options.idFactory,
  );

  const bodyWeightByDate = new Map();
  for (const value of Array.isArray(input.bodyWeightEntries) ? input.bodyWeightEntries : []) {
    const entry = normalizeBodyWeightEntry(value, options);
    if (entry) bodyWeightByDate.set(entry.date, entry);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    workouts,
    series,
    templates,
    bodyWeightEntries: [...bodyWeightByDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    settings,
    activeTimer: normalizeActiveTimerForWorkouts(input.activeTimer, workouts),
  };
}

/**
 * Migrates the original `{workouts}` store. The migration preserves completed
 * set counts and the exact historical points for completed workouts. Planned
 * workouts keep zero awarded points; their preview is derived from the plan.
 * @param {unknown} input
 * @param {{idFactory?: (prefix?: string) => string, today?: string, now?: Date|number|string}} options
 */
export function migrateV1State(input, options = {}) {
  if (!isRecord(input)) return createEmptyAppState();
  const workouts = (Array.isArray(input.workouts) ? input.workouts : [])
    .filter(isRecord)
    .map((workout) => normalizeWorkout({
      ...workout,
      status: workout.completed === true ? 'completed' : 'planned',
      plannedDate: workout.date,
      occurrenceDate: workout.date,
      resultNotes: '',
      seriesId: null,
      sourceTemplateId: null,
      pointsAwarded: workout.completed === true ? workout.points : 0,
      exercises: (Array.isArray(workout.exercises) ? workout.exercises : []).map((exercise) => ({
        ...exercise,
        plannedReps: exercise.reps,
        plannedWeightKg: exercise.weightKg ?? exercise.weight ?? null,
        restSeconds: exercise.restSeconds ?? DEFAULT_REST_SECONDS,
        actualWeightKg: exercise.actualWeightKg ?? null,
        actualReps: exercise.actualReps ?? null,
        rpe: exercise.rpe ?? null,
      })),
    }, options));

  return normalizeAppState({
    schemaVersion: SCHEMA_VERSION,
    workouts,
    series: [],
    templates: [],
    bodyWeightEntries: [],
    settings: normalizeSettings(null),
    activeTimer: null,
  }, options);
}

export const createInitialState = createEmptyAppState;
export const normalizeState = normalizeAppState;
export const migrateV1ToV2 = migrateV1State;
