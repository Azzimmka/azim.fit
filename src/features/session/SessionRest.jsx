import { AlarmClock, Pause, Play, Plus, SkipForward } from 'lucide-react';
import { pluralizeRu } from '../../domain/plural.js';
import { prepareTimerSound } from '../timer/timerSound.js';
import { formatSessionClock } from './sessionView.js';

function runPreparedTimerAction(action) {
  void prepareTimerSound();
  action?.();
}

export function SessionRest({
  exercise,
  nextExercise,
  nextSetNumber,
  timerSnapshot,
  headingRef,
  onPause,
  onResume,
  onAddThirty,
  onContinue,
}) {
  const paused = timerSnapshot?.status === 'paused';
  const expired = timerSnapshot?.status === 'expired';
  const remainingSeconds = timerSnapshot?.remainingSeconds ?? 0;
  const sameExercise = Boolean(nextExercise && nextExercise.id === exercise?.id);
  const secondLabel = `${remainingSeconds} ${pluralizeRu(remainingSeconds, ['секунда', 'секунды', 'секунд'])}`;

  return (
    <section className="session-rest" aria-labelledby="session-rest-title">
      <div className="session-rest-orbit" aria-hidden="true" />
      <span className="session-rest-icon" aria-hidden="true"><AlarmClock size={28} /></span>
      <p className="session-kicker">Отдых · {exercise?.name ?? 'Упражнение'}</p>
      <h1 id="session-rest-title" ref={headingRef} tabIndex="-1" className="session-timer-digits">
        <output aria-live="polite" aria-atomic="true" aria-label={`Осталось ${secondLabel}`}>
          {formatSessionClock(remainingSeconds)}
        </output>
      </h1>
      <p className="session-rest-status">
        {expired ? 'Отдых завершён' : paused ? 'Таймер на паузе' : 'Восстанови дыхание. Следующий шаг уже готов.'}
      </p>

      <div className="session-next-card">
        <span>{sameExercise ? 'Следующий подход' : nextExercise ? 'Следующее упражнение' : 'После отдыха'}</span>
        <strong>{sameExercise ? `Подход ${nextSetNumber}` : nextExercise?.name ?? 'Итоги тренировки'}</strong>
        {nextExercise && <small>{sameExercise ? nextExercise.name : `${nextExercise.sets} × ${nextExercise.plannedReps}`}</small>}
      </div>

      <div className="session-rest-controls" aria-label="Управление таймером">
        {!expired && (paused ? (
          <button type="button" className="session-control-button" onClick={() => runPreparedTimerAction(onResume)} disabled={!onResume}>
            <Play size={19} aria-hidden="true" /> Продолжить
          </button>
        ) : (
          <button type="button" className="session-control-button" onClick={onPause} disabled={!onPause}>
            <Pause size={19} aria-hidden="true" /> Пауза
          </button>
        ))}
        <button type="button" className="session-control-button" onClick={() => runPreparedTimerAction(onAddThirty)} disabled={!onAddThirty}>
          <Plus size={19} aria-hidden="true" /> 30 сек
        </button>
      </div>

      <button type="button" className="session-primary-action session-continue-rest" onClick={onContinue} disabled={!onContinue}>
        <SkipForward size={20} aria-hidden="true" />
        {sameExercise ? 'Начать следующий подход' : nextExercise ? 'Начать упражнение' : 'Перейти к итогам'}
      </button>
    </section>
  );
}
