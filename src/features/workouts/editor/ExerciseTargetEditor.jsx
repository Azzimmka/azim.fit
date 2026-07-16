import { useRef, useState } from 'react';
import { ArrowLeft, Check, TimerReset } from 'lucide-react';
import { normalizeTarget } from '../../../domain/targets.js';
import { TargetValueInput } from './TargetValueInput.jsx';
import { validateExerciseDraft } from './editorView.js';

function targetFor(kind) {
  if (kind === 'duration') return { kind, value: 60, unit: 'seconds' };
  if (kind === 'distance') return { kind, value: 3000, unit: 'meters' };
  return { kind: 'reps', value: 10, unit: 'count' };
}

export function ExerciseTargetEditor({
  exercise,
  onBack,
  onConfirm,
  submitLabel = 'Добавить в план',
  allowName = false,
}) {
  const [draft, setDraft] = useState(() => ({
    ...exercise,
    target: normalizeTarget(exercise.target),
  }));
  const [error, setError] = useState('');
  const firstInputRef = useRef(null);

  const update = (patch) => {
    setError('');
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setStructure = (structure) => {
    const targetKind = draft.target.kind;
    const nextKind = structure === 'sets'
      ? (targetKind === 'distance' ? 'reps' : targetKind)
      : (targetKind === 'reps' ? 'distance' : targetKind);
    update({
      structure,
      target: nextKind === targetKind ? draft.target : targetFor(nextKind),
      sets: structure === 'sets' ? Math.max(1, Number(draft.sets) || 3) : 1,
      restSeconds: structure === 'sets' ? (Number(draft.restSeconds) || 90) : 0,
    });
  };
  const setTargetKind = (kind) => update({ target: targetFor(kind) });
  const confirm = () => {
    const nextError = validateExerciseDraft(draft);
    if (nextError) {
      setError(nextError);
      return;
    }
    onConfirm({
      ...draft,
      name: String(draft.name).trim(),
      target: normalizeTarget(draft.target),
      sets: draft.structure === 'continuous' ? 1 : Number(draft.sets),
      restSeconds: draft.structure === 'continuous' ? 0 : Number(draft.restSeconds),
    });
  };

  return (
    <div className="exercise-target-editor">
      {allowName && (
        <label className="field full">
          <span>Название упражнения</span>
          <input ref={firstInputRef} value={draft.name} maxLength="120" onChange={(event) => update({ name: event.target.value })} placeholder="Например, подъём по лестнице" />
        </label>
      )}

      <fieldset className="segmented-field">
        <legend>Как выполнять?</legend>
        <div className="segmented-control">
          <button type="button" className={draft.structure === 'sets' ? 'active' : ''} aria-pressed={draft.structure === 'sets'} onClick={() => setStructure('sets')}>Подходами</button>
          <button type="button" className={draft.structure === 'continuous' ? 'active' : ''} aria-pressed={draft.structure === 'continuous'} onClick={() => setStructure('continuous')}>Непрерывно</button>
        </div>
      </fieldset>

      <fieldset className="segmented-field">
        <legend>Что измеряем?</legend>
        <div className="segmented-control target-kind-control">
          {draft.structure === 'sets' && <button type="button" className={draft.target.kind === 'reps' ? 'active' : ''} aria-pressed={draft.target.kind === 'reps'} onClick={() => setTargetKind('reps')}>Повторы</button>}
          <button type="button" className={draft.target.kind === 'duration' ? 'active' : ''} aria-pressed={draft.target.kind === 'duration'} onClick={() => setTargetKind('duration')}>Время</button>
          {draft.structure === 'continuous' && <button type="button" className={draft.target.kind === 'distance' ? 'active' : ''} aria-pressed={draft.target.kind === 'distance'} onClick={() => setTargetKind('distance')}>Дистанция</button>}
        </div>
      </fieldset>

      <div className={`target-editor-fields ${draft.structure}`}>
        {draft.structure === 'sets' && (
          <label className="field">
            <span>Подходы</span>
            <input ref={allowName ? undefined : firstInputRef} type="number" min="1" max="20" step="1" value={draft.sets} onChange={(event) => update({ sets: event.target.value })} />
          </label>
        )}
        <TargetValueInput
          key={draft.target.kind}
          target={draft.target}
          inputRef={draft.structure === 'continuous' && !allowName ? firstInputRef : undefined}
          onChange={(value) => update({ target: { ...draft.target, value } })}
        />
        {draft.structure === 'sets' && (
          <label className="field">
            <span>Отдых, секунд</span>
            <input type="number" min="0" max="900" step="15" value={draft.restSeconds} onChange={(event) => update({ restSeconds: event.target.value })} />
          </label>
        )}
      </div>

      <div className="target-editor-hint">
        <TimerReset size={17} aria-hidden="true" />
        <span>{draft.target.kind === 'duration' && draft.structure === 'sets'
          ? 'Таймер автоматически завершит каждый подход.'
          : draft.structure === 'continuous'
            ? 'Во время тренировки увидишь текущий прогресс.'
            : 'Плановые значения можно исправить позже.'}</span>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="editor-step-actions">
        <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /> Назад</button>
        <button type="button" className="primary-button" onClick={confirm}><Check size={18} aria-hidden="true" /> {submitLabel}</button>
      </div>
    </div>
  );
}
