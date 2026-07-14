const CHIME_TONES = Object.freeze([
  { frequency: 784, offset: 0, duration: 0.16 },
  { frequency: 1046.5, offset: 0.13, duration: 0.22 },
]);
const CHIME_OFFSETS = Object.freeze([0, 1.2, 2.4, 3.6, 4.8]);
const TIMER_TONES = Object.freeze(CHIME_OFFSETS.flatMap((chimeOffset) => (
  CHIME_TONES.map((tone) => ({ ...tone, offset: chimeOffset + tone.offset }))
)));

function createBrowserAudioContext() {
  const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

/**
 * Creates an isolated timer sound player. Audio support is optional: every
 * method fails silently so workout tracking never depends on audio playback.
 * @param {{createAudioContext?: () => AudioContext|null}} options
 */
export function createTimerSoundPlayer({ createAudioContext = createBrowserAudioContext } = {}) {
  let context = null;

  const getReadyContext = async () => {
    try {
      if (!context || context.state === 'closed') context = createAudioContext();
      if (!context) return null;
      if (context.state === 'suspended') await context.resume?.();
      return context.state === 'closed' ? null : context;
    } catch {
      return null;
    }
  };

  const prepare = async () => Boolean(await getReadyContext());

  const play = async () => {
    const activeContext = await getReadyContext();
    if (!activeContext) return false;

    try {
      const startAt = activeContext.currentTime + 0.02;
      TIMER_TONES.forEach((tone) => {
        const oscillator = activeContext.createOscillator();
        const gain = activeContext.createGain();
        const toneStart = startAt + tone.offset;
        const toneEnd = toneStart + tone.duration;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
        gain.gain.setValueAtTime(0.0001, toneStart);
        gain.gain.exponentialRampToValueAtTime(0.16, toneStart + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
        oscillator.connect(gain);
        gain.connect(activeContext.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneEnd);
      });
      return true;
    } catch {
      return false;
    }
  };

  const dispose = async () => {
    try {
      await context?.close?.();
    } catch {
      // Closing audio is best-effort and only used by isolated consumers/tests.
    }
    context = null;
  };

  return { dispose, play, prepare };
}

const defaultTimerSoundPlayer = createTimerSoundPlayer();

/** Unlock audio from the same user gesture that starts the rest timer. */
export const prepareTimerSound = () => defaultTimerSoundPlayer.prepare();

/** Play the local two-tone completion signal. */
export const playTimerFinishedSound = () => defaultTimerSoundPlayer.play();
