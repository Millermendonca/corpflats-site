// ══════════════════════════════════════════════════════════════════════════════
// CorpFlats / Guest Flow Manager — Native VAPID Web Push & Grouped Notifications
// ══════════════════════════════════════════════════════════════════════════════
// - Registro e sincronização real de Web Push (RFC 8291 / VAPID) com o backend
// - Agrupamento expansível estilo WhatsApp no Android (acumula linhas por conversa
//   e agrupa todas as notificações do app CorpFlats em um único bloco expansível)
// - Deduplicação estrita entre Web Push real (sw.js) e polling de fallback da aba

const STORAGE_NOTIFIED_IDS = "gfm_push_notified_ids"
const STORAGE_WA_NOTIFIED_MSG_IDS = "gfm_wa_notified_msg_ids"
const STORAGE_LAST_SEEN_TIME = "gfm_push_last_seen_time"
const STORAGE_VAPID_PUB_KEY = "gfm_vapid_public_key_v1"
const STORAGE_SUBSCRIBED_ROLE = "gfm_vapid_subscribed_role_v1"
const STORAGE_PUSH_DEVICE_ID = "gfm_push_device_id_v1"
const CANONICAL_PRODUCTION_ORIGIN = "https://corpflats.com.br"
const MAX_STORED_IDS = 500
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutos para fallback local (o Web Push real do servidor chega na hora)
const RECENT_WA_CONTENT_WINDOW_MS = 45 * 1000

const recentWaContentSeenMap = new Map<string, number>()

let swMessageListenerAttached = false
let syncInFlightPromise: Promise<boolean> | null = null

/**
 * Detecta se o app foi aberto no domínio legado do Render (*.onrender.com).
 * Nesse domínio o Web Push é desativado e expurgado para nunca duplicar com corpflats.com.br.
 */
export function isLegacyRenderHostClient(): boolean {
  if (typeof window === "undefined" || !window.location) return false
  const host = String(window.location.hostname || "").toLowerCase()
  return host === "onrender.com" || host.endsWith(".onrender.com")
}

function getOrCreatePushDeviceId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem(STORAGE_PUSH_DEVICE_ID)
    if (!id) {
      const rand =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      id = rand
      localStorage.setItem(STORAGE_PUSH_DEVICE_ID, id)
    }
    return id
  } catch {
    return ""
  }
}

function markRecentWaContentSeen(phone?: string, message?: string): void {
  const cleanPhone = String(phone || "").replace(/\D/g, "")
  const cleanMsg = String(message || "").trim().slice(0, 120)
  if (!cleanPhone || !cleanMsg) return
  const now = Date.now()
  for (const [k, ts] of recentWaContentSeenMap.entries()) {
    if (now - ts > RECENT_WA_CONTENT_WINDOW_MS) {
      recentWaContentSeenMap.delete(k)
    }
  }
  recentWaContentSeenMap.set(`${cleanPhone}::${cleanMsg}`, now)
}

function hasRecentWaContentSeen(phone?: string, message?: string): boolean {
  const cleanPhone = String(phone || "").replace(/\D/g, "")
  const cleanMsg = String(message || "").trim().slice(0, 120)
  if (!cleanPhone || !cleanMsg) return false
  const ts = recentWaContentSeenMap.get(`${cleanPhone}::${cleanMsg}`)
  if (!ts) return false
  if (Date.now() - ts > RECENT_WA_CONTENT_WINDOW_MS) {
    recentWaContentSeenMap.delete(`${cleanPhone}::${cleanMsg}`)
    return false
  }
  return true
}

/**
 * Remove inscrições Web Push e Service Workers no domínio legado (*.onrender.com)
 * e redireciona automaticamente o navegador para o domínio oficial corpflats.com.br.
 */
