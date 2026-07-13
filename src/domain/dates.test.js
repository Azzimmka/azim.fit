import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addCalendarMonths,
  differenceInCalendarDays,
  getMonthCalendarGrid,
  isMissedWorkout,
  millisecondsUntilNextDay,
} from './dates.js';

describe('calendar dates', () => {
  it('crosses month, year, and leap-day boundaries without millisecond arithmetic', () => {
    expect(addCalendarDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addCalendarMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(differenceInCalendarDays('2024-03-11', '2024-03-09')).toBe(2);
  });

  it('builds a six-week Monday-first calendar including adjacent months', () => {
    const grid = getMonthCalendarGrid('2026-07-13');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-06-29');
    expect(grid.at(-1)).toBe('2026-08-09');
  });

  it('marks only past planned workouts as missed', () => {
    expect(isMissedWorkout({ status: 'planned', plannedDate: '2026-07-12' }, '2026-07-13')).toBe(true);
    expect(isMissedWorkout({ status: 'completed', plannedDate: '2026-07-12' }, '2026-07-13')).toBe(false);
    expect(isMissedWorkout({ status: 'planned', plannedDate: '2026-07-13' }, '2026-07-13')).toBe(false);
  });

  it('computes the actual local-midnight refresh delay', () => {
    const now = new Date(2026, 6, 13, 23, 59, 30, 0);
    expect(millisecondsUntilNextDay(now)).toBe(30_000);
  });
});

