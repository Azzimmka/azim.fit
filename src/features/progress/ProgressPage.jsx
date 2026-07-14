import { useId, useMemo, useState } from 'react';
import { Activity, CalendarClock, CheckCircle2, ChevronRight, Clock3, Flame, Scale, Star, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRuCount, RU_FORMS, pluralizeRu } from '../../domain/plural.js';
import {
  getCompletedWorkoutDurationMinutes,
  getWorkoutSetProgress,
  selectProgressWorkoutsForDate,
} from '../../domain/selectors.js';
import { PageHeader } from '../layout/AppLayout.jsx';

const DAY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function formatDayLabel(date) {
  const value = DAY_FORMATTER.format(new Date(`${date}T12:00:00`));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDayWorkoutStatus(workout, today) {
  if (workout.status === 'completed') {
    return { key: 'completed', label: 'Выполнена', Icon: CheckCircle2 };
  }
  if (workout.status === 'skipped' || workout.plannedDate < today) {
    return { key: 'missed', label: 'Пропущена', Icon: Clock3 };
  }
  return { key: 'planned', label: 'Запланирована', Icon: CalendarClock };
}

function MetricCard({ icon: Icon, label, value, note, tone }) {
  return <article className={`metric-card ${tone}`}><span className="metric-icon"><Icon size={21} /></span><div><p>{label}</p><strong>{value}</strong><span>{note}</span></div></article>;
}

function BodyWeightPanel({ entries, today, onSave, onDelete }) {
  const latest = entries.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState(() => entries.find((item) => item.date === today)?.weightKg ?? '');
  const [error, setError] = useState('');
  const errorId = useId();
  const recent = entries.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const values = recent.map((item) => item.weightKg);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const editEntry = (entry) => {
    setDate(entry.date);
    setWeight(String(entry.weightKg));
    setError('');
  };
  const submit = (event) => {
    event.preventDefault();
    const value = Number(weight);
    if (!date || date > today) {
      setError('Выбери сегодняшнюю или прошедшую дату.');
      return;
    }
    if (!Number.isFinite(value) || value < 20 || value > 500) {
      setError('Укажи вес от 20 до 500 кг.');
      return;
    }
    setError('');
    onSave({ date, weightKg: Math.round(value * 10) / 10 });
  };
  return (
    <section className="weight-card">
      <div className="section-heading"><div><p className="eyebrow">Дневник массы</p><h2>Вес тела</h2></div>{latest && <div className="weight-latest"><Scale size={18} /><strong>{latest.weightKg} кг</strong><span>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${latest.date}T12:00:00`))}</span></div>}</div>
      <form className="weight-form" onSubmit={submit} noValidate>
        <label className="field"><span>Дата</span><input type="date" required max={today} value={date} onChange={(event) => { const nextDate = event.target.value; setDate(nextDate); setWeight(entries.find((item) => item.date === nextDate)?.weightKg ?? ''); setError(''); }} /></label>
        <label className="field"><span>Вес, кг</span><input type="number" required min="20" max="500" step="0.1" value={weight} onChange={(event) => { setWeight(event.target.value); setError(''); }} placeholder="75.5" aria-describedby={error ? errorId : undefined} /></label>
        <button className="primary-button" type="submit">Сохранить</button>
      </form>
      {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
      {recent.length > 1 && <div className="weight-chart" aria-label="Изменение массы тела за последние 14 записей">{recent.map((item) => { const height = max === min ? 50 : 18 + ((item.weightKg - min) / (max - min)) * 72; return <div className="weight-column" key={item.date} title={`${item.date}: ${item.weightKg} кг`}><span style={{ height: `${height}%` }} /><small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'numeric' }).format(new Date(`${item.date}T12:00:00`))}</small></div>; })}</div>}
      {entries.length > 0 && <div className="weight-history" aria-label="История массы тела">{entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div key={item.date}><span>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${item.date}T12:00:00`))}</span><strong>{item.weightKg} кг</strong><button type="button" className="text-button" onClick={() => editEntry(item)}>Изменить</button><button type="button" className="text-button danger-text" onClick={() => onDelete(item.date)}>Удалить</button></div>)}</div>}
    </section>
  );
}

