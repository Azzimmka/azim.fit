/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

const APP_SHELL_URL = '/index.html';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL(APP_SHELL_URL), {
    denylist: [/^\/api(?:\/|$)/, /\/[^/?]+\.[^/]+$/],
  }),
);

// The new worker waits until the user confirms the update in the app UI.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

clientsClaim();
