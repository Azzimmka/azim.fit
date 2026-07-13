import {
  addCalendarDays,
  calendarDateRange,
  compareCalendarDates,
  differenceInCalendarDays,
  getIsoWeekday,
  isCalendarDate,
  startOfCalendarWeek,
} from './dates.js';
import { makeId } from './id.js';
import { normalizePlanSnapshot, normalizeSeries } from './schema.js';
import { createWorkoutFromPlan } from './workouts.js';

/** @param {import('./model.js').RecurrenceSeries} series @param {string} date */
export function isSeriesOccurrenceDate(series, date) {
  if (!isCalendarDate(date)) return false;
  if (compareCalendarDates(date, series.startsOn) < 0) return false;
  if (compareCalendarDates(date, series.endsOn) > 0) return false;
  if (series.excludedOccurrenceDates?.includes(date)) return false;
  if (!series.weekdays.includes(getIsoWeekday(date))) return false;

  const anchorWeek = startOfCalendarWeek(series.startsOn);
  const candidateWeek = startOfCalendarWeek(date);
  const weekIndex = Math.floor(differenceInCalendarDays(candidateWeek, anchorWeek) / 7);
  return weekIndex >= 0 && weekIndex % series.intervalWeeks === 0;
}

/** @param {Array<object>} workouts @param {string} seriesId @param {string} occurrenceDate */
export function hasMaterializedOccurrence(workouts, seriesId, occurrenceDate) {
  return workouts.some((workout) => (
    workout.seriesId === seriesId && workout.occurrenceDate === occurrenceDate
  ));
}

/**
 * Materializes missing occurrences only. A moved occurrence retains its
 * occurrenceDate, so subsequent materialization never recreates the old date.
 * @param {import('./model.js').RecurrenceSeries|object} input
 * @param {{from?: string, through?: string, existingWorkouts?: object[], idFactory?: (prefix?: string) => string}} options
 */
export function materializeSeries(input, options = {}) {
  const series = normalizeSeries(input, options);
  const from = isCalendarDate(options.from) && compareCalendarDates(options.from, series.startsOn) > 0
    ? options.from
    : series.startsOn;
  const through = isCalendarDate(options.through) && compareCalendarDates(options.through, series.endsOn) < 0
    ? options.through
    : series.endsOn;
  if (compareCalendarDates(from, through) > 0) return [];

  const existing = [...(options.existingWorkouts ?? [])];
  const created = [];
  for (const date of calendarDateRange(from, through)) {
    if (!isSeriesOccurrenceDate(series, date)) continue;
    if (hasMaterializedOccurrence([...existing, ...created], series.id, date)) continue;

    created.push(createWorkoutFromPlan(series.planSnapshot, {
      id: makeId(options.idFactory, 'workout'),
      plannedDate: date,
      occurrenceDate: date,
      seriesId: series.id,
      sourceTemplateId: null,
    }, options));
  }
  return created;
}

function mergeSeriesChange(series, changes) {
  const planPatch = changes.planSnapshot ?? changes.plan;
  return {
    ...series,
    ...changes,
    planSnapshot: planPatch
      ? normalizePlanSnapshot({ ...series.planSnapshot, ...planPatch })
      : series.planSnapshot,
  };
}

/**
 * Splits a series at an occurrence and rematerializes only planned instances.
 * Completed/skipped instances are returned byte-for-byte unchanged.
 * @param {import('./model.js').RecurrenceSeries} inputSeries
 * @param {import('./model.js').Workout[]} workouts
 * @param {string} occurrenceDate
 * @param {object} changes
 * @param {{idFactory?: (prefix?: string) => string}} options
 */
