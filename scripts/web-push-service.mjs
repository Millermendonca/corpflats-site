// ══════════════════════════════════════════════════════════════════════════════
// CorpFlats / Guest Flow Manager — Native RFC 8291 & RFC 8292 Web Push Service
// ══════════════════════════════════════════════════════════════════════════════
// Implementação 100% nativa via node:crypto (sem dependências externas):
// - Geração e persistência automática de chaves VAPID (ECDSA P-256 / prime256v1)
// - Assinatura JWT ES256 (RFC 8292) com codificação IEEE P1363
// - Criptografia de payload aes128gcm (RFC 8291 + RFC 8188) via ECDH + HKDF-SHA256
// - Roteamento estrito por perfil de usuário (anserve_repositora, camareira, recepcao, admin, dev)
// - Limpeza automática de inscrições expiradas (HTTP 404 / 410)
// - Cache leve em RAM de áudio TTS pt-BR para reprodução em tela bloqueada (Modo Rádio)

import crypto from "crypto";

const MAX_PUSH_SUBSCRIPTIONS = 250;
const DEFAULT_VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@corpflats.com.br";
const PUSH_HTTP_TIMEOUT_MS = 10000;
const TTS_CACHE_MAX_ITEMS = 120;

// Cache LRU em memória para clipes curtos de voz ("Check-out flat 1004") em tela bloqueada
const checkoutTtsAudioCache = new Map();

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function fromBase64Url(str) {
  const clean = String(str || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  return Buffer.from(clean + pad, "base64");
}

/**
 * Gera um novo par de chaves VAPID P-256 compatível com todos os navegadores
 * (Chrome/FCM, Safari/APNs iOS 16.4+, Edge, Firefox).
 */
export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1"
  });

  const pubJwk = publicKey.export({ format: "jwk" });
  const privJwk = privateKey.export({ format: "jwk" });

  const xBuf = fromBase64Url(pubJwk.x);
  const yBuf = fromBase64Url(pubJwk.y);
  const uncompressedPublic = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);

  return {
    publicKey: toBase64Url(uncompressedPublic),
    privateKey: privJwk.d,
    jwk: privJwk,
    createdAt: new Date().toISOString()
  };
}

/**
 * Reconstrói o JWK privado P-256 caso as chaves venham apenas como strings base64url no .env
 */
function ensurePrivateKeyObject(vapidKeys) {
  if (vapidKeys?.jwk && vapidKeys.jwk.x && vapidKeys.jwk.y && vapidKeys.jwk.d) {
    return crypto.createPrivateKey({ key: vapidKeys.jwk, format: "jwk" });
  }
  const pubBuf = fromBase64Url(vapidKeys.publicKey);
  if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
    throw new Error("Chave pública VAPID inválida (esperado ponto P-256 não comprimido de 65 bytes).");
  }
  const x = toBase64Url(pubBuf.subarray(1, 33));
  const y = toBase64Url(pubBuf.subarray(33, 65));
  const d = toBase64Url(fromBase64Url(vapidKeys.privateKey));
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x, y, d },
    format: "jwk"
  });
}

/**
 * Obtém ou cria e persiste as chaves VAPID do servidor no banco (system_store / db).
 */
export function getOrCreateVapidKeys(db, saveDatabase) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
      jwk: null
    };
  }

  if (
    db &&
    db.webPushVapidKeys &&
    typeof db.webPushVapidKeys.publicKey === "string" &&
    typeof db.webPushVapidKeys.privateKey === "string" &&
    db.webPushVapidKeys.publicKey.length >= 80
  ) {
    return db.webPushVapidKeys;
  }

  const generated = generateVapidKeys();
  if (db) {
    db.webPushVapidKeys = generated;
    if (typeof saveDatabase === "function") {
      try {
        saveDatabase();
      } catch {}
    }
  }
  return generated;
}

/**
 * Cria cabeçalho VAPID RFC 8292 (ES256 JWT) para o endpoint do serviço Push.
 */
