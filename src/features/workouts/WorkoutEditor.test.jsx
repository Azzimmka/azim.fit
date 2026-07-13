import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkoutEditor } from './WorkoutEditor.jsx';

afterEach(cleanup);

describe('WorkoutEditor', () => {
  it('submits the canonical workout plan shape', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <WorkoutEditor
        open
        mode="create"
        initialDate="2026-07-13"
        defaultReminder={30}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText('Название тренировки'), 'День ног');
    await user.type(screen.getByLabelText('Упражнение'), 'Приседания');
    await user.click(screen.getByRole('button', { name: 'Запланировать' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [payload, recurrence] = onSubmit.mock.calls[0];
    expect(payload).toMatchObject({
      title: 'День ног',
      plannedDate: '2026-07-13',
      durationMinutes: 45,
      reminder: 30,
      exercises: [{
        name: 'Приседания',
        sets: 3,
        plannedReps: '10',
        plannedWeightKg: null,
        restSeconds: 90,
      }],
    });
    expect(payload).not.toHaveProperty('duration');
    expect(payload.exercises[0]).not.toHaveProperty('completedSets');
    expect(recurrence).toBeNull();
  });

  it('reads and submits a nested canonical template', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const template = {
      id: 'template-1',
      name: 'Быстрый верх',
      plan: {
        title: 'Верх тела',
        type: 'Силовая',
        time: '07:30',
        durationMinutes: 50,
        intensity: 'Высокая',
        planNotes: 'Контроль техники',
        reminder: 15,
        exercises: [{
          id: 'exercise-1',
          name: 'Жим лёжа',
          sets: 4,
          plannedReps: '8',
          plannedWeightKg: 70,
          restSeconds: 120,
        }],
      },
    };

    render(
      <WorkoutEditor
        open
        mode="template"
        initialDate="2026-07-13"
        template={template}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('Название шаблона')).toHaveValue('Быстрый верх');
    expect(screen.queryByLabelText('Дата')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить шаблон' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Быстрый верх',
      plan: template.plan,
    }, null);
  });

  it('submits only correctable result fields in result mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const workout = {
      id: 'workout-1',
      title: 'Силовая',
      type: 'Силовая',
      status: 'completed',
      plannedDate: '2026-07-12',
      time: '18:00',
      durationMinutes: 45,
      intensity: 'Средняя',
      planNotes: '',
      resultNotes: 'Хорошо',
      reminder: null,
      exercises: [{
        id: 'exercise-1',
        name: 'Тяга',
        sets: 3,
        plannedReps: '8',
        plannedWeightKg: 80,
        restSeconds: 90,
        completedSets: 2,
        actualWeightKg: 85,
        actualReps: 7,
        rpe: 8,
      }],
    };

    render(
      <WorkoutEditor
        open
        mode="result"
        initialDate="2026-07-13"
        workout={workout}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const completedSets = screen.getByLabelText('Выполнено подходов');
    await user.clear(completedSets);
    await user.type(completedSets, '3');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const [payload] = onSubmit.mock.calls[0];
    expect(payload).toEqual({
      resultNotes: 'Хорошо',
      exercises: [{
        id: 'exercise-1',
        completedSets: 3,
        actualWeightKg: 85,
        actualReps: 7,
        rpe: 8,
      }],
    });
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('plannedDate');
  });
});
