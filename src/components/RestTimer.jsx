import { Pause, Play, Plus, Timer, X } from 'lucide-react';
import { prepareTimerSound } from '../features/timer/timerSound.js';

const pluralRules = new Intl.PluralRules('ru-RU');

function pluralize(value, forms) {
  return `${value} ${forms[pluralRules.select(value)]}`;
}

function normalizeSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function timerAccessibleLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const minuteText = pluralize(minutes, {
    one: 'минута',
    few: 'минуты',
    many: 'минут',
    other: 'минуты',
  });
  const secondText = pluralize(remainder, {
    one: 'секунда',
    few: 'секунды',
    many: 'секунд',
    other: 'секунды',
  });

  if (!minutes) return `Осталось ${secondText}`;
  if (!remainder) return `Осталось ${minuteText}`;
  return `Осталось ${minuteText} ${secondText}`;
}

function runPreparedTimerAction(action) {
  void prepareTimerSound();
  action?.();
}

/**
 * Controlled UI for the single global rest timer.
 *
 * @param {object} props
 * @param {number} props.remainingSeconds
 * @param {'running' | 'paused' | 'expired'} [props.status]
 * @param {string} [props.label]
 * @param {() => void} [props.onPause]
 * @param {() => void} [props.onResume]
 * @param {() => void} [props.onAddThirty]
 * @param {() => void} [props.onCancel]
 */
export function RestTimer({
  remainingSeconds,
  status = 'running',
  label = 'Таймер отдыха',
  onPause,
  onResume,
  onAddThirty,
  onCancel,
}) {
  const seconds = normalizeSeconds(remainingSeconds);
  const paused = status === 'paused';
  const expired = status === 'expired' || seconds === 0;
  const statusText = expired ? 'Отдых завершён' : paused ? 'На паузе' : 'Идёт отсчёт';

  return (
    <section className={`rest-timer ${paused ? 'paused' : ''} ${expired ? 'expired' : ''}`} aria-label={label}>
      <span className="rest-timer-icon" aria-hidden="true"><Timer size={21} /></span>
      <div className="rest-timer-copy">
        <span>{label}</span>
        <output
          className="rest-timer-time"
          aria-label={timerAccessibleLabel(seconds)}
          aria-live="polite"
          aria-atomic="true"
        >
          {formatTimer(seconds)}
        </output>
        <small>{statusText}</small>
      </div>
      <div className="rest-timer-actions">
        {!expired && (paused ? (
          <button type="button" className="secondary-button" onClick={() => runPreparedTimerAction(onResume)} disabled={!onResume} aria-label="Продолжить таймер">
            <Play size={17} aria-hidden="true" /> Продолжить
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={onPause} disabled={!onPause} aria-label="Поставить таймер на паузу">
            <Pause size={17} aria-hidden="true" /> Пауза
          </button>
        ))}
        <button type="button" className="secondary-button" onClick={() => runPreparedTimerAction(onAddThirty)} disabled={!onAddThirty} aria-label="Добавить 30 секунд">
          <Plus size={17} aria-hidden="true" /> 30 сек
        </button>
        <button type="button" className="icon-button danger" onClick={onCancel} disabled={!onCancel} aria-label="Отменить таймер">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export default RestTimer;