export function createVapidAuthHeader(endpoint, vapidKeys, subject = DEFAULT_VAPID_SUBJECT) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 horas

  const headerPart = toBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }), "utf8"));
  const payloadPart = toBase64Url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp,
        sub: subject
      }),
      "utf8"
    )
  );

  const unsignedToken = `${headerPart}.${payloadPart}`;
  const privateKeyObj = ensurePrivateKeyObject(vapidKeys);
  const signature = crypto.sign("sha256", Buffer.from(unsignedToken, "utf8"), {
    key: privateKeyObj,
    dsaEncoding: "ieee-p1363"
  });

  const jwt = `${unsignedToken}.${toBase64Url(signature)}`;
  return {
    authorization: `vapid t=${jwt}, k=${vapidKeys.publicKey}`,
    jwt
  };
}

/**
 * Criptografa payload JSON segundo RFC 8291 (Web Push Message Encryption)
 * utilizando Content-Encoding: aes128gcm (RFC 8188).
 */
export function encryptWebPushPayload(payloadInput, subscriptionKeys) {
  const plaintextBuf = Buffer.isBuffer(payloadInput)
    ? payloadInput
    : Buffer.from(typeof payloadInput === "string" ? payloadInput : JSON.stringify(payloadInput), "utf8");

  const uaPublic = fromBase64Url(subscriptionKeys?.p256dh || "");
  const authSecret = fromBase64Url(subscriptionKeys?.auth || "");

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("Chave p256dh da inscrição Web Push inválida.");
  }
  if (authSecret.length < 16) {
    throw new Error("Segredo auth da inscrição Web Push inválido.");
  }

  // Par efêmero ECDH do servidor de aplicação (as_public / as_private)
  const serverEcdh = crypto.createECDH("prime256v1");
  serverEcdh.generateKeys();
  const asPublic = serverEcdh.getPublicKey(); // 65 bytes não comprimido (0x04 || X || Y)
  const sharedSecret = serverEcdh.computeSecret(uaPublic); // 32 bytes

  const salt = crypto.randomBytes(16);

  // RFC 8291 §3.3: Derivação do IKM combinando ECDH e auth_secret
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "ascii"),
    uaPublic,
    asPublic
  ]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));

  // RFC 8188 §2.2 & §2.3: Derivação de CEK (16 bytes) e Nonce (12 bytes)
  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0", "ascii");
  const nonceInfo = Buffer.from("Content-Encoding: nonce\0", "ascii");
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, cekInfo, 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, nonceInfo, 12));

  // Registro único final: payload + delimitador 0x02 (RFC 8188 §2)
  const paddedRecord = Buffer.concat([plaintextBuf, Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const encryptedRecord = Buffer.concat([cipher.update(paddedRecord), cipher.final(), cipher.getAuthTag()]);

  // Cabeçalho binário aes128gcm (86 bytes): salt(16) + rs(4, uint32BE=4096) + idlen(1, 65) + keyid(65, asPublic)
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(4096, 0);
  const idLenBuf = Buffer.from([asPublic.length]);
  const header = Buffer.concat([salt, rsBuf, idLenBuf, asPublic]);

  return Buffer.concat([header, encryptedRecord]);
}

/**
 * Utilitário de descriptografia simétrica RFC 8291 (usado exclusivamente para validação em testes automatizados).
 */
export function decryptWebPushPayloadForTesting(encryptedBody, clientEcdh, authSecretBuf) {
  const salt = encryptedBody.subarray(0, 16);
  const idLen = encryptedBody[20];
  const asPublic = encryptedBody.subarray(21, 21 + idLen);
  const ciphertextWithTag = encryptedBody.subarray(21 + idLen);

  const uaPublic = clientEcdh.getPublicKey();
  const sharedSecret = clientEcdh.computeSecret(asPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "ascii"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecretBuf, keyInfo, 32));

  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "ascii"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "ascii"), 12));

  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(authTag);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Remove delimitador final 0x02 (e eventuais zeros de padding à direita)
  let endIdx = padded.length - 1;
  while (endIdx >= 0 && padded[endIdx] === 0x00) endIdx--;
  if (endIdx < 0 || padded[endIdx] !== 0x02) {
    throw new Error("Delimitador de registro RFC 8188 inválido.");
  }
  return padded.subarray(0, endIdx).toString("utf8");
}

/**
 * Dispara uma mensagem Web Push criptografada diretamente para o endpoint FCM/APNs/Mozilla.
 */
