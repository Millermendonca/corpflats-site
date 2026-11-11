// ══════════════════════════════════════════════════════════════════════════════
// CorpFlats / Guest Flow Manager — Service Worker v4
// Native RFC 8291 Web Push + Android Expandable Grouping + Modo Rádio Bridge
// ══════════════════════════════════════════════════════════════════════════════

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Monta e exibe notificação com agrupamento expansível estilo WhatsApp no Android:
 * 1) Conversas de WhatsApp da mesma pessoa acumulam linha por linha no mesmo card expansível (BigTextStyle).
 * 2) Conversas diferentes + alertas operacionais (check-outs, reservas, limpeza, OS) recebem tags próprias
 *    para o Android agrupar tudo automaticamente dentro de um único grupo recolhido do app CorpFlats
 *    que abre para baixo revelando todos os itens individualmente.
 */
async function handleIncomingPushPayload(data) {
  const isWhatsApp =
    data.category === "whatsapp" ||
    data.type === "whatsapp_message" ||
    Boolean(data.phone);
  const isRestockerCheckout =
    data.type === "restocker_checkout" ||
    Boolean(data.isRestockerCheckout) ||
    data.category === "checkout";

  const phone = String(data.phone || "").replace(/\D/g, "");
  const messageText = String(data.message || data.body || "Nova atualização no sistema.").trim();
  const baseTitle =
    data.title ||
    (isWhatsApp
      ? `💬 ${data.senderName || phone || "WhatsApp"}`
      : isRestockerCheckout && data.flatNumber
      ? `🔔 Check-out flat ${data.flatNumber}`
      : "🔔 CorpFlats");

  const targetUrl =
    data.targetUrl ||
    data.url ||
    (phone ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1` : "/notificacoes");

  let tag;
  let finalTitle = baseTitle;
  let finalBody = messageText;
  let stackedLines = [messageText];
  let msgCount = 1;
  let seenKeys = data.messageKey ? [String(data.messageKey)] : [];

  if (isWhatsApp && phone) {
    tag = `wa-chat-${phone}`;
    try {
      const existingList = await self.registration.getNotifications({ tag });
      if (existingList && existingList.length > 0) {
        const prev = existingList[0];
        const prevData = prev.data || {};
        const prevKeys = Array.isArray(prevData.seenKeys) ? prevData.seenKeys : [];

        // Evita empilhar a mesma mensagem duas vezes
        if (data.messageKey && prevKeys.includes(String(data.messageKey))) {
          return;
        }

        const prevLines = Array.isArray(prevData.lines) && prevData.lines.length > 0
          ? prevData.lines
          : prev.body
          ? [String(prev.body)]
          : [];
        const prevCount = Number(prevData.msgCount) || prevLines.length || 1;

        msgCount = prevCount + 1;
        stackedLines = [...prevLines, messageText].slice(-8);
        seenKeys = [...prevKeys, ...(data.messageKey ? [String(data.messageKey)] : [])].slice(-20);

        const cleanBase = String(prevData.baseTitle || baseTitle).replace(/\s*\(\d+\s*novas?\)\s*$/i, "");
        finalTitle = `${cleanBase} (${msgCount} novas)`;
        finalBody = stackedLines.map((line) => (line.startsWith("• ") ? line : `• ${line}`)).join("\n");
      }
    } catch {}
  } else {
    // Tags distintas por evento permitem que o Android empilhe todas em um único grupo expansível do app CorpFlats
    const uniqueSuffix = data.id
      ? String(data.id)
      : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    tag = isRestockerCheckout && data.flatNumber
      ? `gfm-checkout-${data.flatNumber}-${uniqueSuffix}`
      : `gfm-notif-${uniqueSuffix}`;
  }

  const options = {
    body: finalBody,
    icon: "/api/pwa/chat-icon.png?size=192&v=3",
    badge: "/api/pwa/notification-badge.png?v=3",
    vibrate: isRestockerCheckout
      ? [300, 120, 300, 120, 400]
      : isWhatsApp
      ? [180, 80, 180, 80, 240]
      : [240, 100, 240],
    tag,
    renotify: true,
    requireInteraction: Boolean(isRestockerCheckout),
    timestamp: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
    data: {
      id: data.id || null,
      url: targetUrl,
      phone: phone || null,
      isWhatsApp,
      isRestockerCheckout,
      flatNumber: data.flatNumber || null,
      baseTitle: baseTitle.replace(/\s*\(\d+\s*novas?\)\s*$/i, ""),
      lines: stackedLines,
      msgCount,
      seenKeys
    },
    actions: isWhatsApp && phone
      ? [
          { action: "open_chat", title: "💬 Responder" },
          { action: "mark_read", title: "✓ Marcar como Lida" }
        ]
      : isRestockerCheckout
      ? [{ action: "open", title: "🧊 Conferir Frigobar" }]
      : [{ action: "open", title: "Ver Detalhes" }]
  };

  // Notifica abas abertas / em segundo plano (dispara voz imediata no Modo Rádio da repositora + evita duplicata de polling)
  const broadcastPromise = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        try {
          client.postMessage({
            type: "GFM_PUSH_RECEIVED",
            payload: data
          });
        } catch {}
      }
    })
    .catch(() => {});

  const badgePromise =
    typeof self.navigator !== "undefined" &&
    typeof self.navigator.setAppBadge === "function" &&
    Number(data.unreadCount) > 0
      ? self.navigator.setAppBadge(Number(data.unreadCount)).catch(() => {})
      : Promise.resolve();

  await Promise.all([
    self.registration.showNotification(finalTitle, options),
    broadcastPromise,
    badgePromise
  ]);
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "🔔 CorpFlats", message: event.data.text() };
    }
  }
  event.waitUntil(handleIncomingPushPayload(data));
});

// Permite que o frontend limpe notificações acumuladas ao abrir uma conversa ou disparar notificação agrupada local
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "CLEAR_CHAT_NOTIFICATIONS" && msg.phone) {
    const cleanPhone = String(msg.phone).replace(/\D/g, "");
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `wa-chat-${cleanPhone}` })
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => {})
    );
  } else if (msg.type === "SHOW_GROUPED_NOTIFICATION" && msg.payload) {
    event.waitUntil(handleIncomingPushPayload(msg.payload));
  }
});

self.addEventListener("notificationclick", (event) => {
  const notifData = event.notification.data || {};
  const phone = notifData.phone;
  const targetUrl =
    notifData.url ||
    (phone ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1` : "/notificacoes");

  event.notification.close();

  // Ação rápida: Marcar conversa como lida direto da barra do Android sem abrir o app
  if (event.action === "mark_read" && phone) {
    event.waitUntil(
      fetch(`/api/whatsapp/chat/${encodeURIComponent(phone)}/read`, { method: "POST" })
        .then(() => {
          if (self.navigator && typeof self.navigator.clearAppBadge === "function") {
            return self.navigator.clearAppBadge().catch(() => {});
          }
        })
        .catch(() => {})
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ("focus" in client) {
          if (client.navigate) {
            client.navigate(targetUrl).catch(() => {});
          } else {
            client.postMessage({ type: "WA_OPEN_CONVERSATION", phone, url: targetUrl });
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
