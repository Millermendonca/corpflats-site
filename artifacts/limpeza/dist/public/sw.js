// Guest Flow Manager & CF WhatsApp - Service Worker for Native Web Push & WhatsApp-Style Notifications
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
      data = { title: 'CorpFlats WhatsApp', message: event.data.text() };
    }
  }

  const isWhatsApp = data.category === 'whatsapp' || data.type === 'whatsapp_message' || Boolean(data.phone);
  const phone = data.phone || '';
  const title = data.title || (isWhatsApp ? '💬 Nova Mensagem WhatsApp' : '🔔 Notificação Hotel');
  const targetUrl = data.targetUrl || data.url || (phone ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1` : '/notificacoes');

  const options = {
    body: data.message || data.body || 'Nova mensagem recebida.',
    icon: isWhatsApp ? '/api/pwa/chat-icon.png?size=192' : '/favicon.svg',
    badge: isWhatsApp ? '/api/pwa/chat-icon.png?size=192' : '/favicon.svg',
    vibrate: isWhatsApp ? [180, 80, 180, 80, 240] : [300, 100, 300],
    tag: phone ? `wa-chat-${phone}` : (data.id ? `notif-${data.id}` : 'gfm-notif'),
    renotify: true,
    requireInteraction: isWhatsApp,
    data: {
      url: targetUrl,
      phone: phone || null,
      isWhatsApp
    },
    actions: isWhatsApp
      ? [
          { action: 'open_chat', title: '💬 Responder' },
          { action: 'mark_read', title: '✓ Marcar como Lida' }
        ]
      : [
          { action: 'open', title: 'Ver Alerta' }
        ]
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      typeof self.navigator !== 'undefined' && self.navigator.setAppBadge && data.unreadCount
        ? self.navigator.setAppBadge(Number(data.unreadCount) || 1).catch(() => {})
        : Promise.resolve()
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  const notifData = event.notification.data || {};
  const phone = notifData.phone;
  const targetUrl = notifData.url || (phone ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1` : '/notificacoes');

  event.notification.close();

  // Ação rápida: Marcar como lida direto da barra de notificações do celular sem precisar abrir o app
  if (event.action === 'mark_read' && phone) {
    event.waitUntil(
      fetch(`/api/whatsapp/chat/${encodeURIComponent(phone)}/read`, { method: 'POST' })
        .then(() => {
          if (self.navigator && self.navigator.clearAppBadge) {
            return self.navigator.clearAppBadge().catch(() => {});
          }
        })
        .catch(() => {})
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prioriza focar uma janela que já esteja no WhatsApp Chat
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          if (client.navigate) {
            client.navigate(targetUrl);
          } else {
            client.postMessage({ type: 'WA_OPEN_CONVERSATION', phone, url: targetUrl });
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
