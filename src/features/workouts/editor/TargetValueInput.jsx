import { useState } from 'react';

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function TargetValueInput({ target, onChange, inputRef }) {
  const [distanceUnit, setDistanceUnit] = useState(() => (
    Number(target?.value) >= 1000 ? 'km' : 'm'
  ));
  const value = positiveInteger(target?.value);

  if (target?.kind === 'duration') {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return (
      <div className="target-value-grid duration-target-input">
        <label className="field">
          <span>Минуты</span>
          <input
            ref={inputRef}
            type="number"
            min="0"
            max="1440"
            step="1"
            value={minutes}
            onChange={(event) => onChange(Math.min(86_400, positiveInteger(event.target.value) * 60 + seconds))}
          />
        </label>
        <label className="field">
          <span>Секунды</span>
          <input
            type="number"
            min="0"
            max="59"
            step="1"
            value={seconds}
            onChange={(event) => onChange(Math.min(86_400, minutes * 60 + Math.min(59, positiveInteger(event.target.value))))}
          />
        </label>
      </div>
    );
  }

  if (target?.kind === 'distance') {
    const displayValue = distanceUnit === 'km' ? value / 1000 : value;
    return (
      <div className="target-value-grid distance-target-input">
        <label className="field">
          <span>Дистанция</span>
          <input
            ref={inputRef}
            type="number"
            min={distanceUnit === 'km' ? '0.01' : '1'}
            max={distanceUnit === 'km' ? '1000' : '1000000'}
            step={distanceUnit === 'km' ? '0.1' : '100'}
            value={displayValue}
            onChange={(event) => {
              const number = Number(event.target.value);
              onChange(Number.isFinite(number)
                ? Math.max(0, Math.round(number * (distanceUnit === 'km' ? 1000 : 1)))
                : 0);
            }}
          />
        </label>
        <label className="field target-unit-field">
          <span>Единица дистанции</span>
          <select value={distanceUnit} onChange={(event) => setDistanceUnit(event.target.value)}>
            <option value="m">метры</option>
            <option value="km">километры</option>
          </select>
        </label>
      </div>
    );
  }

  return (
    <label className="field target-single-field">
      <span>Повторения</span>
      <input
        ref={inputRef}
        type="number"
        min="1"
        max="999"
        step="1"
        value={value}
        onChange={(event) => onChange(positiveInteger(event.target.value))}
      />
    </label>
  );
}
