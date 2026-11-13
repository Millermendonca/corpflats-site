// ══════════════════════════════════════════════════════════════════════════════
// CorpFlats / Guest Flow Manager — Service Worker v6
// Native RFC 8291 Web Push + Strict Category-Bucketed Grouping + Modo Rádio Bridge
// + Auto-Purge de Origem Legada (*.onrender.com) p/ Zero Duplicidade com corpflats.com.br
// ══════════════════════════════════════════════════════════════════════════════

const CANONICAL_PROD_ORIGIN = "https://corpflats.com.br";
const DEDUP_WINDOW_MS = 45000;
const recentEventFingerprints = new Map();
let originConfirmedThisSession = false;

const CATEGORY_BUCKETS = {
  whatsapp: {
    emoji: "💬",
    label: "WhatsApp",
    pluralUnit: "novas",
    defaultUrl: "/whatsapp-chat?standalone=1",
    actionLabel: "💬 Abrir WhatsApp"
  },
  shopping_list: {
    emoji: "🛒",
    label: "Lista de Compras",
    pluralUnit: "novos itens",
    defaultUrl: "/lista-compras",
    actionLabel: "🛒 Abrir Lista"
  },
  reservations: {
    emoji: "📅",
    label: "Reservas & Check-in",
    pluralUnit: "alertas",
    defaultUrl: "/reservas",
    actionLabel: "📅 Ver Reservas"
  },
  checkout: {
    emoji: "🚪",
    label: "Check-outs",
    pluralUnit: "saídas",
    defaultUrl: "/portaria",
    actionLabel: "🚪 Ver Check-outs"
  },
  cleaning: {
    emoji: "🧹",
    label: "Governança & Limpeza",
    pluralUnit: "alertas",
    defaultUrl: "/dashboard",
    actionLabel: "🧹 Ver Governança"
  },
  maintenance: {
    emoji: "🔧",
    label: "Manutenção & Achados",
    pluralUnit: "ocorrências",
    defaultUrl: "/ocorrencias",
    actionLabel: "🔧 Ver Ocorrências"
  },
  breakfast: {
    emoji: "🥐",
    label: "Café da Manhã",
    pluralUnit: "pedidos",
    defaultUrl: "/pedidos-cafe",
    actionLabel: "🥐 Ver Pedidos"
  },
  finance: {
    emoji: "💰",
    label: "Financeiro & Frigobar",
    pluralUnit: "alertas",
    defaultUrl: "/financeiro",
    actionLabel: "💰 Ver Financeiro"
  },
  system: {
    emoji: "⚙️",
    label: "Sistema & Alertas",
    pluralUnit: "alertas",
    defaultUrl: "/notificacoes",
    actionLabel: "⚙️ Ver Central"
  }
};

function resolveCategoryBucket(data) {
  if (data.groupBucket && CATEGORY_BUCKETS[data.groupBucket]) {
    return data.groupBucket;
  }
  const cat = String(data.category || "").toLowerCase().trim();
  const url = String(data.targetUrl || data.url || "").toLowerCase();
  const title = String(data.title || "").toLowerCase();

  if (cat === "whatsapp" || data.type === "whatsapp_message" || Boolean(data.phone) || url.includes("/whatsapp-chat")) {
    return "whatsapp";
  }
  if (
    cat === "shopping_list" ||
    url.includes("/lista-compras") ||
    title.includes("lista de compras") ||
    title.includes("🛒")
  ) {
    return "shopping_list";
  }
  if (
    data.type === "restocker_checkout" ||
    Boolean(data.isRestockerCheckout) ||
    ["checkout", "late_checkout", "minibar"].includes(cat)
  ) {
    return "checkout";
  }
  if (
    [
      "reservation",
      "reserva",
      "checkin",
      "pre_checkin",
      "early_checkin",
      "stay_extension",
      "sunday_upsell",
      "ota",
      "abandoned_cart",
      "guest_alert"
    ].includes(cat)
  ) {
    return "reservations";
  }
  if (["cleaning", "cleaning_alert", "cleaning_priority", "cleaning_info", "governanca"].includes(cat)) {
    return "cleaning";
  }
  if (["defect", "manutencao", "service_order", "lost_item", "nfc_card_replacement"].includes(cat)) {
    return "maintenance";
  }
  if (cat === "breakfast") {
    return "breakfast";
  }
  if (
    [
      "finance",
      "financial",
      "boleto_faturado",
      "boleto_reminder",
      "hospedagem_faturada",
      "consumo_faturado"
    ].includes(cat)
  ) {
    return "finance";
  }
  return "system";
}

