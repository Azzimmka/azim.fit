import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTimerCompletionSound } from './useTimerCompletionSound.js';

function SoundHarness({ play, snapshot }) {
  useTimerCompletionSound(snapshot, { play });
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
    const { rerender } = render(<SoundHarness play={play} snapshot={runningSnapshot} />);

    const expired = { ...runningSnapshot, status: 'expired', remainingSeconds: 0 };
    rerender(<SoundHarness play={play} snapshot={expired} />);
    await waitFor(() => expect(play).toHaveBeenCalledOnce());

    rerender(<SoundHarness play={play} snapshot={expired} />);
    expect(play).toHaveBeenCalledOnce();
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