function DaySummary({ date, points, workouts, weightEntry, today }) {
  return (
    <section className="day-summary-card" aria-labelledby="day-summary-title">
      <div className="section-heading day-summary-heading">
        <div>
          <p className="eyebrow">Итоги дня</p>
          <h2 id="day-summary-title">{formatDayLabel(date)}</h2>
          {weightEntry && <p className="day-summary-weight"><Scale size={14} aria-hidden="true" /> {weightEntry.weightKg} кг</p>}
        </div>
        <div className="day-summary-points"><Star size={15} fill="currentColor" aria-hidden="true" /> {formatRuCount(points, 'point')}</div>
      </div>

      {workouts.length > 0 ? (
        <div className="day-workout-list">
          {workouts.map((workout) => {
            const status = getDayWorkoutStatus(workout, today);
            const setProgress = getWorkoutSetProgress(workout);
            const duration = getCompletedWorkoutDurationMinutes(workout);
            const StatusIcon = status.Icon;
            return (
              <Link
                className="day-workout-row"
                key={workout.id}
                to={`/workouts/${workout.id}`}
                aria-label={`Открыть тренировку «${workout.title}»`}
              >
                <div className="day-workout-copy">
                  <div className="day-workout-title">
                    <h3>{workout.title}</h3>
                    <span className={`day-workout-status ${status.key}`}><StatusIcon size={13} aria-hidden="true" /> {status.label}</span>
                  </div>
                  <p>
                    {setProgress.total > 0 && <span>Подходы: {setProgress.completed}/{setProgress.total}</span>}
                    {duration && <span>{duration} мин</span>}
                  </p>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : <p className="muted-copy">В этот день тренировок не было.</p>}
    </section>
  );
}

export function ProgressPage({ today, points, level, streak, completedWorkouts, workouts, weekData, bodyWeightEntries, onSaveWeight, onDeleteWeight, onAdd }) {
  const maxPoints = Math.max(...weekData.map((item) => item.points), 100);
  const [selectedDate, setSelectedDate] = useState(() => (
    weekData.some((item) => item.date === today) ? today : (weekData.at(-1)?.date ?? today)
  ));
  const selectedDay = weekData.find((item) => item.date === selectedDate) ?? weekData.at(-1) ?? { date: today, points: 0 };
  const selectedWorkouts = useMemo(
    () => selectProgressWorkoutsForDate(workouts, selectedDay.date),
    [selectedDay.date, workouts],
  );
  const selectedWeight = bodyWeightEntries.find((entry) => entry.date === selectedDay.date) ?? null;

  return (
    <>
      <PageHeader eyebrow="Каждая отметка имеет значение" title="Твой прогресс" points={points} onAdd={() => onAdd(today)} />
      <div className="metric-grid">
        <MetricCard icon={Trophy} label="Всего баллов" value={points} note={`Уровень ${level}`} tone="lime" />
        <MetricCard icon={Activity} label="Завершено" value={completedWorkouts.length} note={pluralizeRu(completedWorkouts.length, RU_FORMS.workout)} tone="purple" />
        <MetricCard icon={Flame} label="Текущая серия" value={streak} note={`${pluralizeRu(streak, RU_FORMS.day)} подряд`} tone="orange" />
      </div>

      <section className="chart-card">
        <div className="section-heading"><div><p className="eyebrow">Последние 7 дней</p><h2>Заработанные баллы</h2></div><div className="chart-total"><Star size={15} fill="currentColor" /> {weekData.reduce((sum, item) => sum + item.points, 0)}</div></div>
        <div className="bar-chart" role="group" aria-label="Баллы за последние семь дней">
          {weekData.map((item) => {
            const selected = item.date === selectedDay.date;
            return (
              <button
                type="button"
                className={`bar-column${selected ? ' selected' : ''}`}
                key={item.date}
                data-date={item.date}
                aria-pressed={selected}
                aria-label={`${formatDayLabel(item.date)}: ${formatRuCount(item.points, 'point')}`}
                onClick={() => setSelectedDate(item.date)}
              >
                <span className="bar-value" aria-hidden="true">{item.points || (selected ? '0' : '')}</span>
                <span className="bar-track" aria-hidden="true"><span style={{ height: `${Math.max((item.points / maxPoints) * 100, item.points ? 8 : 2)}%` }} /></span>
                <span className={item.date === today ? 'today-label' : ''} aria-hidden="true">{item.label}</span>
              </button>
            );
          })}
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">Выбран {formatDayLabel(selectedDay.date)}: {formatRuCount(selectedDay.points, 'point')}</p>
      </section>

      <DaySummary
        date={selectedDay.date}
        points={selectedDay.points}
        workouts={selectedWorkouts}
        weightEntry={selectedWeight}
        today={today}
      />

      <BodyWeightPanel entries={bodyWeightEntries} today={today} onSave={onSaveWeight} onDelete={onDeleteWeight} />
    </>
  );
}
