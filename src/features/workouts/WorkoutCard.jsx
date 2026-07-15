import {
  Activity,
  CalendarClock,
  Check,
  Clock3,
  Copy,
  Dumbbell,
  Edit3,
  Eye,
  FilePlus2,
  MoreHorizontal,
  MoveRight,
  Play,
  Sparkles,
  Star,
  Target,
  Trash2,
} from 'lucide-react';
import {
  formatRuCount,
  pluralizeRu,
  RU_FORMS,
} from '../../domain/plural.js';
import { getWorkoutPoints } from '../../domain/points.js';

const TYPE_ICONS = { Силовая: Dumbbell, Кардио: Activity, Мобильность: Sparkles, Другое: Target };
const REP_FORMS = Object.freeze(['повтор', 'повтора', 'повторов']);

function formatExerciseTarget(exercise) {
  const rawReps = String(exercise.plannedReps ?? '').trim();
  const reps = /^\d+$/.test(rawReps)
    ? `${rawReps} ${pluralizeRu(Number(rawReps), REP_FORMS)}`
    : rawReps;
  const weight = Number(exercise.plannedWeightKg) > 0
    ? `${exercise.plannedWeightKg} кг`
    : '';
  return [reps, weight].filter(Boolean).join(' · ');
}

export function WorkoutCard({
  workout,
  today,
  compact = false,
  onOpen,
  onStartSession,
  onEdit,
  onReschedule,
  onDuplicate,
  onSaveTemplate,
  onDelete,
  onSkip,
  onCorrectResult,
}) {
  const Icon = TYPE_ICONS[workout.type] || Target;
  const exercises = workout.exercises ?? [];
  const completed = workout.status === 'completed';
  const skipped = workout.status === 'skipped';
  const planned = workout.status === 'planned';
  const future = planned && workout.plannedDate > today;
  const missed = planned && workout.plannedDate < today;
  const canStart = planned && !future;
  const startSession = onStartSession ?? onOpen;
  const points = getWorkoutPoints(workout);
  const openCard = canStart
    ? startSession
    : (skipped ? onOpen : null);
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

  const ctaLabel = canStart
    ? 'Начать'
    : future
      ? 'Запланировано'
      : skipped ? 'Просмотреть' : null;
  const CtaIcon = canStart ? Play : future ? CalendarClock : Eye;
  const ctaAction = canStart ? startSession : (skipped ? onOpen : null);

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
    return (
      <article className="compact-workout">
        <span className={`workout-icon type-${workout.type.toLowerCase()}`}><Icon size={20} aria-hidden="true" /></span>
        <div className="compact-copy">
          <span>{workout.time}</span>
          <h3>{workout.title}</h3>
          <p>{formatRuCount(exercises.length, 'exercise')} · +{formatRuCount(points, 'point')}</p>
        </div>
        {ctaLabel && (
          <button
            type="button"
            className={`secondary-button compact-open ${canStart ? 'primary' : ''}`}
            disabled={!ctaAction}
            onClick={() => ctaAction?.(workout)}
          >
            <CtaIcon size={16} aria-hidden="true" /> {ctaLabel}
          </button>
        )}
      </article>
    );
  }

  const accessibleAction = canStart ? 'Начать' : 'Открыть';

  return (
    <article
      className={`workout-card ${completed ? 'completed' : ''} ${missed ? 'missed' : ''} ${skipped ? 'skipped' : ''} ${cardInteractive ? 'workout-card-interactive' : ''}`}
      tabIndex={cardInteractive ? 0 : undefined}
      aria-label={cardInteractive ? `${accessibleAction} тренировку «${workout.title}»` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="workout-card-head">
        <span className={`workout-icon type-${workout.type.toLowerCase()}`}><Icon size={22} aria-hidden="true" /></span>
        <div className="workout-title-wrap">
          <div className="meta-row"><span>{workout.type}</span><i /> <Clock3 size={14} aria-hidden="true" /> {workout.time} <i /> {workout.intensity}</div>
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

      {missed && <div className="status-banner warning" role="status">Пропущена · можно выполнить сейчас или перенести</div>}
      {future && <div className="status-banner" role="status">Выполнение станет доступно {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${workout.plannedDate}T12:00:00`))}</div>}
      {completed && <div className="status-banner success" role="status">Завершена · +{formatRuCount(workout.pointsAwarded, 'point')}</div>}
      {skipped && <div className="status-banner muted" role="status">Тренировка пропущена</div>}

      <div className="exercise-list workout-preview-list">
        {exercises.map((exercise, exerciseIndex) => {
          const setCount = Math.max(0, Math.trunc(Number(exercise.sets) || 0));
          return (
            <div className="exercise-preview-row" key={exercise.id}>
              <div className="exercise-number">{String(exerciseIndex + 1).padStart(2, '0')}</div>
              <div className="exercise-name">
                <strong>{exercise.name}</strong>
                <span>{formatExerciseTarget(exercise)}</span>
              </div>
              <div className="exercise-set-count" aria-label={formatRuCount(setCount, 'set')}>
                <strong>{setCount}</strong>
                <span>{pluralizeRu(setCount, RU_FORMS.set)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {ctaLabel && (
        <button
          type="button"
          className={`workout-card-cta ${canStart ? 'primary' : 'secondary'}`}
          disabled={!ctaAction}
          onClick={() => ctaAction?.(workout)}
        >
          <CtaIcon size={19} aria-hidden="true" /> {ctaLabel}
        </button>
      )}
    </article>
  );
}
