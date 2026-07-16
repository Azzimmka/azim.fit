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
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Выбери упражнение' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ПриседанияПодходы/ }));
    await user.click(screen.getByRole('button', { name: 'Добавить в план' }));
    expect(screen.getByText(/3 × 15 повторов/)).toBeInTheDocument();
    await user.click(screen.getByText('Дополнительно'));
    const title = screen.getByLabelText('Название тренировки');
    expect(title).toHaveValue('Приседания');
    await user.clear(title);
    await user.type(title, 'День ног');
    expect(screen.queryByLabelText('Вес, кг')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Продолжительность, минут')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Напоминание')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Заметка к плану')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Запланировать' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [payload, recurrence] = onSubmit.mock.calls[0];
    expect(payload).toMatchObject({
      title: 'День ног',
      plannedDate: '2026-07-13',
      exercises: [{
        name: 'Приседания',
        structure: 'sets',
        target: { kind: 'reps', value: 15, unit: 'count' },
        sets: 3,
        restSeconds: 90,
        catalogExerciseId: 'squats',
        customExerciseId: null,
      }],
    });
    expect(payload).not.toHaveProperty('duration');
    expect(payload).not.toHaveProperty('durationMinutes');
    expect(payload).not.toHaveProperty('planNotes');
    expect(payload).not.toHaveProperty('reminder');
    expect(payload.exercises[0]).not.toHaveProperty('completedSets');
    expect(payload.exercises[0]).not.toHaveProperty('plannedWeightKg');
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
        intensity: 'Высокая',
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
      plan: {
        title: 'Верх тела',
        type: 'Силовая',
        time: '07:30',
        intensity: 'Высокая',
        exercises: [{
          id: 'exercise-1',
          name: 'Жим лёжа',
          structure: 'sets',
          target: { kind: 'reps', value: 8, unit: 'count' },
          sets: 4,
          restSeconds: 120,
          catalogExerciseId: null,
          customExerciseId: null,
          legacyTargetText: null,
        }],
      },
    }, null);
  });

  it('submits distinct per-set results and preserves completion timestamps', async () => {
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
      completedAt: '2026-07-12T16:45:00.000Z',
      reminder: null,
      exercises: [{
        id: 'exercise-1',
        name: 'Тяга',
        sets: 3,
        plannedReps: '8',
        plannedWeightKg: 80,
        restSeconds: 90,
        setResults: [
          { setNumber: 1, status: 'completed', weightKg: 82.5, reps: 8, rpe: 7, completedAt: '2026-07-12T16:10:00.000Z' },
          { setNumber: 2, status: 'completed', weightKg: 85, reps: 6, rpe: 9, completedAt: '2026-07-12T16:15:00.000Z' },
          { setNumber: 3, status: 'skipped', weightKg: null, reps: null, rpe: null, completedAt: null },
        ],
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

    expect(screen.getByText('Подход 1 · Выполнен')).toBeInTheDocument();
    expect(screen.getByText('Подход 3 · Пропущен')).toBeInTheDocument();
    const firstWeight = screen.getByLabelText('Вес, кг, Тяга, подход 1');
    expect(firstWeight).toHaveValue(82.5);
    await user.clear(firstWeight);
    await user.type(firstWeight, '87.5');
    expect(screen.getByLabelText('Вес, кг, Тяга, подход 2')).toHaveValue(85);
    const thirdWeight = screen.getByLabelText('Вес, кг, Тяга, подход 3');
    expect(thirdWeight).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Статус, Тяга, подход 3'), 'completed');
    expect(thirdWeight).toBeEnabled();
    await user.type(thirdWeight, '80');
    const firstRpe = screen.getByLabelText('RPE, Тяга, подход 1');
    await user.clear(firstRpe);
    await user.type(firstRpe, '11');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('RPE должен быть от 1 до 10: Тяга, подход 1.');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(firstRpe);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledOnce();
    const [payload] = onSubmit.mock.calls[0];
    expect(payload).toEqual({
      resultNotes: 'Хорошо',
      exercises: [{
        id: 'exercise-1',
        setResults: [
          { setNumber: 1, status: 'completed', weightKg: 87.5, reps: 8, actualValue: 8, rpe: null, completedAt: '2026-07-12T16:10:00.000Z' },
          { setNumber: 2, status: 'completed', weightKg: 85, reps: 6, actualValue: 6, rpe: 9, completedAt: '2026-07-12T16:15:00.000Z' },
          { setNumber: 3, status: 'completed', weightKg: 80, reps: null, actualValue: null, rpe: null, completedAt: null },
        ],
      }],
    });
    expect(payload.exercises[0].setResults.map((item) => item.actualValue)).toEqual([8, 6, null]);
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('plannedDate');
  });

  it('synthesizes per-set correction fields for a raw legacy workout', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const workout = {
      id: 'legacy-workout',
      title: 'Старая тренировка',
      status: 'completed',
      plannedDate: '2026-07-10',
      completedAt: '2026-07-10T18:30:00.000Z',
      resultNotes: '',
      exercises: [{
        id: 'legacy-exercise',
        name: 'Жим',
        sets: 3,
        completedSets: 2,
        actualWeightKg: 70,
        actualReps: 10,
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

    expect(screen.getByLabelText('Вес, кг, Жим, подход 1')).toHaveValue(70);
    expect(screen.getByLabelText('Вес, кг, Жим, подход 3')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit.mock.calls[0][0].exercises[0].setResults).toEqual([
      { setNumber: 1, status: 'completed', weightKg: 70, reps: 10, actualValue: 10, rpe: 8, completedAt: workout.completedAt },
      { setNumber: 2, status: 'completed', weightKg: 70, reps: 10, actualValue: 10, rpe: 8, completedAt: workout.completedAt },
      { setNumber: 3, status: 'pending', weightKg: null, reps: null, actualValue: null, rpe: null, completedAt: null },
    ]);
  });
});
