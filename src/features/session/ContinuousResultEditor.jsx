import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { formatDistance, formatDuration } from '../../domain/targets.js';

function initialNumber(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? String(number) : '';
}

export function ContinuousResultEditor({ exercise, snapshot, onSubmit, onBack }) {
  const distanceFirst = exercise?.target?.kind === 'distance';
  const [distance, setDistance] = useState(() => initialNumber(snapshot?.accumulatedMeters));
  const [duration, setDuration] = useState(() => initialNumber(snapshot?.activeDurationSeconds));
  const [error, setError] = useState('');
  const primaryRef = useRef(null);

  const submit = () => {
    const distanceValue = distance === '' ? null : Number(distance);
    const durationValue = duration === '' ? null : Number(duration);
    const primaryValue = distanceFirst ? distanceValue : durationValue;
    const maximum = distanceFirst ? 1_000_000 : 86_400;
    if (!Number.isInteger(primaryValue) || primaryValue < 1 || primaryValue > maximum) {
      setError(distanceFirst
        ? 'Укажи дистанцию от 1 до 1 000 000 метров'
        : 'Укажи время от 1 секунды до 24 часов');
      primaryRef.current?.focus();
      return;
    }
    if (distanceValue !== null && (!Number.isInteger(distanceValue) || distanceValue < 1 || distanceValue > 1_000_000)) {
      setError('Проверь дистанцию в метрах');
      return;
    }
    if (durationValue !== null && (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 86_400)) {
      setError('Проверь активное время в секундах');
      return;
    }
    setError('');
    onSubmit?.({
      ...(distanceValue !== null ? { distanceMeters: distanceValue } : {}),
      ...(durationValue !== null ? { activeDurationSeconds: durationValue } : {}),
    });
  };

  const fields = [
    {
      key: 'distance',
      label: 'Дистанция, м',
      value: distance,
      setValue: setDistance,
      hint: distance ? formatDistance(distance) : 'Например, 3000',
      maximum: 1_000_000,
    },
    {
      key: 'duration',
      label: 'Активное время, сек',
      value: duration,
      setValue: setDuration,
      hint: duration ? formatDuration(duration) : 'Например, 1200',
      maximum: 86_400,
    },
  ].sort((left) => left.key === (distanceFirst ? 'distance' : 'duration') ? -1 : 1);

  return (
    <section className="continuous-result-editor" aria-labelledby="continuous-result-title">
      <p className="session-kicker">Проверь итог</p>
      <h2 id="continuous-result-title">Сохранить результат</h2>
      <p>Можно поправить итоговые цифры — маршрут и координаты не сохраняются.</p>
      <div className="continuous-result-fields">
        {fields.map((field, index) => (
          <label key={field.key}>
            <span>{field.label}{index === 0 ? ' · цель' : ' · необязательно'}</span>
            <input
              ref={index === 0 ? primaryRef : undefined}
              type="number"
              inputMode="numeric"
              min="1"
              max={field.maximum}
              step="1"
              value={field.value}
              onChange={(event) => field.setValue(event.target.value)}
            />
            <small>{field.hint}</small>
          </label>
        ))}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="continuous-result-actions">
        {onBack && <button type="button" className="session-secondary-action" onClick={onBack}>Назад</button>}
        <button type="button" className="session-primary-action" onClick={submit} disabled={!onSubmit}>
          <Check size={20} aria-hidden="true" /> Сохранить результат
        </button>
      </div>
    </section>
  );
}

