// Native Web Push & Browser Notification Helper for Chrome & Android
// Blindagem contra notificações repetidas e retroativas

const STORAGE_NOTIFIED_IDS = "gfm_push_notified_ids"
const STORAGE_LAST_SEEN_TIME = "gfm_push_last_seen_time"
const MAX_STORED_IDS = 500
const MAX_AGE_MS = 4 * 60 * 1000 // 4 minutos: notificações mais antigas que isso não geram push/vibração retroativo

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator
}

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
    // Se a data de criação for mais antiga que 4 minutos, considera retroativa e não vibra
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
  force?: boolean // Força disparo (usado no botão de teste manual)
}

/**
 * Dispara notificação nativa inteligente com blindagem contra repetições e retroatividade
 */
export async function showNativeNotification(options: SmartNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission !== "granted") return false

  const { id, title, message, url = "/notificacoes", createdAt, force = false } = options

  // Se tem ID e não é forçado, verifica se já foi notificado anteriormente
  if (id && !force) {
    const notified = getNotifiedIds()
    if (notified.has(id)) {
      return false // Já notificado, ignora silenciosamente
    }

    // Verifica se a notificação é retroativa (antiga)
    if (!isFreshNotification(createdAt)) {
      // Registra como vista para não processar mais
      recordNotifiedIds([id])
      return false
    }
  }

  // Registra o ID como notificado antes de disparar
  if (id) {
    recordNotifiedIds([id])
  }

  const cleanTitle = title || "🔔 Guest Flow Manager"
  const cleanBody = message || "Nova notificação no sistema."

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && reg.showNotification) {
        await reg.showNotification(cleanTitle, {
          body: cleanBody,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          vibrate: [200, 100, 200],
          tag: id ? `gfm-notif-${id}` : `gfm-${Date.now()}`,
          renotify: false,
          data: { url }
        } as any)
        return true
      }
    }

    // Fallback standard Notification
    const notif = new Notification(cleanTitle, {
      body: cleanBody,
      icon: "/favicon.svg",
      tag: id ? `gfm-notif-${id}` : `gfm-${Date.now()}`
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
