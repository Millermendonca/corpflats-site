// Native Web Push & Browser Notification Helper for Chrome & Android
// Blindagem contra notificações repetidas e retroativas + Motor Estilo WhatsApp

const STORAGE_NOTIFIED_IDS = "gfm_push_notified_ids"
const STORAGE_WA_NOTIFIED_MSG_IDS = "gfm_wa_notified_msg_ids"
const STORAGE_LAST_SEEN_TIME = "gfm_push_last_seen_time"
const MAX_STORED_IDS = 500
const MAX_AGE_MS = 4 * 60 * 1000 // 4 minutos: notificações mais antigas que isso não geram push/vibração retroativo

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator
}

export const canUsePushNotifications = isPushSupported

export function getPushPermissionState(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied"
  }
  return Notification.permission
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    return reg
  } catch (err) {
    console.warn("[Push Service Worker Registration Failed]", err)
    return null
  }
}

export async function requestPushNotificationPermission(): Promise<NotificationPermission> {
  const ok = await requestPushPermission()
  return ok ? "granted" : getPushPermissionState()
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) {
    alert("Seu navegador atual não suporta notificações nativas.")
    return false
  }

  try {
    await registerServiceWorker()
    const permission = await Notification.requestPermission()
    return permission === "granted"
  } catch (err) {
    console.error("[Push Permission Request Error]", err)
    return false
  }
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
    ids.forEach(id => current.add(id))
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
 * Verifica se uma notificação é recente o suficiente para disparar som/push no celular
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
  createdAt?: string
  force?: boolean
}

export interface WhatsAppChatNotificationOptions {
  phone: string
  senderName: string
  flatNumber?: string
  reservationCode?: string
  message: string
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
 * Dispara notificação nativa agrupada por conversa idêntica ao WhatsApp (com renotify, vibração e ações rápidas)
 */
export async function showWhatsAppChatNotification(options: WhatsAppChatNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission !== "granted") return false

  const { phone, senderName, flatNumber, message, unreadCount = 1, messageKey, timestamp } = options
  if (timestamp && !isFreshNotification(timestamp)) {
    if (messageKey) recordNotifiedWaMsgKey(messageKey)
    return false
  }

  if (messageKey) {
    const seen = getNotifiedWaMsgKeys()
    if (seen.has(messageKey)) return false
    recordNotifiedWaMsgKey(messageKey)
  }

  const title = `💬 ${senderName || phone}${flatNumber ? ` • Flat ${flatNumber}` : ""}`
  const body = unreadCount > 1 ? `(${unreadCount} novas) ${message}` : message
  const targetUrl = `/whatsapp-chat?phone=${encodeURIComponent(phone)}&standalone=1`

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: "/api/pwa/chat-icon.png?size=192",
          badge: "/api/pwa/chat-icon.png?size=192",
          vibrate: [180, 80, 180, 80, 240],
          tag: `wa-chat-${phone}`,
          renotify: true,
          requireInteraction: false,
          data: { url: targetUrl, phone, isWhatsApp: true },
          actions: [
            { action: "open_chat", title: "💬 Responder" },
            { action: "mark_read", title: "✓ Marcar como Lida" }
          ]
        } as any)
        return true
      }
    }

    const notif = new Notification(title, {
      body,
      icon: "/api/pwa/chat-icon.png?size=192",
      tag: `wa-chat-${phone}`
    })
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
 * Dispara notificação nativa inteligente com blindagem contra repetições e retroatividade
 */
export async function showNativeNotification(options: SmartNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission !== "granted") return false

  const { id, title, message, url = "/notificacoes", createdAt, force = false } = options

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

  const isWhatsApp = url.includes("/whatsapp-chat") || title.toLowerCase().includes("whatsapp")
  const cleanTitle = title || "🔔 Guest Flow Manager"
  const cleanBody = message || "Nova notificação no sistema."
  const phoneMatch = url.match(/phone=([0-9]+)/)
  const phone = phoneMatch ? phoneMatch[1] : null

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && reg.showNotification) {
        await reg.showNotification(cleanTitle, {
          body: cleanBody,
          icon: isWhatsApp ? "/api/pwa/chat-icon.png?size=192" : "/favicon.svg",
          badge: isWhatsApp ? "/api/pwa/chat-icon.png?size=192" : "/favicon.svg",
          vibrate: isWhatsApp ? [180, 80, 180, 80, 240] : [200, 100, 200],
          tag: phone ? `wa-chat-${phone}` : (id ? `gfm-notif-${id}` : `gfm-${Date.now()}`),
          renotify: true,
          data: { url, phone, isWhatsApp },
          actions: isWhatsApp && phone
            ? [
                { action: "open_chat", title: "💬 Responder" },
                { action: "mark_read", title: "✓ Marcar como Lida" }
              ]
            : undefined
        } as any)
        return true
      }
    }

    const notif = new Notification(cleanTitle, {
      body: cleanBody,
      icon: isWhatsApp ? "/api/pwa/chat-icon.png?size=192" : "/favicon.svg",
      tag: phone ? `wa-chat-${phone}` : (id ? `gfm-notif-${id}` : `gfm-${Date.now()}`)
    })
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
