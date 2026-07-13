import { describe, expect, it } from 'vitest';
import { RU_FORMS, pluralizeRu } from './plural.js';

describe('Russian plurals', () => {
  it.each([
    [0, 'дней'],
    [1, 'день'],
    [2, 'дня'],
    [5, 'дней'],
    [11, 'дней'],
    [21, 'день'],
    [25, 'дней'],
  ])('%s -> %s', (count, expected) => {
    expect(pluralizeRu(count, RU_FORMS.day)).toBe(expected);
  });

  it('supports every product noun', () => {
    expect(pluralizeRu(2, RU_FORMS.week)).toBe('недели');
    expect(pluralizeRu(5, RU_FORMS.workout)).toBe('тренировок');
    expect(pluralizeRu(1, RU_FORMS.exercise)).toBe('упражнение');
    expect(pluralizeRu(21, RU_FORMS.set)).toBe('подход');
    expect(pluralizeRu(11, RU_FORMS.point)).toBe('баллов');
  });
});

