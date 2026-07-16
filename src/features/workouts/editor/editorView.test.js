import { describe, expect, it } from 'vitest';
import {
  getInitialEditorStep,
  getNextAutomaticTitle,
  validateExerciseDraft,
} from './editorView.js';

describe('workout editor view helpers', () => {
  it('opens create mode in the picker and existing plans in the builder', () => {
    expect(getInitialEditorStep('create', false)).toBe('picker');
    expect(getInitialEditorStep('edit', true)).toBe('builder');
    expect(getInitialEditorStep('duplicate', true)).toBe('builder');
  });

  it('keeps automatic titles until the user edits one', () => {
    const exercises = [{ name: 'Отжимания' }, { name: 'Планка' }];
    expect(getNextAutomaticTitle(exercises, false)).toBe('Отжимания + планка');
    expect(getNextAutomaticTitle(exercises, true)).toBeNull();
  });

  it('rejects incompatible structures and targets', () => {
    expect(validateExerciseDraft({
      name: 'Бег', structure: 'sets', sets: 3, restSeconds: 90,
      target: { kind: 'distance', value: 3000, unit: 'meters' },
    })).toMatch(/непрерывной/);
    expect(validateExerciseDraft({
      name: 'Бег', structure: 'continuous',
      target: { kind: 'reps', value: 10, unit: 'count' },
    })).toMatch(/время или дистанцию/);
  });
});
