// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareTimerSound } from '../timer/timerSound.js';
import { SessionRest } from './SessionRest.jsx';

vi.mock('../timer/timerSound.js', () => ({
  prepareTimerSound: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(prepareTimerSound).mockReset();
});

afterEach(cleanup);

describe('SessionRest', () => {
  it('prepares audio from resume and add-time user gestures', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onAddThirty = vi.fn();

    render(
      <SessionRest
        exercise={{ id: 'press', name: 'Жим' }}
        nextExercise={{ id: 'press', name: 'Жим' }}
        nextSetNumber={2}
        timerSnapshot={{ status: 'paused', remainingSeconds: 45 }}
        onResume={onResume}
        onAddThirty={onAddThirty}
        onContinue={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('button', { name: '30 сек' }));

    expect(onResume).toHaveBeenCalledOnce();
    expect(onAddThirty).toHaveBeenCalledOnce();
    expect(prepareTimerSound).toHaveBeenCalledTimes(2);
  });

  it('waits at zero and can restart the expired rest with 30 seconds', async () => {
    const user = userEvent.setup();
    const onAddThirty = vi.fn();
    const onContinue = vi.fn();

    render(
      <SessionRest
        exercise={{ id: 'press', name: 'Жим' }}
        nextExercise={{ id: 'press', name: 'Жим' }}
        nextSetNumber={2}
        timerSnapshot={{ status: 'expired', remainingSeconds: 0 }}
        onPause={() => {}}
        onAddThirty={onAddThirty}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('Отдых завершён')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пауза' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '30 сек' }));
    await user.click(screen.getByRole('button', { name: 'Начать следующий подход' }));
    expect(onAddThirty).toHaveBeenCalledOnce();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('labels the transition between exercises explicitly', () => {
    render(
      <SessionRest
        exercise={{ id: 'press', name: 'Отжимания' }}
        nextExercise={{ id: 'row', name: 'Подтягивания', sets: 3, plannedReps: '8' }}
        nextSetNumber={1}
        timerSnapshot={{ status: 'running', remainingSeconds: 60 }}
        onContinue={() => {}}
      />,
    );

    expect(screen.getByText('Следующее упражнение')).toBeInTheDocument();
    expect(screen.getByText('Подтягивания')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать упражнение' })).toBeInTheDocument();
  });
});
