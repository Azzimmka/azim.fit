import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';

function buildDrafts(workout) {
  return Object.fromEntries((workout?.exercises ?? []).flatMap((exercise) => (
    (exercise.setResults ?? []).map((result, setIndex) => [
      `${exercise.id}:${setIndex}`,
      result.reps ?? '',
    ])
  )));
}

export function SessionResultsEditor({
  workout,
  headingRef,
  onUpdateSet,
  onDone,
}) {
  const initialDrafts = useMemo(() => buildDrafts(workout), [workout]);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [errors, setErrors] = useState({});
  const inputRefs = useRef({});

  const save = () => {
    const nextErrors = {};
    const changes = [];

    for (const exercise of workout.exercises ?? []) {
      for (let setIndex = 0; setIndex < (exercise.setResults ?? []).length; setIndex += 1) {
        const result = exercise.setResults[setIndex];
        if (result.status !== 'completed') continue;
        const key = `${exercise.id}:${setIndex}`;
        const rawValue = drafts[key];
        const reps = rawValue === '' ? null : Number(rawValue);
        if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 999)) {
          nextErrors[key] = 'Укажи целое число от 1 до 999';
          continue;
        }
        if (reps !== result.reps) {
          changes.push({ workoutId: workout.id, exerciseId: exercise.id, setIndex, patch: { reps } });
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
          <h1 id="session-results-title" ref={headingRef} tabIndex="-1">Фактические повторения</h1>
          <p>Измени только те подходы, где результат отличался от плана.</p>
        </div>
      </div>

      <div className="session-results-exercises">
        {(workout.exercises ?? []).map((exercise) => (
          <section key={exercise.id}>
            <h2>{exercise.name}</h2>
            <div className="session-results-sets">
              {(exercise.setResults ?? []).map((result, setIndex) => {
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
                          max="999"
                          step="1"
                          value={drafts[key]}
                          aria-label={`Повторы: ${exercise.name}, подход ${setIndex + 1}`}
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
            </div>
          </section>
        ))}
      </div>

      <div className="session-results-actions">
        <button type="button" className="session-primary-action" onClick={save} disabled={!onUpdateSet}>
          <Check size={20} strokeWidth={2.7} aria-hidden="true" /> Сохранить изменения
        </button>
      </div>
    </section>
  );
}

export default SessionResultsEditor;
