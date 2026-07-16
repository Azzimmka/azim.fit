import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { Modal } from '../../components/index.js';
import {
  addCalendarDays,
  addCalendarYears,
  getIsoWeekday,
  getToday,
  isCalendarDate,
} from '../../domain/dates.js';
import { calculatePlanPoints } from '../../domain/points.js';
import { normalizeExercise } from '../../domain/schema.js';
import { createExerciseFromLibraryItem } from '../../domain/exerciseCatalog.js';
import { resolveExerciseDefaults } from '../../domain/exerciseDefaults.js';
import {
  createAutomaticWorkoutTitle,
  normalizeTarget,
} from '../../domain/targets.js';
import {
  ExercisePicker,
  ExerciseTargetEditor,
  WorkoutPlanBuilder,
} from './editor/index.js';
import { getInitialEditorStep, validateExerciseDraft } from './editor/editorView.js';

const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

const SET_RESULT_LABELS = Object.freeze({
  completed: 'Выполнен',
  pending: 'Ожидает',
  skipped: 'Пропущен',
});

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const toFormValue = (value) => value == null ? '' : value;
const optionalNumber = (value) => value === '' || value == null ? null : Number(value);
const defaultSeriesEnd = (date) => addCalendarDays(date, 8 * 7 - 1);
const maxSeriesEnd = (date) => addCalendarDays(addCalendarYears(date, 1), -1);

const newExercise = () => ({
  id: makeId(),
  name: '',
  structure: 'sets',
  target: { kind: 'reps', value: 10, unit: 'count' },
  sets: 3,
  plannedReps: '10',
  restSeconds: 90,
  completedSets: 0,
  actualWeightKg: '',
  actualReps: '',
  rpe: '',
});

function normalizeExerciseForForm(exercise) {
  const normalized = normalizeExercise(exercise, { planningOnly: true });
  return {
    ...newExercise(),
    ...normalized,
    target: normalizeTarget(normalized.target),
    actualWeightKg: toFormValue(exercise?.actualWeightKg),
    actualReps: toFormValue(exercise?.actualReps),
    rpe: toFormValue(exercise?.rpe),
  };
}

function normalizeResultExerciseForForm(exercise, completedAt) {
  const normalized = normalizeExercise(exercise, { completedAt });
  return {
    ...normalized,
    setResults: normalized.setResults.map((setResult) => {
      const completed = setResult.status === 'completed';
      return {
        ...setResult,
        weightKg: completed ? toFormValue(setResult.weightKg) : '',
        reps: completed ? toFormValue(setResult.reps) : '',
        rpe: completed ? toFormValue(setResult.rpe) : '',
      };
    }),
  };
}

function initialWorkoutForm(initialDate, workout, resultMode = false) {
  const source = workout ?? {};
  const exercises = Array.isArray(source.exercises) && source.exercises.length
    ? source.exercises.map((exercise) => resultMode
      ? normalizeResultExerciseForForm(exercise, source.completedAt ?? null)
      : normalizeExerciseForForm(exercise))
    : [];
  return {
    templateName: '',
    title: source.title ?? '',
    type: source.type ?? 'Силовая',
    intensity: source.intensity ?? 'Средняя',
    plannedDate: source.plannedDate ?? initialDate,
    time: source.time ?? '18:00',
    resultNotes: source.resultNotes ?? '',
    exercises,
  };
}

function initialTemplateForm(initialDate, template) {
  const plan = template?.plan ?? {};
  return {
    ...initialWorkoutForm(initialDate, plan),
    templateName: template?.name ?? '',
  };
}

function cleanPlanExercise(exercise) {
  const target = normalizeTarget(exercise.target);
  return {
    id: exercise.id,
    name: exercise.name.trim(),
    structure: exercise.structure === 'continuous' ? 'continuous' : 'sets',
    target,
    sets: exercise.structure === 'continuous' ? 1 : Math.trunc(Number(exercise.sets)),
    restSeconds: exercise.structure === 'continuous'
      ? 0
      : Math.trunc(Number(exercise.restSeconds)),
    catalogExerciseId: exercise.catalogExerciseId ?? null,
    customExerciseId: exercise.customExerciseId ?? null,
    legacyTargetText: exercise.legacyTargetText ?? null,
  };
}

