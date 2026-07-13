import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Plus, Save, Trash2 } from 'lucide-react';
import { Modal } from '../../components/index.js';
import {
  addCalendarDays,
  addCalendarYears,
  getIsoWeekday,
  getToday,
  isCalendarDate,
} from '../../domain/dates.js';
import { DEFAULT_REMINDER, REMINDER_OFFSETS } from '../../domain/model.js';
import { calculatePlanPoints } from '../../domain/points.js';

const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

const REMINDER_OPTIONS = [
  { value: 'off', label: 'Выключено' },
  { value: '0', label: 'Вовремя' },
  { value: '5', label: 'За 5 минут' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 минут' },
  { value: '60', label: 'За 60 минут' },
];

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const toFormValue = (value) => value == null ? '' : value;
const optionalNumber = (value) => value === '' || value == null ? null : Number(value);
const defaultSeriesEnd = (date) => addCalendarDays(date, 8 * 7 - 1);
const maxSeriesEnd = (date) => addCalendarDays(addCalendarYears(date, 1), -1);

const newExercise = () => ({
  id: makeId(),
  name: '',
  sets: 3,
  plannedReps: '10',
  plannedWeightKg: '',
  restSeconds: 90,
  completedSets: 0,
  actualWeightKg: '',
  actualReps: '',
  rpe: '',
});

function normalizeReminderValue(value, fallback) {
  if (value === null) return null;
  const number = Number(value);
  return REMINDER_OFFSETS.includes(number) ? number : fallback;
}

function normalizeExerciseForForm(exercise) {
  return {
    ...newExercise(),
    ...exercise,
    plannedWeightKg: toFormValue(exercise?.plannedWeightKg),
    actualWeightKg: toFormValue(exercise?.actualWeightKg),
    actualReps: toFormValue(exercise?.actualReps),
    rpe: toFormValue(exercise?.rpe),
  };
}

function initialWorkoutForm(initialDate, workout, defaultReminder) {
  const source = workout ?? {};
  const exercises = Array.isArray(source.exercises) && source.exercises.length
    ? source.exercises.map(normalizeExerciseForForm)
    : [newExercise()];
  return {
    templateName: '',
    title: source.title ?? '',
    type: source.type ?? 'Силовая',
    intensity: source.intensity ?? 'Средняя',
    plannedDate: source.plannedDate ?? initialDate,
    time: source.time ?? '18:00',
    durationMinutes: source.durationMinutes ?? 45,
    planNotes: source.planNotes ?? '',
    resultNotes: source.resultNotes ?? '',
    reminder: normalizeReminderValue(source.reminder, defaultReminder),
    exercises,
  };
}

function initialTemplateForm(initialDate, template, defaultReminder) {
  const plan = template?.plan ?? {};
  return {
    ...initialWorkoutForm(initialDate, plan, defaultReminder),
    templateName: template?.name ?? '',
  };
}

function cleanPlanExercise(exercise) {
  return {
    id: exercise.id,
    name: exercise.name.trim(),
    sets: Math.trunc(Number(exercise.sets)),
    plannedReps: String(exercise.plannedReps).trim(),
    plannedWeightKg: optionalNumber(exercise.plannedWeightKg),
    restSeconds: Math.trunc(Number(exercise.restSeconds)),
  };
}

function cleanResultExercise(exercise) {
  return {
    id: exercise.id,
    completedSets: Math.trunc(Number(exercise.completedSets)),
    actualWeightKg: optionalNumber(exercise.actualWeightKg),
    actualReps: optionalNumber(exercise.actualReps),
    rpe: optionalNumber(exercise.rpe),
  };
}

function planPayload(form) {
  return {
    title: form.title.trim(),
    type: form.type,
    time: form.time,
    durationMinutes: Math.trunc(Number(form.durationMinutes)),
    intensity: form.intensity,
    planNotes: form.planNotes.trim(),
    reminder: form.reminder,
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
  const duration = Number(form.durationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 300) return 'Продолжительность должна быть от 5 до 300 минут.';
  if (!form.exercises.length) return 'Добавь хотя бы одно упражнение.';

  for (const exercise of form.exercises) {
    if (!exercise.name.trim()) return 'У каждого упражнения должно быть название.';
    const sets = Number(exercise.sets);
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) return 'Количество подходов должно быть от 1 до 20.';
    if (!String(exercise.plannedReps).trim()) return 'Укажи плановые повторы для каждого упражнения.';
    const weight = optionalNumber(exercise.plannedWeightKg);
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 1000)) return 'Плановый вес должен быть от 0,5 до 1000 кг.';
    const rest = Number(exercise.restSeconds);
    if (!Number.isInteger(rest) || (rest !== 0 && (rest < 15 || rest > 900))) return 'Отдых должен быть 0 или от 15 до 900 секунд.';
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
    const completedSets = Number(exercise.completedSets);
    if (!Number.isInteger(completedSets) || completedSets < 0 || completedSets > Number(exercise.sets)) return `Проверь выполненные подходы: ${exercise.name}.`;
    const weight = optionalNumber(exercise.actualWeightKg);
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 1000)) return `Проверь фактический вес: ${exercise.name}.`;
    const reps = optionalNumber(exercise.actualReps);
    if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 999)) return `Проверь повторы: ${exercise.name}.`;
    const rpe = optionalNumber(exercise.rpe);
    if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return `RPE должен быть от 1 до 10: ${exercise.name}.`;
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
  defaultReminder = DEFAULT_REMINDER,
  onClose,
  onSubmit,
}) {
  const resolvedDate = isCalendarDate(initialDate) ? initialDate : getToday();
  const isResultMode = mode === 'result';
  const isRescheduleMode = mode === 'reschedule';
  const isTemplateMode = mode === 'template';
  const [form, setForm] = useState(() => isTemplateMode
    ? initialTemplateForm(resolvedDate, template, defaultReminder)
    : initialWorkoutForm(resolvedDate, workout, defaultReminder));
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

  const update = (field, value) => {
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updateExercise = (id, field, value) => {
    setError('');
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((item) => item.id === id ? { ...item, [field]: value } : item),
    }));
  };
  const updatePlannedDate = (date) => {
    update('plannedDate', date);
    if (!repeat && isCalendarDate(date)) setWeekdays([getIsoWeekday(date)]);
    if (isCalendarDate(date)) setEndsOn(defaultSeriesEnd(date));
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

  const modalTitle = isTemplateMode
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
  const submitLabel = isTemplateMode
    ? 'Сохранить шаблон'
    : mode === 'create'
      ? 'Запланировать'
      : mode === 'duplicate'
        ? 'Создать копию'
        : isRescheduleMode
          ? 'Перенести'
          : 'Сохранить';
  const footer = (
    <>
      {!isResultMode && !isRescheduleMode && !isTemplateMode && <div className="points-preview">Можно получить <strong>+{pointsPreview}</strong></div>}
      <button type="submit" form="workout-editor-form" className="primary-button">
        {mode === 'create' || mode === 'duplicate' ? <CalendarDays size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
        {submitLabel}
      </button>
    </>
  );

  return (
    <Modal
      open
      title={modalTitle}
      eyebrow={isResultMode ? 'Фактические данные' : isTemplateMode ? 'Повторно используемый план' : 'План тренировки'}
      onClose={onClose}
      initialFocusRef={firstFieldRef}
      footer={footer}
    >
      <form id="workout-editor-form" onSubmit={submit} noValidate>
        {isResultMode ? (
          <>
            <div className="result-editor-list">
              {form.exercises.map((exercise, index) => (
                <fieldset className="result-editor-row" key={exercise.id}>
                  <legend>{exercise.name}</legend>
                  <label className="field"><span>Выполнено подходов</span><input ref={index === 0 ? firstFieldRef : undefined} type="number" min="0" max={exercise.sets} step="1" value={exercise.completedSets} onChange={(event) => updateExercise(exercise.id, 'completedSets', event.target.value)} /></label>
                  <label className="field"><span>Вес, кг</span><input type="number" min="0.5" max="1000" step="0.5" value={exercise.actualWeightKg} onChange={(event) => updateExercise(exercise.id, 'actualWeightKg', event.target.value)} /></label>
                  <label className="field"><span>Повторы</span><input type="number" min="1" max="999" step="1" value={exercise.actualReps} onChange={(event) => updateExercise(exercise.id, 'actualReps', event.target.value)} /></label>
                  <label className="field"><span>RPE</span><input type="number" min="1" max="10" step="0.5" value={exercise.rpe} onChange={(event) => updateExercise(exercise.id, 'rpe', event.target.value)} /></label>
                </fieldset>
              ))}
            </div>
            <label className="field full"><span>Итоговая заметка</span><textarea value={form.resultNotes} onChange={(event) => update('resultNotes', event.target.value)} maxLength="2000" /></label>
          </>
        ) : isRescheduleMode ? (
          <div className="form-grid">
            <label className="field"><span>Новая дата</span><input ref={firstFieldRef} type="date" required value={form.plannedDate} onChange={(event) => updatePlannedDate(event.target.value)} /></label>
            <label className="field"><span>Новое время</span><input type="time" required value={form.time} onChange={(event) => update('time', event.target.value)} /></label>
          </div>
        ) : (
          <>
            {isTemplateMode && <label className="field full"><span>Название шаблона</span><input ref={firstFieldRef} required maxLength="80" value={form.templateName} onChange={(event) => update('templateName', event.target.value)} placeholder="Например, День ног" /></label>}
            <label className="field full"><span>Название тренировки</span><input ref={isTemplateMode ? undefined : firstFieldRef} required maxLength="80" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Например, грудь и плечи" /></label>
            <div className="form-grid">
              <label className="field"><span>Тип</span><select value={form.type} onChange={(event) => update('type', event.target.value)}><option>Силовая</option><option>Кардио</option><option>Мобильность</option><option>Другое</option></select></label>
              <label className="field"><span>Интенсивность</span><select value={form.intensity} onChange={(event) => update('intensity', event.target.value)}><option>Лёгкая</option><option>Средняя</option><option>Высокая</option></select></label>
              {!isTemplateMode && <label className="field"><span>Дата</span><input type="date" required value={form.plannedDate} onChange={(event) => updatePlannedDate(event.target.value)} /></label>}
              <label className="field"><span>Время</span><input type="time" required value={form.time} onChange={(event) => update('time', event.target.value)} /></label>
              <label className="field"><span>Продолжительность, минут</span><input type="number" min="5" max="300" step="1" value={form.durationMinutes} onChange={(event) => update('durationMinutes', event.target.value)} /></label>
              <label className="field"><span>Напоминание</span><select value={form.reminder ?? 'off'} onChange={(event) => update('reminder', event.target.value === 'off' ? null : Number(event.target.value))}>{REMINDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            <label className="field full"><span>Заметка к плану</span><textarea value={form.planNotes} onChange={(event) => update('planNotes', event.target.value)} maxLength="2000" placeholder="Цель, техника или важное напоминание" /></label>

            <section className="exercise-builder" aria-labelledby="exercise-builder-title">
              <div className="builder-head">
                <div><strong id="exercise-builder-title">Упражнения</strong><small>Вес можно оставить пустым, отдых — 0 или 15–900 секунд</small></div>
                <button type="button" className="text-button" onClick={() => update('exercises', [...form.exercises, newExercise()])}><Plus size={17} aria-hidden="true" /> Добавить</button>
              </div>
              {form.exercises.map((exercise, index) => (
                <fieldset className="builder-row-v2" key={exercise.id}>
                  <legend>{index + 1}. {exercise.name || 'Новое упражнение'}</legend>
                  <label className="field exercise-name-field"><span>Упражнение</span><input value={exercise.name} maxLength="120" onChange={(event) => updateExercise(exercise.id, 'name', event.target.value)} placeholder="Отжимания" /></label>
                  <label className="field"><span>Подходы</span><input type="number" min="1" max="20" step="1" value={exercise.sets} onChange={(event) => updateExercise(exercise.id, 'sets', event.target.value)} /></label>
                  <label className="field"><span>Повторы</span><input value={exercise.plannedReps} maxLength="40" onChange={(event) => updateExercise(exercise.id, 'plannedReps', event.target.value)} placeholder="10–12" /></label>
                  <label className="field"><span>Вес, кг</span><input type="number" min="0.5" max="1000" step="0.5" value={exercise.plannedWeightKg} onChange={(event) => updateExercise(exercise.id, 'plannedWeightKg', event.target.value)} /></label>
                  <label className="field"><span>Отдых, сек</span><input type="number" min="0" max="900" step="15" value={exercise.restSeconds} onChange={(event) => updateExercise(exercise.id, 'restSeconds', event.target.value)} /></label>
                  <button type="button" className="icon-button danger" disabled={form.exercises.length === 1} onClick={() => update('exercises', form.exercises.filter((item) => item.id !== exercise.id))} aria-label={`Удалить упражнение ${exercise.name || index + 1}`}><Trash2 size={17} aria-hidden="true" /></button>
                </fieldset>
              ))}
            </section>

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
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
