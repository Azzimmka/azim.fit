import { Bell, Database, Download, Info, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react';
import { NotificationPermissionButton } from '../../reminders/NotificationPermissionButton.jsx';
import { PageHeader } from '../layout/AppLayout.jsx';

export function SettingsPage({
  points,
  settings,
  onUpdateSettings,
  onNotificationPermissionChange,
  notificationControl,
  onLoadDemo,
  onReset,
  installControl,
  updateControl,
  storageStatus,
}) {
  return (
    <>
      <PageHeader eyebrow="Личное приложение" title="Настройки" points={points} />
      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-title"><Bell /><div><h2>Напоминания</h2><p>Работают, пока приложение активно</p></div></div>
          <label className="field"><span>Напоминать по умолчанию</span><select value={settings.defaultReminder ?? 'off'} onChange={(event) => onUpdateSettings({ defaultReminder: event.target.value === 'off' ? null : Number(event.target.value) })}><option value="off">Выключено</option><option value="0">Вовремя</option><option value="5">За 5 минут</option><option value="15">За 15 минут</option><option value="30">За 30 минут</option><option value="60">За 60 минут</option></select></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.includeWorkoutTitleInNotifications} onChange={(event) => onUpdateSettings({ includeWorkoutTitleInNotifications: event.target.checked })} /><span><strong>Показывать название</strong><small>Иначе уведомление будет нейтральным</small></span></label>
          {notificationControl ?? <NotificationPermissionButton className="settings-action notification-permission" onChange={onNotificationPermissionChange} />}
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Smartphone /><div><h2>Приложение</h2><p>Установка и обновления PWA</p></div></div>
          {installControl || <div className="settings-info"><Download size={18} /><span>Откройте меню браузера и выберите установку приложения.</span></div>}
          {updateControl}
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Database /><div><h2>Локальные данные</h2><p>Хранятся только на этом устройстве</p></div></div>
          <div className="settings-info"><ShieldCheck size={18} /><span>{storageStatus === 'persisted' ? 'Браузер подтвердил устойчивое хранение.' : storageStatus === 'denied' ? 'Браузер не гарантирует защиту данных от очистки.' : 'Защита хранилища будет запрошена после первого сохранения.'}</span></div>
          <div className="settings-actions"><button type="button" className="secondary-button" onClick={onLoadDemo}>Загрузить демо</button><button type="button" className="secondary-button danger-outline" onClick={onReset}><RotateCcw size={17} aria-hidden="true" /> Очистить данные</button></div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Info /><div><h2>Ограничение PWA</h2><p>Без сервера браузер не обязан будить полностью закрытое приложение.</p></div></div>
          <p className="settings-copy">AZIM.FIT напомнит о тренировке, пока вкладка или установленная PWA активна. После следующего открытия пропущенные тренировки будут показаны отдельным баннером.</p>
        </section>
      </div>
    </>
  );
}
