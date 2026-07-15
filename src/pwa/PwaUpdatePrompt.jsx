import { usePwaUpdate } from './usePwaUpdate.js';

export function PwaUpdatePrompt({ className = 'pwa-update-prompt' }) {
  const {
    applyUpdate,
    dismissOfflineReady,
    dismissUpdate,
    needRefresh,
    offlineReady,
  } = usePwaUpdate();

  if (needRefresh) {
    return (
      <aside className={className} role="alert" aria-labelledby="pwa-update-title">
        <div>
          <strong id="pwa-update-title">Доступно обновление</strong>
          <p>Обновите приложение, когда закончите вводить данные.</p>
        </div>
        <div>
          <button type="button" onClick={dismissUpdate}>Позже</button>
          <button type="button" onClick={() => void applyUpdate()}>Обновить</button>
        </div>
      </aside>
    );
  }

  if (!offlineReady) return null;

  return (
    <aside className={className} role="status" aria-live="polite">
      <p>KEEP AT IT готов работать без сети.</p>
      <button type="button" onClick={dismissOfflineReady}>Понятно</button>
    </aside>
  );
}
