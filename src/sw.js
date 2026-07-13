/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

const APP_SHELL_URL = '/index.html';
const DEFAULT_NOTIFICATION_URL = '/today';

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

const sameOriginPath = (candidate) => {
  try {
    const url = new URL(candidate || DEFAULT_NOTIFICATION_URL, self.location.origin);
    return url.origin === self.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : DEFAULT_NOTIFICATION_URL;
  } catch {
    return DEFAULT_NOTIFICATION_URL;
  }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const workoutId = event.notification.data?.workoutId;
  const requestedUrl = event.notification.data?.url
    || (workoutId ? `/workouts/${encodeURIComponent(workoutId)}` : DEFAULT_NOTIFICATION_URL);
  const targetPath = sameOriginPath(requestedUrl);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const exactClient = windowClients.find((client) => client.url === targetUrl);
    if (exactClient) {
      return exactClient.focus();
    }

    const appClient = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
    if (appClient) {
      if ('navigate' in appClient) {
        await appClient.navigate(targetPath);
      }
      return appClient.focus();
    }

    return self.clients.openWindow(targetPath);
  })());
});
