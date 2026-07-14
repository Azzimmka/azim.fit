import { describe, expect, it } from 'vitest';
import {
  getCompletedWorkoutDurationMinutes,
  getCalendarDayStatus,
  getWorkoutSetProgress,
  selectCompletionStreak,
  selectDailyPoints,
  selectMissedWorkouts,
  selectProgressWorkoutsForDate,
  selectProgressStats,
} from './selectors.js';

describe('workout selectors', () => {
  const workouts = [
    {
      id: 'late',
      status: 'completed',
      plannedDate: '2026-07-10',
      completedAt: '2026-07-12T08:00:00.000Z',
      pointsAwarded: 40,
      time: '18:00',
    },
    {
      id: 'today',
      status: 'completed',
      plannedDate: '2026-07-13',
      completedAt: '2026-07-13T08:00:00.000Z',
      pointsAwarded: 50,
      time: '08:00',
    },
    {
      id: 'missed',
      status: 'planned',
      plannedDate: '2026-07-11',
      completedAt: null,
      pointsAwarded: 0,
      time: '10:00',
    },
  ];

  it('uses actual completion dates for streak and daily points', () => {
    expect(selectCompletionStreak(workouts, '2026-07-13')).toBe(2);
    expect(selectDailyPoints(workouts, '2026-07-13', 4)).toEqual([
      { date: '2026-07-10', points: 0 },
      { date: '2026-07-11', points: 0 },
      { date: '2026-07-12', points: 40 },
      { date: '2026-07-13', points: 50 },
    ]);
  });

  it('selects missed planned workouts and calendar statuses', () => {
    expect(selectMissedWorkouts(workouts, '2026-07-13').map((item) => item.id)).toEqual(['missed']);
    expect(getCalendarDayStatus(workouts, '2026-07-11', '2026-07-13')).toMatchObject({
      primaryStatus: 'missed',
      counts: { planned: 1, completed: 0, skipped: 0, missed: 1 },
    });
  });

  it('aggregates progress from terminal state and awarded points', () => {
    expect(selectProgressStats(workouts, '2026-07-13')).toMatchObject({
      totalPoints: 90,
      completedWorkouts: 2,
      missedWorkouts: 1,
      streakDays: 2,
    });
  });

  it('groups progress workouts by actual completion or planned date', () => {
    const skipped = {
      id: 'skipped',
      title: 'Растяжка',
      status: 'skipped',
      plannedDate: '2026-07-12',
      time: '07:00',
    };

    expect(selectProgressWorkoutsForDate([...workouts, skipped], '2026-07-12').map((item) => item.id))
      .toEqual(['skipped', 'late']);
    expect(selectProgressWorkoutsForDate(workouts, '2026-07-10')).toEqual([]);
    expect(selectProgressWorkoutsForDate(workouts, '2026-07-11').map((item) => item.id))
      .toEqual(['missed']);
  });

  it('summarizes completed sets and real session duration safely', () => {
    const workout = {
      status: 'completed',
      startedAt: '2026-07-13T10:00:00.000Z',
      completedAt: '2026-07-13T10:42:40.000Z',
      exercises: [
        {
          sets: 3,
          setResults: [
            { status: 'completed' },
            { status: 'skipped' },
            { status: 'pending' },
          ],
        },
        { sets: 2, completedSets: 2 },
      ],
    };

    expect(getWorkoutSetProgress(workout)).toEqual({ completed: 3, total: 5 });
    expect(getCompletedWorkoutDurationMinutes(workout)).toBe(43);
    expect(getCompletedWorkoutDurationMinutes({ ...workout, startedAt: 'broken' })).toBeNull();
  });
});
