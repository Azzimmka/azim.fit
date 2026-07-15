import { BarChart3, CalendarDays, Flame, LayoutDashboard, MailCheck, Settings, Star, Trophy, UserRound, Zap } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
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

const SYNC_STATUS_META = Object.freeze({
  local: { tone: 'local', label: 'Локальный режим' },
  connecting: { tone: 'syncing', label: 'Подключение к облаку' },
  syncing: { tone: 'syncing', label: 'Синхронизация' },
  synced: { tone: 'synced', label: 'Данные синхронизированы' },
  offline: { tone: 'local', label: 'Offline' },
  'verify-email': { tone: 'local', label: 'Ожидается подтверждение email' },
  error: { tone: 'error', label: 'Ошибка синхронизации' },
});

function getAccountCopy(accountUser, syncStatus, accountAvatar = null) {
  const displayName = typeof accountUser?.displayName === 'string'
    ? accountUser.displayName.trim()
    : '';
  const email = typeof accountUser?.email === 'string' ? accountUser.email.trim() : '';
  const sync = SYNC_STATUS_META[syncStatus] ?? SYNC_STATUS_META.local;
  if (!accountUser) {
    return {
      name: 'Локальный профиль',
      detail: 'Локальный режим',
      initial: 'Л',
      photoURL: '',
      sync: SYNC_STATUS_META.local,
    };
  }
  const name = displayName || email || 'Аккаунт KEEP AT IT';
  return {
    name,
    detail: displayName && email ? email : sync.label,
    initial: name.slice(0, 1).toLocaleUpperCase('ru-RU'),
    photoURL: typeof accountAvatar?.src === 'string'
      ? accountAvatar.src
      : (typeof accountUser.photoURL === 'string' ? accountUser.photoURL : ''),
    sync,
  };
}

export function AppLayout({
  children,
  points,
  level,
  levelProgress,
  remainingPoints,
  missedCount,
  immersive = false,
  accountUser = null,
  syncStatus = 'local',
  accountAvatar = null,
}) {
  const { pathname } = useLocation();
  const sessionPath = /^\/workouts\/[^/]+\/session\/?$/.test(pathname);
  const immersiveMode = immersive || sessionPath;
  const account = getAccountCopy(accountUser, syncStatus, accountAvatar);
  const requiresEmailVerification = accountUser?.emailVerified === false;
  const profileLabel = `Настройки аккаунта: ${[
    account.name,
    account.detail,
    account.sync.label,
  ].filter((item, index, items) => items.indexOf(item) === index).join(', ')}`;

  return (
    <div className={`app-shell ${immersiveMode ? 'immersive-session-shell' : ''}`}>
      {!immersiveMode && <aside className="sidebar">
        <NavLink className="brand" to="/today" aria-label="KEEP AT IT — на главную">
          <span className="brand-mark"><Zap size={18} fill="currentColor" /></span>
          <span>KEEP <span>AT IT</span></span>
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
        <NavLink className="profile-row" to="/settings" aria-label={profileLabel}>
          <div className="avatar account-avatar">
            {account.photoURL ? <img src={account.photoURL} alt="" /> : account.initial}
          </div>
          <div className="profile-copy">
            <strong>{account.name}</strong>
            <small><i className={`profile-sync-indicator ${account.sync.tone}`} title={account.sync.label} aria-hidden="true" /> {account.detail}</small>
          </div>
          <Settings size={18} aria-hidden="true" />
        </NavLink>
      </aside>}

      <main className={`main-content ${immersiveMode ? 'immersive-session-content' : ''}`} id="main-content">
        {!immersiveMode && <div className="mobile-topbar">
          <NavLink className="brand" to="/today" aria-label="KEEP AT IT — на главную"><span className="brand-mark"><Zap size={17} fill="currentColor" /></span><span>KEEP <span>AT IT</span></span></NavLink>
          <div className="mobile-account-actions">
            <div className="mobile-points" aria-label={formatRuCount(points, 'point')}><Star size={15} fill="currentColor" aria-hidden="true" /> {points}</div>
            <NavLink
              className={`mobile-account-control ${accountUser ? 'signed-in' : 'guest'}`}
              to={accountUser ? '/settings' : '/login'}
              aria-label={accountUser ? profileLabel : 'Войти и включить синхронизацию'}
            >
              {accountUser && account.photoURL
                ? <img src={account.photoURL} alt="" />
                : <UserRound size={20} aria-hidden="true" />}
              <i className={`profile-sync-indicator ${account.sync.tone}`} aria-hidden="true" />
            </NavLink>
          </div>
        </div>}
        <div className={immersiveMode ? 'session-page-container' : 'page-container'}>
          {!immersiveMode && requiresEmailVerification && (
            <div className="email-verification-banner" role="status" aria-live="polite">
              <span className="email-verification-icon" aria-hidden="true"><MailCheck size={18} /></span>
              <p><strong>Подтвердите email</strong><span>для облачной синхронизации</span></p>
              <NavLink className="email-verification-link" to="/settings">Открыть</NavLink>
            </div>
          )}
          {children}
        </div>
      </main>

      {!immersiveMode && <nav className="mobile-nav" aria-label="Мобильная навигация">
        {MOBILE_NAV_ITEMS.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="mobile-nav-icon"><Icon size={21} />{to === '/plan' && missedCount > 0 && <i />}</span><span>{short}</span>
          </NavLink>
        ))}
      </nav>}
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
