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
    actualValue: null,
    ...values,
  };
}

function createExercise(overrides = {}) {
  return {
    id: 'exercise-1',
    name: 'Отжимания',
    sets: 2,
    plannedReps: '10',
    plannedWeightKg: null,
    restSeconds: 90,
    structure: 'sets',
    target: { kind: 'reps', value: 10, unit: 'count' },
    completedSets: 0,
    actualWeightKg: null,
    actualReps: null,
    rpe: null,
    setResults: [setResult(1), setResult(2)],
    ...overrides,
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
    intensity: 'Средняя',
    resultNotes: '',
    startedAt: '2026-07-14T10:00:00.000Z',
    completedAt: null,
    pointsAwarded: 0,
    exercises: [createExercise()],
    ...overrides,
  };
}

const baseProps = {
  today: '2026-07-14',
  onBack: () => {},
};

describe('ActiveWorkoutPage', () => {
  it('starts on the first pending set without inputs and submits the set only once', async () => {
    const user = userEvent.setup();
    const workout = createWorkout({ startedAt: null });
    const onStart = vi.fn();
    const onCompleteSet = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        onStart={onStart}
        onCompleteSet={onCompleteSet}
      />,
    );

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Отжимания' })).toHaveFocus());
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('повторений')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Подход 1: ожидает')).toHaveClass('current');
    expect(screen.queryByRole('button', { name: 'Подход 1: ожидает' })).not.toBeInTheDocument();

    await user.dblClick(screen.getByRole('button', { name: 'Подход выполнен' }));

    expect(onCompleteSet).toHaveBeenCalledTimes(1);
    expect(onCompleteSet).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 0,
    });
    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  });

  it('keeps a non-numeric plan as text and never invents repetitions', () => {
    const workout = createWorkout({
      exercises: [createExercise({ plannedReps: 'до отказа', legacyTargetText: 'до отказа' })],
    });

    render(<ActiveWorkoutPage {...baseProps} workout={workout} onCompleteSet={() => {}} />);

    expect(screen.getByText('до отказа')).toBeInTheDocument();
    expect(screen.getByText('выполни по плану')).toBeInTheDocument();
    expect(screen.queryByText('повторений')).not.toBeInTheDocument();
  });

  it('keeps linked rest visible and lets the user continue early', async () => {
    const user = userEvent.setup();
    const workout = createWorkout({
      exercises: [createExercise({
        completedSets: 1,
        setResults: [setResult(1, 'completed', { reps: 10 }), setResult(2)],
      })],
    });
    const onTimerPause = vi.fn();
    const onTimerAddThirty = vi.fn();
    const onContinueRest = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        timerSnapshot={{ status: 'running', remainingSeconds: 80, workoutId: 'workout-1', exerciseId: 'exercise-1' }}
        onTimerPause={onTimerPause}
        onTimerAddThirty={onTimerAddThirty}
        onContinueRest={onContinueRest}
      />,
    );

    expect(screen.getByText('01:20').closest('.session-timer-digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    await user.click(screen.getByRole('button', { name: '30 сек' }));
    await user.click(screen.getByRole('button', { name: 'Начать следующий подход' }));

    expect(onTimerPause).toHaveBeenCalledOnce();
    expect(onTimerAddThirty).toHaveBeenCalledOnce();
    expect(onContinueRest).toHaveBeenCalledWith('workout-1');
  });

  it('starts a duration set from a focused ready screen', async () => {
    const user = userEvent.setup();
    const onStartTimedSet = vi.fn();
    const workout = createWorkout({
      exercises: [createExercise({
        name: 'Планка',
        target: { kind: 'duration', value: 180, unit: 'seconds' },
      })],
    });

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        onStartTimedSet={onStartTimedSet}
      />,
    );

    expect(screen.getByText('03:00')).toBeInTheDocument();
    expect(screen.getByText('Таймер завершит подход автоматически')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Начать подход' }));
    expect(onStartTimedSet).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 0,
    });
  });

  it('shows a running work timer and lets the user finish it early', async () => {
    const user = userEvent.setup();
    const onTimerPause = vi.fn();
    const onFinishTimedSet = vi.fn();
    const workout = createWorkout({
      exercises: [createExercise({
        name: 'Планка',
        target: { kind: 'duration', value: 180, unit: 'seconds' },
      })],
    });

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        timerSnapshot={{
          status: 'running',
          phase: 'work',
          remainingSeconds: 142,
          initialSeconds: 180,
          workoutId: 'workout-1',
          exerciseId: 'exercise-1',
          setIndex: 0,
        }}
        onTimerPause={onTimerPause}
        onFinishTimedSet={onFinishTimedSet}
      />,
    );

    expect(screen.getByText('02:22')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    expect(onTimerPause).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Завершить раньше' }));
    await user.click(screen.getByRole('button', { name: 'Завершить сейчас' }));
    expect(onFinishTimedSet).toHaveBeenCalledOnce();
  });

  it('routes a continuous distance exercise to the GPS start screen', () => {
    const workout = createWorkout({
      exercises: [{
        ...createExercise(),
        id: 'run',
        name: 'Утренний бег',
        structure: 'continuous',
        target: { kind: 'distance', value: 3000, unit: 'meters' },
        sets: 1,
        setResults: [],
        continuousResult: {
          status: 'pending',
          actualValue: null,
          distanceMeters: null,
          activeDurationSeconds: null,
          averagePaceSecondsPerKm: null,
          completedAt: null,
        },
      }],
    });

    render(<ActiveWorkoutPage {...baseProps} workout={workout} />);
    expect(screen.getByRole('heading', { name: 'Утренний бег' })).toBeInTheDocument();
    expect(screen.getByText('Цель: 3 км')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  });

  it('returns from rest to the first pending set and moves focus', async () => {
    const user = userEvent.setup();
    const workout = createWorkout({
      exercises: [createExercise({
        completedSets: 1,
        setResults: [setResult(1, 'completed', { reps: 10 }), setResult(2)],
      })],
    });
    const onContinueRest = vi.fn();
    const { rerender } = render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={workout}
        timerSnapshot={{ status: 'expired', remainingSeconds: 0, workoutId: 'workout-1', exerciseId: 'exercise-1' }}
        onContinueRest={onContinueRest}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Осталось 0 секунд' })).toHaveFocus());
    expect(screen.getByText('Отдых завершён')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пауза' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Начать следующий подход' }));
    expect(onContinueRest).toHaveBeenCalledWith('workout-1');

    rerender(<ActiveWorkoutPage {...baseProps} workout={workout} timerSnapshot={null} onCompleteSet={() => {}} />);
    expect(screen.getByText('Подход 2 из 2')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Отжимания' })).toHaveFocus());
  });

  it('corrects only repetitions in the summary and focuses the first invalid value', async () => {
    const user = userEvent.setup();
    const resolvedWorkout = createWorkout({
      exercises: [createExercise({
        completedSets: 2,
        setResults: [
          setResult(1, 'completed', { weightKg: 15, reps: 10, rpe: 7 }),
          setResult(2, 'completed', { weightKg: 15, reps: 10, rpe: 8 }),
        ],
      })],
    });
    const onUpdateSet = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={resolvedWorkout}
        onUpdateSet={onUpdateSet}
        onCompleteWorkout={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Исправить результаты' }));
    expect(screen.queryByText('Вес, кг')).not.toBeInTheDocument();
    expect(screen.queryByText('RPE')).not.toBeInTheDocument();
    const firstReps = screen.getByRole('spinbutton', { name: 'Повторы: Отжимания, подход 1' });
    await user.clear(firstReps);
    await user.type(firstReps, '1000');
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Укажи целое число от 1 до 999');
    expect(firstReps).toHaveFocus();
    expect(onUpdateSet).not.toHaveBeenCalled();

    await user.clear(firstReps);
    await user.type(firstReps, '12');
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onUpdateSet).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 0,
      patch: { reps: 12 },
    });
    expect(screen.getByRole('heading', { name: 'Тренировка собрана' })).toBeInTheDocument();
  });

  it('corrects actual duration in seconds without showing repetition fields', async () => {
    const user = userEvent.setup();
    const resolvedWorkout = createWorkout({
      exercises: [createExercise({
        name: 'Планка',
        target: { kind: 'duration', value: 180, unit: 'seconds' },
        completedSets: 2,
        setResults: [
          setResult(1, 'completed', { actualValue: 175 }),
          setResult(2, 'completed', { actualValue: 180 }),
        ],
      })],
    });
    const onUpdateSet = vi.fn();

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={resolvedWorkout}
        onUpdateSet={onUpdateSet}
        onCompleteWorkout={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Исправить результаты' }));
    const firstDuration = screen.getByRole('spinbutton', { name: 'Время, секунд: Планка, подход 1' });
    fireEvent.change(firstDuration, { target: { value: '160' } });
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onUpdateSet).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'exercise-1',
      setIndex: 0,
      patch: { actualValue: 160 },
    });
  });

  it('corrects a completed continuous result in the final review', async () => {
    const user = userEvent.setup();
    const onUpdateContinuous = vi.fn();
    const resolvedWorkout = createWorkout({
      exercises: [{
        ...createExercise(),
        id: 'run',
        name: 'Бег',
        structure: 'continuous',
        target: { kind: 'distance', value: 3000, unit: 'meters' },
        sets: 1,
        setResults: [],
        continuousResult: {
          status: 'completed',
          actualValue: 3100,
          distanceMeters: 3100,
          activeDurationSeconds: 900,
          averagePaceSecondsPerKm: 290,
          completedAt: '2026-07-14T10:15:00.000Z',
        },
      }],
    });

    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={resolvedWorkout}
        onUpdateSet={() => {}}
        onUpdateContinuous={onUpdateContinuous}
        onCompleteWorkout={() => {}}
      />,
    );

    expect(screen.getByText('3,1 км')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Исправить результаты' }));
    fireEvent.change(screen.getByLabelText('Дистанция, м: Бег'), { target: { value: '3200' } });
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onUpdateContinuous).toHaveBeenCalledWith({
      workoutId: 'workout-1',
      exerciseId: 'run',
      distanceMeters: 3200,
      activeDurationSeconds: 900,
    });
  });

  it('updates notes and requires explicit confirmation on the summary', async () => {
    const user = userEvent.setup();
    const resolvedWorkout = createWorkout({
      exercises: [createExercise({
        completedSets: 2,
        setResults: [setResult(1, 'completed', { reps: 10 }), setResult(2, 'completed', { reps: 10 })],
      })],
    });
    const onUpdateNotes = vi.fn();
    const onCompleteWorkout = vi.fn();

    function SummaryHarness() {
      const [workout, setWorkout] = useState(resolvedWorkout);
      return (
        <ActiveWorkoutPage
          {...baseProps}
          workout={workout}
          onUpdateNotes={(workoutId, resultNotes) => {
            onUpdateNotes(workoutId, resultNotes);
            setWorkout((current) => ({ ...current, resultNotes }));
          }}
          onCompleteWorkout={onCompleteWorkout}
        />
      );
    }

    render(<SummaryHarness />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Тренировка собрана' })).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Итоговая заметка'), { target: { value: 'Чистая техника ' } });
    await user.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    expect(onUpdateNotes).toHaveBeenCalledWith('workout-1', 'Чистая техника ');
    expect(onCompleteWorkout).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workout-1',
      resultNotes: 'Чистая техника ',
    }));
  });

  it('keeps route guards for future workouts', () => {
    const onCompleteSet = vi.fn();
    render(
      <ActiveWorkoutPage
        {...baseProps}
        workout={createWorkout({ plannedDate: '2026-07-15' })}
        onCompleteSet={onCompleteSet}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Ещё не время тренироваться' })).toBeInTheDocument();
    expect(onCompleteSet).not.toHaveBeenCalled();
  });
});
