import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  intensity: 'Средняя',
  pointsAwarded: 0,
  exercises: [{
    id: 'exercise-1',
    name: 'Приседания',
    sets: 3,
    plannedReps: '10',
    plannedWeightKg: 60,
    restSeconds: 90,
    completedSets: 0,
  }],
};

describe('WorkoutCard', () => {
  it('opens an available session from the free card surface and keyboard', async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={onStartSession}
      />,
    );

    const card = screen.getByRole('article', { name: 'Начать тренировку «Ноги»' });
    await user.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(onStartSession).toHaveBeenCalledTimes(3);
    expect(onStartSession).toHaveBeenLastCalledWith(workout);
  });

  it('renders only the workout preview and emphasizes the plan', () => {
    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ноги' })).toBeVisible();
    expect(screen.getByText('10 повторов · 60 кг')).toBeVisible();
    expect(screen.getByLabelText('3 подхода')).toHaveTextContent('3подхода');
    expect(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '90 сек' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Результат' })).not.toBeInTheDocument();
    expect(screen.queryByText('Отмечай подходы по ходу тренировки')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Подтвердить выполнение/ })).not.toBeInTheDocument();
  });

  it('starts the session once from the nested lime action', async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={onStartSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    expect(onStartSession).toHaveBeenCalledOnce();
    expect(onStartSession).toHaveBeenCalledWith(workout);
  });

  it('keeps menu actions independent from session navigation', async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();
    const onDelete = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onStartSession={onStartSession}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Действия: Ноги' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onDelete).toHaveBeenCalledWith(workout);
    expect(onStartSession).not.toHaveBeenCalled();
  });

  it('disables a future workout and labels it as scheduled', () => {
    render(
      <WorkoutCard
        workout={{ ...workout, plannedDate: '2026-07-14' }}
        today="2026-07-13"
        onStartSession={() => {}}
      />,
    );

    const card = screen.getByRole('article');
    expect(card).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('button', { name: 'Запланировано' })).toBeDisabled();
  });

  it('keeps a completed workout static while preserving its menu actions', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onStartSession = vi.fn();
    const onCorrectResult = vi.fn();
    const completedWorkout = {
      ...workout,
      status: 'completed',
      pointsAwarded: 35,
    };

    render(
      <WorkoutCard
        workout={completedWorkout}
        today="2026-07-13"
        onOpen={onOpen}
        onStartSession={onStartSession}
        onCorrectResult={onCorrectResult}
      />,
    );

    const card = screen.getByRole('article');
    expect(screen.getByRole('status')).toHaveTextContent('Завершена · +35 баллов');
    expect(screen.queryByRole('button', { name: 'Посмотреть результат' })).not.toBeInTheDocument();
    expect(card).not.toHaveAttribute('tabindex');

    await user.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onStartSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Действия: Ноги' }));
    await user.click(screen.getByRole('button', { name: 'Исправить результат' }));
    expect(onCorrectResult).toHaveBeenCalledWith(completedWorkout);
  });

  it('does not render a completed-result action in the compact card', () => {
    render(
      <WorkoutCard
        compact
        workout={{ ...workout, status: 'completed', pointsAwarded: 35 }}
        today="2026-07-13"
        onOpen={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Посмотреть результат' })).not.toBeInTheDocument();
  });

  it('uses the same contextual action in the compact card', () => {
    render(
      <WorkoutCard
        compact
        workout={{ ...workout, plannedDate: '2026-07-14' }}
        today="2026-07-13"
        onStartSession={() => {}}
      />,
    );

    const card = screen.getByRole('article');
    expect(within(card).getByRole('button', { name: 'Запланировано' })).toBeDisabled();
  });
});
