import { useId, useMemo, useState } from 'react';
import { Activity, Dumbbell, Flame, Medal, Scale, Star, Trophy } from 'lucide-react';
import { formatRuCount, RU_FORMS, pluralizeRu } from '../../domain/plural.js';
import { PageHeader } from '../layout/AppLayout.jsx';

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

export function ProgressPage({ today, points, level, streak, completedWorkouts, weekData, records, bodyWeightEntries, onSaveWeight, onDeleteWeight, onAdd }) {
  const maxPoints = Math.max(...weekData.map((item) => item.points), 100);
  const recordRows = useMemo(() => records.slice(0, 12), [records]);
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
        <div className="bar-chart" role="img" aria-label={weekData.map((item) => `${item.label}: ${formatRuCount(item.points, 'point')}`).join(', ')}>{weekData.map((item) => <div className="bar-column" key={item.date}><div className="bar-value">{item.points || ''}</div><div className="bar-track"><span style={{ height: `${Math.max((item.points / maxPoints) * 100, item.points ? 8 : 2)}%` }} /></div><span className={item.date === today ? 'today-label' : ''}>{item.label}</span></div>)}</div>
      </section>

      <section className="records-card">
        <div className="section-heading"><div><p className="eyebrow">Личные рекорды</p><h2>Лучшие результаты</h2></div><Medal size={24} /></div>
        {recordRows.length ? <div className="records-grid">{recordRows.map((record) => <article key={record.normalizedName}><span className="record-icon"><Dumbbell size={19} aria-hidden="true" /></span><div><h3>{record.displayName}</h3>{record.weight && <p>Рабочий вес: {record.weight.value} кг</p>}{record.volume && <small>Максимальный объём: {Math.round(record.volume.value)} кг</small>}{record.reps && <p>Повторы без веса: {record.reps.value}</p>}</div></article>)}</div> : <p className="muted-copy">Добавь фактический вес или повторы и заверши тренировку — рекорды появятся здесь.</p>}
      </section>

      <BodyWeightPanel entries={bodyWeightEntries} today={today} onSave={onSaveWeight} onDelete={onDeleteWeight} />
    </>
  );
}
