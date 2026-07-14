import { useState } from 'react';
import {
  Activity,
  Check,
  Clock3,
  Copy,
  Dumbbell,
  Edit3,
  FilePlus2,
  MoreHorizontal,
  MoveRight,
  Play,
  Sparkles,
  Star,
  Target,
  Trash2,
} from 'lucide-react';
import { formatRuCount } from '../../domain/plural.js';
import { getWorkoutPoints } from '../../domain/points.js';

const TYPE_ICONS = { Силовая: Dumbbell, Кардио: Activity, Мобильность: Sparkles, Другое: Target };

function getExerciseSetResults(exercise) {
  const sets = Math.max(0, Number(exercise.sets) || 0);
  if (Array.isArray(exercise.setResults)) {
    return Array.from({ length: sets }, (_, index) => exercise.setResults[index] ?? {
      setNumber: index + 1,
      status: 'pending',
      weightKg: null,
      reps: null,
      rpe: null,
      completedAt: null,
    });
  }
  const completedSets = Math.max(0, Number(exercise.completedSets) || 0);
  return Array.from({ length: sets }, (_, index) => ({
    setNumber: index + 1,
    status: index < completedSets ? 'completed' : 'pending',
    weightKg: index < completedSets ? exercise.actualWeightKg ?? null : null,
    reps: index < completedSets ? exercise.actualReps ?? null : null,
    rpe: index < completedSets ? exercise.rpe ?? null : null,
    completedAt: null,
  }));
}

