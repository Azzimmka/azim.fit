import { CalendarDays, ChevronRight, Clock3, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRuCount } from '../../../domain/plural.js';
import { formatExerciseTarget } from '../../../domain/targets.js';

export function WorkoutPlanBuilder({
  form,
  isTemplateMode,
  onUpdate,
  onDateChange,
  onAddExercise,
  onEditExercise,
  onRemoveExercise,
  advancedContent,
  titleInputRef,
}) {
  return (
    <div className="workout-plan-builder">
      {!isTemplateMode && (
        <div className="plan-schedule-grid">
          <label className="field schedule-field">
            <span><CalendarDays size={15} aria-hidden="true" /> Дата</span>
            <input type="date" required value={form.plannedDate} onChange={(event) => onDateChange(event.target.value)} />
          </label>
          <label className="field schedule-field">
            <span><Clock3 size={15} aria-hidden="true" /> Время</span>
            <input type="time" required value={form.time} onChange={(event) => onUpdate('time', event.target.value)} />
          </label>
        </div>
      )}

      <section className="plan-exercise-section" aria-labelledby="plan-exercises-title">
        <div className="builder-head compact-builder-head">
          <div>
            <strong id="plan-exercises-title">План тренировки</strong>
            <small>{formatRuCount(form.exercises.length, 'exercise')}</small>
          </div>
          <button type="button" className="text-button" onClick={onAddExercise}><Plus size={18} aria-hidden="true" /> Добавить</button>
        </div>

        <div className="plan-exercise-list">
          {form.exercises.map((exercise, index) => (
            <article className="plan-exercise-card" key={exercise.id}>
              <button type="button" className="plan-exercise-main" onClick={() => onEditExercise(exercise.id)} aria-label={`Настроить ${exercise.name}`}>
                <span className="plan-exercise-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="plan-exercise-copy">
                  <strong>{exercise.name}</strong>
                  <small>{formatExerciseTarget(exercise)}</small>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <div className="plan-exercise-actions">
                <button type="button" className="icon-button" onClick={() => onEditExercise(exercise.id)} aria-label={`Изменить ${exercise.name}`}><Pencil size={17} aria-hidden="true" /></button>
                <button type="button" className="icon-button danger" onClick={() => onRemoveExercise(exercise.id)} aria-label={`Удалить ${exercise.name}`}><Trash2 size={17} aria-hidden="true" /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <details className="plan-advanced">
        <summary>Дополнительно</summary>
        <div className="plan-advanced-content">
          <label className="field full">
            <span>Название тренировки</span>
            <input ref={titleInputRef} required maxLength="80" value={form.title} onChange={(event) => onUpdate('title', event.target.value, { manual: true })} placeholder="Сформируется автоматически" />
          </label>
          {advancedContent}
        </div>
      </details>
    </div>
  );
}
