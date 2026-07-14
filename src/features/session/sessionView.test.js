import { describe, expect, it } from 'vitest';
import {
  countWorkoutSets,
  formatSessionClock,
  getSessionElapsedSeconds,
  validateSetDraft,
} from './sessionView.js';

describe('session view helpers', () => {
  it('formats timer and elapsed session values', () => {
    expect(formatSessionClock(80)).toBe('01:20');
    expect(formatSessionClock(3_661)).toBe('01:01:01');
    expect(getSessionElapsedSeconds('2026-07-14T10:00:00.000Z', '2026-07-14T10:02:05.000Z')).toBe(125);
    expect(getSessionElapsedSeconds(null, '2026-07-14T10:02:05.000Z')).toBeNull();
  });

  it('counts completed and skipped sets independently', () => {
    expect(countWorkoutSets({
      exercises: [{
        sets: 3,
        setResults: [
          { status: 'completed' },
          { status: 'skipped' },
          { status: 'pending' },
        ],
      }],
    })).toEqual({ total: 3, completed: 1, skipped: 1 });
  });

  it('accepts optional fields and rejects values outside fitness limits', () => {
    expect(validateSetDraft({ weightKg: '', reps: '', rpe: '' })).toEqual({
      result: { weightKg: null, reps: null, rpe: null },
      errors: {},
      valid: true,
    });
    const invalid = validateSetDraft({ weightKg: '0', reps: '4.5', rpe: '11' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual({
      weightKg: 'Укажи вес от 0,5 до 1000 кг',
      reps: 'Укажи целое число от 1 до 999',
      rpe: 'Укажи RPE от 1 до 10',
    });
  });
});
