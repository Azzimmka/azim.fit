import { useCallback, useEffect, useState } from 'react';

const listeners = new Set();
let workbox;
let registration;
let registrationPromise;
let reloadAfterControl = false;

let pwaState = {
  error: null,
  needRefresh: false,
  offlineReady: false,
  registered: false,
};

const publish = (patch) => {
  pwaState = { ...pwaState, ...patch };
  listeners.forEach((listener) => listener(pwaState));
};

const subscribe = (listener) => {
  listeners.add(listener);
  listener(pwaState);
  return () => listeners.delete(listener);
};

export async function registerPwa() {
  if (!globalThis.navigator?.serviceWorker) return undefined;
  if (registrationPromise) return registrationPromise;

  registrationPromise = import('workbox-window')
    .then(({ Workbox }) => {
      workbox = new Workbox('/sw.js', { scope: '/' });

      workbox.addEventListener('installed', (event) => {
        if (!event.isUpdate) publish({ offlineReady: true });
      });
      workbox.addEventListener('waiting', () => publish({ needRefresh: true }));
      workbox.addEventListener('externalwaiting', () => publish({ needRefresh: true }));
      workbox.addEventListener('controlling', () => {
        if (reloadAfterControl) globalThis.location?.reload();
      });
      workbox.addEventListener('redundant', () => {
        publish({ error: new Error('Не удалось активировать обновление приложения.') });
      });

      return workbox.register().then((nextRegistration) => {
        registration = nextRegistration;
        publish({
          needRefresh: Boolean(nextRegistration?.waiting),
          registered: Boolean(nextRegistration),
        });
        return nextRegistration;
      });
    })
    .catch((error) => {
      registrationPromise = undefined;
      publish({ error });
      return undefined;
    });

  return registrationPromise;
}

export function usePwaUpdate() {
  const [state, setState] = useState(pwaState);

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    void registerPwa();
    return unsubscribe;
  }, []);

  const applyUpdate = useCallback(async () => {
    const activeRegistration = registration ?? await registerPwa();
    if (!activeRegistration?.waiting) return false;

    reloadAfterControl = true;
    if (workbox) workbox.messageSkipWaiting();
    else activeRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }, []);

  const checkForUpdate = useCallback(async () => {
    const activeRegistration = registration ?? await registerPwa();
    await activeRegistration?.update?.();
  }, []);

  const dismissOfflineReady = useCallback(() => publish({ offlineReady: false }), []);
  const dismissUpdate = useCallback(() => publish({ needRefresh: false }), []);

  return {
    ...state,
    applyUpdate,
    checkForUpdate,
    dismissOfflineReady,
    dismissUpdate,
  };
}