function isLegacyRenderHost() {
  try {
    const host = String((self.location && self.location.hostname) || "").toLowerCase();
    return host === "onrender.com" || host.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

function isDuplicateRecentEvent(exactKeys, contentKey, source) {
  const now = Date.now();
  for (const [k, entry] of recentEventFingerprints.entries()) {
    if (now - entry.ts > DEDUP_WINDOW_MS) {
      recentEventFingerprints.delete(k);
    }
  }
  const validExact = exactKeys.filter(Boolean);
  for (const k of validExact) {
    const prev = recentEventFingerprints.get(k);
    if (prev && now - prev.ts <= DEDUP_WINDOW_MS) {
      return true;
    }
  }
  if (contentKey) {
    const prevContent = recentEventFingerprints.get(contentKey);
    if (prevContent && now - prevContent.ts <= DEDUP_WINDOW_MS && (prevContent.source !== source || validExact.length === 0)) {
      return true;
    }
    recentEventFingerprints.set(contentKey, { ts: now, source });
  }
  for (const k of validExact) {
    recentEventFingerprints.set(k, { ts: now, source });
  }
  return false;
}

async function purgeLegacyRenderPushSubscription() {
  try {
    const existing = await self.registration.getNotifications();
    for (const n of existing) {
      try {
        n.close();
      } catch {}
    }
  } catch {}

  try {
    if (self.registration && self.registration.pushManager) {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub && sub.endpoint) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, reason: "legacy_onrender_sw" })
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    }
  } catch {}
}

async function confirmCanonicalOriginOnce() {
  if (originConfirmedThisSession || isLegacyRenderHost()) return;
  originConfirmedThisSession = true;
  try {
    if (self.registration && self.registration.pushManager) {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub && sub.endpoint) {
        await fetch("/api/push/confirm-origin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            origin: self.location ? self.location.origin : CANONICAL_PROD_ORIGIN
          })
        }).catch(() => {});
      }
    }
  } catch {}
}

function stripLeadingEmoji(str) {
  return String(str || "")
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\s•\-:]+/gu, "")
    .trim();
}

function buildCompactCategoryLine(bucketKey, baseTitle, messageText, data) {
  if (bucketKey === "shopping_list") {
    return messageText;
  }
  if (bucketKey === "checkout" && data.flatNumber) {
    const cleanMsg = stripLeadingEmoji(messageText);
    return cleanMsg.toLowerCase().includes(String(data.flatNumber).toLowerCase())
      ? cleanMsg
      : `Flat ${data.flatNumber} — ${cleanMsg}`;
  }
  const cleanTitle = stripLeadingEmoji(baseTitle)
    .replace(/^corpflats\s*[•\-:]?\s*/i, "")
    .trim();
  const cleanMsg = String(messageText || "").trim();
  if (!cleanTitle || cleanMsg.toLowerCase().includes(cleanTitle.toLowerCase())) {
    return cleanMsg;
  }
  return `${cleanTitle}: ${cleanMsg}`.slice(0, 180);
}

