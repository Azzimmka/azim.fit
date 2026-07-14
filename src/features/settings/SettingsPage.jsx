import { Database, Download, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react';
import { PageHeader } from '../layout/AppLayout.jsx';

export function SettingsPage({
  points,
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
          <div className="settings-card-title"><Smartphone /><div><h2>Приложение</h2><p>Установка и обновления PWA</p></div></div>
          {installControl || <div className="settings-info"><Download size={18} /><span>Откройте меню браузера и выберите установку приложения.</span></div>}
          {updateControl}
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><Database /><div><h2>Локальные данные</h2><p>Хранятся только на этом устройстве</p></div></div>
          <div className="settings-info"><ShieldCheck size={18} /><span>{storageStatus === 'persisted' ? 'Браузер подтвердил устойчивое хранение.' : storageStatus === 'denied' ? 'Браузер не гарантирует защиту данных от очистки.' : 'Защита хранилища будет запрошена после первого сохранения.'}</span></div>
          <div className="settings-actions"><button type="button" className="secondary-button" onClick={onLoadDemo}>Загрузить демо</button><button type="button" className="secondary-button danger-outline" onClick={onReset}><RotateCcw size={17} aria-hidden="true" /> Очистить данные</button></div>
        </section>
      </div>
    </>
  );
}
