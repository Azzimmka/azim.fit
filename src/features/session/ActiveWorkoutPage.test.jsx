import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveWorkoutPage } from './ActiveWorkoutPage.jsx';

afterEach(cleanup);

function setResult(setNumber, status = 'pending', values = {}) {
  return {
    setNumber,
    status,
    weightKg: null,
    reps: null,
    rpe: null,
    completedAt: null,
    ...values,
  };
}

function createWorkout(overrides = {}) {
  return {
    id: 'workout-1',
    title: 'Грудь и трицепс',
    type: 'Силовая',
    status: 'planned',
    plannedDate: '2026-07-14',
    time: '18:00',
    durationMinutes: 45,
    intensity: 'Средняя',
    planNotes: '',
    resultNotes: '',
    startedAt: '2026-07-14T10:00:00.000Z',
    completedAt: null,
    pointsAwarded: 0,
    exercises: [{
      id: 'exercise-1',
      name: 'Отжимания',
      sets: 2,
      plannedReps: '10',
      plannedWeightKg: 20,
      restSeconds: 90,
      completedSets: 0,
      actualWeightKg: null,
      actualReps: null,
      rpe: null,
      setResults: [setResult(1), setResult(2)],
    }],
    ...overrides,
  };
}

const baseProps = {
  today: '2026-07-14',
  onBack: () => {},
};

