import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTimerCompletionSound } from './useTimerCompletionSound.js';

function SoundHarness({ play, snapshot, vibrate = () => {} }) {
  useTimerCompletionSound(snapshot, { play, vibrate });
  return null;
}

const runningSnapshot = {
  status: 'running',
  remainingSeconds: 1,
  endsAt: '2026-07-14T10:01:30.000Z',
  workoutId: 'workout-1',
  exerciseId: 'exercise-1',
};

describe('useTimerCompletionSound', () => {
  it('plays once when an observed running timer reaches zero', async () => {
    const play = vi.fn().mockResolvedValue(true);
    const vibrate = vi.fn();
    const { rerender } = render(<SoundHarness play={play} vibrate={vibrate} snapshot={runningSnapshot} />);

    const expired = { ...runningSnapshot, status: 'expired', remainingSeconds: 0 };
    rerender(<SoundHarness play={play} vibrate={vibrate} snapshot={expired} />);
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(vibrate).toHaveBeenCalledWith();

    rerender(<SoundHarness play={play} vibrate={vibrate} snapshot={expired} />);
    expect(play).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it('does not sound when the first observed snapshot is already expired', () => {
    const play = vi.fn();
    render(
      <SoundHarness
        play={play}
        snapshot={{ ...runningSnapshot, status: 'expired', remainingSeconds: 0 }}
      />,
    );
    expect(play).not.toHaveBeenCalled();
  });
});
