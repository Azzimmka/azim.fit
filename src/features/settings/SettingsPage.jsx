import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  LogIn,
  LogOut,
  MailCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../layout/AppLayout.jsx';
import { AvatarPicker } from '../profile/AvatarPicker.jsx';
import { DEFAULT_AVATAR_ID } from '../profile/avatars.js';

function getSyncCopy(status) {
  if (status === 'connecting') return { Icon: RefreshCw, text: 'Подключаем облачные данные…', tone: 'syncing' };
  if (status === 'syncing') return { Icon: RefreshCw, text: 'Синхронизируем изменения…', tone: 'syncing' };
  if (status === 'synced') return { Icon: CheckCircle2, text: 'Данные синхронизированы', tone: 'synced' };
  if (status === 'offline') return { Icon: CloudOff, text: 'Offline — изменения отправятся позже', tone: 'offline' };
  if (status === 'verify-email') return { Icon: MailCheck, text: 'Подтвердите email для облачной синхронизации', tone: 'warning' };
  if (status === 'error') return { Icon: CloudOff, text: 'Не удалось синхронизировать данные', tone: 'error' };
  return { Icon: Cloud, text: 'Облачная синхронизация готова', tone: 'idle' };
}

export function SettingsPage({
  points,
  onLoadDemo,
  onReset,
  installControl,
  updateControl,
  storageStatus,
  authUser = null,
  authAvailable = true,
  syncStatus = 'local',
  syncError = '',
  avatarSettings = {},
  accountAvatar = null,
  verificationPending = false,
  onLogin,
  onLogout,
  onResendVerification,
  onCheckVerification,
  onAvatarChange,
}) {
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const syncCopy = getSyncCopy(syncStatus);
  const SyncIcon = syncCopy.Icon;
  const avatarSyncTone = syncStatus === 'synced'
    ? 'synced'
    : syncStatus === 'syncing' || syncStatus === 'connecting'
      ? 'syncing'
      : syncStatus === 'error'
        ? 'error'
        : 'local';
  const accountName = authUser?.displayName || authUser?.email || 'Аккаунт KEEP AT IT';
  const selectedAvatarId = avatarSettings.avatarId || accountAvatar?.avatarId || DEFAULT_AVATAR_ID;
  const avatarSource = avatarSettings.avatarSource
    || (accountAvatar?.kind === 'google' ? 'google' : 'generated');

  const selectAvatar = (nextAvatar) => {
    onAvatarChange?.(nextAvatar);
    setAvatarFeedback(nextAvatar.source === 'google'
      ? 'Используется фотография Google.'
      : 'Новый аватар выбран.');
  };

  return (
    <>
      <PageHeader eyebrow="Личное приложение" title="Настройки" points={points} />
      <div className="settings-grid">
        <section className="settings-card account-settings-card">
          <div className="settings-card-title"><UserRound /><div><h2>Аккаунт</h2><p>{authUser ? accountName : 'Локальный профиль без входа'}</p></div></div>
          {authUser ? (
            <>
              <div className="account-avatar-editor">
                <span className="account-avatar-preview">
                  {accountAvatar?.src
                    ? <img src={accountAvatar.src} alt="" />
                    : <UserRound size={28} aria-hidden="true" />}
                  <i className={`profile-sync-indicator ${avatarSyncTone}`} aria-hidden="true" />
                </span>
                <div>
                  <strong>{accountName}</strong>
                  <small>{authUser.email}</small>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  aria-expanded={avatarPickerOpen}
                  onClick={() => setAvatarPickerOpen((open) => !open)}
                >
                  {avatarPickerOpen ? 'Скрыть' : 'Изменить аватар'}
                </button>
              </div>
              {avatarPickerOpen && (
                <AvatarPicker
                  value={selectedAvatarId}
                  source={avatarSource}
                  googlePhotoURL={authUser.photoURL || ''}
                  onChange={selectAvatar}
                />
              )}
              <p className="avatar-save-feedback" role="status" aria-live="polite">{avatarFeedback}</p>
              <div className={`settings-info sync-state ${syncCopy.tone}`} role="status">
                <SyncIcon size={18} className={syncStatus === 'syncing' ? 'spin' : undefined} />
                <span>{syncCopy.text}{syncError ? `: ${syncError}` : ''}</span>
              </div>
              {!authUser.emailVerified && (
                <div className="verification-actions" aria-busy={verificationPending}>
                  <button type="button" className="primary-button settings-full-button" onClick={onCheckVerification} disabled={verificationPending}>
                    <CheckCircle2 size={17} aria-hidden="true" /> Проверить подтверждение
                  </button>
                  <button type="button" className="secondary-button settings-full-button" onClick={onResendVerification} disabled={verificationPending}>
                    <MailCheck size={17} aria-hidden="true" /> Отправить письмо ещё раз
                  </button>
                </div>
              )}
              <button type="button" className="secondary-button danger-outline settings-full-button" onClick={onLogout}>
                <LogOut size={17} aria-hidden="true" /> Выйти из аккаунта
              </button>
            </>
          ) : (
            <>
              <div className="settings-info"><ShieldCheck size={18} /><span>Тренировки работают offline и остаются на этом устройстве.</span></div>
              <button type="button" className="primary-button settings-full-button" onClick={onLogin} disabled={!authAvailable}>
                <LogIn size={17} aria-hidden="true" /> {authAvailable ? 'Войти и включить синхронизацию' : 'Firebase не настроен'}
              </button>
            </>
          )}
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Smartphone /><div><h2>Приложение</h2><p>Установка и обновления PWA</p></div></div>
          {installControl || <div className="settings-info"><Download size={18} /><span>Откройте меню браузера и выберите установку приложения.</span></div>}
          {updateControl}
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Database /><div><h2>Данные</h2><p>{authUser?.emailVerified ? 'Локальный кэш и Cloud Firestore' : 'Хранятся на этом устройстве'}</p></div></div>
          <div className="settings-info"><ShieldCheck size={18} /><span>{storageStatus === 'persisted' ? 'Браузер подтвердил устойчивое хранение.' : storageStatus === 'denied' ? 'Браузер не гарантирует защиту данных от очистки.' : 'Защита хранилища будет запрошена после первого сохранения.'}</span></div>
          <div className="settings-actions"><button type="button" className="secondary-button" onClick={onLoadDemo}>Загрузить демо</button><button type="button" className="secondary-button danger-outline" onClick={onReset}><RotateCcw size={17} aria-hidden="true" /> Очистить данные</button></div>
        </section>
      </div>
    </>
  );
}