describe('ActiveWorkoutPage', () => {
  it('starts a fresh session and completes the pending set with validated per-set values', async () => {
    const user = userEvent.setup();
    const workout = createWorkout({ startedAt: null });
    const onStart = vi.fn();
    const onCompleteSet = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        workouts={[workout]}
        onStart={onStart}
        onCompleteSet={onCompleteSet}
      />,
    );

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Отжимания' })).toHaveFocus());
    expect(screen.getByLabelText('Вес, кг')).toHaveValue(20);
    expect(screen.getByLabelText('Повторы')).toHaveValue(10);

    await user.clear(screen.getByLabelText('Вес, кг'));
    await user.type(screen.getByLabelText('Вес, кг'), '22.5');
    await user.type(screen.getByLabelText('RPE'), '8');
    await user.click(screen.getByRole('button', { name: 'Выполнить подход и начать отдых' }));

    expect(onCompleteSet).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 0,
      result: { weightKg: 22.5, reps: 10, rpe: 8 },
      skipRest: false,
    });
  });

  it('keeps focus on the first invalid field and does not save', async () => {
    const user = userEvent.setup();
    const workout = createWorkout();
    const onCompleteSet = vi.fn();

    render(<ActiveWorkoutPage {...baseProps} workout={workout} workouts={[workout]} onCompleteSet={onCompleteSet} />);
    const weight = screen.getByLabelText('Вес, кг');
    await user.clear(weight);
    await user.type(weight, '0');
    await user.click(screen.getByRole('button', { name: 'Выполнить подход и начать отдых' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Укажи вес от 0,5 до 1000 кг');
    expect(weight).toHaveFocus();
    expect(onCompleteSet).not.toHaveBeenCalled();
  });

  it('renders the embedded timer and exposes pause, add and skip controls', async () => {
    const user = userEvent.setup();
    const workout = createWorkout();
    const onTimerPause = vi.fn();
    const onTimerAddThirty = vi.fn();
    const onSkipRest = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        workouts={[workout]}
        timerSnapshot={{ status: 'running', remainingSeconds: 80, workoutId: 'workout-1', exerciseId: 'exercise-1' }}
        onTimerPause={onTimerPause}
        onTimerAddThirty={onTimerAddThirty}
        onSkipRest={onSkipRest}
      />,
    );

    expect(screen.getByText('01:20').closest('.session-timer-digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    await user.click(screen.getByRole('button', { name: '30 сек' }));
    await user.click(screen.getByRole('button', { name: 'Пропустить отдых' }));
    expect(onTimerPause).toHaveBeenCalledOnce();
    expect(onTimerAddThirty).toHaveBeenCalledOnce();
    expect(onSkipRest).toHaveBeenCalledOnce();
  });

  it('returns from a finished rest to the first pending set and moves focus across session views', async () => {
    const user = userEvent.setup();
    const workout = createWorkout({
      exercises: [{
        ...createWorkout().exercises[0],
        completedSets: 1,
        setResults: [
          setResult(1, 'completed', { weightKg: 20, reps: 10, rpe: 7 }),
          setResult(2),
        ],
      }],
    });
    const timerSnapshot = {
      status: 'running',
      remainingSeconds: 80,
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
    };
    const { rerender } = render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        workouts={[workout]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Подход 1: выполнен' }));
    expect(screen.getByRole('button', { name: 'Подход 1: выполнен' })).toHaveAttribute('aria-pressed', 'true');
    rerender(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        workouts={[workout]}
        timerSnapshot={timerSnapshot}
      />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Осталось 80 секунд' })).toHaveFocus());
    await user.click(screen.getByRole('tab', { name: 'Весь план' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'План тренировки' })).toHaveFocus());

    rerender(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        workouts={[workout]}
        timerSnapshot={null}
      />,
    );

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Упражнение' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('button', { name: 'Подход 2: ожидает выполнения' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Подход 2 из 2/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Отжимания' })).toHaveFocus());
  });

  it('opens resolved sets from the plan and corrects a skipped set without rest', async () => {
    const user = userEvent.setup();
    const resolvedWorkout = createWorkout({
      exercises: [{
        ...createWorkout().exercises[0],
        completedSets: 1,
        actualWeightKg: 20,
        actualReps: 10,
        rpe: 7,
        setResults: [
          setResult(1, 'completed', { weightKg: 20, reps: 10, rpe: 7, completedAt: '2026-07-14T10:01:00.000Z' }),
          setResult(2, 'skipped'),
        ],
      }],
    });
    const onCompleteSet = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={resolvedWorkout}
        workouts={[resolvedWorkout]}
        onCompleteSet={onCompleteSet}
        onCompleteWorkout={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Исправить результаты' }));
    await user.click(screen.getByRole('button', { name: /Отжимания/ }));
    await user.click(screen.getByRole('button', { name: 'Подход 2: пропущен' }));
    await user.click(screen.getByRole('button', { name: 'Выполнить подход и начать отдых' }));

    expect(onCompleteSet).toHaveBeenCalledWith(expect.objectContaining({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 1,
      skipRest: true,
    }));
  });

  it('updates notes and requires explicit confirmation on the summary', async () => {
    const user = userEvent.setup();
    const resolvedWorkout = createWorkout({
      exercises: [{
        ...createWorkout().exercises[0],
        completedSets: 2,
        setResults: [
          setResult(1, 'completed', { weightKg: 20, reps: 10, rpe: 7 }),
          setResult(2, 'completed', { weightKg: 22.5, reps: 8, rpe: 8 }),
        ],
      }],
    });
    const onUpdateNotes = vi.fn();
    const onCompleteWorkout = vi.fn();

    function SummaryHarness() {
      const [workout, setWorkout] = useState(resolvedWorkout);
      return (
        <ActiveWorkoutPage
          {...baseProps}
          workout={workout}
          workouts={[workout]}
          onUpdateNotes={(workoutId, resultNotes) => {
            onUpdateNotes(workoutId, resultNotes);
            setWorkout((current) => ({ ...current, resultNotes }));
          }}
          onCompleteWorkout={onCompleteWorkout}
        />
      );
    }

    render(<SummaryHarness />);

    const summaryHeading = screen.getByRole('heading', { name: 'Тренировка собрана' });
    await waitFor(() => expect(summaryHeading).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Итоговая заметка'), { target: { value: 'Чистая техника ' } });
    expect(screen.getByLabelText('Итоговая заметка')).toHaveValue('Чистая техника ');
    await user.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    expect(onUpdateNotes).toHaveBeenCalledWith('workout-1', 'Чистая техника ');
    expect(onCompleteWorkout).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workout-1',
      resultNotes: 'Чистая техника ',
    }));
  });
});