function cleanSetResult(setResult) {
  const completed = setResult.status === 'completed';
  return {
    setNumber: Number(setResult.setNumber),
    status: setResult.status,
    weightKg: completed ? optionalNumber(setResult.weightKg) : null,
    reps: completed ? optionalNumber(setResult.reps) : null,
    actualValue: completed
      ? optionalNumber(setResult.actualValue ?? setResult.reps)
      : null,
    rpe: completed ? optionalNumber(setResult.rpe) : null,
    completedAt: completed ? setResult.completedAt ?? null : null,
  };
}

function cleanResultExercise(exercise) {
  return {
    id: exercise.id,
    setResults: exercise.setResults.map(cleanSetResult),
  };
}

function planPayload(form) {
  return {
    title: form.title.trim(),
    type: form.type,
    time: form.time,
    intensity: form.intensity,
    exercises: form.exercises.map(cleanPlanExercise),
  };
}

function isValidClockTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validatePlan(form, { includeDate, templateMode, repeat, weekdays, intervalWeeks, endsOn }) {
  if (templateMode && !form.templateName.trim()) return 'Дай шаблону название.';
  if (!form.title.trim()) return 'Дай тренировке название.';
  if (includeDate && !isCalendarDate(form.plannedDate)) return 'Укажи корректную дату.';
  if (!isValidClockTime(form.time)) return 'Укажи корректное время.';
  if (!form.exercises.length) return 'Добавь хотя бы одно упражнение.';

  for (const exercise of form.exercises) {
    const exerciseError = validateExerciseDraft(exercise);
    if (exerciseError) return exerciseError;
  }

  if (repeat) {
    if (!weekdays.length) return 'Выбери хотя бы один день серии.';
    if (!Number.isInteger(Number(intervalWeeks)) || Number(intervalWeeks) < 1 || Number(intervalWeeks) > 4) return 'Интервал серии должен быть от 1 до 4 недель.';
    if (!isCalendarDate(endsOn) || endsOn < form.plannedDate || endsOn > maxSeriesEnd(form.plannedDate)) return 'Дата окончания серии должна быть в пределах одного года.';
  }
  return '';
}

function validateResult(form) {
  for (const exercise of form.exercises) {
    for (const setResult of exercise.setResults) {
      if (setResult.status !== 'completed') continue;
      const suffix = `${exercise.name}, подход ${setResult.setNumber}.`;
      const weight = optionalNumber(setResult.weightKg);
      if (weight !== null && (!Number.isFinite(weight) || weight < 0.5 || weight > 1000)) return `Проверь фактический вес: ${suffix}`;
      const reps = optionalNumber(setResult.reps);
      if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 999)) return `Проверь повторы: ${suffix}`;
      const rpe = optionalNumber(setResult.rpe);
      if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return `RPE должен быть от 1 до 10: ${suffix}`;
    }
  }
  return '';
}

export function WorkoutEditor(props) {
  if (!props.open) return null;
  const identity = `${props.mode ?? 'create'}:${props.workout?.id ?? props.template?.id ?? props.initialDate ?? 'new'}`;
  return <WorkoutEditorContent key={identity} {...props} />;
}

