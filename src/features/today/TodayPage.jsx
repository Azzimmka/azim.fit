import { AlertTriangle, ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/index.js';
import { formatRuCount } from '../../domain/plural.js';
import { PageHeader, TodayHero } from '../layout/AppLayout.jsx';
import { WorkoutCard } from '../workouts/WorkoutCard.jsx';

const longDate = (date) => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));

export function TodayPage({
  today,
  tomorrow,
  workouts,
  tomorrowWorkouts,
  missedCount,
  points,
  streak,
  todayPoints,
  onAdd,
  workoutActions,
}) {
  return (
    <>
      <PageHeader eyebrow={longDate(today)} title="Сегодня — твой день" points={points} onAdd={() => onAdd(today)} />
      {missedCount > 0 && <Link className="overdue-banner" to="/plan?tab=missed"><AlertTriangle size={20} aria-hidden="true" /><span><strong>Пропущено: {formatRuCount(missedCount, 'workout')}</strong><small>Заверши их сейчас, перенеси или пропусти</small></span><ArrowRight size={18} aria-hidden="true" /></Link>}
      <TodayHero workouts={workouts} streak={streak} todayPoints={todayPoints} onAdd={() => onAdd(today)} />

      <section className="content-section">
        <div className="section-heading"><div><p className="eyebrow">План дня</p><h2>Тренировки сегодня</h2></div><span className="count-badge" aria-label={formatRuCount(workouts.length, 'workout')}>{workouts.length}</span></div>
        <div className="workouts-grid">
          {workouts.length ? workouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} today={today} {...workoutActions} />) : <EmptyState title="На сегодня пока пусто" description="Добавь тренировку и преврати планы в результат." actionLabel="Добавить тренировку" onAction={() => onAdd(today)} />}
        </div>
      </section>

      <section className="content-section tomorrow-section">
        <div className="section-heading"><div><p className="eyebrow">Следующий шаг</p><h2>Завтра</h2></div><Link className="text-button" to="/plan">Весь план <ArrowRight size={16} aria-hidden="true" /></Link></div>
        {tomorrowWorkouts.length ? <div className="compact-list">{tomorrowWorkouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} today={today} compact {...workoutActions} />)}</div> : <button type="button" className="tomorrow-empty" onClick={() => onAdd(tomorrow)}><Plus size={22} aria-hidden="true" /><span><strong>Запланировать тренировку на завтра</strong><small>Выбери время и упражнения</small></span><ArrowRight size={19} aria-hidden="true" /></button>}
      </section>
    </>
  );
}
