/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache static assets (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching: API requests use NetworkFirst strategy
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 5, // 5 minutes
      }),
    ],
  }),
);

// ── Push Notification Handlers ───────────────────────────────────────

self.addEventListener('push', (event) => {
  let data: Record<string, string> = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Non-JSON payload — use text as body
    data = { title: 'Hammoc', body: event.data?.text() || '' };
  }
  const { title, body, icon, badge, tag, url } = data;

  event.waitUntil(
    self.registration.showNotification(title || 'Hammoc', {
      body: body || '',
      icon: icon || '/favicon-192.png',
      badge: badge || '/favicon-192.png',
      tag: tag || 'hammoc-notification',
      data: { url },
    } as NotificationOptions & { vibrate?: number[] }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if available
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    }),
  );
});
