import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';

function buildDrafts(workout) {
  return Object.fromEntries((workout?.exercises ?? []).flatMap((exercise) => (
    exercise.structure === 'continuous'
      ? [
        [`${exercise.id}:distance`, exercise.continuousResult?.distanceMeters ?? ''],
        [`${exercise.id}:duration`, exercise.continuousResult?.activeDurationSeconds ?? ''],
      ]
      : (exercise.setResults ?? []).map((result, setIndex) => [
        `${exercise.id}:${setIndex}`,
        result.actualValue ?? result.reps ?? '',
      ])
  )));
}

function resultField(exercise) {
  return exercise?.target?.kind === 'duration'
    ? { label: 'Время, секунд', maximum: 86_400, patchKey: 'actualValue' }
    : { label: 'Повторы', maximum: 999, patchKey: 'reps' };
}

export function SessionResultsEditor({
  workout,
  headingRef,
  onUpdateSet,
  onUpdateContinuous,
  onDone,
}) {
  const initialDrafts = useMemo(() => buildDrafts(workout), [workout]);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [errors, setErrors] = useState({});
  const inputRefs = useRef({});

  const save = () => {
    const nextErrors = {};
    const changes = [];
    const continuousChanges = [];

    for (const exercise of workout.exercises ?? []) {
      if (exercise.structure === 'continuous') {
        if (exercise.continuousResult?.status !== 'completed') continue;
        const distanceKey = `${exercise.id}:distance`;
        const durationKey = `${exercise.id}:duration`;
        const rawDistance = drafts[distanceKey];
        const rawDuration = drafts[durationKey];
        const distanceMeters = rawDistance === '' ? null : Number(rawDistance);
        const activeDurationSeconds = rawDuration === '' ? null : Number(rawDuration);
        const requiresDistance = exercise.target?.kind === 'distance';
        const primary = requiresDistance ? distanceMeters : activeDurationSeconds;
        const primaryKey = requiresDistance ? distanceKey : durationKey;
        const primaryMaximum = requiresDistance ? 1_000_000 : 86_400;
        if (!Number.isInteger(primary) || primary < 1 || primary > primaryMaximum) {
          nextErrors[primaryKey] = requiresDistance
            ? 'Укажи дистанцию от 1 до 1 000 000 метров'
            : 'Укажи время от 1 секунды до 24 часов';
          continue;
        }
        if (distanceMeters !== null && (!Number.isInteger(distanceMeters) || distanceMeters < 1 || distanceMeters > 1_000_000)) {
          nextErrors[distanceKey] = 'Проверь дистанцию в метрах';
          continue;
        }
        if (activeDurationSeconds !== null && (!Number.isInteger(activeDurationSeconds) || activeDurationSeconds < 1 || activeDurationSeconds > 86_400)) {
          nextErrors[durationKey] = 'Проверь активное время';
          continue;
        }
        if (
          distanceMeters !== exercise.continuousResult.distanceMeters
          || activeDurationSeconds !== exercise.continuousResult.activeDurationSeconds
        ) {
          continuousChanges.push({
            workoutId: workout.id,
            exerciseId: exercise.id,
            distanceMeters,
            activeDurationSeconds,
          });
        }
        continue;
      }
      const field = resultField(exercise);
      for (let setIndex = 0; setIndex < (exercise.setResults ?? []).length; setIndex += 1) {
        const result = exercise.setResults[setIndex];
        if (result.status !== 'completed') continue;
        const key = `${exercise.id}:${setIndex}`;
        const rawValue = drafts[key];
        const value = rawValue === '' ? null : Number(rawValue);
        if (value !== null && (!Number.isInteger(value) || value < 1 || value > field.maximum)) {
          nextErrors[key] = `Укажи целое число от 1 до ${field.maximum.toLocaleString('ru-RU')}`;
          continue;
        }
        const previousValue = result.actualValue ?? result.reps ?? null;
        if (value !== previousValue) {
          changes.push({
            workoutId: workout.id,
            exerciseId: exercise.id,
            setIndex,
            patch: { [field.patchKey]: value },
          });
        }
      }
    }

    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      inputRefs.current[firstError]?.focus();
      return;
    }

    changes.forEach((change) => onUpdateSet?.(change));
    continuousChanges.forEach((change) => onUpdateContinuous?.(change));
    onDone?.();
  };

  return (
    <section className="session-results-editor" aria-labelledby="session-results-title">
      <div className="session-results-editor-heading">
        <button type="button" className="session-back" onClick={onDone} aria-label="Вернуться к итогам">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <p className="session-kicker">Коррекция</p>
          <h1 id="session-results-title" ref={headingRef} tabIndex="-1">Фактические результаты</h1>
          <p>Измени только те подходы, где результат отличался от плана.</p>
        </div>
      </div>

      <div className="session-results-exercises">
        {(workout.exercises ?? []).map((exercise) => (
          <section key={exercise.id}>
            <h2>{exercise.name}</h2>
            {exercise.structure === 'continuous' ? (
              exercise.continuousResult?.status === 'completed' ? (
                <div className="session-results-continuous">
                  {[
                    { key: 'distance', label: 'Дистанция, м', maximum: 1_000_000 },
                    { key: 'duration', label: 'Активное время, сек', maximum: 86_400 },
                  ].map((field) => {
                    const key = `${exercise.id}:${field.key}`;
                    const errorId = `session-result-error-${exercise.id}-${field.key}`;
                    return (
                      <label key={key}>
                        <span>{field.label}</span>
                        <input
                          ref={(node) => { inputRefs.current[key] = node; }}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={field.maximum}
                          step="1"
                          value={drafts[key]}
                          aria-label={`${field.label}: ${exercise.name}`}
                          aria-invalid={Boolean(errors[key])}
                          aria-describedby={errors[key] ? errorId : undefined}
                          onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                        />
                        {errors[key] && <small id={errorId} role="alert">{errors[key]}</small>}
                      </label>
                    );
                  })}
                </div>
              ) : <p className="session-result-skipped">Упражнение пропущено</p>
            ) : <div className="session-results-sets">
              {(exercise.setResults ?? []).map((result, setIndex) => {
                const field = resultField(exercise);
                const key = `${exercise.id}:${setIndex}`;
                const errorId = `session-result-error-${exercise.id}-${setIndex}`;
                return (
                  <label key={key} className={result.status !== 'completed' ? 'disabled' : ''}>
                    <span>Подход {setIndex + 1}</span>
                    {result.status === 'completed' ? (
                      <>
                        <input
                          ref={(node) => { inputRefs.current[key] = node; }}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={field.maximum}
                          step="1"
                          value={drafts[key]}
                          aria-label={`${field.label}: ${exercise.name}, подход ${setIndex + 1}`}
                          aria-invalid={Boolean(errors[key])}
                          aria-describedby={errors[key] ? errorId : undefined}
                          onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                        />
                        {errors[key] && <small id={errorId} role="alert">{errors[key]}</small>}
                      </>
                    ) : <strong>{result.status === 'skipped' ? 'Пропущен' : 'Не выполнен'}</strong>}
                  </label>
                );
              })}
            </div>}
          </section>
        ))}
      </div>

      <div className="session-results-actions">
        <button type="button" className="session-primary-action" onClick={save} disabled={!onUpdateSet && !onUpdateContinuous}>
          <Check size={20} strokeWidth={2.7} aria-hidden="true" /> Сохранить изменения
        </button>
      </div>
    </section>
  );
}

export default SessionResultsEditor;