function WorkoutEditorContent({
  mode = 'create',
  initialDate,
  workout,
  template,
  appState = {},
  onCustomExerciseCreate,
  onClose,
  onSubmit,
}) {
  const resolvedDate = isCalendarDate(initialDate) ? initialDate : getToday();
  const isResultMode = mode === 'result';
  const isRescheduleMode = mode === 'reschedule';
  const isTemplateMode = mode === 'template';
  const [form, setForm] = useState(() => isTemplateMode
    ? initialTemplateForm(resolvedDate, template)
    : initialWorkoutForm(resolvedDate, workout, isResultMode));
  const hasInitialPlan = Boolean((isTemplateMode ? template?.plan : workout)?.exercises?.length);
  const [step, setStep] = useState(() => (
    isResultMode || isRescheduleMode
      ? 'focused'
      : getInitialEditorStep(mode, hasInitialPlan)
  ));
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [editingExerciseId, setEditingExerciseId] = useState(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [titleWasEdited, setTitleWasEdited] = useState(() => Boolean(
    (isTemplateMode ? template?.plan?.title : workout?.title)?.trim(),
  ));
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState(() => [getIsoWeekday(workout?.plannedDate ?? resolvedDate)]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endsOn, setEndsOn] = useState(() => defaultSeriesEnd(workout?.plannedDate ?? resolvedDate));
  const [error, setError] = useState('');
  const firstFieldRef = useRef(null);

  const pointsPreview = useMemo(
    () => calculatePlanPoints(form.exercises.filter((item) => item.name.trim())),
    [form.exercises],
  );

  const update = (field, value, options = {}) => {
    setError('');
    if (field === 'title' && options.manual) setTitleWasEdited(true);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updateSetResult = (exerciseId, setNumber, field, value) => {
    setError('');
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === exerciseId
        ? {
          ...exercise,
          setResults: exercise.setResults.map((setResult) => (
            setResult.setNumber === setNumber
              ? {
                ...setResult,
                [field]: value,
                ...(field === 'reps' ? { actualValue: value } : {}),
              }
              : setResult
          )),
        }
        : exercise),
    }));
  };
  const updatePlannedDate = (date) => {
    update('plannedDate', date);
    if (!repeat && isCalendarDate(date)) setWeekdays([getIsoWeekday(date)]);
    if (isCalendarDate(date)) setEndsOn(defaultSeriesEnd(date));
  };

  const beginExerciseSelection = () => {
    setEditingExerciseId(null);
    setCreatingCustom(false);
    setSelectedExercise(null);
    setStep('picker');
  };
  const selectLibraryExercise = (item) => {
    const defaults = resolveExerciseDefaults(item, appState);
    const exercise = createExerciseFromLibraryItem({ ...item, ...defaults });
    setSelectedExercise({ ...exercise, ...defaults, id: exercise.id });
    setCreatingCustom(false);
    setStep('target');
  };
  const beginCustomExercise = () => {
    const customId = `custom-${makeId()}`;
    setEditingExerciseId(null);
    setCreatingCustom(true);
    setSelectedExercise({
      ...newExercise(),
      catalogExerciseId: null,
      customExerciseId: customId,
      pendingCustomId: customId,
    });
    setStep('target');
  };
  const editExercise = (exerciseId) => {
    const exercise = form.exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    setEditingExerciseId(exerciseId);
    setCreatingCustom(false);
    setSelectedExercise({ ...exercise, target: { ...exercise.target } });
    setStep('target');
  };
  const confirmExercise = (exercise) => {
    const cleaned = {
      ...exercise,
      catalogExerciseId: exercise.catalogExerciseId ?? null,
      customExerciseId: exercise.customExerciseId ?? null,
      legacyTargetText: null,
    };
    delete cleaned.pendingCustomId;
    if (creatingCustom) {
      onCustomExerciseCreate?.({
        id: exercise.pendingCustomId ?? exercise.customExerciseId,
        name: exercise.name,
        aliases: [],
        category: exercise.structure === 'continuous' ? 'cardio' : 'custom',
        structure: exercise.structure,
        target: exercise.target,
        sets: exercise.sets,
        restSeconds: exercise.restSeconds,
      });
    }
    setForm((current) => {
      const exercises = editingExerciseId
        ? current.exercises.map((item) => item.id === editingExerciseId
          ? { ...cleaned, id: editingExerciseId }
          : item)
        : [...current.exercises, cleaned];
      return {
        ...current,
        exercises,
        title: titleWasEdited ? current.title : createAutomaticWorkoutTitle(exercises),
      };
    });
    setEditingExerciseId(null);
    setCreatingCustom(false);
    setSelectedExercise(null);
    setStep('builder');
  };
  const removeExercise = (exerciseId) => {
    setForm((current) => {
      const exercises = current.exercises.filter((item) => item.id !== exerciseId);
      return {
        ...current,
        exercises,
        title: titleWasEdited ? current.title : createAutomaticWorkoutTitle(exercises),
      };
    });
  };

  const validate = () => {
    if (isResultMode) return validateResult(form);
    if (isRescheduleMode) {
      if (!isCalendarDate(form.plannedDate)) return 'Укажи корректную дату.';
      if (!isValidClockTime(form.time)) return 'Укажи корректное время.';
      return '';
    }
    return validatePlan(form, {
      includeDate: !isTemplateMode,
      templateMode: isTemplateMode,
      repeat,
      weekdays,
      intervalWeeks,
      endsOn,
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (step === 'picker' || step === 'target') return;
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    if (isResultMode) {
      onSubmit({
        resultNotes: form.resultNotes.trim(),
        exercises: form.exercises.map(cleanResultExercise),
      }, null);
      return;
    }
    if (isRescheduleMode) {
      onSubmit({ plannedDate: form.plannedDate, time: form.time }, null);
      return;
    }

    const plan = planPayload(form);
    if (isTemplateMode) {
      onSubmit({ name: form.templateName.trim(), plan }, null);
      return;
    }

    onSubmit(
      { ...plan, plannedDate: form.plannedDate },
      repeat ? {
        weekdays: [...weekdays].sort((left, right) => left - right),
        intervalWeeks: Number(intervalWeeks),
        startsOn: form.plannedDate,
        endsOn,
      } : null,
    );
  };

  const baseModalTitle = isTemplateMode
    ? (template ? 'Редактировать шаблон' : 'Новый шаблон')
    : mode === 'create'
      ? 'Новая тренировка'
      : mode === 'duplicate'
        ? 'Дублировать тренировку'
        : isRescheduleMode
          ? 'Перенести тренировку'
          : isResultMode
            ? 'Исправить результат'
            : 'Редактировать тренировку';
  const modalTitle = step === 'picker'
    ? (form.exercises.length ? 'Добавить упражнение' : 'Выбери упражнение')
    : step === 'target'
      ? (creatingCustom ? 'Своё упражнение' : selectedExercise?.name ?? 'Настрой упражнение')
      : baseModalTitle;
  const submitLabel = isTemplateMode
    ? 'Сохранить шаблон'
    : mode === 'create'
      ? 'Запланировать'
      : mode === 'duplicate'
        ? 'Создать копию'
        : isRescheduleMode
          ? 'Перенести'
          : 'Сохранить';
  const firstCompletedSetKey = useMemo(() => {
    for (const exercise of form.exercises) {
      const setResult = exercise.setResults?.find((item) => item.status === 'completed');
      if (setResult) return `${exercise.id}:${setResult.setNumber}`;
    }
    return '';
  }, [form.exercises]);
  const footer = step === 'picker' || step === 'target' ? null : (
    <>
      {!isResultMode && !isRescheduleMode && !isTemplateMode && <div className="points-preview">Можно получить <strong>+{pointsPreview}</strong></div>}
      <button type="submit" form="workout-editor-form" className="primary-button">
        {mode === 'create' || mode === 'duplicate' ? <CalendarDays size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
        {submitLabel}
      </button>
    </>
  );
  const advancedContent = (
    <>
      {isTemplateMode && (
        <label className="field full">
          <span>Название шаблона</span>
          <input ref={firstFieldRef} required maxLength="80" value={form.templateName} onChange={(event) => update('templateName', event.target.value)} placeholder="Например, День ног" />
        </label>
      )}
      <div className="form-grid">
        <label className="field"><span>Тип</span><select value={form.type} onChange={(event) => update('type', event.target.value)}><option>Силовая</option><option>Кардио</option><option>Мобильность</option><option>Другое</option></select></label>
        <label className="field"><span>Интенсивность</span><select value={form.intensity} onChange={(event) => update('intensity', event.target.value)}><option>Лёгкая</option><option>Средняя</option><option>Высокая</option></select></label>
        {isTemplateMode && <label className="field"><span>Время</span><input type="time" required value={form.time} onChange={(event) => update('time', event.target.value)} /></label>}
      </div>
      {mode === 'create' && (
        <section className="recurrence-box">
          <label className="toggle-row"><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /><span><strong>Повторять тренировку</strong><small>Создать конечную серию по дням недели</small></span></label>
          {repeat && (
            <div className="recurrence-controls">
              <div className="weekday-picker" role="group" aria-label="Дни повторения">{WEEKDAYS.map((day) => <button type="button" key={day.value} className={weekdays.includes(day.value) ? 'active' : ''} aria-pressed={weekdays.includes(day.value)} onClick={() => setWeekdays((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])}>{day.label}</button>)}</div>
              <label className="field"><span>Каждые</span><select value={intervalWeeks} onChange={(event) => setIntervalWeeks(Number(event.target.value))}><option value="1">1 неделю</option><option value="2">2 недели</option><option value="3">3 недели</option><option value="4">4 недели</option></select></label>
              <label className="field"><span>До даты включительно</span><input type="date" value={endsOn} min={form.plannedDate} max={maxSeriesEnd(form.plannedDate)} onChange={(event) => setEndsOn(event.target.value)} /></label>
            </div>
          )}
        </section>
      )}
    </>
  );

  return (
    <Modal
      open
      title={modalTitle}
      eyebrow={isResultMode ? 'Фактические данные' : isTemplateMode ? 'Повторно используемый план' : 'План тренировки'}
      description={step === 'picker'
        ? 'Выбери готовое упражнение — подходы и цель подставятся автоматически.'
        : step === 'target' ? 'Оставь рекомендуемые значения или настрой под себя.' : undefined}
      onClose={onClose}
      initialFocusRef={firstFieldRef}
      footer={footer}
      className={step === 'picker' || step === 'target' ? 'guided-editor-modal' : 'workout-editor-modal'}
    >
      <form id="workout-editor-form" onSubmit={submit} noValidate>
        {step === 'picker' ? (
          <ExercisePicker
            appState={appState}
            inputRef={firstFieldRef}
            onSelect={selectLibraryExercise}
            onCreateCustom={beginCustomExercise}
          />
        ) : step === 'target' && selectedExercise ? (
          <ExerciseTargetEditor
            key={`${selectedExercise.id}:${creatingCustom ? 'custom' : 'existing'}`}
            exercise={selectedExercise}
            allowName={creatingCustom}
            submitLabel={editingExerciseId ? 'Сохранить изменения' : 'Добавить в план'}
            onBack={() => setStep(form.exercises.length ? 'builder' : 'picker')}
            onConfirm={confirmExercise}
          />
        ) : isResultMode ? (
          <>
            <div className="result-editor-list">
              {form.exercises.map((exercise) => (
                <section key={exercise.id} aria-labelledby={`result-exercise-${exercise.id}`}>
                  <h3 id={`result-exercise-${exercise.id}`}>{exercise.name}</h3>
                  {exercise.setResults.map((setResult) => {
                    const completed = setResult.status === 'completed';
                    const setKey = `${exercise.id}:${setResult.setNumber}`;
                    const accessibleSuffix = `, ${exercise.name}, подход ${setResult.setNumber}`;
                    return (
                      <fieldset className="result-editor-row" key={setKey}>
                        <legend>Подход {setResult.setNumber} · {SET_RESULT_LABELS[setResult.status]}</legend>
                        <label className="field result-status-field">
                          <span>Статус<span className="visually-hidden">{accessibleSuffix}</span></span>
                          <select
                            value={setResult.status}
                            onChange={(event) => updateSetResult(exercise.id, setResult.setNumber, 'status', event.target.value)}
                          >
                            <option value="completed">Выполнен</option>
                            <option value="skipped">Пропущен</option>
                            <option value="pending">Не выполнен</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Вес, кг<span className="visually-hidden">{accessibleSuffix}</span></span>
                          <input ref={setKey === firstCompletedSetKey ? firstFieldRef : undefined} type="number" min="0.5" max="1000" step="0.5" disabled={!completed} value={setResult.weightKg} onChange={(event) => updateSetResult(exercise.id, setResult.setNumber, 'weightKg', event.target.value)} />
                        </label>
                        <label className="field">
                          <span>Повторы<span className="visually-hidden">{accessibleSuffix}</span></span>
                          <input type="number" min="1" max="999" step="1" disabled={!completed} value={setResult.reps} onChange={(event) => updateSetResult(exercise.id, setResult.setNumber, 'reps', event.target.value)} />
                        </label>
                        <label className="field">
                          <span>RPE<span className="visually-hidden">{accessibleSuffix}</span></span>
                          <input type="number" min="1" max="10" step="0.5" disabled={!completed} value={setResult.rpe} onChange={(event) => updateSetResult(exercise.id, setResult.setNumber, 'rpe', event.target.value)} />
                        </label>
                      </fieldset>
                    );
                  })}
                </section>
              ))}
            </div>
            <label className="field full"><span>Итоговая заметка</span><textarea ref={!firstCompletedSetKey ? firstFieldRef : undefined} value={form.resultNotes} onChange={(event) => update('resultNotes', event.target.value)} maxLength="2000" /></label>
          </>
        ) : isRescheduleMode ? (
          <div className="form-grid">
            <label className="field"><span>Новая дата</span><input ref={firstFieldRef} type="date" required value={form.plannedDate} onChange={(event) => updatePlannedDate(event.target.value)} /></label>
            <label className="field"><span>Новое время</span><input type="time" required value={form.time} onChange={(event) => update('time', event.target.value)} /></label>
          </div>
        ) : (
          <WorkoutPlanBuilder
            form={form}
            isTemplateMode={isTemplateMode}
            onUpdate={update}
            onDateChange={updatePlannedDate}
            onAddExercise={beginExerciseSelection}
            onEditExercise={editExercise}
            onRemoveExercise={removeExercise}
            advancedContent={advancedContent}
            titleInputRef={isTemplateMode ? undefined : firstFieldRef}
          />
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
