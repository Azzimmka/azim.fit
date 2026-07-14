import { Check, ChevronRight, Edit3, Medal, Timer, TrendingUp, Trophy } from 'lucide-react';
import { formatRuCount } from '../../domain/plural.js';
import { countWorkoutSets, formatSessionClock } from './sessionView.js';

const RECORD_LABELS = {
  weight: 'Максимальный вес',
  volume: 'Объём',
  reps: 'Повторы',
};

function formatRecord(record) {
  if (typeof record === 'string') return record;
  const suffix = record?.metric === 'weight'
    ? ' кг'
    : record?.metric === 'volume'
      ? ' кг·повт.'
      : ' повт.';
  return `${record?.displayName ?? 'Упражнение'} · ${RECORD_LABELS[record?.metric] ?? 'Рекорд'} ${record?.value ?? ''}${suffix}`;
}

export function SessionSummary({
  workout,
  elapsedSeconds,
  volume,
  points,
  personalRecords = [],
  headingRef,
  onEditResults,
  onUpdateNotes,
  onCompleteWorkout,
}) {
  const sets = countWorkoutSets(workout);

  return (
    <section className="session-summary" aria-labelledby="session-summary-title">
      <div className="session-summary-heading">
        <span className="session-summary-medal" aria-hidden="true"><Trophy size={26} /></span>
        <p className="session-kicker">Финишная проверка</p>
        <h1 id="session-summary-title" ref={headingRef} tabIndex="-1">Тренировка собрана</h1>
        <p>Проверь результаты и заверши тренировку, когда всё готово.</p>
      </div>

      <div className="session-summary-metrics">
        <article><Timer aria-hidden="true" /><span>Время</span><strong>{elapsedSeconds === null ? '—' : formatSessionClock(elapsedSeconds)}</strong></article>
        <article><Check aria-hidden="true" /><span>Подходы</span><strong>{sets.completed}/{sets.total}</strong></article>
        <article><TrendingUp aria-hidden="true" /><span>Объём</span><strong>{Math.round(volume).toLocaleString('ru-RU')} кг·повт.</strong></article>
        <article><Medal aria-hidden="true" /><span>Баллы</span><strong>+{points}</strong></article>
      </div>

      {personalRecords.length > 0 && (
        <section className="session-record-preview" aria-label="Новые личные рекорды">
          <div><Trophy size={19} aria-hidden="true" /><span><strong>Новый личный рекорд</strong><small>Будет сохранён после завершения</small></span></div>
          <ul>{personalRecords.map((record, index) => <li key={`${record?.metric ?? 'record'}-${record?.exerciseId ?? index}`}>{formatRecord(record)}</li>)}</ul>
        </section>
      )}

      <section className="session-plan-review" aria-labelledby="session-plan-review-title">
        <div className="session-section-title"><div><p className="session-kicker">Результаты</p><h2 id="session-plan-review-title">Весь план</h2></div><button type="button" className="session-link-button" onClick={onEditResults}><Edit3 size={17} aria-hidden="true" /> Исправить</button></div>
        <div className="session-review-list">
          {(workout.exercises ?? []).map((exercise, index) => {
            const completed = (exercise.setResults ?? []).filter((result) => result.status === 'completed').length;
            const skipped = (exercise.setResults ?? []).filter((result) => result.status === 'skipped').length;
            return (
              <div key={exercise.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{exercise.name}</strong><small>{formatRuCount(completed, 'set')} из {exercise.sets}{skipped ? ` · пропущено ${skipped}` : ''}</small></div>
                <ChevronRight size={18} aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </section>

      <label className="session-notes-field">
        <span>Итоговая заметка</span>
        <textarea
          value={workout.resultNotes ?? ''}
          maxLength="2000"
          placeholder="Самочувствие, техника или план на следующий раз"
          onChange={(event) => onUpdateNotes?.(workout.id, event.target.value)}
        />
      </label>

      <div className="session-summary-actions">
        <button type="button" className="session-secondary-action" onClick={onEditResults}><Edit3 size={18} aria-hidden="true" /> Исправить результаты</button>
        <button type="button" className="session-primary-action" onClick={() => onCompleteWorkout?.(workout)} disabled={!onCompleteWorkout}>
          <Check size={20} strokeWidth={2.6} aria-hidden="true" /> Завершить тренировку
        </button>
      </div>
    </section>
  );
}
