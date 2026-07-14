import { describe, expect, it, vi } from 'vitest';
import { createTimerSoundPlayer } from './timerSound.js';

function createFakeAudioContext() {
  const oscillators = [];
  const gains = [];
  const context = {
    currentTime: 4,
    destination: {},
    state: 'suspended',
    close: vi.fn(async () => { context.state = 'closed'; }),
    resume: vi.fn(async () => { context.state = 'running'; }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = {
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
      gains.push(gain);
      return gain;
    }),
  };
  return { context, gains, oscillators };
}

describe('timer sound player', () => {
  it('unlocks once and generates a local two-tone completion signal', async () => {
    const { context, gains, oscillators } = createFakeAudioContext();
    const createAudioContext = vi.fn(() => context);
    const player = createTimerSoundPlayer({ createAudioContext });

    await expect(player.prepare()).resolves.toBe(true);
    await expect(player.play()).resolves.toBe(true);

    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(oscillators).toHaveLength(2);
    expect(gains).toHaveLength(2);
    oscillators.forEach((oscillator) => {
      expect(oscillator.start).toHaveBeenCalledOnce();
      expect(oscillator.stop).toHaveBeenCalledOnce();
    });
  });

  it('degrades silently when Web Audio is unavailable', async () => {
    const player = createTimerSoundPlayer({ createAudioContext: () => null });
    await expect(player.prepare()).resolves.toBe(false);
    await expect(player.play()).resolves.toBe(false);
  });
});
