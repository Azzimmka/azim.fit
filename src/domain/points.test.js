import { describe, expect, it } from 'vitest';
import {
  calculateAwardedPoints,
  calculatePlanPoints,
  getWorkoutPoints,
} from './points.js';

describe('points', () => {
  it('centralizes the 20 + 5 per set formula', () => {
    expect(calculatePlanPoints([{ sets: 4 }, { sets: 3 }])).toBe(55);
    expect(calculateAwardedPoints([{ completedSets: 4 }, { completedSets: 2 }])).toBe(50);
    expect(calculateAwardedPoints([{
      completedSets: 99,
      setResults: [
        { status: 'completed' },
        { status: 'skipped' },
        { status: 'pending' },
      ],
    }])).toBe(25);
  });

  it('uses persisted historical points only for completed workouts', () => {
    const exercises = [{ sets: 3, completedSets: 1 }];
    expect(getWorkoutPoints({ status: 'completed', pointsAwarded: 95, exercises })).toBe(95);
    expect(getWorkoutPoints({ status: 'planned', pointsAwarded: 95, exercises })).toBe(35);
  });
});
