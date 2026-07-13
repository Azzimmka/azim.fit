import {
  addCalendarDays,
  compareCalendarDates,
  getMonthCalendarGrid,
  getToday,
  isMissedWorkout,
  startOfCalendarMonth,
  toCalendarDate,
} from './dates.js';

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts */
function workoutsFrom(stateOrWorkouts) {
  return Array.isArray(stateOrWorkouts)
    ? stateOrWorkouts
    : (Array.isArray(stateOrWorkouts?.workouts) ? stateOrWorkouts.workouts : []);
}

/** @param {object} workout */
export function getWorkoutCompletionDate(workout) {
  if (workout?.status !== 'completed') return '';
  const date = toCalendarDate(workout.completedAt);
  return date || workout.plannedDate || '';
}

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts @param {string} today */
export function selectMissedWorkouts(stateOrWorkouts, today = getToday()) {
  return workoutsFrom(stateOrWorkouts)
    .filter((workout) => isMissedWorkout(workout, today))
    .sort((left, right) => (
      left.plannedDate.localeCompare(right.plannedDate)
      || left.time.localeCompare(right.time)
    ));
}

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts @param {string} date */
export function selectWorkoutsForDate(stateOrWorkouts, date) {
  return workoutsFrom(stateOrWorkouts)
    .filter((workout) => workout.plannedDate === date)
    .sort((left, right) => left.time.localeCompare(right.time));
}

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts @param {string} id */
export function selectWorkoutById(stateOrWorkouts, id) {
  return workoutsFrom(stateOrWorkouts).find((workout) => workout.id === id) ?? null;
}

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts */
export function selectCompletedWorkouts(stateOrWorkouts) {
  return workoutsFrom(stateOrWorkouts)
    .filter((workout) => workout.status === 'completed')
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}

/** @param {object[]} workouts @param {string} date @param {string} today */
export function getCalendarDayStatus(workouts, date, today = getToday()) {
  const items = workouts.filter((workout) => workout.plannedDate === date);
  const counts = {
    planned: items.filter((workout) => workout.status === 'planned').length,
    completed: items.filter((workout) => workout.status === 'completed').length,
    skipped: items.filter((workout) => workout.status === 'skipped').length,
    missed: items.filter((workout) => isMissedWorkout(workout, today)).length,
  };
  const statuses = [];
  if (counts.missed) statuses.push('missed');
  if (counts.planned - counts.missed > 0) statuses.push('planned');
  if (counts.completed) statuses.push('completed');
  if (counts.skipped) statuses.push('skipped');
  return {
    date,
    workouts: items,
    counts,
    statuses,
    primaryStatus: statuses[0] ?? 'empty',
  };
}

/**
 * @param {{workouts?: object[]}|object[]} stateOrWorkouts
 * @param {string} monthDate
 * @param {string} today
 */
export function selectCalendarMonth(stateOrWorkouts, monthDate, today = getToday()) {
  const workouts = workoutsFrom(stateOrWorkouts);
  const month = startOfCalendarMonth(monthDate);
  return getMonthCalendarGrid(monthDate).map((date) => ({
    ...getCalendarDayStatus(workouts, date, today),
    isCurrentMonth: date.startsWith(month.slice(0, 7)),
    isToday: date === today,
  }));
}

/** @param {{workouts?: object[]}|object[]} stateOrWorkouts */
export function selectTotalPoints(stateOrWorkouts) {
  return workoutsFrom(stateOrWorkouts)
    .filter((workout) => workout.status === 'completed')
    .reduce((sum, workout) => sum + Math.max(0, Number(workout.pointsAwarded) || 0), 0);
}

/**
 * Completion streak uses actual completedAt dates. If today has no completion,
 * yesterday is allowed to keep the current streak alive.
 * @param {{workouts?: object[]}|object[]} stateOrWorkouts
 * @param {string} today
 */
export function selectCompletionStreak(stateOrWorkouts, today = getToday()) {
  const completedDates = new Set(
    selectCompletedWorkouts(stateOrWorkouts).map(getWorkoutCompletionDate).filter(Boolean),
  );
  let cursor = completedDates.has(today) ? today : addCalendarDays(today, -1);
  let count = 0;
  while (completedDates.has(cursor)) {
    count += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return count;
}

/**
 * @param {{workouts?: object[]}|object[]} stateOrWorkouts
 * @param {string} today
 */
export function selectProgressStats(stateOrWorkouts, today = getToday()) {
  const workouts = workoutsFrom(stateOrWorkouts);
  const completed = workouts.filter((workout) => workout.status === 'completed');
  const points = selectTotalPoints(workouts);
  return {
    totalPoints: points,
    completedWorkouts: completed.length,
    skippedWorkouts: workouts.filter((workout) => workout.status === 'skipped').length,
    plannedWorkouts: workouts.filter((workout) => workout.status === 'planned').length,
    missedWorkouts: selectMissedWorkouts(workouts, today).length,
    streakDays: selectCompletionStreak(workouts, today),
    level: Math.floor(points / 250) + 1,
    levelProgress: ((points % 250) / 250) * 100,
  };
}

/**
 * @param {{workouts?: object[]}|object[]} stateOrWorkouts
 * @param {string} endDate
 * @param {number} days
 */
export function selectDailyPoints(stateOrWorkouts, endDate = getToday(), days = 7) {
  const safeDays = Math.max(1, Math.trunc(Number(days) || 7));
  const startDate = addCalendarDays(endDate, 1 - safeDays);
  const totals = new Map();
  for (const workout of selectCompletedWorkouts(stateOrWorkouts)) {
    const date = getWorkoutCompletionDate(workout);
    if (compareCalendarDates(date, startDate) < 0 || compareCalendarDates(date, endDate) > 0) continue;
    totals.set(date, (totals.get(date) ?? 0) + (Number(workout.pointsAwarded) || 0));
  }
  return Array.from({ length: safeDays }, (_, index) => {
    const date = addCalendarDays(startDate, index);
    return { date, points: totals.get(date) ?? 0 };
  });
}

/** @param {{bodyWeightEntries?: object[]}} state */
export function selectBodyWeightHistory(state) {
  return [...(state?.bodyWeightEntries ?? [])].sort((left, right) => left.date.localeCompare(right.date));
}

export const selectStats = selectProgressStats;

