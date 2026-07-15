import { usePwaInstall } from './usePwaInstall.js';

export function PwaInstallPrompt({ className = 'pwa-install-prompt' }) {
  const {
    canInstall,
    dismiss,
    install,
    isStandalone,
    outcome,
    showIOSInstructions,
  } = usePwaInstall();

  if (isStandalone || outcome === 'dismissed') return null;

  if (showIOSInstructions) {
    return (
      <aside className={className} aria-labelledby="pwa-install-title">
        <div>
          <strong id="pwa-install-title">Добавить KEEP AT IT на экран «Домой»</strong>
          <p>В Safari нажмите «Поделиться», затем «На экран Домой».</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Скрыть инструкцию по установке">
          Позже
        </button>
      </aside>
    );
  }

  if (!canInstall) return null;

  return (
    <aside className={className} aria-live="polite" aria-labelledby="pwa-install-title">
      <div>
        <strong id="pwa-install-title">Установить KEEP AT IT</strong>
        <p>Тренировки останутся доступны с домашнего экрана и без сети.</p>
      </div>
      <div>
        <button type="button" onClick={dismiss}>Позже</button>
        <button type="button" onClick={() => void install()}>Установить</button>
      </div>
    </aside>
  );
}
