import { useState } from 'react';
import { Check } from 'lucide-react';
import { pluralizeRu } from '../../domain/plural.js';

const REP_FORMS = Object.freeze(['повторение', 'повторения', 'повторений']);

function parsePlannedReps(value) {
  const text = String(value ?? '').trim();
  const number = /^\d+$/.test(text) ? Number(text) : null;
  return Number.isInteger(number) && number >= 1 && number <= 999 ? number : null;
}

export function SessionSetFocus({
  workoutId,
  exercise,
  exerciseIndex,
  exerciseCount,
  setIndex,
  headingRef,
  onComplete,
}) {
  const [submitting, setSubmitting] = useState(false);
  const legacyPlanLabel = String(exercise?.legacyTargetText ?? '').trim();
  const targetReps = exercise?.target?.kind === 'reps' && !legacyPlanLabel
    ? Number(exercise.target.value)
    : null;
  const plannedReps = Number.isInteger(targetReps) && targetReps >= 1 && targetReps <= 999
    ? targetReps
    : parsePlannedReps(exercise?.plannedReps);
  const planLabel = legacyPlanLabel || String(exercise?.plannedReps ?? '').trim() || 'По плану';

  const completeSet = () => {
    if (submitting || !onComplete) return;
    setSubmitting(true);
    onComplete({
      workoutId,
      exerciseId: exercise.id,
      setIndex,
    });
  };

  return (
    <section className="session-set-focus" aria-labelledby="session-set-focus-title">
      <div className="session-set-focus-heading">
        <p className="session-kicker">Упражнение {exerciseIndex + 1} из {exerciseCount}</p>
        <h1 id="session-set-focus-title" ref={headingRef} tabIndex="-1">{exercise.name}</h1>
        <p>Подход {setIndex + 1} из {exercise.sets}</p>
      </div>

      <div className={`session-set-instruction ${plannedReps === null ? 'text-plan' : ''}`}>
        <strong>{plannedReps ?? planLabel}</strong>
        <span>{plannedReps === null ? 'выполни по плану' : pluralizeRu(plannedReps, REP_FORMS)}</span>
        <p>Сосредоточься на технике. Выполни подход в своём темпе.</p>
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

      <div className="session-set-action-dock">
        <button
          type="button"
          className="session-primary-action"
          disabled={!onComplete || submitting}
          onClick={completeSet}
        >
          <Check size={21} strokeWidth={2.8} aria-hidden="true" />
          {submitting ? 'Сохраняем…' : 'Подход выполнен'}
        </button>
      </div>
    </section>
  );
}

export default SessionSetFocus;
