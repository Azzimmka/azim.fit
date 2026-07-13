import { useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Edit3, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/index.js';
import {
  addCalendarMonths,
  fromCalendarDate,
  getMonthCalendarGrid,
} from '../../domain/dates.js';
import { formatRuCount } from '../../domain/plural.js';
import { PageHeader } from '../layout/AppLayout.jsx';
import { WorkoutCard } from '../workouts/WorkoutCard.jsx';

const monthTitle = (date) => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(fromCalendarDate(date));
const longDate = (date) => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(fromCalendarDate(date));
const TAB_VALUES = ['calendar', 'missed', 'templates'];

function MonthCalendar({ selectedDate, today, workouts, onSelect }) {
  const days = getMonthCalendarGrid(selectedDate);
  const selectedMonth = selectedDate.slice(0, 7);
  const byDate = useMemo(() => workouts.reduce((map, workout) => {
    const values = map.get(workout.plannedDate) || [];
    values.push(workout);
    map.set(workout.plannedDate, values);
    return map;
  }, new Map()), [workouts]);

  return (
    <section className="calendar-card" aria-label="Календарь тренировок">
      <div className="calendar-toolbar">
        <button type="button" className="icon-button" onClick={() => onSelect(addCalendarMonths(selectedDate, -1))} aria-label="Предыдущий месяц"><ChevronLeft aria-hidden="true" /></button>
        <div><p className="eyebrow">Календарь</p><h2>{monthTitle(selectedDate)}</h2></div>
        <button type="button" className="secondary-button" onClick={() => onSelect(today)}>Сегодня</button>
        <button type="button" className="icon-button" onClick={() => onSelect(addCalendarMonths(selectedDate, 1))} aria-label="Следующий месяц"><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="month-grid">
        {days.map((iso) => {
          const dayWorkouts = byDate.get(iso) || [];
          const completed = dayWorkouts.filter((item) => item.status === 'completed').length;
          const skipped = dayWorkouts.filter((item) => item.status === 'skipped').length;
          const missed = dayWorkouts.filter((item) => item.status === 'planned' && iso < today).length;
          const planned = dayWorkouts.filter((item) => item.status === 'planned' && iso >= today).length;
          return (
            <button
              type="button"
              key={iso}
              className={`month-day ${iso === selectedDate ? 'active' : ''} ${!iso.startsWith(selectedMonth) ? 'outside' : ''}`}
              aria-pressed={iso === selectedDate}
              aria-label={`${longDate(iso)}; ${formatRuCount(dayWorkouts.length, 'workout')}`}
              onClick={() => onSelect(iso)}
            >
              <span>{Number(iso.slice(-2))}</span>
              <div className="day-statuses" aria-hidden="true">
                {planned > 0 && <i className="planned" />}
                {completed > 0 && <i className="done" />}
                {missed > 0 && <i className="missed" />}
                {skipped > 0 && <i className="skipped" />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TemplatePanel({ templates, selectedDate, onCreate, onApply, onEdit, onDelete }) {
  return (
    <section className="template-panel">
      <div className="section-heading"><div><p className="eyebrow">Быстрый старт</p><h2>Шаблоны тренировок</h2></div><button type="button" className="secondary-button" onClick={onCreate}><Plus size={17} aria-hidden="true" /> Новый шаблон</button></div>
      {templates.length ? <div className="template-grid">{templates.map((template) => {
        const plan = template.plan;
        return (
          <article className="template-card" key={template.id}>
            <div className="template-card-icon"><Copy aria-hidden="true" /></div>
            <div><span>{plan.type} · {plan.durationMinutes} мин</span><h3>{template.name}</h3><p>{formatRuCount(plan.exercises.length, 'exercise')}</p></div>
            <div className="template-actions"><button type="button" className="primary-button" onClick={() => onApply(template, selectedDate)}>Использовать</button><button type="button" className="icon-button" onClick={() => onEdit(template)} aria-label={`Редактировать шаблон ${template.name}`}><Edit3 size={17} aria-hidden="true" /></button><button type="button" className="icon-button danger" onClick={() => onDelete(template)} aria-label={`Удалить шаблон ${template.name}`}><Trash2 size={17} aria-hidden="true" /></button></div>
          </article>
        );
      })}</div> : <EmptyState title="Шаблонов пока нет" description="Сохрани готовую тренировку или создай новый шаблон." actionLabel="Создать шаблон" onAction={onCreate} />}
    </section>
  );
}

export function PlanPage({
  today,
  points,
  selectedDate,
  tab,
  workouts,
  missedWorkouts,
  templates,
  onSelectDate,
  onSelectTab,
  onAdd,
  onCreateTemplate,
  onApplyTemplate,
  onEditTemplate,
  onDeleteTemplate,
  workoutActions,
}) {
  const selected = workouts.filter((workout) => workout.plannedDate === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TAB_VALUES.indexOf(tab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TAB_VALUES.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TAB_VALUES.length) % TAB_VALUES.length;
    const nextTab = TAB_VALUES[nextIndex];
    onSelectTab(nextTab);
    event.currentTarget.querySelector(`#plan-tab-${nextTab}`)?.focus();
  };
  return (
    <>
      <PageHeader eyebrow="План под контролем" title="Календарь тренировок" points={points} onAdd={() => onAdd(selectedDate)} />
      <div className="plan-tabs" role="tablist" aria-label="Разделы плана" onKeyDown={handleTabKeyDown}>
        <button type="button" id="plan-tab-calendar" role="tab" aria-controls="plan-panel-calendar" aria-selected={tab === 'calendar'} tabIndex={tab === 'calendar' ? 0 : -1} className={tab === 'calendar' ? 'active' : ''} onClick={() => onSelectTab('calendar')}><CalendarDays size={17} aria-hidden="true" /> Календарь</button>
        <button type="button" id="plan-tab-missed" role="tab" aria-controls="plan-panel-missed" aria-selected={tab === 'missed'} tabIndex={tab === 'missed' ? 0 : -1} className={tab === 'missed' ? 'active' : ''} onClick={() => onSelectTab('missed')}>Пропущенные <span>{missedWorkouts.length}</span></button>
        <button type="button" id="plan-tab-templates" role="tab" aria-controls="plan-panel-templates" aria-selected={tab === 'templates'} tabIndex={tab === 'templates' ? 0 : -1} className={tab === 'templates' ? 'active' : ''} onClick={() => onSelectTab('templates')}>Шаблоны <span>{templates.length}</span></button>
      </div>

      {tab === 'calendar' && (
        <div id="plan-panel-calendar" role="tabpanel" aria-labelledby="plan-tab-calendar">
          <MonthCalendar selectedDate={selectedDate} today={today} workouts={workouts} onSelect={onSelectDate} />
          <section className="content-section plan-list-section">
            <div className="section-heading"><div><p className="eyebrow">{longDate(selectedDate)}</p><h2>{selected.length ? formatRuCount(selected.length, 'workout') : 'Свободный день'}</h2></div><button type="button" className="secondary-button" onClick={() => onAdd(selectedDate)}><Plus size={17} aria-hidden="true" /> Добавить</button></div>
            <div className="workouts-grid">{selected.length ? selected.map((workout) => <WorkoutCard key={workout.id} workout={workout} today={today} {...workoutActions} />) : <EmptyState title="На эту дату ничего нет" description="Добавь тренировку или используй шаблон." actionLabel="Добавить" onAction={() => onAdd(selectedDate)} />}</div>
          </section>
        </div>
      )}

      {tab === 'missed' && (
        <section id="plan-panel-missed" role="tabpanel" aria-labelledby="plan-tab-missed" className="content-section plan-list-section">
          <div className="section-heading"><div><p className="eyebrow">Требуют решения</p><h2>Пропущенные тренировки</h2></div><span className="count-badge" aria-label={formatRuCount(missedWorkouts.length, 'workout')}>{missedWorkouts.length}</span></div>
          <div className="workouts-grid">{missedWorkouts.length ? missedWorkouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} today={today} {...workoutActions} />) : <EmptyState title="Пропусков нет" description="Все прошлые тренировки завершены или перенесены." />}</div>
        </section>
      )}

      {tab === 'templates' && <div id="plan-panel-templates" role="tabpanel" aria-labelledby="plan-tab-templates"><TemplatePanel templates={templates} selectedDate={selectedDate} onCreate={onCreateTemplate} onApply={onApplyTemplate} onEdit={onEditTemplate} onDelete={onDeleteTemplate} /></div>}
    </>
  );
}
