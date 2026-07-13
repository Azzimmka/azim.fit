import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestPersistentStorage } from './persistence.js';

export const isIOSDevice = (navigatorLike = globalThis.navigator) => {
  if (!navigatorLike) return false;
  const agent = navigatorLike.userAgent || '';
  const platform = navigatorLike.platform || '';
  return /iPad|iPhone|iPod/i.test(agent)
    || (platform === 'MacIntel' && Number(navigatorLike.maxTouchPoints) > 1);
};

export const isStandaloneDisplay = (windowLike = globalThis.window, navigatorLike = globalThis.navigator) =>
  Boolean(
    navigatorLike?.standalone
    || windowLike?.matchMedia?.('(display-mode: standalone)').matches,
  );

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [outcome, setOutcome] = useState('idle');
  const [error, setError] = useState(null);
  const [standalone, setStandalone] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    if (!globalThis.window) return undefined;

    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const updateStandalone = () => setStandalone(isStandaloneDisplay());
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
      setOutcome('available');
    };
    const handleInstalled = () => {
      setPromptEvent(null);
      setOutcome('installed');
      setStandalone(true);
      void requestPersistentStorage();
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode?.addEventListener?.('change', updateStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode?.removeEventListener?.('change', updateStandalone);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return { outcome: 'unavailable' };

    setError(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      const nextOutcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      setPromptEvent(null);
      setOutcome(nextOutcome);
      if (nextOutcome === 'accepted') {
        void requestPersistentStorage();
      }
      return choice ?? { outcome: nextOutcome };
    } catch (installError) {
      setError(installError);
      setOutcome('error');
      return { outcome: 'error', error: installError };
    }
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    setPromptEvent(null);
    setOutcome('dismissed');
  }, []);

  const ios = useMemo(() => isIOSDevice(), []);

  return {
    canInstall: Boolean(promptEvent) && !standalone,
    dismiss,
    error,
    install,
    isIOS: ios,
    isStandalone: standalone,
    outcome,
    showIOSInstructions: ios && !standalone,
  };
}
