export interface AttributionData {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  fbp?: string
  fbc?: string
  landingPage?: string
  referrer?: string
  firstTouchAt?: string
  lastTouchAt?: string
}

export interface PublicTrackingConfig {
  ga4MeasurementId?: string
  googleAdsId?: string
  googleAdsConversionLabel?: string
  metaPixelId?: string
}

declare global {
  interface Window {
    __CORPFLATS_TRACKING__?: PublicTrackingConfig
    __CF_TRACKING_BOOTSTRAPPED__?: boolean
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void
      queue?: unknown[]
      loaded?: boolean
      version?: string
      push?: (...args: unknown[]) => void
    }
    _fbq?: unknown
  }
}

const ATTRIBUTION_STORAGE_KEY = "corpflats_attribution_v1"
const SESSION_STORAGE_KEY = "corpflats_funnel_session"
const PURCHASE_DEDUP_PREFIX = "corpflats_tracked_purchase_"
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000

const MOCK_META_PIXELS = new Set(["7489123891023", "000000000000000", "123456789012345"])
const MOCK_GOOGLE_ADS = new Set(["AW-9481923", "9481923", "AW-000000000"])

let activeTrackingConfig: PublicTrackingConfig = {}
let memoryFallbackSessionId = ""
const configuredVendorIds = new Set<string>()
let vendorScriptsScheduled = false

function safeReadStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore Safari private mode / quota errors
  }
}

function readCookieValue(cookieName: string): string | undefined {
  if (typeof document === "undefined" || !document.cookie) return undefined
  const prefix = `${cookieName}=`
  const parts = document.cookie.split(";")
  for (const rawPart of parts) {
    const trimmed = rawPart.trim()
    if (trimmed.startsWith(prefix)) {
      const val = decodeURIComponent(trimmed.slice(prefix.length)).trim()
      if (val) return val
    }
  }
  return undefined
}

