// Guest Flow Manager - Service Worker for Native Web Push & Browser Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Guest Flow Manager', message: event.data.text() };
    }
  }

  const title = data.title || '🔔 Notificação Hotel';
  const options = {
    body: data.message || data.body || 'Novo alerta no sistema.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [300, 100, 300],
    tag: data.id ? `notif-${data.id}` : 'gfm-notif',
    renotify: true,
    data: {
      url: data.targetUrl || data.url || '/notificacoes'
    },
    actions: [
      { action: 'open', title: 'Ver Alerta' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/notificacoes';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          if (client.navigate) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