function renderWhatsAppNotificationSpec(waEntries, unreadCount) {
  const uniquePhones = [];
  for (const e of waEntries) {
    const p = e.phone || e.senderShort || "chat";
    if (!uniquePhones.includes(p)) uniquePhones.push(p);
  }

  if (uniquePhones.length <= 1) {
    const first = waEntries[0] || {};
    const onlyPhone = first.phone || "";
    const senderHeader = first.fullTitle || `💬 ${first.senderShort || onlyPhone || "WhatsApp"}`;
    const cleanHeader = senderHeader.replace(/\s*\(\d+\s*novas?\)\s*$/i, "");
    const finalTitle = waEntries.length > 1 ? `${cleanHeader} (${waEntries.length} novas)` : cleanHeader;
    const finalBody =
      waEntries.length > 1
        ? waEntries.slice(-8).map((e) => `• ${e.text}`).join("\n")
        : first.text || "Nova mensagem recebida";
    const targetUrl = onlyPhone
      ? `/whatsapp-chat?phone=${encodeURIComponent(onlyPhone)}&standalone=1`
      : "/whatsapp-chat?standalone=1";

    return {
      finalTitle,
      finalBody,
      targetUrl,
      singlePhone: onlyPhone || null,
      actions: onlyPhone
        ? [
            { action: "open_chat", title: "💬 Responder" },
            { action: "mark_read", title: "✓ Marcar como Lida" }
          ]
        : [{ action: "open_chat", title: "💬 Abrir WhatsApp" }]
    };
  }

  const finalTitle = `💬 WhatsApp (${waEntries.length} novas • ${uniquePhones.length} conversas)`;
  const finalBody = waEntries
    .slice(-8)
    .map((e) => `• ${e.senderShort}: ${e.text}`)
    .join("\n");

  return {
    finalTitle,
    finalBody,
    targetUrl: "/whatsapp-chat?standalone=1&tab=unread",
    singlePhone: null,
    actions: [
      { action: "open_chat", title: "💬 Ver Conversas" },
      { action: "clear_category", title: "✓ Limpar" }
    ]
  };
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      if (isLegacyRenderHost()) {
        await purgeLegacyRenderPushSubscription();
      } else {
        await confirmCanonicalOriginOnce();
      }
    })()
  );
});

/**
 * Exibe e agrupa notificações separadas ESTRITAMENTE POR CATEGORIA:
 * - gfm-cat-whatsapp       -> Todas as conversas do WhatsApp juntas num único card expansível
 * - gfm-cat-shopping_list  -> Todos os itens da Lista de Compras juntos num único card expansível
 * - gfm-cat-reservations   -> Reservas, Pré Check-in e Entradas num único card expansível
 * - gfm-cat-checkout       -> Saídas / Check-outs e Frigobar num único card expansível
 * - gfm-cat-cleaning       -> Governança & Limpeza num único card expansível
 * - gfm-cat-maintenance    -> Manutenção, Ordens de Serviço e Achados num único card expansível
 * - gfm-cat-breakfast      -> Pedidos de Café da Manhã num único card expansível
 * - gfm-cat-finance        -> Financeiro & Faturamento num único card expansível
 * - gfm-cat-system         -> Sistema & IA Sofia num único card expansível
 */