function writeFirstPartyCookie(cookieName: string, value: string, maxAgeSec = 7776000): void {
  if (typeof document === "undefined" || !value) return
  try {
    const secureFlag =
      typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${cookieName}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secureFlag}`
  } catch {
    // Ignore restricted cookie contexts
  }
}

function sanitizeClientTrackingConfig(raw?: PublicTrackingConfig): PublicTrackingConfig {
  if (!raw) return {}
  const ga4 = raw.ga4MeasurementId?.trim().toUpperCase() || ""
  const gAds = raw.googleAdsId?.trim().replace(/^aw-/i, "AW-") || ""
  const gLabel = raw.googleAdsConversionLabel?.trim() || ""
  const pixel = raw.metaPixelId?.trim().replace(/\D/g, "") || ""

  return {
    ga4MeasurementId: /^G-[A-Z0-9]{4,24}$/.test(ga4) ? ga4 : undefined,
    googleAdsId:
      !MOCK_GOOGLE_ADS.has(gAds) && /^AW-\d{6,16}$/.test(gAds) ? gAds : undefined,
    googleAdsConversionLabel:
      /^[A-Za-z0-9_-]{3,64}$/.test(gLabel) ? gLabel : undefined,
    metaPixelId:
      !MOCK_META_PIXELS.has(pixel) && /^\d{10,20}$/.test(pixel) ? pixel : undefined,
  }
}

function isExternalReferrer(ref: string): boolean {
  if (!ref) return false
  try {
    const refHost = new URL(ref).hostname.toLowerCase()
    const curHost =
      typeof window !== "undefined" ? window.location.hostname.toLowerCase() : ""
    if (!refHost) return false
    if (curHost && refHost === curHost) return false
    if (refHost.endsWith("corpflats.com.br") || refHost === "localhost") return false
    return true
  } catch {
    return false
  }
}

export function getSessionTrackingId(): string {
  const existing = safeReadStorage(SESSION_STORAGE_KEY)
  if (existing && existing.length >= 8) {
    return existing
  }
  if (memoryFallbackSessionId) {
    return memoryFallbackSessionId
  }
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 12)
  const generated = `cf_${Date.now()}_${randomPart}`
  memoryFallbackSessionId = generated
  safeWriteStorage(SESSION_STORAGE_KEY, generated)
  return generated
}

export function captureAttributionOnLoad(): AttributionData {
  if (typeof window === "undefined") return {}

  const nowIso = new Date().toISOString()
  let stored: (AttributionData & { savedAtMs?: number }) | null = null
  const rawStored = safeReadStorage(ATTRIBUTION_STORAGE_KEY)
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored)
      if (
        parsed &&
        typeof parsed === "object" &&
        (!parsed.savedAtMs || Date.now() - Number(parsed.savedAtMs) < ATTRIBUTION_TTL_MS)
      ) {
        stored = parsed
      }
    } catch {
      stored = null
    }
  }

  const params = new URLSearchParams(window.location.search || "")
  const incoming: AttributionData = {}
  const paramKeys: Array<keyof AttributionData> = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
  ]

  let hasNewCampaignTouch = false
  for (const key of paramKeys) {
    const val = params.get(key)?.trim()
    if (val) {
      incoming[key] = val.slice(0, 200)
      hasNewCampaignTouch = true
    }
  }

  const cookieFbp = readCookieValue("_fbp")
  let cookieFbc = readCookieValue("_fbc")
  if (!cookieFbc && incoming.fbclid) {
    cookieFbc = `fb.1.${Date.now()}.${incoming.fbclid}`
    writeFirstPartyCookie("_fbc", cookieFbc)
  }

  const currentPathWithQuery = `${window.location.pathname || "/"}${window.location.search || ""}`
  const externalRef =
    typeof document !== "undefined" && isExternalReferrer(document.referrer)
      ? document.referrer.slice(0, 300)
      : undefined

  const merged: AttributionData = {
    ...(stored || {}),
    ...incoming,
    fbp: cookieFbp || stored?.fbp,
    fbc: cookieFbc || stored?.fbc,
    landingPage:
      hasNewCampaignTouch || !stored?.landingPage
        ? currentPathWithQuery.slice(0, 300)
        : stored.landingPage,
    referrer: externalRef || stored?.referrer,
    firstTouchAt: stored?.firstTouchAt || nowIso,
    lastTouchAt: hasNewCampaignTouch || !stored?.lastTouchAt ? nowIso : stored.lastTouchAt,
  }

  const cleanResult: AttributionData = {}
  const allKeys: Array<keyof AttributionData> = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "fbp",
    "fbc",
    "landingPage",
    "referrer",
    "firstTouchAt",
    "lastTouchAt",
  ]
  for (const k of allKeys) {
    if (merged[k]) {
      cleanResult[k] = merged[k]
    }
  }

  safeWriteStorage(
    ATTRIBUTION_STORAGE_KEY,
    JSON.stringify({ ...cleanResult, savedAtMs: Date.now() })
  )

  return cleanResult
}

export function getStoredAttribution(): AttributionData {
  if (typeof window === "undefined") return {}
  const rawStored = safeReadStorage(ATTRIBUTION_STORAGE_KEY)
  let base: AttributionData
  if (!rawStored) {
    base = captureAttributionOnLoad()
  } else {
    try {
      const parsed = JSON.parse(rawStored)
      const { savedAtMs: _ignored, ...rest } = parsed || {}
      void _ignored
      base = rest
    } catch {
      base = captureAttributionOnLoad()
    }
  }

  const liveFbp = readCookieValue("_fbp")
  const liveFbc = readCookieValue("_fbc")
  if (liveFbp) base.fbp = liveFbp
  if (liveFbc) base.fbc = liveFbc
  if (!base.fbc && base.fbclid) {
    base.fbc = `fb.1.${Date.now()}.${base.fbclid}`
  }

  return base
}

function scheduleIdleVendorScripts(primaryGoogleTagId?: string, metaPixelId?: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return
  if (vendorScriptsScheduled) return
  vendorScriptsScheduled = true

  const inject = () => {
    if (primaryGoogleTagId && !document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`)) {
      const gs = document.createElement("script")
      gs.async = true
      gs.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryGoogleTagId)}`
      document.head.appendChild(gs)
    }
    if (metaPixelId && !document.querySelector(`script[src*="connect.facebook.net"]`)) {
      const fs = document.createElement("script")
      fs.async = true
      fs.src = "https://connect.facebook.net/en_US/fbevents.js"
      document.head.appendChild(fs)
    }
  }

  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(inject, { timeout: 2200 })
  } else {
    window.setTimeout(inject, 1500)
  }
}

export function initPublicAnalytics(trackingConfig?: {
  ga4MeasurementId?: string
  googleAdsId?: string
  googleAdsConversionLabel?: string
  metaPixelId?: string
}): void {
  if (typeof window === "undefined") return

  captureAttributionOnLoad()
  getSessionTrackingId()

  const ssrConfig = sanitizeClientTrackingConfig(window.__CORPFLATS_TRACKING__)
  const incomingConfig = sanitizeClientTrackingConfig(trackingConfig)

  activeTrackingConfig = {
    ga4MeasurementId: incomingConfig.ga4MeasurementId || ssrConfig.ga4MeasurementId,
    googleAdsId: incomingConfig.googleAdsId || ssrConfig.googleAdsId,
    googleAdsConversionLabel:
      incomingConfig.googleAdsConversionLabel || ssrConfig.googleAdsConversionLabel,
    metaPixelId: incomingConfig.metaPixelId || ssrConfig.metaPixelId,
  }

  // If SSR head stub already bootstrapped the vendor tags with the same IDs, avoid double PageView
  if (window.__CF_TRACKING_BOOTSTRAPPED__) {
    if (ssrConfig.ga4MeasurementId) configuredVendorIds.add(ssrConfig.ga4MeasurementId)
    if (ssrConfig.googleAdsId) configuredVendorIds.add(ssrConfig.googleAdsId)
    if (ssrConfig.metaPixelId) configuredVendorIds.add(`meta:${ssrConfig.metaPixelId}`)
  }

  const primaryGoogleTagId =
    activeTrackingConfig.ga4MeasurementId || activeTrackingConfig.googleAdsId

  if (primaryGoogleTagId) {
    window.dataLayer = window.dataLayer || []
    if (!window.gtag) {
      window.gtag = function gtagProxy(...args: unknown[]) {
        window.dataLayer!.push(args)
      }
      window.gtag("js", new Date())
    }
    if (
      activeTrackingConfig.ga4MeasurementId &&
      !configuredVendorIds.has(activeTrackingConfig.ga4MeasurementId)
    ) {
      configuredVendorIds.add(activeTrackingConfig.ga4MeasurementId)
      window.gtag("config", activeTrackingConfig.ga4MeasurementId, {
        send_page_view: true,
        transport_type: "beacon",
      })
    }
    if (
      activeTrackingConfig.googleAdsId &&
      !configuredVendorIds.has(activeTrackingConfig.googleAdsId)
    ) {
      configuredVendorIds.add(activeTrackingConfig.googleAdsId)
      window.gtag("config", activeTrackingConfig.googleAdsId)
    }
  }

  if (
    activeTrackingConfig.metaPixelId &&
    !configuredVendorIds.has(`meta:${activeTrackingConfig.metaPixelId}`)
  ) {
    configuredVendorIds.add(`meta:${activeTrackingConfig.metaPixelId}`)
    if (!window.fbq) {
      type FbqCallable = NonNullable<Window["fbq"]>
      const fbqQueue: unknown[] = []
      const fbqProxy = (...args: unknown[]): void => {
        if (fbqStub.callMethod) {
          fbqStub.callMethod(...args)
        } else {
          fbqQueue.push(args)
        }
      }
      const fbqStub: FbqCallable = Object.assign(fbqProxy, {
        queue: fbqQueue,
        loaded: true,
        version: "2.0",
        push: fbqProxy,
      })
      window.fbq = fbqStub
      if (!window._fbq) window._fbq = fbqStub
    }
    window.fbq("init", activeTrackingConfig.metaPixelId)
    window.fbq("track", "PageView")
  }

  if (primaryGoogleTagId || activeTrackingConfig.metaPixelId) {
    scheduleIdleVendorScripts(primaryGoogleTagId, activeTrackingConfig.metaPixelId)
  }
}

function emitGtagEvent(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  try {
    window.gtag("event", eventName, params)
  } catch {
    // Ignore third-party blocker exceptions
  }
}

function emitMetaStandardEvent(
  eventName: string,
  params: Record<string, unknown>,
  eventId?: string
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return
  try {
    if (eventId) {
      window.fbq("track", eventName, params, { eventID: eventId })
    } else {
      window.fbq("track", eventName, params)
    }
  } catch {
    // Ignore third-party blocker exceptions
  }
}

function emitMetaCustomEvent(
  eventName: string,
  params: Record<string, unknown>,
  eventId?: string
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return
  try {
    if (eventId) {
      window.fbq("trackCustom", eventName, params, { eventID: eventId })
    } else {
      window.fbq("trackCustom", eventName, params)
    }
  } catch {
    // Ignore third-party blocker exceptions
  }
}

export function trackViewItem(params: {
  routeSlug: string
  title?: string
  price?: number
  ratePlan?: string
}): void {
  const sessionId = getSessionTrackingId()
  const eventId = `vi_${sessionId}_${params.routeSlug}`
  const price = typeof params.price === "number" ? Number(params.price.toFixed(2)) : undefined

  emitGtagEvent("view_item", {
    currency: "BRL",
    ...(price !== undefined ? { value: price } : {}),
    items: [
      {
        item_id: params.routeSlug || "home",
        item_name: params.title || "Suíte Executiva CorpFlats",
        item_category: params.ratePlan || "hospedagem_direta",
        ...(price !== undefined ? { price } : {}),
      },
    ],
  })

  emitMetaStandardEvent(
    "ViewContent",
    {
      content_ids: [params.routeSlug || "home"],
      content_name: params.title || "Suíte Executiva CorpFlats",
      content_type: "product",
      currency: "BRL",
      ...(price !== undefined ? { value: price } : {}),
    },
    eventId
  )
}

export function trackSelectDates(params: {
  checkin: string
  checkout: string
  nights: number
  adults?: number
  ratePlan?: string
  value?: number
}): void {
  const val = typeof params.value === "number" ? Number(params.value.toFixed(2)) : undefined

  emitGtagEvent("select_dates", {
    checkin_date: params.checkin,
    checkout_date: params.checkout,
    nights: params.nights,
    adults: params.adults ?? 1,
    rate_plan: params.ratePlan || "with_breakfast",
    currency: "BRL",
    ...(val !== undefined ? { value: val } : {}),
  })

  emitMetaStandardEvent("Search", {
    checkin_date: params.checkin,
    checkout_date: params.checkout,
    num_adults: params.adults ?? 1,
    content_category: params.ratePlan || "with_breakfast",
    currency: "BRL",
    ...(val !== undefined ? { value: val } : {}),
  })
}

export function trackBeginCheckout(params: {
  checkin: string
  checkout: string
  nights: number
  roomsCount: number
  ratePlan: string
  value: number
}): void {
  const sessionId = getSessionTrackingId()
  const eventId = `ic_${sessionId}_${params.checkin}_${params.roomsCount}`
  const value = Number((params.value || 0).toFixed(2))
  const totalRoomNights = Math.max(1, (params.nights || 1) * (params.roomsCount || 1))

  emitGtagEvent("begin_checkout", {
    currency: "BRL",
    value,
    checkin_date: params.checkin,
    checkout_date: params.checkout,
    nights: params.nights,
    rooms_count: params.roomsCount,
    items: [
      {
        item_id: "corpflats_suite",
        item_name: "Suíte CorpFlats Site Oficial",
        item_variant: params.ratePlan,
        quantity: totalRoomNights,
      },
    ],
  })

  emitMetaStandardEvent(
    "InitiateCheckout",
    {
      currency: "BRL",
      value,
      content_type: "product",
      content_ids: ["corpflats_suite"],
      num_items: totalRoomNights,
    },
    eventId
  )
}

export function trackGenerateLead(params: {
  name?: string
  email?: string
  phone?: string
  isWorkTrip?: boolean
  value?: number
}): void {
  const sessionId = getSessionTrackingId()
  const eventId = `lead_${sessionId}`
  const value = typeof params.value === "number" ? Number(params.value.toFixed(2)) : 0
  const leadType = params.isWorkTrip ? "corporate" : "leisure"

  emitGtagEvent("generate_lead", {
    currency: "BRL",
    value,
    lead_type: leadType,
    has_phone: Boolean(params.phone),
    has_email: Boolean(params.email),
  })

  emitMetaStandardEvent(
    "Lead",
    {
      currency: "BRL",
      value,
      content_category: leadType,
    },
    eventId
  )
}

export function trackAddPaymentInfo(params: {
  reservationCode: string
  paymentMethod: "pix" | "card"
  value: number
  nights?: number
  roomsCount?: number
}): void {
  const eventId = `pay_${params.reservationCode}_${params.paymentMethod}`
  const value = Number((params.value || 0).toFixed(2))
  const numItems = Math.max(1, (params.nights || 1) * (params.roomsCount || 1))

  emitGtagEvent("add_payment_info", {
    currency: "BRL",
    value,
    payment_type: params.paymentMethod,
    transaction_id: params.reservationCode,
    items: [
      {
        item_id: "corpflats_suite",
        item_name: "Suíte CorpFlats Site Oficial",
        quantity: numItems,
      },
    ],
  })

  if (params.paymentMethod === "pix") {
    emitGtagEvent("generate_pix", {
      currency: "BRL",
      value,
      transaction_id: params.reservationCode,
    })
  }

  emitMetaStandardEvent(
    "AddPaymentInfo",
    {
      currency: "BRL",
      value,
      content_type: "product",
      content_ids: ["corpflats_suite"],
      num_items: numItems,
    },
    eventId
  )
}

export function trackPurchase(params: {
  reservationCode: string
  value: number
  paymentMethod?: string
  nights?: number
  roomsCount?: number
}): void {
  if (!params.reservationCode) return

  const dedupStorageKey = `${PURCHASE_DEDUP_PREFIX}${params.reservationCode}`
  if (safeReadStorage(dedupStorageKey)) {
    return
  }
  safeWriteStorage(dedupStorageKey, new Date().toISOString())

  // Deterministic event_id shared 1:1 with Server-Side Meta CAPI (`pur_${reservationCode}`)
  const eventId = `pur_${params.reservationCode}`
  const value = Number((params.value || 0).toFixed(2))
  const numItems = Math.max(1, (params.nights || 1) * (params.roomsCount || 1))

  emitGtagEvent("purchase", {
    transaction_id: params.reservationCode,
    value,
    currency: "BRL",
    payment_type: params.paymentMethod || "pix",
    items: [
      {
        item_id: "corpflats_suite",
        item_name: "Suíte CorpFlats Site Oficial",
        quantity: numItems,
      },
    ],
  })

  if (activeTrackingConfig.googleAdsId && activeTrackingConfig.googleAdsConversionLabel) {
    emitGtagEvent("conversion", {
      send_to: `${activeTrackingConfig.googleAdsId}/${activeTrackingConfig.googleAdsConversionLabel}`,
      value,
      currency: "BRL",
      transaction_id: params.reservationCode,
    })
  }

  emitMetaStandardEvent(
    "Purchase",
    {
      value,
      currency: "BRL",
      order_id: params.reservationCode,
      content_type: "product",
      content_ids: ["corpflats_suite"],
      num_items: numItems,
    },
    eventId
  )
}

export function trackWhatsAppConciergeClick(params: {
  placement: string
  pagePath: string
  checkinDate?: string
  checkoutDate?: string
  nights?: number
  totalGuests?: number
  ratePlan?: string
  value?: number
}): void {
  const sessionId = getSessionTrackingId()
  const eventId = `wa_${sessionId}_${params.placement}`
  const value = typeof params.value === "number" ? Number(params.value.toFixed(2)) : 0

  emitGtagEvent("whatsapp_concierge_click", {
    placement: params.placement,
    page_path: params.pagePath,
    checkin_date: params.checkinDate || "",
    checkout_date: params.checkoutDate || "",
    nights: params.nights ?? 0,
    guests: params.totalGuests ?? 1,
    rate_plan: params.ratePlan || "",
    currency: "BRL",
    value,
  })

  emitMetaStandardEvent(
    "Contact",
    {
      content_name: params.placement,
      content_category: params.pagePath,
      currency: "BRL",
      value,
    },
    eventId
  )
}

export function trackDirectPerkClick(params: {
  portalSource: string
  action: "open_site" | "save_vcard" | "copy_link" | "google_review"
  channel?: string
}): void {
  emitGtagEvent("direct_perk_click", {
    portal_source: params.portalSource,
    perk_action: params.action,
    origin_channel: params.channel || "unknown",
  })

  emitMetaCustomEvent("DirectPerkClick", {
    portal_source: params.portalSource,
    action: params.action,
    channel: params.channel || "unknown",
  })
}