export async function sendWebPushMessage(subscription, payloadObj, vapidKeys, options = {}) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { ok: false, status: 0, expired: true, error: "Inscrição incompleta" };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ttlSeconds = Number.isFinite(options.ttl) ? options.ttl : 86400; // 24h de retenção p/ reconexão offline
  const urgency = options.urgency || "high"; // Acorda o Android em Doze Mode / tela bloqueada na hora

  let body;
  let authHeaders;
  try {
    const jsonStr = typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj);
    body = encryptWebPushPayload(jsonStr, subscription.keys);
    authHeaders = createVapidAuthHeader(subscription.endpoint, vapidKeys, options.subject || DEFAULT_VAPID_SUBJECT);
  } catch (err) {
    return { ok: false, status: 0, expired: false, error: err?.message || String(err) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, options.timeoutMs || PUSH_HTTP_TIMEOUT_MS);

  try {
    const res = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(body.length),
        TTL: String(ttlSeconds),
        Urgency: urgency,
        Authorization: authHeaders.authorization
      },
      body,
      signal: controller.signal
    });

    const status = res.status;
    const ok = status >= 200 && status < 300;
    const expired = status === 404 || status === 410;
    let errorText = "";
    if (!ok) {
      try {
        errorText = (await res.text()).slice(0, 200);
      } catch {}
    }
    return { ok, status, expired, error: ok ? null : errorText || `HTTP ${status}` };
  } catch (err) {
    return { ok: false, status: 0, expired: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sanitiza número do flat (ex: "Flat 1004" -> "1004")
 */
export function extractCleanFlatNumber(notification) {
  const metaFlat = notification?.metadata?.flatNumber;
  if (metaFlat !== undefined && metaFlat !== null && String(metaFlat).trim()) {
    return String(metaFlat)
      .trim()
      .replace(/^(?:apartamento|apto|apt|quarto|flat|uh|unidade)\b\.?\s*/i, "")
      .trim();
  }
  const combined = `${notification?.title || ""} ${notification?.message || ""}`;
  const m = combined.match(/(?:apartamento|apto|apt|quarto|flat|uh|unidade)\b\.?\s*([A-Za-z0-9\-]+)/i);
  return m ? m[1].trim() : "";
}

/**
 * Matriz estrita de permissões de recebimento de Web Push por perfil (role).
 * Garante que a repositora receba APENAS check-out/frigobar e nunca WhatsApp/reservas/admin.
 */
export function shouldRoleReceiveNotification(role, notification, subscriberUserId = null) {
  const normRole = String(role || "").toLowerCase().trim();
  if (!normRole || !notification) return false;

  // Se a notificação for direcionada especificamente a um usuário
  if (
    notification.metadata?.targetUserId !== undefined &&
    notification.metadata?.targetUserId !== null &&
    subscriberUserId !== null &&
    String(notification.metadata.targetUserId) !== String(subscriberUserId)
  ) {
    return false;
  }

  const category = String(notification.category || "general").toLowerCase().trim();

  // 1. Perfil Repositora: EXCLUSIVAMENTE check-out e frigobar
  if (normRole === "anserve_repositora") {
    return category === "checkout" || category === "minibar";
  }

  // 2. Perfil Gestor Anserve: check-out e frigobar
  if (normRole === "anserve_gestor") {
    return category === "checkout" || category === "minibar";
  }

  // 3. Perfil Camareira: governança, check-out, defeitos e achados/perdidos
  if (normRole === "camareira") {
    return [
      "checkout",
      "cleaning_alert",
      "cleaning_priority",
      "cleaning_info",
      "defect",
      "lost_item"
    ].includes(category);
  }

  // 4. Perfil Recepção / Portaria: toda a operação e WhatsApp (exceto erros internos de engenharia)
  if (normRole === "recepcao" || normRole === "reception") {
    return category !== "system_error";
  }

  // 5. Perfis Admin e Dev: visibilidade operacional completa
  if (normRole === "admin" || normRole === "dev") {
    return true;
  }

  return false;
}

/**
 * Monta o payload estruturado (< 3.5 KB) otimizado para agrupamento Android e Modo Rádio.
 */
export function buildPushPayloadForSubscriber(notification, subscriberRole, unreadCount = 1) {
  const normRole = String(subscriberRole || "").toLowerCase().trim();
  const category = String(notification?.category || "general").toLowerCase().trim();
  const meta = notification?.metadata || {};
  const flatNumber = extractCleanFlatNumber(notification);

  // Caso 1: Conversa do WhatsApp Corporativo (acumula mensagens por conversa no Android)
  if (category === "whatsapp") {
    const urlPhoneMatch = String(notification?.targetUrl || "").match(/phone=([0-9]+)/);
    const phone = String(meta.phone || (urlPhoneMatch ? urlPhoneMatch[1] : "") || "").replace(/\D/g, "");
    const rawSender =
      meta.senderName ||
      String(notification?.title || "")
        .replace(/^WhatsApp:\s*/i, "")
        .trim() ||
      phone ||
      "Hóspede";
    const senderWithFlat = flatNumber && !rawSender.includes(flatNumber)
      ? `${rawSender} • Flat ${flatNumber}`
      : rawSender;

    return {
      id: notification.id,
      type: "whatsapp_message",
      category: "whatsapp",
      phone,
      senderName: rawSender,
      flatNumber: flatNumber || null,
      reservationCode: meta.reservationCode || meta.code || null,
      messageKey: meta.messageId || `notif_${notification.id}`,
      title: `💬 ${senderWithFlat}`,
      message: String(notification.message || "Nova mensagem recebida").slice(0, 400),
      targetUrl: phone
        ? `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1`
        : notification.targetUrl || "/whatsapp-chat?standalone=1",
      unreadCount: Number(meta.unreadCount || unreadCount) || 1,
      createdAt: notification.createdAt || new Date().toISOString()
    };
  }

  // Caso 2: Check-out para Repositora (título limpo p/ tela de bloqueio + gatilho imediato de voz)
  if (category === "checkout" && normRole === "anserve_repositora") {
    const cleanFlat = flatNumber || "S/N";
    const spoken = `Check-out flat ${cleanFlat}`;
    return {
      id: notification.id,
      type: "restocker_checkout",
      category: "checkout",
      isRestockerCheckout: true,
      flatNumber: cleanFlat,
      reservationCode: meta.code || meta.reservationCode || null,
      checkoutTime: meta.checkoutTime || null,
      speakText: spoken,
      title: `🔔 ${spoken}`,
      message: `Flat ${cleanFlat} liberado para conferência e reposição do frigobar.`,
      targetUrl: "/frigobar-reposicao",
      unreadCount: 1,
      createdAt: notification.createdAt || new Date().toISOString()
    };
  }

  // Caso 3: Notificações operacionais gerais (reservas, check-outs recepção, limpeza, café, OS, etc.)
  return {
    id: notification.id,
    type: "system_notification",
    category,
    severity: notification.severity || "info",
    flatNumber: flatNumber || null,
    reservationCode: meta.code || meta.reservationCode || null,
    title: String(notification.title || "🔔 CorpFlats").slice(0, 120),
    message: String(notification.message || "").slice(0, 400),
    targetUrl: notification.targetUrl || "/notificacoes",
    unreadCount: Number(unreadCount) || 1,
    createdAt: notification.createdAt || new Date().toISOString()
  };
}

/**
 * Registra ou atualiza a inscrição Push de um dispositivo vinculando-a ao usuário/perfil autenticado.
 * Se o mesmo navegador trocar de usuário (mesmo endpoint), sobrescreve userId e role com segurança.
 */
export function upsertPushSubscription(db, saveDatabase, { subscription, user, userAgent = "" }) {
  if (!db) throw new Error("Banco de dados indisponível.");
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Objeto PushSubscription inválido (endpoint/keys ausentes).");
  }
  if (!user || !user.role) {
    throw new Error("Usuário ou perfil autenticado obrigatório para registrar Web Push.");
  }

  if (!Array.isArray(db.webPushSubscriptions)) {
    db.webPushSubscriptions = [];
  }

  const endpoint = String(subscription.endpoint).trim();
  const nowIso = new Date().toISOString();
  const existingIdx = db.webPushSubscriptions.findIndex(s => s && s.endpoint === endpoint);

  const record = {
    endpoint,
    expirationTime: subscription.expirationTime || null,
    keys: {
      p256dh: String(subscription.keys.p256dh).trim(),
      auth: String(subscription.keys.auth).trim()
    },
    userId: user.id ?? null,
    username: String(user.username || user.name || user.role),
    role: String(user.role).toLowerCase().trim(),
    userAgent: String(userAgent || "").slice(0, 220),
    createdAt: existingIdx >= 0 ? db.webPushSubscriptions[existingIdx].createdAt || nowIso : nowIso,
    updatedAt: nowIso
  };

  if (existingIdx >= 0) {
    db.webPushSubscriptions[existingIdx] = record;
  } else {
    db.webPushSubscriptions.push(record);
  }

  if (db.webPushSubscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
    db.webPushSubscriptions.sort((a, b) => new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime());
    db.webPushSubscriptions = db.webPushSubscriptions.slice(-MAX_PUSH_SUBSCRIPTIONS);
  }

  if (typeof saveDatabase === "function") {
    saveDatabase();
  }

  return record;
}

/**
 * Remove inscrição Web Push pelo endpoint (ex: no logout ou ao revogar permissão).
 */
export function removePushSubscription(db, saveDatabase, endpoint) {
  if (!db || !Array.isArray(db.webPushSubscriptions) || !endpoint) {
    return false;
  }
  const before = db.webPushSubscriptions.length;
  db.webPushSubscriptions = db.webPushSubscriptions.filter(s => s && s.endpoint !== endpoint);
  const removed = db.webPushSubscriptions.length !== before;
  if (removed && typeof saveDatabase === "function") {
    saveDatabase();
  }
  return removed;
}

/**
 * Dispara Web Push Real em paralelo para todos os dispositivos inscritos cujo perfil
 * tenha permissão para aquela categoria de notificação. Remove endpoints expirados (404/410).
 */
export async function dispatchWebPushForNotification(db, saveDatabase, notification, options = {}) {
  if (!db || !notification || !Array.isArray(db.webPushSubscriptions) || db.webPushSubscriptions.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, totalTargets: 0 };
  }

  const vapidKeys = getOrCreateVapidKeys(db, saveDatabase);
  const unreadCount = Array.isArray(db.notifications)
    ? db.notifications.filter(n => n && !n.read).length
    : 1;

  const eligibleSubs = db.webPushSubscriptions.filter(sub =>
    sub?.endpoint &&
    sub?.keys?.p256dh &&
    sub?.keys?.auth &&
    shouldRoleReceiveNotification(sub.role, notification, sub.userId)
  );

  if (eligibleSubs.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, totalTargets: 0 };
  }

  const expiredEndpoints = new Set();
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    eligibleSubs.map(async sub => {
      const payload = buildPushPayloadForSubscriber(notification, sub.role, unreadCount);
      const result = await sendWebPushMessage(sub, payload, vapidKeys, options);
      if (result.ok) {
        sent++;
      } else {
        failed++;
        if (result.expired) {
          expiredEndpoints.add(sub.endpoint);
        }
      }
    })
  );

  let pruned = 0;
  if (expiredEndpoints.size > 0 && Array.isArray(db.webPushSubscriptions)) {
    const before = db.webPushSubscriptions.length;
    db.webPushSubscriptions = db.webPushSubscriptions.filter(s => s && !expiredEndpoints.has(s.endpoint));
    pruned = before - db.webPushSubscriptions.length;
    if (pruned > 0 && typeof saveDatabase === "function") {
      try {
        saveDatabase();
      } catch {}
    }
  }

  return { sent, failed, pruned, totalTargets: eligibleSubs.length };
}