async function handleIncomingPushPayload(data, source = "push") {
  if (isLegacyRenderHost()) {
    await purgeLegacyRenderPushSubscription();
    return;
  }

  const bucketKey = resolveCategoryBucket(data);
  const bucketMeta = CATEGORY_BUCKETS[bucketKey] || CATEGORY_BUCKETS.system;
  const isWhatsApp = bucketKey === "whatsapp";
  const isRestockerCheckout =
    data.type === "restocker_checkout" || Boolean(data.isRestockerCheckout);

  const phone = String(data.phone || "").replace(/\D/g, "");
  const messageText = String(data.message || data.body || "Nova atualização no sistema.").trim();
  const baseTitle =
    data.title ||
    (isWhatsApp
      ? `💬 ${data.senderName || phone || "WhatsApp"}`
      : isRestockerCheckout && data.flatNumber
      ? `🔔 Check-out flat ${data.flatNumber}`
      : `${bucketMeta.emoji} ${bucketMeta.label}`);

  const exactDedupKeys = [
    data.id ? `id:${data.id}` : "",
    data.messageKey ? `key:${data.messageKey}` : ""
  ];
  const contentKey = isWhatsApp && phone
    ? `wa:${phone}:${messageText.slice(0, 120)}`
    : `cat:${bucketKey}:${baseTitle}:${messageText.slice(0, 120)}`;
  if (!data.isTest && isDuplicateRecentEvent(exactDedupKeys, contentKey, source)) {
    return;
  }

  const itemUrl =
    data.targetUrl ||
    data.url ||
    (isWhatsApp && phone
      ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1`
      : isRestockerCheckout
      ? "/frigobar-reposicao"
      : bucketMeta.defaultUrl);

  const tag = `gfm-cat-${bucketKey}`;
  let finalTitle = baseTitle;
  let finalBody = messageText;
  let targetUrl = itemUrl;
  let actions = [{ action: "open", title: bucketMeta.actionLabel }];
  let notifDataPayload = {};

  let prevData = {};
  try {
    const existingList = await self.registration.getNotifications({ tag });
    if (existingList && existingList.length > 0) {
      prevData = existingList[0].data || {};
    }
  } catch {}

  const prevKeys = Array.isArray(prevData.seenKeys) ? prevData.seenKeys : [];
  const prevIds = Array.isArray(prevData.seenIds) ? prevData.seenIds : [];
  if (
    !data.isTest &&
    ((data.messageKey && prevKeys.includes(String(data.messageKey))) ||
      (data.id && prevIds.includes(String(data.id))))
  ) {
    return;
  }

  const seenKeys = [...prevKeys, ...(data.messageKey ? [String(data.messageKey)] : [])].slice(-30);
  const seenIds = [...prevIds, ...(data.id ? [String(data.id)] : [])].slice(-30);

  if (isWhatsApp) {
    const senderShort =
      stripLeadingEmoji(data.senderName || baseTitle)
        .replace(/^whatsapp:\s*/i, "")
        .replace(/\s*\(\d+\s*novas?\)\s*$/i, "")
        .trim() ||
      phone ||
      "Contato";
    const fullTitle = baseTitle.startsWith("💬") ? baseTitle : `💬 ${senderShort}`;

    const prevEntries = Array.isArray(prevData.waEntries) ? prevData.waEntries : [];
    const waEntries = [
      ...prevEntries,
      {
        phone,
        senderShort,
        fullTitle,
        text: messageText,
        key: data.messageKey ? String(data.messageKey) : null,
        id: data.id ? String(data.id) : null
      }
    ].slice(-15);

    const spec = renderWhatsAppNotificationSpec(waEntries, data.unreadCount);
    finalTitle = spec.finalTitle;
    finalBody = spec.finalBody;
    targetUrl = spec.targetUrl;
    actions = spec.actions;
    notifDataPayload = {
      bucketKey,
      isWhatsApp: true,
      phone: spec.singlePhone,
      url: targetUrl,
      waEntries,
      lines: waEntries.slice(-8).map((e) => e.text),
      msgCount: waEntries.length,
      seenKeys,
      seenIds
    };
  } else {
    const prevCatEntries = Array.isArray(prevData.catEntries) ? prevData.catEntries : [];
    const compactLine = buildCompactCategoryLine(bucketKey, baseTitle, messageText, data);
    const catEntries = [
      ...prevCatEntries,
      {
        line: compactLine,
        title: baseTitle,
        url: itemUrl,
        flatNumber: data.flatNumber || null
      }
    ].slice(-12);

    const prevWasRestocker = Boolean(prevData.isRestockerCheckout);
    const effectiveRestocker = isRestockerCheckout || prevWasRestocker;

    if (catEntries.length === 1) {
      finalTitle = baseTitle.startsWith(bucketMeta.emoji) || effectiveRestocker
        ? baseTitle
        : `${bucketMeta.emoji} ${baseTitle}`;
      finalBody = messageText;
      targetUrl = itemUrl;
    } else {
      const groupHeader = effectiveRestocker
        ? `🔔 Check-outs p/ Frigobar (${catEntries.length} flats)`
        : `${bucketMeta.emoji} ${bucketMeta.label} (${catEntries.length} ${bucketMeta.pluralUnit})`;
      finalTitle = groupHeader;
      finalBody = catEntries
        .slice(-8)
        .map((e) => (e.line.startsWith("• ") ? e.line : `• ${e.line}`))
        .join("\n");
      targetUrl = effectiveRestocker ? "/frigobar-reposicao" : bucketMeta.defaultUrl;
    }

    actions = effectiveRestocker
      ? [{ action: "open", title: "🧊 Conferir Frigobar" }]
      : [
          { action: "open", title: bucketMeta.actionLabel },
          { action: "clear_category", title: "✓ Limpar" }
        ];

    notifDataPayload = {
      id: data.id || null,
      bucketKey,
      isWhatsApp: false,
      isRestockerCheckout: effectiveRestocker,
      flatNumber: data.flatNumber || null,
      url: targetUrl,
      catEntries,
      lines: catEntries.slice(-8).map((e) => e.line),
      msgCount: catEntries.length,
      seenKeys,
      seenIds
    };
  }

  const options = {
    body: finalBody,
    icon: `/api/pwa/category-icon.png?cat=${encodeURIComponent(bucketKey)}&size=192&v=1`,
    badge: "/api/pwa/notification-badge.png?v=3",
    vibrate: isRestockerCheckout
      ? [300, 120, 300, 120, 400]
      : isWhatsApp
      ? [180, 80, 180, 80, 240]
      : [220, 90, 220],
    tag,
    renotify: true,
    requireInteraction: Boolean(notifDataPayload.isRestockerCheckout),
    timestamp: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
    data: notifDataPayload,
    actions
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
    badgePromise,
    confirmCanonicalOriginOnce()
  ]);
}

self.addEventListener("push", (event) => {
  if (isLegacyRenderHost()) {
    event.waitUntil(
      (async () => {
        try {
          await self.registration.showNotification(" ", {
            tag: "gfm-legacy-cleanup",
            silent: true
          });
        } catch {}
        await purgeLegacyRenderPushSubscription();
      })()
    );
    return;
  }

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "🔔 CorpFlats", message: event.data.text() };
    }
  }
  event.waitUntil(handleIncomingPushPayload(data, "push"));
});

// Permite que o frontend limpe notificações por conversa ou por categoria inteira
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "CLEAR_CHAT_NOTIFICATIONS" && msg.phone) {
    const cleanPhone = String(msg.phone).replace(/\D/g, "");
    event.waitUntil(
      (async () => {
        try {
          // Limpa eventual tag antiga por telefone
          const oldList = await self.registration.getNotifications({ tag: `wa-chat-${cleanPhone}` });
          oldList.forEach((n) => n.close());
        } catch {}
        try {
          // Atualiza ou fecha o card unificado da categoria WhatsApp
          const catList = await self.registration.getNotifications({ tag: "gfm-cat-whatsapp" });
          if (catList && catList.length > 0) {
            const current = catList[0];
            const prevData = current.data || {};
            const prevEntries = Array.isArray(prevData.waEntries) ? prevData.waEntries : [];
            const remaining = prevEntries.filter((e) => e.phone !== cleanPhone);
            if (remaining.length === 0) {
              current.close();
            } else if (remaining.length !== prevEntries.length) {
              const spec = renderWhatsAppNotificationSpec(remaining, remaining.length);
              await self.registration.showNotification(spec.finalTitle, {
                body: spec.finalBody,
                icon: "/api/pwa/category-icon.png?cat=whatsapp&size=192&v=1",
                badge: "/api/pwa/notification-badge.png?v=3",
                tag: "gfm-cat-whatsapp",
                renotify: false,
                silent: true,
                data: {
                  ...prevData,
                  phone: spec.singlePhone,
                  url: spec.targetUrl,
                  waEntries: remaining,
                  lines: remaining.slice(-8).map((e) => e.text),
                  msgCount: remaining.length
                },
                actions: spec.actions
              });
            }
          }
        } catch {}
      })()
    );
  } else if (msg.type === "CLEAR_CATEGORY_NOTIFICATIONS" && msg.bucket) {
    const bucket = String(msg.bucket).trim();
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `gfm-cat-${bucket}` })
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => {})
    );
  } else if (msg.type === "SHOW_GROUPED_NOTIFICATION" && msg.payload) {
    event.waitUntil(handleIncomingPushPayload(msg.payload, "local_poll"));
  }
});

self.addEventListener("notificationclick", (event) => {
  const notifData = event.notification.data || {};
  const phone = notifData.phone;
  const targetUrl =
    notifData.url ||
    (phone ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1` : "/notificacoes");

  event.notification.close();

  if (event.action === "clear_category") {
    return;
  }

  if (isLegacyRenderHost()) {
    const canonicalDestination = `${CANONICAL_PROD_ORIGIN}${targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`}`;
    event.waitUntil(
      (async () => {
        await purgeLegacyRenderPushSubscription();
        if (self.clients.openWindow) {
          return self.clients.openWindow(canonicalDestination);
        }
      })()
    );
    return;
  }

  // Ação rápida: Marcar conversa única como lida direto da barra do Android sem abrir o app
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