export function splitSeriesAndFollowing(
  inputSeries,
  workouts,
  occurrenceDate,
  changes = {},
  options = {},
) {
  const series = normalizeSeries(inputSeries, options);
  if (
    !isCalendarDate(occurrenceDate)
    || compareCalendarDates(occurrenceDate, series.startsOn) < 0
    || compareCalendarDates(occurrenceDate, series.endsOn) > 0
  ) {
    return { oldSeries: series, newSeries: null, workouts: [...workouts] };
  }

  const affectedPlanned = workouts.filter((workout) => (
    workout.seriesId === series.id
    && workout.status === 'planned'
    && compareCalendarDates(workout.occurrenceDate, occurrenceDate) >= 0
  ));
  const affectedIds = new Set(affectedPlanned.map((workout) => workout.id));
  const preserved = workouts.filter((workout) => !affectedIds.has(workout.id));
  const terminalDates = preserved
    .filter((workout) => (
      workout.seriesId === series.id
      && workout.status !== 'planned'
      && compareCalendarDates(workout.occurrenceDate, occurrenceDate) >= 0
    ))
    .map((workout) => workout.occurrenceDate);

  const previousEnd = addCalendarDays(occurrenceDate, -1);
  const oldSeries = compareCalendarDates(previousEnd, series.startsOn) >= 0
    ? normalizeSeries({ ...series, endsOn: previousEnd }, options)
    : null;

  const nextId = changes.id && changes.id !== series.id
    ? changes.id
    : makeId(options.idFactory, 'series');
  const changed = mergeSeriesChange(series, changes);
  const nextStartsOn = isCalendarDate(changes.startsOn)
    ? changes.startsOn
    : occurrenceDate;
  const newSeries = normalizeSeries({
    ...changed,
    id: nextId,
    startsOn: nextStartsOn,
    excludedOccurrenceDates: [
      ...(changed.excludedOccurrenceDates ?? []).filter((date) => (
        compareCalendarDates(date, nextStartsOn) >= 0
      )),
      ...terminalDates,
    ],
  }, options);
  const created = materializeSeries(newSeries, {
    ...options,
    existingWorkouts: preserved,
  });

  return {
    oldSeries,
    newSeries,
    workouts: [...preserved, ...created],
  };
}

/**
 * Deletes a single planned occurrence and records the hole on the series.
 * @param {import('./model.js').RecurrenceSeries} inputSeries
 * @param {import('./model.js').Workout[]} workouts
 * @param {string} occurrenceDate
 */
export function excludeSeriesOccurrence(inputSeries, workouts, occurrenceDate) {
  const series = normalizeSeries(inputSeries);
  if (!isCalendarDate(occurrenceDate)) return { series, workouts: [...workouts] };
  return {
    series: {
      ...series,
      excludedOccurrenceDates: [...new Set([
        ...series.excludedOccurrenceDates,
        occurrenceDate,
      ])].sort(),
    },
    workouts: workouts.filter((workout) => !(
      workout.seriesId === series.id
      && workout.occurrenceDate === occurrenceDate
      && workout.status === 'planned'
    )),
  };
}

/**
 * Deletes planned occurrences from the split date onward while retaining all
 * completed/skipped history.
 * @param {import('./model.js').RecurrenceSeries} inputSeries
 * @param {import('./model.js').Workout[]} workouts
 * @param {string} occurrenceDate
 */
export function deleteSeriesAndFollowing(inputSeries, workouts, occurrenceDate) {
  const series = normalizeSeries(inputSeries);
  if (!isCalendarDate(occurrenceDate)) return { series, workouts: [...workouts] };
  const previousEnd = addCalendarDays(occurrenceDate, -1);
  return {
    series: compareCalendarDates(previousEnd, series.startsOn) >= 0
      ? { ...series, endsOn: previousEnd }
      : null,
    workouts: workouts.filter((workout) => !(
      workout.seriesId === series.id
      && workout.status === 'planned'
      && compareCalendarDates(workout.occurrenceDate, occurrenceDate) >= 0
    )),
  };
}

export const generateSeriesWorkouts = materializeSeries;
export const splitSeries = splitSeriesAndFollowing;
