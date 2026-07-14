// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareTimerSound } from '../timer/timerSound.js';
import { SessionRest } from './SessionRest.jsx';

vi.mock('../timer/timerSound.js', () => ({
  prepareTimerSound: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(prepareTimerSound).mockReset();
});

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
        onSkip={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('button', { name: '30 сек' }));

    expect(onResume).toHaveBeenCalledOnce();
    expect(onAddThirty).toHaveBeenCalledOnce();
    expect(prepareTimerSound).toHaveBeenCalledTimes(2);
  });
});
