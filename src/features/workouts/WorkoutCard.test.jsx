import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkoutCard } from './WorkoutCard.jsx';

afterEach(cleanup);

const workout = {
  id: 'workout-1',
  title: 'Ноги',
  type: 'Силовая',
  status: 'planned',
  plannedDate: '2026-07-13',
  time: '18:00',
  durationMinutes: 50,
  intensity: 'Средняя',
  planNotes: '',
  resultNotes: '',
  pointsAwarded: 0,
  exercises: [{
    id: 'exercise-1',
    name: 'Приседания',
    sets: 3,
    plannedReps: '10',
    plannedWeightKg: 60,
    restSeconds: 90,
    completedSets: 0,
    actualWeightKg: null,
    actualReps: null,
    rpe: null,
  }],
};

const perSetWorkout = {
  ...workout,
  exercises: [{
    ...workout.exercises[0],
    completedSets: 2,
    actualWeightKg: 70,
    actualReps: 8,
    rpe: 8,
    setResults: [
      { setNumber: 1, status: 'completed', weightKg: 60, reps: 10, rpe: 7, completedAt: null },
      { setNumber: 2, status: 'completed', weightKg: 70, reps: 8, rpe: 8, completedAt: null },
      { setNumber: 3, status: 'skipped', weightKg: null, reps: null, rpe: null, completedAt: null },
    ],
  }],
};

describe('WorkoutCard', () => {
  it('opens an available session from the card surface and keyboard', async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={onStartSession}
      />,
    );

    const card = screen.getByRole('article', { name: 'Начать или продолжить тренировку «Ноги»' });
    await user.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(onStartSession).toHaveBeenCalledTimes(3);
    expect(onStartSession).toHaveBeenLastCalledWith(workout);
  });

  it('does not open the session when a nested control is used', async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();
    const onStartTimer = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={onStartSession}
        onStartTimer={onStartTimer}
      />,
    );

    await user.click(screen.getByRole('button', { name: '90 сек' }));
    expect(onStartTimer).toHaveBeenCalledOnce();
    expect(onStartSession).not.toHaveBeenCalled();
  });

  it('starts rest for the selected workout and exercise with one button press', async () => {
    const user = userEvent.setup();
    const onStartTimer = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartTimer={onStartTimer}
      />,
    );

    await user.click(screen.getByRole('button', { name: '90 сек' }));
    expect(onStartTimer).toHaveBeenCalledWith(workout, workout.exercises[0]);
  });

  it('exposes the draft result note only through its dedicated callback', async () => {
    const user = userEvent.setup();
    const onUpdateResultNotes = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onUpdateResult={() => {}}
        onUpdateResultNotes={onUpdateResultNotes}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Результат' }));
    const notes = screen.getByLabelText('Итоговая заметка');
    fireEvent.change(notes, { target: { value: 'Легко' } });

    expect(onUpdateResultNotes).toHaveBeenCalledWith('workout-1', 'Легко');
  });

  it('renders and toggles each real set status independently', async () => {
    const user = userEvent.setup();
    const onToggleSet = vi.fn();

    render(
      <WorkoutCard
        workout={perSetWorkout}
        today="2026-07-13"
        onToggleSet={onToggleSet}
      />,
    );

    expect(screen.getByRole('button', { name: 'Подход 1: выполнен' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Подход 2: выполнен' })).toHaveAttribute('aria-pressed', 'true');
    const skippedSet = screen.getByRole('button', { name: 'Подход 3: пропущен' });
    expect(skippedSet).toHaveClass('skipped');

    await user.click(skippedSet);
    expect(onToggleSet).toHaveBeenCalledOnce();
    expect(onToggleSet).toHaveBeenCalledWith('workout-1', 'exercise-1', 2);
  });

  it('edits the selected or last completed set in the compact result block', async () => {
    const user = userEvent.setup();
    const onToggleSet = vi.fn();
    const onUpdateResult = vi.fn();

    render(
      <WorkoutCard
        workout={perSetWorkout}
        today="2026-07-13"
        onToggleSet={onToggleSet}
        onUpdateResult={onUpdateResult}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Результат' }));
    expect(screen.getByText('Подход 2')).toBeInTheDocument();
    const weight = screen.getByLabelText('Вес, кг');
    expect(weight).toHaveValue(70);
    fireEvent.change(weight, { target: { value: '72.5' } });
    expect(onUpdateResult).toHaveBeenLastCalledWith(
      'workout-1', 'exercise-1', 1, 'actualWeightKg', '72.5',
    );

    await user.click(screen.getByRole('button', { name: 'Подход 1: выполнен' }));
    expect(screen.getByText('Подход 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Вес, кг')).toHaveValue(60);
  });
});
