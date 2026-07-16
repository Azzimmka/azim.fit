import { useEffect, useState } from 'react';
import { Check, Pause, Play, TimerReset } from 'lucide-react';
import { formatDuration } from '../../domain/targets.js';
import { formatSessionClock } from './sessionView.js';

export function TimedSetSession({
  workoutId,
  exercise,
  exerciseIndex,
  exerciseCount,
  setIndex,
  timerSnapshot,
  headingRef,
  onStart,
  onPause,
  onResume,
  onFinishEarly,
  startBlockedMessage = '',
}) {
  const [starting, setStarting] = useState(false);
  const [confirmingEarlyFinish, setConfirmingEarlyFinish] = useState(false);
  const timerActive = timerSnapshot?.phase === 'work';
  const paused = timerActive && timerSnapshot.status === 'paused';
  const expired = timerActive && timerSnapshot.status === 'expired';
  const targetSeconds = Math.max(1, Math.round(Number(exercise?.target?.value) || 1));
  const remainingSeconds = timerActive
    ? Math.max(0, Number(timerSnapshot.remainingSeconds) || 0)
    : targetSeconds;
  const showStarting = starting && !startBlockedMessage;

  useEffect(() => {
    if (!starting || timerActive) return undefined;
    const timeoutId = window.setTimeout(() => setStarting(false), 1_200);
    return () => window.clearTimeout(timeoutId);
  }, [starting, timerActive]);

  const start = () => {
    if (starting || !onStart) return;
    setStarting(true);
    onStart({ workoutId, exerciseId: exercise.id, setIndex });
  };

  return (
    <section className={`session-timed-set ${timerActive ? 'active' : 'ready'}`} aria-labelledby="session-timed-title">
      <div className="session-timed-heading">
        <p className="session-kicker">Упражнение {exerciseIndex + 1} из {exerciseCount}</p>
        <h1 id="session-timed-title" ref={headingRef} tabIndex="-1">{exercise.name}</h1>
        <p>Подход {setIndex + 1} из {exercise.sets}</p>
      </div>

      <div className="session-work-timer">
        <span className="session-work-timer-icon" aria-hidden="true"><TimerReset size={27} /></span>
        <p>{timerActive ? paused ? 'Рабочий таймер на паузе' : expired ? 'Время вышло' : 'Подход идёт' : 'Цель подхода'}</p>
        <output
          className="session-timer-digits"
          aria-live="polite"
          aria-atomic="true"
          aria-label={timerActive ? `Осталось ${remainingSeconds} секунд` : `Цель ${targetSeconds} секунд`}
        >
          {formatSessionClock(remainingSeconds)}
        </output>
        <small>{timerActive ? `План: ${formatDuration(targetSeconds)}` : 'Таймер завершит подход автоматически'}</small>
      </div>

      <div className="session-set-statuses" aria-label={`Подход ${setIndex + 1} из ${exercise.sets}`}>
        {(exercise.setResults ?? []).map((result, index) => (
          <span
            key={result.setNumber ?? index}
            className={`${result.status} ${index === setIndex ? 'current' : ''}`}
            aria-label={`Подход ${index + 1}: ${result.status === 'completed' ? 'выполнен' : result.status === 'skipped' ? 'пропущен' : 'ожидает'}`}
          >
            {result.status === 'completed'
              ? <Check size={18} strokeWidth={3} aria-hidden="true" />
              : result.status === 'skipped' ? '—' : index + 1}
          </span>
        ))}
      </div>

      {!timerActive && startBlockedMessage && (
        <p className="session-start-blocked" role="status">{startBlockedMessage}</p>
      )}

      {confirmingEarlyFinish && (
        <div className="session-early-finish" role="alertdialog" aria-label="Завершить подход раньше">
          <div><strong>Завершить сейчас?</strong><p>Сохраним фактически прошедшее время.</p></div>
          <button type="button" className="session-secondary-action" onClick={() => setConfirmingEarlyFinish(false)}>Продолжить подход</button>
          <button type="button" className="session-primary-action" onClick={onFinishEarly}>Завершить сейчас</button>
        </div>
      )}

      <div className="session-set-action-dock session-timed-actions">
        {!timerActive ? (
          <button type="button" className="session-primary-action" disabled={!onStart || showStarting || Boolean(startBlockedMessage)} onClick={start}>
            <Play size={21} fill="currentColor" aria-hidden="true" />
            {showStarting ? 'Запускаем…' : 'Начать подход'}
          </button>
        ) : expired ? (
          <div className="session-timed-saving" role="status">Сохраняем подход…</div>
        ) : (
          <>
            <button type="button" className="session-primary-action" onClick={paused ? onResume : onPause} disabled={paused ? !onResume : !onPause}>
              {paused ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
              {paused ? 'Продолжить' : 'Пауза'}
            </button>
            <button type="button" className="session-secondary-action" onClick={() => setConfirmingEarlyFinish(true)} disabled={!onFinishEarly || confirmingEarlyFinish}>
              <Check size={19} aria-hidden="true" /> Завершить раньше
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export default TimedSetSession;
