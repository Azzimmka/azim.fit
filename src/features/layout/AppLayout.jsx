import { BarChart3, CalendarDays, Flame, LayoutDashboard, Settings, Star, Trophy, Zap } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { formatRuCount } from '../../domain/plural.js';

const NAV_ITEMS = [
  { to: '/today', label: 'Сегодня', short: 'Сегодня', icon: LayoutDashboard },
  { to: '/plan', label: 'Мой план', short: 'План', icon: CalendarDays },
  { to: '/progress', label: 'Прогресс', short: 'Прогресс', icon: BarChart3 },
];
const MOBILE_NAV_ITEMS = [
  ...NAV_ITEMS,
  { to: '/settings', label: 'Настройки', short: 'Настройки', icon: Settings },
];

export function AppLayout({ children, points, level, levelProgress, remainingPoints, missedCount }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/today" aria-label="AZIM.FIT — на главную">
          <span className="brand-mark"><Zap size={18} fill="currentColor" /></span>
          <span>AZIM<span>.FIT</span></span>
        </NavLink>
        <nav className="side-nav" aria-label="Основная навигация">
          <p className="nav-caption">Меню</p>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} /><span>{label}</span>
              {to === '/plan' && missedCount > 0 && <b className="nav-badge" aria-label={`Пропущено: ${formatRuCount(missedCount, 'workout')}`}>{missedCount}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="level-card">
          <div className="level-card-top"><span className="level-medal"><Trophy size={18} aria-hidden="true" /></span><div><strong>Уровень {level}</strong><small>{formatRuCount(points, 'point')}</small></div></div>
          <div className="dark-progress" role="progressbar" aria-label={`Прогресс уровня ${level}`} aria-valuemin="0" aria-valuemax="250" aria-valuenow={points % 250}><span style={{ width: `${levelProgress}%` }} /></div>
          <p>До нового уровня осталось {formatRuCount(remainingPoints, 'point')}</p>
        </div>
        <NavLink className="profile-row" to="/settings"><div className="avatar">А</div><div><strong>Азим</strong><small>Настройки</small></div><Settings size={18} /></NavLink>
      </aside>

      <main className="main-content" id="main-content">
        <div className="mobile-topbar">
          <NavLink className="brand" to="/today"><span className="brand-mark"><Zap size={17} fill="currentColor" /></span><span>AZIM<span>.FIT</span></span></NavLink>
          <div className="mobile-points" aria-label={formatRuCount(points, 'point')}><Star size={15} fill="currentColor" aria-hidden="true" /> {points}</div>
        </div>
        <div className="page-container">{children}</div>
      </main>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {MOBILE_NAV_ITEMS.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="mobile-nav-icon"><Icon size={21} />{to === '/plan' && missedCount > 0 && <i />}</span><span>{short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ eyebrow, title, points, onAdd, actionLabel = 'Запланировать', children }) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">{eyebrow}</p><h1 tabIndex="-1">{title}</h1></div>
      <div className="header-actions">
        {children}
        <div className="points-pill"><Star size={16} fill="currentColor" aria-hidden="true" /> {formatRuCount(points, 'point')}</div>
        {onAdd && <button type="button" className="primary-button" onClick={onAdd}><CalendarDays size={18} aria-hidden="true" /> {actionLabel}</button>}
      </div>
    </header>
  );
}

export function TodayHero({ workouts, streak, todayPoints, onAdd }) {
  const completed = workouts.filter((item) => item.status === 'completed').length;
  const percent = workouts.length ? Math.round((completed / workouts.length) * 100) : 0;
  return (
    <section className="day-hero">
      <div className="hero-copy">
        <div className="hero-badge"><Flame size={16} fill="currentColor" aria-hidden="true" /> Серия: {formatRuCount(streak, 'day')}</div>
        <h2>{workouts.length ? 'План есть. Осталось действовать.' : 'Запланируй движение на сегодня.'}</h2>
        <p>{workouts.length ? `Завершено: ${completed} из ${workouts.length}` : 'Даже короткая тренировка — это победа над вчерашним собой.'}</p>
        {!workouts.length && <button type="button" className="lime-button" onClick={onAdd}><CalendarDays size={18} aria-hidden="true" /> Создать тренировку</button>}
      </div>
      <div className="hero-stats">
        <div className="progress-ring" role="progressbar" aria-label="Прогресс на сегодня" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} style={{ '--progress': `${percent * 3.6}deg` }}><div><strong>{percent}%</strong><span>на сегодня</span></div></div>
        <div className="hero-metric"><span>Заработано</span><strong>+{todayPoints}</strong><small>{formatRuCount(todayPoints, 'point')} сегодня</small></div>
      </div>
      <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
    </section>
  );
}
