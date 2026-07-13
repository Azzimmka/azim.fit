import { describe, expect, it } from 'vitest';
import { normalizeWorkout } from './schema.js';
import { applyTemplate, createTemplateFromWorkout } from './workouts.js';

function sequentialIds() {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

describe('templates and duplication boundaries', () => {
  it('stores plan fields only and applies independent deep copies', () => {
    const workout = normalizeWorkout({
      id: 'source',
      title: 'Ноги',
      status: 'completed',
      plannedDate: '2026-07-10',
      completedAt: '2026-07-10T12:00:00.000Z',
      pointsAwarded: 55,
      resultNotes: 'Тяжело',
      exercises: [{
        id: 'source-e',
        name: 'Присед',
        sets: 3,
        plannedReps: '10',
        completedSets: 3,
        actualWeightKg: 80,
        actualReps: 8,
        rpe: 9,
      }],
    });
    const idFactory = sequentialIds();
    const template = createTemplateFromWorkout(workout, {
      id: 'template-a',
      now: '2026-07-13T10:00:00.000Z',
    }, { idFactory });
    const first = applyTemplate(template, { plannedDate: '2026-07-14' }, { idFactory });
    const second = applyTemplate(template, { plannedDate: '2026-07-15' }, { idFactory });

    expect(template.plan).not.toHaveProperty('resultNotes');
    expect(template.plan.exercises[0]).not.toHaveProperty('completedSets');
    expect(first).toMatchObject({
      status: 'planned',
      pointsAwarded: 0,
      seriesId: null,
      sourceTemplateId: 'template-a',
    });
    expect(first.exercises[0]).toMatchObject({
      completedSets: 0,
      actualWeightKg: null,
      actualReps: null,
      rpe: null,
    });
    expect(first.exercises[0]).not.toBe(second.exercises[0]);
    expect(first.exercises[0].id).not.toBe(second.exercises[0].id);
    first.exercises[0].name = 'Изменено';
    expect(second.exercises[0].name).toBe('Присед');
    expect(template.plan.exercises[0].name).toBe('Присед');
  });
});

