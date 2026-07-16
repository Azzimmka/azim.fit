import { describe, expect, it } from 'vitest';
import {
  countExerciseProgressUnits,
  createAutomaticWorkoutTitle,
  formatExerciseTarget,
  formatPace,
  formatTargetValue,
  normalizeExerciseStructure,
  normalizeTarget,
  parseLegacyPlannedTarget,
} from './targets.js';

describe('exercise targets', () => {
  it('normalizes each target kind to its canonical unit and bounds', () => {
    expect(normalizeTarget({ kind: 'reps', value: '12', unit: 'seconds' })).toEqual({
      kind: 'reps', value: 12, unit: 'count',
    });
    expect(normalizeTarget({ kind: 'duration', value: '180' })).toEqual({
      kind: 'duration', value: 180, unit: 'seconds',
    });
    expect(normalizeTarget({ kind: 'distance', value: 3000 })).toEqual({
      kind: 'distance', value: 3000, unit: 'meters',
    });
    expect(normalizeTarget({ kind: 'reps', value: 0 })).toEqual({
      kind: 'reps', value: 10, unit: 'count',
    });
    expect(normalizeTarget({ kind: 'distance', value: Number.NaN })).toEqual({
      kind: 'distance', value: 1000, unit: 'meters',
    });
  });

  it('parses unambiguous legacy reps, seconds, minutes and clock values', () => {
    expect(parseLegacyPlannedTarget('15')).toEqual({
      target: { kind: 'reps', value: 15, unit: 'count' },
      legacyTargetText: null,
    });
    expect(parseLegacyPlannedTarget('30 сек')).toEqual({
      target: { kind: 'duration', value: 30, unit: 'seconds' },
      legacyTargetText: null,
    });
    expect(parseLegacyPlannedTarget('3 минуты')).toEqual({
      target: { kind: 'duration', value: 180, unit: 'seconds' },
      legacyTargetText: null,
    });
    expect(parseLegacyPlannedTarget('01:30')).toEqual({
      target: { kind: 'duration', value: 90, unit: 'seconds' },
      legacyTargetText: null,
    });
  });

  it('preserves ambiguous legacy text instead of inventing a numeric result', () => {
    expect(parseLegacyPlannedTarget('10–12')).toEqual({
      target: { kind: 'reps', value: 10, unit: 'count' },
      legacyTargetText: '10–12',
    });
    expect(parseLegacyPlannedTarget('до отказа')).toEqual({
      target: { kind: 'reps', value: 10, unit: 'count' },
      legacyTargetText: 'до отказа',
    });
  });

  it('formats target values and pace with stable Russian units', () => {
    expect(formatTargetValue({ kind: 'reps', value: 1 })).toBe('1 повтор');
    expect(formatTargetValue({ kind: 'reps', value: 5 })).toBe('5 повторов');
    expect(formatTargetValue({ kind: 'duration', value: 180 })).toBe('3 мин');
    expect(formatTargetValue({ kind: 'duration', value: 90 })).toBe('1 мин 30 сек');
    expect(formatTargetValue({ kind: 'distance', value: 842 })).toBe('842 м');
    expect(formatTargetValue({ kind: 'distance', value: 1840 })).toBe('1,84 км');
    expect(formatPace(353)).toBe('5:53/км');
    expect(formatPace(null)).toBe('—');
  });

  it('formats set and continuous plans without artificial sets', () => {
    expect(formatExerciseTarget({
      structure: 'sets', sets: 3, target: { kind: 'reps', value: 10 }, restSeconds: 90,
    })).toBe('3 × 10 повторов · отдых 1 мин 30 сек');
    expect(formatExerciseTarget({
      structure: 'sets', sets: 3, target: { kind: 'duration', value: 180 }, restSeconds: 60,
    })).toBe('3 × 3 мин · отдых 1 мин');
    expect(formatExerciseTarget({
      structure: 'continuous', target: { kind: 'distance', value: 3000 },
    })).toBe('3 км');
  });

  it('enforces compatible structures and progress units', () => {
    expect(normalizeExerciseStructure('sets', { kind: 'distance' })).toBe('continuous');
    expect(normalizeExerciseStructure('continuous', { kind: 'reps' })).toBe('sets');
    expect(normalizeExerciseStructure('continuous', { kind: 'duration' })).toBe('continuous');
    expect(countExerciseProgressUnits({ structure: 'sets', sets: 4 })).toBe(4);
    expect(countExerciseProgressUnits({ structure: 'continuous', sets: 12 })).toBe(1);
  });

  it('creates a compact title while keeping the full plan readable', () => {
    expect(createAutomaticWorkoutTitle([])).toBe('Тренировка');
    expect(createAutomaticWorkoutTitle([{ name: 'Отжимания' }])).toBe('Отжимания');
    expect(createAutomaticWorkoutTitle([{ name: 'Отжимания' }, { name: 'Планка' }]))
      .toBe('Отжимания + планка');
    expect(createAutomaticWorkoutTitle([
      { name: 'Отжимания' }, { name: 'Планка' }, { name: 'Приседания' },
    ])).toBe('Отжимания + планка + ещё 1');
  });
});
