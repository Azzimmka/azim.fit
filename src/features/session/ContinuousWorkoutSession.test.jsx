import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContinuousWorkoutSession } from './ContinuousWorkoutSession.jsx';

const exercise = {
  id: 'run',
  name: 'Утренний бег',
  structure: 'continuous',
  target: { kind: 'distance', value: 3000, unit: 'meters' },
};

const baseProps = {
  workoutId: 'workout',
  exercise,
  exerciseIndex: 0,
  exerciseCount: 1,
};

let geolocation;

beforeEach(() => {
  geolocation = {
    watchPosition: vi.fn(() => 4),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: geolocation,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

describe('ContinuousWorkoutSession', () => {
  it('requests GPS only from the explicit start action', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<ContinuousWorkoutSession {...baseProps} onStart={onStart} />);

    expect(screen.getByText('Цель: 3 км')).toBeInTheDocument();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Начать и включить GPS' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      workoutId: 'workout',
      exerciseId: 'run',
    }));
    expect(geolocation.watchPosition).toHaveBeenCalledOnce();
  });

  it('shows live totals, never auto-finishes at the goal, and opens review explicitly', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onReview = vi.fn();
    render(
      <ContinuousWorkoutSession
        {...baseProps}
        session={{
          workoutId: 'workout',
          exerciseId: 'run',
          status: 'active',
          accumulatedMeters: 3120,
          activeDurationSeconds: 900,
          activeSince: null,
        }}
        onPause={onPause}
        onReview={onReview}
      />,
    );

    expect(screen.getByText('3,12 км')).toBeInTheDocument();
    expect(screen.getByText('Цель достигнута')).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Пауза' }));
    expect(onPause).toHaveBeenCalledWith(expect.objectContaining({ workoutId: 'workout' }));
    await user.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ workoutId: 'workout' }));
  });

  it('submits corrected final distance and time from summary', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ContinuousWorkoutSession
        {...baseProps}
        session={{
          workoutId: 'workout',
          exerciseId: 'run',
          status: 'summary',
          accumulatedMeters: 3010,
          activeDurationSeconds: 920,
        }}
        onComplete={onComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Дистанция, м/), { target: { value: '3050' } });
    fireEvent.change(screen.getByLabelText(/Активное время, сек/), { target: { value: '900' } });
    await user.click(screen.getByRole('button', { name: 'Сохранить результат' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      workoutId: 'workout',
      exerciseId: 'run',
      distanceMeters: 3050,
      activeDurationSeconds: 900,
    }));
  });
});

