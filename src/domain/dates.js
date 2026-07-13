const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/** @param {unknown} value */
export function getCalendarDateParts(value) {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    probe.getFullYear() !== year
    || probe.getMonth() !== month - 1
    || probe.getDate() !== day
  ) return null;

  return { year, month, day };
}

/** @param {unknown} value */
export function isCalendarDate(value) {
  return getCalendarDateParts(value) !== null;
}

/** @param {Date|number|string} input */
export function toCalendarDate(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** @param {Date|number|string} now */
export function getToday(now = new Date()) {
  return toCalendarDate(now);
}

/**
 * Parses a calendar date at local noon so DST boundaries never shift the day.
 * @param {string} value
 */
export function fromCalendarDate(value) {
  const parts = getCalendarDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

/** @param {string} date */
export function getCalendarDayNumber(date) {
  const parts = getCalendarDateParts(date);
  if (!parts) return Number.NaN;
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

/** @param {string} date @param {number} amount */
export function addCalendarDays(date, amount) {
  const parts = getCalendarDateParts(date);
  if (!parts || !Number.isFinite(Number(amount))) return '';
  const next = new Date(parts.year, parts.month - 1, parts.day + Math.trunc(Number(amount)), 12);
  return toCalendarDate(next);
}

/** @param {string} date @param {number} amount */
export function addCalendarMonths(date, amount) {
  const parts = getCalendarDateParts(date);
  if (!parts || !Number.isFinite(Number(amount))) return '';
  const targetMonth = new Date(parts.year, parts.month - 1 + Math.trunc(Number(amount)), 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate();
  targetMonth.setDate(Math.min(parts.day, lastDay));
  return toCalendarDate(targetMonth);
}

/** @param {string} date @param {number} amount */
export function addCalendarYears(date, amount) {
  return addCalendarMonths(date, Math.trunc(Number(amount)) * 12);
}

/** @param {string} left @param {string} right */
export function differenceInCalendarDays(left, right) {
  const leftNumber = getCalendarDayNumber(left);
  const rightNumber = getCalendarDayNumber(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return Number.NaN;
  return leftNumber - rightNumber;
}

/** @param {string} left @param {string} right */
export function compareCalendarDates(left, right) {
  const difference = differenceInCalendarDays(left, right);
  if (!Number.isFinite(difference)) return Number.NaN;
  return Math.sign(difference);
}

/** @param {string} date */
export function getIsoWeekday(date) {
  const parsed = fromCalendarDate(date);
  if (!parsed) return Number.NaN;
  const day = parsed.getDay();
  return day === 0 ? 7 : day;
}

/** @param {string} date */
export function startOfCalendarWeek(date) {
  const weekday = getIsoWeekday(date);
  return Number.isFinite(weekday) ? addCalendarDays(date, 1 - weekday) : '';
}

/** @param {string} date */
export function endOfCalendarWeek(date) {
  const start = startOfCalendarWeek(date);
  return start ? addCalendarDays(start, 6) : '';
}

/** @param {string} date */
export function startOfCalendarMonth(date) {
  const parts = getCalendarDateParts(date);
  if (!parts) return '';
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-01`;
}

/** @param {string} date */
export function endOfCalendarMonth(date) {
  const start = startOfCalendarMonth(date);
  if (!start) return '';
  return addCalendarDays(addCalendarMonths(start, 1), -1);
}

/**
 * Returns a fixed six-week Monday-first grid including adjacent months.
 * @param {string} monthDate
 */
export function getMonthCalendarGrid(monthDate) {
  const first = startOfCalendarWeek(startOfCalendarMonth(monthDate));
  if (!first) return [];
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(first, index));
}

/** @param {string} start @param {string} end */
export function calendarDateRange(start, end) {
  if (!isCalendarDate(start) || !isCalendarDate(end) || compareCalendarDates(start, end) > 0) {
    return [];
  }

  const days = differenceInCalendarDays(end, start) + 1;
  return Array.from({ length: days }, (_, index) => addCalendarDays(start, index));
}

/** @param {unknown} value */
export function normalizeClockTime(value, fallback = '18:00') {
  if (typeof value !== 'string') return fallback;
  const match = CLOCK_TIME_PATTERN.exec(value);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? value : fallback;
}

/**
 * Converts local calendar fields to an absolute timestamp.
 * @param {string} date
 * @param {string} time
 */
export function localDateTimeToTimestamp(date, time = '00:00') {
  const parts = getCalendarDateParts(date);
  const normalizedTime = normalizeClockTime(time, '');
  if (!parts || !normalizedTime) return Number.NaN;
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  return new Date(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0).getTime();
}

/** @param {{status?: string, plannedDate?: string}} workout @param {string} today */
export function isMissedWorkout(workout, today = getToday()) {
  return workout?.status === 'planned'
    && isCalendarDate(workout.plannedDate)
    && compareCalendarDates(workout.plannedDate, today) < 0;
}

/**
 * Milliseconds until the next local midnight; useful for refreshing "today".
 * @param {Date|number|string} now
 */
export function millisecondsUntilNextDay(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) return 0;
  const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - current.getTime());
}