/**
 * Gera/retorna do cache RAM o áudio MP3 em português ("Check-out flat 1004") para reprodução
 * via HTML5 <audio> quando o celular da repositora estiver com a tela bloqueada (Modo Rádio).
 */
export async function synthesizeCheckoutAudioMp3(flatNumber, options = {}) {
  const cleanFlat = String(flatNumber || "")
    .trim()
    .replace(/^(?:apartamento|apto|apt|quarto|flat|uh|unidade)\b\.?\s*/i, "")
    .replace(/[^A-Za-z0-9\- ]/g, "")
    .trim();

  if (!cleanFlat) return null;

  const cacheKey = cleanFlat.toUpperCase();
  if (checkoutTtsAudioCache.has(cacheKey)) {
    return checkoutTtsAudioCache.get(cacheKey);
  }

  const text = `Check-out flat ${cleanFlat}`;
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(text)}`;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, options.timeoutMs || 3000);

  try {
    const res = await fetchImpl(ttsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36"
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 256) return null;

    if (checkoutTtsAudioCache.size >= TTS_CACHE_MAX_ITEMS) {
      const oldestKey = checkoutTtsAudioCache.keys().next().value;
      if (oldestKey) checkoutTtsAudioCache.delete(oldestKey);
    }
    checkoutTtsAudioCache.set(cacheKey, buf);
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