export async function purgeLegacyRenderOriginAndRedirect(): Promise<void> {
  if (typeof window === "undefined" || !isLegacyRenderHostClient()) return

  const cleanupTask = (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const reg of regs) {
          try {
            const notifications = await reg.getNotifications()
            notifications.forEach((n) => {
              try {
                n.close()
              } catch {}
            })
          } catch {}
          try {
            const sub = await reg.pushManager?.getSubscription()
            if (sub?.endpoint) {
              await fetch("/api/push/unsubscribe", {
                method: "POST",
                credentials: "include",
                keepalive: true,
                headers: buildPushAuthHeaders(),
                body: JSON.stringify({ endpoint: sub.endpoint, reason: "legacy_onrender_redirect" })
              }).catch(() => {})
              await sub.unsubscribe().catch(() => {})
            }
          } catch {}
          try {
            await reg.unregister()
          } catch {}
        }
      }
      localStorage.removeItem(STORAGE_SUBSCRIBED_ROLE)
      localStorage.removeItem(STORAGE_VAPID_PUB_KEY)
    } catch {}
  })()

  if (!window.location.search.includes("keep_render_host=1")) {
    await Promise.race([
      cleanupTask,
      new Promise((resolve) => setTimeout(resolve, 450))
    ])
    const dest = `${CANONICAL_PRODUCTION_ORIGIN}${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    window.location.replace(dest)
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  )
}

export const canUsePushNotifications = isPushSupported

export function getPushPermissionState(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied"
  }
  return Notification.permission
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function buildPushAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra
  }
  if (typeof window !== "undefined") {
    try {
      const anserveToken = localStorage.getItem("corpflats_anserve_token")
      if (anserveToken) {
        headers["x-anserve-token"] = anserveToken
      }
    } catch {}
  }
  return headers
}

/**
 * Conecta o listener de mensagens vindas do Service Worker (sw.js) para:
 * 1) Marcar IDs/mensagens já entregues via Web Push real (evita duplicata pelo polling da aba)
 * 2) Disparar o evento 'gfm:push-received' (aciona voz imediata no Modo Rádio da repositora)
 */
export function ensureServiceWorkerBridge(): void {
  if (swMessageListenerAttached || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return
  }
  swMessageListenerAttached = true

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {}
    if (data.type === "GFM_PUSH_RECEIVED" && data.payload) {
      const payload = data.payload
      if (payload.id && Number.isFinite(Number(payload.id))) {
        recordNotifiedIds([Number(payload.id)])
      }
      if (payload.messageKey) {
        recordNotifiedWaMsgKey(String(payload.messageKey))
      }
      if (payload.phone && payload.message) {
        markRecentWaContentSeen(String(payload.phone), String(payload.message))
      }
      if (typeof payload.unreadCount === "number") {
        updateAppBadge(payload.unreadCount)
      }
      try {
        window.dispatchEvent(new CustomEvent("gfm:push-received", { detail: payload }))
      } catch {}
    }
  })
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }
  if (isLegacyRenderHostClient()) {
    await unsubscribeWebPush()
    return null
  }
  try {
    ensureServiceWorkerBridge()
    const reg = await navigator.serviceWorker.register("/sw.js?v=4", { scope: "/" })
    reg.update().catch(() => {})
    return reg
  } catch (err) {
    console.warn("[Push Service Worker Registration Failed]", err)
    return null
  }
}

/**
 * Sincroniza a inscrição Push real (PushManager + VAPID) deste dispositivo com o servidor,
 * associando-a ao perfil do usuário logado no momento.
 */
export async function syncWebPushSubscription(options?: {
  forceResubscribe?: boolean
  roleHint?: string
}): Promise<boolean> {
  if (!isPushSupported() || getPushPermissionState() !== "granted") {
    return false
  }
  if (isLegacyRenderHostClient()) {
    await unsubscribeWebPush()
    return false
  }
  if (syncInFlightPromise) {
    return syncInFlightPromise
  }

  syncInFlightPromise = (async () => {
    try {
      const reg = await registerServiceWorker()
      if (!reg || !("pushManager" in reg)) {
        return false
      }
      await navigator.serviceWorker.ready

      const keyRes = await fetch("/api/push/vapid-public-key", {
        credentials: "include",
        headers: buildPushAuthHeaders()
      })
      if (!keyRes.ok) {
        return false
      }
      const keyData = await keyRes.json()
      if (keyData?.blockedLegacyOrigin) {
        await unsubscribeWebPush()
        return false
      }
      const { publicKey } = keyData
      if (!publicKey || typeof publicKey !== "string") {
        return false
      }

      const savedVapidKey = localStorage.getItem(STORAGE_VAPID_PUB_KEY)
      let subscription = await reg.pushManager.getSubscription()

      // Se a chave VAPID mudou ou forçou renovação, recria a inscrição
      if (subscription && (options?.forceResubscribe || (savedVapidKey && savedVapidKey !== publicKey))) {
        try {
          await subscription.unsubscribe()
        } catch {}
        subscription = null
      }

      if (!subscription) {
        const appServerKey = urlBase64ToUint8Array(publicKey)
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as BufferSource
        })
      }

      const subJson = subscription.toJSON()
      let anserveUserId: number | undefined
      let anserveUsername: string | undefined
      try {
        const rawUid = localStorage.getItem("corpflats_anserve_user_id")
        if (rawUid) anserveUserId = Number(rawUid) || undefined
        anserveUsername = localStorage.getItem("corpflats_anserve_username") || undefined
      } catch {}

      const subRes = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: buildPushAuthHeaders(),
        body: JSON.stringify({
          subscription: subJson,
          userId: anserveUserId,
          username: anserveUsername,
          deviceId: getOrCreatePushDeviceId(),
          clientOrigin: typeof window !== "undefined" ? window.location.origin : ""
        })
      })

      if (subRes.ok) {
        const data = await subRes.json().catch(() => ({}))
        if (data?.blockedLegacyOrigin) {
          try {
            await subscription.unsubscribe()
          } catch {}
          return false
        }
        localStorage.setItem(STORAGE_VAPID_PUB_KEY, publicKey)
        if (data?.role || options?.roleHint) {
          localStorage.setItem(STORAGE_SUBSCRIBED_ROLE, String(data?.role || options?.roleHint))
        }
        return true
      }
      return false
    } catch (err) {
      console.warn("[Web Push Sync Error]", err)
      return false
    } finally {
      syncInFlightPromise = null
    }
  })()

  return syncInFlightPromise
}

/**
 * Remove o vínculo Web Push deste navegador no backend (ex: durante logout).
 */
export async function unsubscribeWebPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration("/")
    const sub = await reg?.pushManager?.getSubscription()
    if (sub?.endpoint) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        credentials: "include",
        headers: buildPushAuthHeaders(),
        body: JSON.stringify({ endpoint: sub.endpoint })
      }).catch(() => {})
    }
    localStorage.removeItem(STORAGE_SUBSCRIBED_ROLE)
  } catch {}
}

/**
 * Dispara um teste real de Web Push criptografado enviado pelo servidor ao dispositivo.
 */
export async function sendServerWebPushTest(extraBody: Record<string, any> = {}): Promise<{
  success: boolean
  sent?: number
  error?: string
}> {
  try {
    await syncWebPushSubscription()
    let endpoint: string | undefined
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg?.pushManager?.getSubscription()
      endpoint = sub?.endpoint
    } catch {}

    const res = await fetch("/api/push/test", {
      method: "POST",
      credentials: "include",
      headers: buildPushAuthHeaders(),
      body: JSON.stringify({ endpoint, ...extraBody })
    })
    const data = await res.json().catch(() => ({}))
    return {
      success: Boolean(res.ok && data?.success),
      sent: data?.sent || 0,
      error: data?.error
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de rede no teste Push." }
  }
}

export async function requestPushNotificationPermission(): Promise<NotificationPermission> {
  const ok = await requestPushPermission()
  return ok ? "granted" : getPushPermissionState()
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) {
    alert("Seu navegador atual não suporta notificações nativas. No iPhone, adicione o app à Tela de Início primeiro.")
    return false
  }

  try {
    await registerServiceWorker()
    const permission = await Notification.requestPermission()
    if (permission === "granted") {
      await syncWebPushSubscription({ forceResubscribe: false })
      return true
    }
    return false
  } catch (err) {
    console.error("[Push Permission Request Error]", err)
    return false
  }
}

/**
 * Limpa a notificação agrupada da conversa do WhatsApp na bandeja do Android ao abrir o chat
 */
export function clearWhatsAppTrayNotification(phone: string): void {
  if (typeof window === "undefined" || !phone || !("serviceWorker" in navigator)) return
  try {
    navigator.serviceWorker.ready
      .then((reg) => {
        reg?.active?.postMessage({
          type: "CLEAR_CHAT_NOTIFICATIONS",
          phone: String(phone).replace(/\D/g, "")
        })
      })
      .catch(() => {})
  } catch {}
}

/**
 * Atualiza o badge numérico no ícone do aplicativo instalado (Android / iOS / Windows PWA)
 */
export function updateAppBadge(unreadCount: number): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return
  try {
    const nav = navigator as any
    if (unreadCount > 0 && typeof nav.setAppBadge === "function") {
      nav.setAppBadge(unreadCount).catch(() => {})
    } else if (unreadCount <= 0 && typeof nav.clearAppBadge === "function") {
      nav.clearAppBadge().catch(() => {})
    }
  } catch {}
}

/**
 * Obtém o conjunto de IDs já notificados neste dispositivo (persistido no localStorage)
 */
export function getNotifiedIds(): Set<number> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_NOTIFIED_IDS)
    if (!raw) return new Set()
    const list: number[] = JSON.parse(raw)
    return new Set(list)
  } catch {
    return new Set()
  }
}

/**
 * Registra um ou mais IDs como já notificados/vistos para evitar repetições
 */
export function recordNotifiedIds(ids: number[]): void {
  if (typeof window === "undefined" || !ids.length) return
  try {
    const current = getNotifiedIds()
    ids.forEach((id) => current.add(id))
    const arr = Array.from(current).slice(-MAX_STORED_IDS)
    localStorage.setItem(STORAGE_NOTIFIED_IDS, JSON.stringify(arr))
  } catch {}
}

/**
 * Registra o histórico inicial ao abrir o app para evitar que notificações antigas toquem
 */
export function markInitialHistoryAsSeen(existingIds: number[]): void {
  if (!existingIds.length) return
  recordNotifiedIds(existingIds)
  try {
    localStorage.setItem(STORAGE_LAST_SEEN_TIME, new Date().toISOString())
  } catch {}
}

/**
 * Verifica se uma notificação é recente o suficiente para disparar som/push local de fallback
 */
export function isFreshNotification(createdAt?: string): boolean {
  if (!createdAt) return true
  try {
    const createdTime = new Date(createdAt).getTime()
    const now = Date.now()
    if (now - createdTime > MAX_AGE_MS) {
      return false
    }
    return true
  } catch {
    return true
  }
}

export interface SmartNotificationOptions {
  id?: number
  title: string
  message: string
  url?: string
  category?: string
  flatNumber?: string
  createdAt?: string
  force?: boolean
}

export interface WhatsAppChatNotificationOptions {
  phone: string
  senderName: string
  flatNumber?: string
  reservationCode?: string
  message?: string
  messageText?: string
  unreadCount?: number
  messageKey?: string
  timestamp?: string
}

function getNotifiedWaMsgKeys(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_WA_NOTIFIED_MSG_IDS)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function recordNotifiedWaMsgKey(key: string): void {
  if (typeof window === "undefined" || !key) return
  try {
    const current = getNotifiedWaMsgKeys()
    current.add(key)
    const arr = Array.from(current).slice(-MAX_STORED_IDS)
    localStorage.setItem(STORAGE_WA_NOTIFIED_MSG_IDS, JSON.stringify(arr))
  } catch {}
}

/**
 * Dispara notificação nativa agrupada por conversa idêntica ao WhatsApp (acumulando linhas via sw.js)
 */
export async function showWhatsAppChatNotification(
  options: WhatsAppChatNotificationOptions
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission !== "granted") return false

  const {
    phone,
    senderName,
    flatNumber,
    unreadCount = 1,
    messageKey,
    timestamp
  } = options
  const cleanMessage = String(options.message || options.messageText || "Nova mensagem recebida").trim()

  if (timestamp && !isFreshNotification(timestamp)) {
    if (messageKey) recordNotifiedWaMsgKey(messageKey)
    return false
  }

  const effectiveKey = messageKey || `${phone}_${timestamp || ""}_${cleanMessage.slice(0, 40)}`
  const seen = getNotifiedWaMsgKeys()
  if (seen.has(effectiveKey) || hasRecentWaContentSeen(phone, cleanMessage)) return false
  recordNotifiedWaMsgKey(effectiveKey)
  markRecentWaContentSeen(phone, cleanMessage)

  const title = `💬 ${senderName || phone}${flatNumber ? ` • Flat ${flatNumber}` : ""}`
  const targetUrl = `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1`

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg?.active) {
        reg.active.postMessage({
          type: "SHOW_GROUPED_NOTIFICATION",
          payload: {
            type: "whatsapp_message",
            category: "whatsapp",
            phone,
            senderName,
            flatNumber,
            title,
            message: cleanMessage,
            targetUrl,
            unreadCount,
            messageKey: effectiveKey,
            createdAt: timestamp || new Date().toISOString()
          }
        })
        return true
      }
    }

    const notif = new Notification(title, {
      body: cleanMessage,
      icon: "/api/pwa/chat-icon.png?size=192&v=3",
      badge: "/api/pwa/notification-badge.png?v=3",
      tag: `wa-chat-${phone}`
    } as any)
    notif.onclick = () => {
      window.focus()
      window.location.href = targetUrl
    }
    return true
  } catch (err) {
    console.warn("[Show WhatsApp Notification Error]", err)
    return false
  }
}

/**
 * Dispara notificação nativa inteligente com agrupamento Android (via tags distintas no sw.js)
 */
export async function showNativeNotification(options: SmartNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission !== "granted") return false

  const { id, title, message, url = "/notificacoes", category, flatNumber, createdAt, force = false } = options

  if (id && !force) {
    const notified = getNotifiedIds()
    if (notified.has(id)) {
      return false
    }

    if (!isFreshNotification(createdAt)) {
      recordNotifiedIds([id])
      return false
    }
  }

  if (id) {
    recordNotifiedIds([id])
  }

  const isWhatsApp = category === "whatsapp" || url.includes("/whatsapp-chat") || title.toLowerCase().includes("whatsapp")
  const cleanTitle = title || "🔔 CorpFlats"
  const cleanBody = message || "Nova notificação no sistema."
  const phoneMatch = url.match(/phone=([0-9]+)/)
  const phone = phoneMatch ? phoneMatch[1] : null

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg?.active) {
        reg.active.postMessage({
          type: "SHOW_GROUPED_NOTIFICATION",
          payload: {
            id: id || Date.now(),
            category: category || (isWhatsApp ? "whatsapp" : "general"),
            phone,
            flatNumber,
            title: cleanTitle,
            message: cleanBody,
            targetUrl: url,
            createdAt: createdAt || new Date().toISOString()
          }
        })
        return true
      }
    }

    const notif = new Notification(cleanTitle, {
      body: cleanBody,
      icon: "/api/pwa/chat-icon.png?size=192&v=3",
      badge: "/api/pwa/notification-badge.png?v=3",
      tag: phone ? `wa-chat-${phone}` : `gfm-notif-${id || Date.now()}`
    } as any)
    notif.onclick = () => {
      window.focus()
      window.location.href = url
    }
    return true
  } catch (err) {
    console.warn("[Show Native Notification Error]", err)
    return false
  }
}