export function WorkoutCard({
  workout,
  today,
  compact = false,
  onOpen,
  onStartSession,
  onToggleSet,
  onComplete,
  onEdit,
  onReschedule,
  onDuplicate,
  onSaveTemplate,
  onDelete,
  onSkip,
  onCorrectResult,
  onUpdateResult,
  onUpdateResultNotes,
  onStartTimer,
}) {
  const [expandedExerciseIds, setExpandedExerciseIds] = useState(() => new Set());
  const [selectedSetIndices, setSelectedSetIndices] = useState({});
  const Icon = TYPE_ICONS[workout.type] || Target;
  const exercises = workout.exercises ?? [];
  const total = exercises.reduce((sum, item) => sum + Number(item.sets || 0), 0);
  const done = exercises.reduce((sum, item) => (
    sum + getExerciseSetResults(item).filter((result) => result.status === 'completed').length
  ), 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const completed = workout.status === 'completed';
  const skipped = workout.status === 'skipped';
  const planned = workout.status === 'planned';
  const future = planned && workout.plannedDate > today;
  const missed = planned && workout.plannedDate < today;
  const canTrack = planned && !future;
  const points = getWorkoutPoints(workout);
  const openWorkout = onOpen ?? onEdit;
  const openCard = canTrack && onStartSession ? onStartSession : onOpen;
  const cardInteractive = Boolean(openCard);
  const hasMenuActions = Boolean(
    (planned && onEdit)
    || (planned && onReschedule)
    || (completed && onCorrectResult)
    || onDuplicate
    || onSaveTemplate
    || (missed && onSkip)
    || onDelete,
  );

  const toggleResults = (exerciseId) => {
    setExpandedExerciseIds((current) => {
      const next = new Set(current);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  const handleCardClick = (event) => {
    if (!cardInteractive) return;
    if (event.target.closest('button, a, input, textarea, select, summary, details, label')) return;
    openCard(workout);
  };

  const handleCardKeyDown = (event) => {
    if (!cardInteractive || event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCard(workout);
  };

  if (compact) {
    const openCompact = canTrack && onStartSession ? onStartSession : openWorkout;
    return (
      <article className="compact-workout">
        <span className={`workout-icon type-${workout.type.toLowerCase()}`}><Icon size={20} aria-hidden="true" /></span>
        <div className="compact-copy">
          <span>{workout.time} · {workout.durationMinutes} мин</span>
          <h3>{workout.title}</h3>
          <p>{formatRuCount(exercises.length, 'exercise')} · +{formatRuCount(points, 'point')}</p>
        </div>
        <button type="button" className="secondary-button compact-open" disabled={!openCompact} onClick={() => openCompact?.(workout)}>Открыть</button>
      </article>
    );
  }

  return (
    <article
      className={`workout-card ${completed ? 'completed' : ''} ${missed ? 'missed' : ''} ${skipped ? 'skipped' : ''} ${cardInteractive ? 'workout-card-interactive' : ''}`}
      tabIndex={cardInteractive ? 0 : undefined}
      aria-label={cardInteractive ? `${canTrack ? 'Начать или продолжить' : 'Открыть'} тренировку «${workout.title}»` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="workout-card-head">
        <span className={`workout-icon type-${workout.type.toLowerCase()}`}><Icon size={22} aria-hidden="true" /></span>
        <div className="workout-title-wrap">
          <div className="meta-row"><span>{workout.type}</span><i /> <Clock3 size={14} aria-hidden="true" /> {workout.time} <i /> {workout.durationMinutes} мин <i /> {workout.intensity}</div>
          <h3>{workout.title}</h3>
        </div>
        <div className="points-tag" aria-label={`Можно получить ${formatRuCount(points, 'point')}`}><Star size={14} fill="currentColor" aria-hidden="true" /> +{points}</div>
        {hasMenuActions && (
          <details className="action-menu">
            <summary role="button" className="icon-button" aria-label={`Действия: ${workout.title}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
            <div className="action-menu-popover">
              {planned && onEdit && <button type="button" onClick={() => onEdit(workout)}><Edit3 size={16} aria-hidden="true" /> Редактировать</button>}
              {planned && onReschedule && <button type="button" onClick={() => onReschedule(workout)}><MoveRight size={16} aria-hidden="true" /> Перенести</button>}
              {completed && onCorrectResult && <button type="button" onClick={() => onCorrectResult(workout)}><Edit3 size={16} aria-hidden="true" /> Исправить результат</button>}
              {onDuplicate && <button type="button" onClick={() => onDuplicate(workout)}><Copy size={16} aria-hidden="true" /> Дублировать</button>}
              {onSaveTemplate && <button type="button" onClick={() => onSaveTemplate(workout)}><FilePlus2 size={16} aria-hidden="true" /> В шаблоны</button>}
              {missed && onSkip && <button type="button" onClick={() => onSkip(workout)}><Check size={16} aria-hidden="true" /> Пропустить</button>}
              {onDelete && <button type="button" className="danger" onClick={() => onDelete(workout)}><Trash2 size={16} aria-hidden="true" /> Удалить</button>}
            </div>
          </details>
        )}
      </div>

      {workout.planNotes && <p className="workout-note"><strong>План:</strong> {workout.planNotes}</p>}
      {missed && <div className="status-banner warning" role="status">Пропущена · можно выполнить сейчас или перенести</div>}
      {future && <div className="status-banner" role="status">Выполнение станет доступно {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${workout.plannedDate}T12:00:00`))}</div>}
      {skipped && <div className="status-banner muted" role="status">Тренировка пропущена</div>}

      <div className="exercise-list">
        {exercises.map((exercise, exerciseIndex) => {
          const resultsExpanded = expandedExerciseIds.has(exercise.id);
          const resultPanelId = `exercise-result-${workout.id}-${exercise.id}`;
          const resultEditable = canTrack && Boolean(onUpdateResult);
          const setResults = getExerciseSetResults(exercise);
          const selectedSetIndex = selectedSetIndices[exercise.id];
          const lastCompletedIndex = setResults.findLastIndex((result) => (
            result.status === 'completed'
          ));
          const resultSetIndex = Number.isInteger(selectedSetIndex)
            && selectedSetIndex >= 0
            && selectedSetIndex < setResults.length
            ? selectedSetIndex
            : (lastCompletedIndex >= 0 ? lastCompletedIndex : 0);
          const resultSet = setResults[resultSetIndex] ?? null;
          const completedSetCount = setResults.filter((result) => (
            result.status === 'completed'
          )).length;
          return (
            <div className="exercise-row-v2" key={exercise.id}>
              <div className="exercise-number">{String(exerciseIndex + 1).padStart(2, '0')}</div>
              <div className="exercise-name">
                <strong>{exercise.name}</strong>
                <span>{exercise.sets} × {exercise.plannedReps}{exercise.plannedWeightKg ? ` · ${exercise.plannedWeightKg} кг` : ''}</span>
              </div>
              <div className="set-dots" aria-label={`${formatRuCount(completedSetCount, 'set')} из ${exercise.sets}`}>
                {setResults.map((setResult, index) => {
                  const pressed = setResult.status === 'completed';
                  const setStatusLabel = pressed
                    ? 'выполнен'
                    : setResult.status === 'skipped' ? 'пропущен' : 'не выполнен';
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`set-dot${pressed ? ' done' : ''}${setResult.status === 'skipped' ? ' skipped' : ''}`}
                      disabled={!canTrack || !onToggleSet}
                      aria-pressed={pressed}
                      aria-label={`Подход ${index + 1}: ${setStatusLabel}`}
                      onClick={() => {
                        setSelectedSetIndices((current) => ({ ...current, [exercise.id]: index }));
                        onToggleSet?.(workout.id, exercise.id, index);
                      }}
                    >
                      {pressed
                        ? <Check size={14} strokeWidth={3} aria-hidden="true" />
                        : setResult.status === 'skipped' ? '—' : index + 1}
                    </button>
                  );
                })}
              </div>
              <div className="exercise-actions">
                {exercise.restSeconds > 0 && canTrack && onStartTimer && <button type="button" className="timer-start" onClick={() => onStartTimer(workout, exercise)}><Play size={14} aria-hidden="true" /> {exercise.restSeconds} сек</button>}
                <button type="button" className="text-button" aria-expanded={resultsExpanded} aria-controls={resultPanelId} onClick={() => toggleResults(exercise.id)}>Результат</button>
              </div>
              {resultsExpanded && (
                <div className="exercise-result-fields" id={resultPanelId}>
                  <strong className="exercise-result-target">Подход {resultSetIndex + 1}</strong>
                  <label><span>Вес, кг</span><input type="number" min="0.5" max="1000" step="0.5" disabled={!resultEditable} value={resultSet?.weightKg ?? ''} onChange={(event) => onUpdateResult?.(workout.id, exercise.id, resultSetIndex, 'actualWeightKg', event.target.value)} /></label>
                  <label><span>Повторы</span><input type="number" min="1" max="999" step="1" disabled={!resultEditable} value={resultSet?.reps ?? ''} onChange={(event) => onUpdateResult?.(workout.id, exercise.id, resultSetIndex, 'actualReps', event.target.value)} /></label>
                  <label><span>RPE</span><input type="number" min="1" max="10" step="0.5" disabled={!resultEditable} value={resultSet?.rpe ?? ''} onChange={(event) => onUpdateResult?.(workout.id, exercise.id, resultSetIndex, 'rpe', event.target.value)} /></label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {planned && expandedExerciseIds.size > 0 && (
        <label className="field full workout-result-notes">
          <span>Итоговая заметка</span>
          <textarea
            value={workout.resultNotes}
            maxLength="2000"
            disabled={!canTrack || !onUpdateResultNotes}
            placeholder="Самочувствие, техника или что изменить в следующий раз"
            onChange={(event) => onUpdateResultNotes?.(workout.id, event.target.value)}
          />
        </label>
      )}

      <div className="workout-progress" role="progressbar" aria-label={`Прогресс тренировки ${workout.title}`} aria-valuemin="0" aria-valuemax={total} aria-valuenow={done}>
        <div><span>Выполнено подходов</span><strong>{done}/{total}</strong></div>
        <div className="linear-progress"><span style={{ width: `${percent}%` }} /></div>
      </div>

      <div className="workout-footer">
        {completed ? <div className="complete-message"><span><Check size={16} aria-hidden="true" /></span> Завершена · +{formatRuCount(workout.pointsAwarded, 'point')}</div> : skipped ? <p>Не влияет на баллы и личные рекорды</p> : (
          <>
            <p>{done === total && total > 0 ? 'Все подходы отмечены' : canTrack ? 'Отмечай подходы по ходу тренировки' : 'Только просмотр'}</p>
            <button type="button" className="complete-button" disabled={!canTrack || done !== total || total === 0 || !onComplete} onClick={() => onComplete?.(workout)}><Check size={17} aria-hidden="true" /> {missed ? 'Завершить сейчас' : 'Подтвердить выполнение'}</button>
          </>
        )}
      </div>
      {workout.resultNotes && <p className="workout-note result"><strong>Итог:</strong> {workout.resultNotes}</p>}
    </article>
  );
}
