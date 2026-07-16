import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimedSetSession } from './TimedSetSession.jsx';

afterEach(cleanup);

const exercise = {
  id: 'plank',
  name: 'Планка',
  structure: 'sets',
  target: { kind: 'duration', value: 180, unit: 'seconds' },
  sets: 2,
  setResults: [
    { setNumber: 1, status: 'pending' },
    { setNumber: 2, status: 'pending' },
  ],
};

const baseProps = {
  workoutId: 'workout',
  exercise,
  exerciseIndex: 0,
  exerciseCount: 1,
  setIndex: 0,
};

describe('TimedSetSession', () => {
  it('starts a timed set from a focused ready state', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TimedSetSession {...baseProps} onStart={onStart} />);

    expect(screen.getByText('03:00')).toBeInTheDocument();
    expect(screen.getByText('Таймер завершит подход автоматически')).toBeInTheDocument();
    await user.dblClick(screen.getByRole('button', { name: 'Начать подход' }));

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith({
      workoutId: 'workout',
      exerciseId: 'plank',
      setIndex: 0,
    });
    expect(screen.getByRole('button', { name: 'Запускаем…' })).toBeDisabled();
  });

  it('pauses, resumes, and confirms an early finish', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onFinishEarly = vi.fn();
    const { rerender } = render(
      <TimedSetSession
        {...baseProps}
        timerSnapshot={{ phase: 'work', status: 'running', remainingSeconds: 125 }}
        onPause={onPause}
        onResume={onResume}
        onFinishEarly={onFinishEarly}
      />,
    );

    expect(screen.getByText('02:05')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    expect(onPause).toHaveBeenCalledOnce();

    rerender(
      <TimedSetSession
        {...baseProps}
        timerSnapshot={{ phase: 'work', status: 'paused', remainingSeconds: 125 }}
        onPause={onPause}
        onResume={onResume}
        onFinishEarly={onFinishEarly}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(onResume).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Завершить раньше' }));
    expect(screen.getByRole('alertdialog', { name: 'Завершить подход раньше' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Завершить сейчас' }));
    expect(onFinishEarly).toHaveBeenCalledOnce();
  });

  it('explains why another active work timer blocks the start', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <TimedSetSession
        {...baseProps}
        onStart={onStart}
        startBlockedMessage="Сначала завершите активный подход в другой тренировке."
      />,
    );

    expect(screen.getByText('Сначала завершите активный подход в другой тренировке.')).toHaveClass('session-start-blocked');
    const startButton = screen.getByRole('button', { name: 'Начать подход' });
    expect(startButton).toBeDisabled();
    await user.click(startButton);
    expect(onStart).not.toHaveBeenCalled();
  });
});
