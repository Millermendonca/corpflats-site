import { useState, useEffect, useRef, useMemo, Suspense, lazy } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import {
  Building2, Calendar, Wifi, Tv, Wind, Coffee, ShieldCheck,
  Sparkles, CheckCircle2, ArrowRight, CreditCard, QrCode, Copy, Check, Star, Car, Utensils,
  Ban, MessageCircle, KeyRound, MapPin, ExternalLink, Mail,
  Dumbbell, Waves, Flame, ChevronDown,
  UserCheck, LogOut, User, ChevronRight, ChevronLeft, Image as ImageIcon,
  Save, Sun, Gamepad2, Instagram
} from "lucide-react"
import { format, addDays, differenceInDays, parseISO } from "date-fns"
import { useLocation } from "wouter"
import { AddToCalendar } from "@/components/add-to-calendar"
import { AuthModal } from "@/components/auth-modal"
import { CompleteProfileModal } from "@/components/complete-profile-modal"
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { cancelGoogleOneTap, getCurrentSession, logoutAccount } from "@/lib/auth-client"
import {
  type LandingPageSlug,
  resolveLandingSlugFromPath,
  getLandingPageSpec,
  resolveInitialBookingParams,
  computeDynamicRatingSummary,
  normalizeSohoPhotoBase,
  getHeroResponsiveSrcSet,
} from "@/lib/seo-landing-pages"
import {
  captureAttributionOnLoad,
  initPublicAnalytics,
  getSessionTrackingId,
  trackViewItem,
  trackSelectDates,
  trackBeginCheckout,
} from "@/lib/analytics-tracking"
import {
  type ConciergePlacement,
  openSmartWhatsAppConcierge,
} from "@/lib/whatsapp-concierge"

let funnelModalImportPromise: Promise<{ default: React.ComponentType<any> }> | null = null
const loadBookingFunnelModalModule = () => {
  if (!funnelModalImportPromise) {
    funnelModalImportPromise = import("@/components/booking-funnel-modal").then((mod) => ({
      default: mod.default || mod.BookingFunnelModal,
    }))
  }
  return funnelModalImportPromise
}
const preloadBookingFunnelModal = () => {
  void loadBookingFunnelModalModule().catch(() => {
    funnelModalImportPromise = null
  })
}
const LazyBookingFunnelModal = lazy(loadBookingFunnelModalModule)

export interface RoomConfig {
  id: number
  bedType: "queen" | "twin"
  adults: number
}

export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return ""
  const parts = isoDate.split("-")
  if (parts.length !== 3) return isoDate
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatPhoneNumber(phone: string): string {
  if (!phone) return "(22) 99712-4021"
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4)
    const part1 = digits.slice(4, 9)
    const part2 = digits.slice(9)
    return `(${ddd}) ${part1}-${part2}`
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4)
    const part1 = digits.slice(4, 8)
    const part2 = digits.slice(8)
    return `(${ddd}) ${part1}-${part2}`
  }
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2)
    const part1 = digits.slice(2, 7)
    const part2 = digits.slice(7)
    return `(${ddd}) ${part1}-${part2}`
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2)
    const part1 = digits.slice(2, 6)
    const part2 = digits.slice(6)
    return `(${ddd}) ${part1}-${part2}`
  }
  return phone
}

function readSavedBookingDraft(): any | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("corpflats_funnel_draft_v1")
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || Date.now() - Number(parsed.savedAt) > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("corpflats_funnel_draft_v1")
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export interface BookingEngineProps {
  landingSlug?: LandingPageSlug
}

export default function BookingEngine({ landingSlug }: BookingEngineProps = {}) {
  const [locationPath, setLocation] = useLocation()
  const { toast } = useToast()
  const returnToAccountRef = useRef(false)

  const activeSlug: LandingPageSlug = useMemo(() => {
    if (landingSlug) return landingSlug
    const currentPath =
      locationPath || (typeof window !== "undefined" ? window.location.pathname : "/")
    return resolveLandingSlugFromPath(currentPath)
  }, [landingSlug, locationPath])

  const initialBookingParams = useMemo(() => {
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : activeSlug === "home" ? "/" : `/${activeSlug}`
    const search = typeof window !== "undefined" ? window.location.search : ""
    const savedDraft = activeSlug === "home" ? readSavedBookingDraft() : null
    return resolveInitialBookingParams(pathname, search, savedDraft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [checkin, setCheckin] = useState<string>(() => initialBookingParams.checkin)
  const [checkout, setCheckout] = useState<string>(() => initialBookingParams.checkout)

  // Carrinho de Flats / Multi-Quartos (1 a N flats)
  const [rooms, setRooms] = useState<RoomConfig[]>(() => {
    const count = Math.max(1, Number(initialBookingParams.roomsCount) || 1)
    const bedType = initialBookingParams.bedType === "twin" ? "twin" : "queen"
    const adults = Math.min(3, Math.max(1, Number(initialBookingParams.adults) || 2))
    return Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      bedType,
      adults,
    }))
  })

  const [availabilityData, setAvailabilityData] = useState<any>(null)
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [showStickyBottom, setShowStickyBottom] = useState(false)

  // Modo de Edição Visual Ao Vivo (On-Page Editor)
  const [isVisualEditMode, setIsVisualEditMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.search.includes("edit=true") || window.location.hash.includes("edit=true")
    }
    return false
  })
  const [isSavingSite, setIsSavingSite] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && (window.location.search.includes("edit=true") || window.location.hash.includes("edit=true"))) {
      setIsVisualEditMode(true)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const cardEl = document.getElementById("reserva-rapida")
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect()
        setShowStickyBottom(rect.bottom < 80)
      } else {
        setShowStickyBottom(window.scrollY > 350)
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Preload em idle do chunk BookingFunnelModal após LCP estabilizar (2.5s)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        ;(window as any).requestIdleCallback(() => preloadBookingFunnelModal(), { timeout: 2000 })
      } else {
        preloadBookingFunnelModal()
      }
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  const updateNestedConfig = (pathStr: string, val: string) => {
    const keys = pathStr.split(".")
    setSiteConfig((prev: any) => {
      const clone = JSON.parse(JSON.stringify(prev || {}))
      let cur = clone
      for (let i = 0; i < keys.length - 1; i++) {
        if (!cur[keys[i]]) cur[keys[i]] = {}
        cur = cur[keys[i]]
      }
      cur[keys[keys.length - 1]] = val
      return clone
    })
  }

  const handleSaveVisualEdits = async () => {
    setIsSavingSite(true)
    try {
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteConfig)
      })
      if (res.ok) {
        toast({
          title: "Alterações salvas",
          description: "As alterações visuais foram publicadas com sucesso no site.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Falha ao salvar",
          description: "Não foi possível salvar as alterações no servidor.",
        })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Erro de conexão",
        description: "Verifique sua conexão e tente salvar novamente.",
      })
    } finally {
      setIsSavingSite(false)
    }
  }

  // Pet Friendly States
  const [bringingPet, setBringingPet] = useState<boolean>(() => Boolean(initialBookingParams.bringingPet))
  const [petCount, setPetCount] = useState(1)
  const [petRulesAccepted, setPetRulesAccepted] = useState(false)

  // Regime de Hospedagem: "with_breakfast" | "room_only"
  const [ratePlan, setRatePlan] = useState<"with_breakfast" | "room_only">(
    () => initialBookingParams.ratePlan
  )

  // Booking Flow States
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [hasOpenedFunnel, setHasOpenedFunnel] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState<any | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pixKeyCopied, setPixKeyCopied] = useState(false)
  const [settings, setSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  const [breakfastZoomOpen, setBreakfastZoomOpen] = useState(false)

  // Guest Account & Auth States
  const [guestAccount, setGuestAccount] = useState<any | null>(() => {
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false)
  const [profileToComplete, setProfileToComplete] = useState<any | null>(null)

  // Guest fields & Auto-Fill Mode
  const [guestName, setGuestName] = useState(() => {
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      if (raw) {
        const p = JSON.parse(raw)
        return p.name || ""
      }
    } catch {}
    return ""
  })
  const [guestPhone, setGuestPhone] = useState(() => {
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      if (raw) {
        const p = JSON.parse(raw)
        return p.phone || ""
      }
    } catch {}
    return ""
  })
  const [guestEmail, setGuestEmail] = useState(() => {
    try {
      return localStorage.getItem("corpflats_guest_email") || ""
    } catch {
      return ""
    }
  })
  const [guestDocument, setGuestDocument] = useState(() => {
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      if (raw) {
        const p = JSON.parse(raw)
        return p.document || ""
      }
    } catch {}
    return ""
  })

  // Veículo & Estacionamento
  const [hasVehicle, setHasVehicle] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")

  // Banco Inter PIX Modal States
  const [pixModalOpen, setPixModalOpen] = useState(false)
  const [interPixData, setInterPixData] = useState<any | null>(null)
  const [currentPendingRes, setCurrentPendingRes] = useState<any | null>(null)

  // Mercado Pago Cartão de Crédito Modal States
  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null)
  const [mpResData, setMpResData] = useState<any | null>(null)

  // Dados da Empresa (PJ) para Faturamento
  const [isWorkTrip, setIsWorkTrip] = useState<boolean>(() => Boolean(initialBookingParams.isWorkTrip))
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")

  const [, setLoadingFlats] = useState(false)

  // Especificação ativa do Silo de SEO Local (5 páginas indexáveis + overrides do Site Editor)
  const lpSpec = useMemo(
    () => getLandingPageSpec(activeSlug, siteConfig),
    [activeSlug, siteConfig]
  )
  const ratingSummary = useMemo(
    () => computeDynamicRatingSummary(siteConfig),
    [siteConfig]
  )

  // Transição suave entre LPs do Silo via SPA (preservando query params explícitos se houver)
  const prevSlugRef = useRef<LandingPageSlug>(activeSlug)
  useEffect(() => {
    if (prevSlugRef.current === activeSlug) return
    prevSlugRef.current = activeSlug
    setActivePhotoIdx(0)
    setFaqOpen(null)
    const search = typeof window !== "undefined" ? window.location.search : ""
    const nextParams = resolveInitialBookingParams(
      lpSpec.path,
      search,
      activeSlug === "home" ? readSavedBookingDraft() : null
    )
    setCheckin(nextParams.checkin)
    setCheckout(nextParams.checkout)
    setRatePlan(nextParams.ratePlan)
    setIsWorkTrip(Boolean(nextParams.isWorkTrip))
    setRooms((prev) => {
      const first = prev[0] || { id: 1, bedType: "queen" as const, adults: 2 }
      return [{ ...first, adults: Math.min(3, Math.max(1, Number(nextParams.adults) || 2)) }]
    })
  }, [activeSlug, lpSpec.path])

  const handleSiloLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, targetPath: string) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return
    }
    e.preventDefault()
    const currentSearch = typeof window !== "undefined" ? window.location.search : ""
    const preservedParams = new URLSearchParams(currentSearch)
    preservedParams.delete("checkin")
    preservedParams.delete("checkout")
    preservedParams.delete("adults")
    const qs = preservedParams.toString()
    setLocation(`${targetPath}${qs ? `?${qs}` : ""}`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const applyGuestData = (account: any, triggerCompletionCheck = false) => {
    if (!account) return
    setGuestAccount(account)
    if (account.name) setGuestName(account.name)
    if (account.phone) setGuestPhone(account.phone)
    if (account.email) setGuestEmail(account.email)
    if (account.document) setGuestDocument(account.document)

    if (account.companyData) {
      setIsWorkTrip(true)
      if (account.companyData.cnpj) setCompanyCnpj(account.companyData.cnpj)
      if (account.companyData.companyName) setCompanyName(account.companyData.companyName)
      if (account.companyData.companyEmail) setCompanyEmail(account.companyData.companyEmail)
      if (account.companyData.companyPhone) setCompanyPhone(account.companyData.companyPhone)
    }

    if (account.vehicle && account.vehicle.plate) {
      setHasVehicle(true)
      setVehiclePlate(account.vehicle.plate)
      setVehicleBrand(account.vehicle.brand || "")
      setVehicleModel(account.vehicle.model || "")
      setVehicleColor(account.vehicle.color || "")
    }

    try {
      if (account.email) {
        localStorage.setItem("corpflats_guest_email", account.email)
      }
      localStorage.setItem("corpflats_guest_profile", JSON.stringify(account))
    } catch {}

    cancelGoogleOneTap()

    if (triggerCompletionCheck && (!account.phone || !account.document || account.phone.replace(/\D/g, "").length < 10)) {
      setProfileToComplete(account)
      setCompleteProfileModalOpen(true)
    }
  }

  const handleLogout = async () => {
    await logoutAccount()
    setGuestAccount(null)
    setGuestName("")
    setGuestPhone("")
    setGuestEmail("")
    setGuestDocument("")
    setHasVehicle(false)
    setVehiclePlate("")
    setIsWorkTrip(Boolean(lpSpec.defaultIsWorkTrip))
    setCompanyCnpj("")
    setCompanyName("")
    setCompanyEmail("")
    setCompanyPhone("")
    localStorage.removeItem("corpflats_guest_email")
    localStorage.removeItem("corpflats_guest_token")
    localStorage.removeItem("corpflats_guest_profile")
    cancelGoogleOneTap()
  }

  useEffect(() => {
    captureAttributionOnLoad()

    fetch("/api/settings")
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})

    fetch("/api/site-content")
      .then(r => r.json())
      .then(d => {
        setSiteConfig(d)
        if (d?.tracking) {
          initPublicAnalytics(d.tracking)
        }
      })
      .catch(() => {})

    ;(window as any).handleGoogleOneTapGlobal = async (response: any) => {
      if (response?.credential) {
        try {
          const res = await fetch("/api/v2/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ credential: response.credential })
          })
          const data = await res.json()
          if (data.success && data.user) {
            applyGuestData(data.user, true)
            cancelGoogleOneTap()
          }
        } catch {}
      }
    }

    // Validação silenciosa de sessão existente (sem disparar Google One Tap no carregamento frio: zero ruído / zero TBT inicial)
    const initAuthSession = async () => {
      const sessionUser = await getCurrentSession()
      if (sessionUser) {
        applyGuestData(sessionUser, false)
        return
      }

      const savedToken = localStorage.getItem("corpflats_guest_token")
      if (savedToken) {
        try {
          const res = await fetch("/api/guest-auth/profile", {
            credentials: "include",
            headers: { Authorization: `Bearer ${savedToken}` }
          })
          if (res.ok) {
            const d = await res.json()
            if (d.guest) {
              applyGuestData(d.guest, false)
              return
            }
          }
        } catch {}
      }

      const rawProfile = localStorage.getItem("corpflats_guest_profile")
      if (rawProfile) {
        try {
          const parsed = JSON.parse(rawProfile)
          if (parsed && (parsed.email || parsed.name)) {
            applyGuestData(parsed, false)
          }
        } catch {}
      }
    }

    initAuthSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza <title>, <meta name="description"> e <link rel="canonical"> em transições SPA entre as 5 LPs
  useEffect(() => {
    const homeCustomTitle = activeSlug === "home" ? siteConfig?.seo?.title?.trim() : ""
    document.title = homeCustomTitle || lpSpec.title
    if (typeof document !== "undefined") {
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc) {
        metaDesc.setAttribute("content", lpSpec.metaDescription)
      }
      let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
      if (!canonicalEl) {
        canonicalEl = document.createElement("link")
        canonicalEl.rel = "canonical"
        document.head.appendChild(canonicalEl)
      }
      canonicalEl.href = lpSpec.canonicalUrl
    }
  }, [activeSlug, lpSpec.title, lpSpec.metaDescription, lpSpec.canonicalUrl, siteConfig?.seo?.title])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("login") === "1") {
      returnToAccountRef.current = true
      setAuthModalOpen(true)
      toast({
        title: "Faça login para acessar Minha Conta",
        description: "Entre com seu e-mail, Google ou chave de acesso para ver suas reservas e dados cadastrais.",
      })
      params.delete("login")
      const nextQuery = params.toString()
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`
      window.history.replaceState({}, "", nextUrl)
    }
  }, [toast])

  useEffect(() => {
    searchAvailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin, checkout, ratePlan])

  const searchAvailability = async () => {
    setLoadingFlats(true)
    try {
      const res = await fetch(`/api/reservations/availability?checkin=${checkin}&checkout=${checkout}`)
      if (res.ok) {
        const data = await res.json()
        setAvailabilityData(data)
        if (!data.allowTwinBeds) {
          setRooms((prev) =>
            prev.some((r) => r.bedType === "twin")
              ? prev.map((r) => (r.bedType === "twin" ? { ...r, bedType: "queen" } : r))
              : prev
          )
        }
      }
    } catch {
      // Fallback silencioso
    } finally {
      setLoadingFlats(false)
    }
  }

  const nights = Math.max(1, differenceInDays(parseISO(checkout || checkin), parseISO(checkin)))
  const flatsCount = rooms.length
  const totalGuestsCount = rooms.reduce((acc, r) => acc + (Number(r.adults) || 1), 0)

  // Regra de corte temporal (padrão 12:00 em America/Sao_Paulo) para reservas com check-in hoje + controle de 3º hóspede
  const nowObj = new Date()
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowObj)
  const brtParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(nowObj)
  const brtHour = parseInt(brtParts.find((p) => p.type === "hour")?.value || "0", 10) || 0
  const brtMinute = parseInt(brtParts.find((p) => p.type === "minute")?.value || "0", 10) || 0
  const nowMinutes = brtHour * 60 + brtMinute
  const twinCutoffTimeStr = String(siteConfig?.bedConfig?.twinSameDayCutoffTime || "12:00")
  const [cutoffH, cutoffM] = twinCutoffTimeStr.split(":").map((n) => parseInt(n, 10) || 0)
  const isCheckinToday = checkin === todayStr
  const isCutoffActive = isCheckinToday && nowMinutes >= (cutoffH * 60 + cutoffM)
  const isThirdGuestEnabled = Boolean(siteConfig?.extraBedConfig?.enabled === true) && !(isCheckinToday && nowMinutes >= ((Number(siteConfig?.extraBedConfig?.cutoffHour) || 12) * 60))

  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => ({
        ...r,
        bedType: isCutoffActive || siteConfig?.bedConfig?.allowTwinBeds === false ? "queen" : r.bedType,
        adults: !isThirdGuestEnabled && r.adults > 2 ? 2 : r.adults,
      }))
    )
  }, [checkin, isCutoffActive, isThirdGuestEnabled, siteConfig?.bedConfig?.allowTwinBeds])

  const addRoom = () => {
    const maxAvailable = availabilityData?.totalAvailableFlats || 5
    if (rooms.length >= maxAvailable) {
      toast({
        title: "Limite de disponibilidade atingido",
        description: `No momento há ${maxAvailable} flats disponíveis para as datas selecionadas.`,
      })
      return
    }
    const newId = rooms.length > 0 ? Math.max(...rooms.map(r => r.id)) + 1 : 1
    setRooms([...rooms, { id: newId, bedType: "queen", adults: 2 }])
  }

  const removeRoom = (id: number) => {
    if (rooms.length <= 1) return
    setRooms(rooms.filter(r => r.id !== id))
  }

  const updateRoom = (id: number, field: "bedType" | "adults", value: any) => {
    if (field === "adults" && Number(value) > 2 && !isThirdGuestEnabled) {
      if (siteConfig?.extraBedConfig?.enabled === true && isCheckinToday) {
        toast({
          title: "Lotação limitada para hoje",
          description: "Para reservas com check-in hoje após as 12:00, a lotação é limitada a até 2 hóspedes por flat.",
        })
      }
      return
    }
    if (field === "bedType" && value === "twin") {
      if (siteConfig?.bedConfig?.allowTwinBeds === false) return
      if (isCutoffActive) {
        toast({
          title: "Horário limite para camas de solteiro",
          description: `Para reservas com check-in no mesmo dia, a montagem de 2 camas de solteiro só pode ser solicitada até as ${twinCutoffTimeStr}.`,
        })
        return
      }
    }
    setRooms(rooms.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const formatBrl = (val: number) =>
    Number(val || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(Math.round(Number(val || 0) * 100) / 100) ? 0 : 2,
      maximumFractionDigits: 2,
    })

  // Precificação dinâmica sincronizada com SEBRAE / Calendário / Preços
  const dynPricing = availabilityData?.dynamicPricing
  const breakfastSurchargePerGuest = Number(
    dynPricing?.breakfastSurchargePerGuest ??
    siteConfig?.pricing?.breakfastSurchargePerGuest ??
    20
  )
  const cardMarkupPercent = Number(
    dynPricing?.cardMarkupPercent ??
    siteConfig?.pricing?.cardMarkupPercent ??
    siteConfig?.pricing?.pixDiscountPercent ??
    5
  )
  const fallbackBaseSemCafe = Number(
    dynPricing?.avgRoomOnlyRate ??
    siteConfig?.ratePlans?.room_only?.dailyRate ??
    216.49
  )
  const perNightBaseSemCafe: number[] =
    Array.isArray(dynPricing?.discountedSemCafeRates) && dynPricing.discountedSemCafeRates.length === nights
      ? dynPricing.discountedSemCafeRates.map((d: any) => Number(d.rate) || fallbackBaseSemCafe)
      : Array.from({ length: nights }, () => fallbackBaseSemCafe)

  const roomOnlyPixSubtotal = Math.round(
    perNightBaseSemCafe.reduce((acc, r) => acc + r * flatsCount, 0) * 100
  ) / 100
  const withBreakfastPixSubtotal = Math.round(
    perNightBaseSemCafe.reduce(
      (acc, r) =>
        acc +
        rooms.reduce(
          (s, rm) => s + Math.round((r + Math.min(3, Math.max(1, Number(rm.adults) || 1)) * breakfastSurchargePerGuest) * 100) / 100,
          0
        ),
      0
    ) * 100
  ) / 100

  const roomOnlyAvgRate = Math.round((roomOnlyPixSubtotal / (nights * flatsCount)) * 100) / 100
  const withBreakfastAvgRate = Math.round((withBreakfastPixSubtotal / (nights * flatsCount)) * 100) / 100

  const rawWithBreakfast = siteConfig?.ratePlans?.with_breakfast || {}
  const withBreakfastConfig = {
    dailyRate: withBreakfastAvgRate,
    cleaningFeeType: "per_stay",
    description: "Diária com Café da Manhã servido exclusivamente no flat",
    ...rawWithBreakfast,
    dailyRateComputed: withBreakfastAvgRate,
    cleaningFeeEnabled: Boolean(rawWithBreakfast.cleaningFeeEnabled),
    cleaningFeeAmount: Number(rawWithBreakfast.cleaningFeeAmount ?? 0)
  }
  withBreakfastConfig.dailyRate = withBreakfastAvgRate

  const rawRoomOnly = siteConfig?.ratePlans?.room_only || {}
  const roomOnlyConfig = {
    dailyRate: roomOnlyAvgRate,
    cleaningFeeType: "per_stay",
    description: "Hospedagem em flat completo sem café da manhã",
    ...rawRoomOnly,
    dailyRateComputed: roomOnlyAvgRate,
    cleaningFeeEnabled: rawRoomOnly.cleaningFeeEnabled !== false,
    cleaningFeeAmount: Number(rawRoomOnly.cleaningFeeAmount ?? 50)
  }
  roomOnlyConfig.dailyRate = roomOnlyAvgRate

  const currentPlan = ratePlan === "with_breakfast" ? withBreakfastConfig : roomOnlyConfig
  const selectedDailyRate = ratePlan === "with_breakfast" ? withBreakfastAvgRate : roomOnlyAvgRate
  const subtotal = ratePlan === "with_breakfast" ? withBreakfastPixSubtotal : roomOnlyPixSubtotal

  const cleaningFeePerFlat = currentPlan.cleaningFeeEnabled
    ? (currentPlan.cleaningFeeType === "per_night" ? (Number(currentPlan.cleaningFeeAmount) || 0) * nights : (Number(currentPlan.cleaningFeeAmount) || 0))
    : 0
  const cleaningFee = Math.round(cleaningFeePerFlat * flatsCount * 100) / 100

  const petFeePerUnit = siteConfig?.petPolicy?.feeAmount ?? 40
  const petFee = bringingPet
    ? (siteConfig?.petPolicy?.feeType === "per_night" ? petFeePerUnit * nights * petCount : petFeePerUnit * petCount)
    : 0

  const twinCount = rooms.filter(r => r.bedType === "twin").length
  const twinFeeUnit = siteConfig?.bedConfig?.twinFeeAmount ?? 30
  const twinFee = twinCount * (siteConfig?.bedConfig?.twinFeeType === "per_night" ? twinFeeUnit * nights : twinFeeUnit)

  const extraBedCount = rooms.filter(r => r.adults === 3).length
  const extraBedFeeUnit = siteConfig?.extraBedConfig?.feeAmount ?? 60
  const extraBedFee = extraBedCount * (siteConfig?.extraBedConfig?.feeType === "per_night" ? extraBedFeeUnit * nights : extraBedFeeUnit)

  const pixTotalAmount = Math.round((subtotal + cleaningFee + petFee + twinFee + extraBedFee) * 100) / 100
  const cardTotalAmount = Math.round(pixTotalAmount * (1 + cardMarkupPercent / 100) * 100) / 100
  const baseTotalAmount = cardTotalAmount

  const pixDiscountPercent = cardMarkupPercent
  const pixDiscountAmount = Math.round((cardTotalAmount - pixTotalAmount) * 100) / 100

  const totalAmount = paymentMethod === "pix" ? pixTotalAmount : cardTotalAmount
  const currentTotalDiscount = paymentMethod === "pix" ? pixDiscountAmount : 0

  // Referência comparativa contra plataformas (Booking / Airbnb)
  const otaReferenceMarkupPercent = Number(
    dynPricing?.otaComparison?.referenceMarkupPercent ??
    siteConfig?.pricing?.otaComparison?.referenceMarkupPercent ??
    15
  )
  const otaFactor = 1 + Math.max(0, otaReferenceMarkupPercent) / 100
  const otaWithBreakfastDailyRate = Math.round(withBreakfastConfig.dailyRate * otaFactor * 100) / 100
  const otaRoomOnlyDailyRate = Math.round(roomOnlyConfig.dailyRate * otaFactor * 100) / 100
  const otaTotalAmount = Math.round(pixTotalAmount * otaFactor * 100) / 100
  const otaSavingsAmount = Math.max(0, Math.round((otaTotalAmount - pixTotalAmount) * 100) / 100)

  const cancellationPolicy = calculateCancellationPolicy(
    new Date(),
    checkin,
    totalAmount,
    "14:00",
    new Date(),
    Number(siteConfig?.cancellationPolicy?.freeCancellationHours ?? 24),
    Number(siteConfig?.cancellationPolicy?.noShowPenaltyPercent ?? 100)
  )

  // Eventos Full-Funnel: view_item por LP e select_dates quando o usuário altera datas/regime
  const lastViewedSlugRef = useRef<string>("")
  useEffect(() => {
    if (lastViewedSlugRef.current === activeSlug) return
    lastViewedSlugRef.current = activeSlug
    trackViewItem({
      routeSlug: activeSlug,
      title: lpSpec.title,
      price: selectedDailyRate,
      ratePlan,
    })
  }, [activeSlug, lpSpec.title, selectedDailyRate, ratePlan])

  const hasMountedDatesRef = useRef(false)
  useEffect(() => {
    if (!hasMountedDatesRef.current) {
      hasMountedDatesRef.current = true
      return
    }
    trackSelectDates({
      checkin,
      checkout,
      nights,
      adults: totalGuestsCount,
      ratePlan,
      value: pixTotalAmount,
    })
  }, [checkin, checkout, nights, totalGuestsCount, ratePlan, pixTotalAmount])

  const handleStartBooking = (overridePlan?: "with_breakfast" | "room_only") => {
    const activePlan = overridePlan || ratePlan
    if (overridePlan) setRatePlan(overridePlan)
    preloadBookingFunnelModal()
    setHasOpenedFunnel(true)
    setCheckoutModalOpen(true)
    trackBeginCheckout({
      checkin,
      checkout,
      nights,
      roomsCount: rooms.length,
      ratePlan: activePlan,
      value: pixTotalAmount,
    })
    try {
      fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionTrackingId(),
          step: 1,
          stepName: "busca_datas",
          checkinDate: checkin,
          checkoutDate: checkout,
          ratePlan: activePlan,
          status: "pesquisando"
        })
      }).catch(() => {})
    } catch {}
  }

  const handleConfirmBooking = async () => {
    if (!guestName.trim() || !guestPhone.trim() || !guestEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Dados obrigatórios pendentes",
        description: "Por favor, preencha nome, WhatsApp e e-mail para confirmar a sua reserva.",
      })
      return
    }

    if (bringingPet && !petRulesAccepted) {
      toast({
        variant: "destructive",
        title: "Aceite do regulamento Pet necessário",
        description: "Por favor, leia e aceite as regras de convivência para animais de estimação antes de prosseguir.",
      })
      return
    }

    setIsProcessing(true)
    try {
      const payload = {
        guestName,
        guestPhone,
        guestEmail,
        guestDocument,
        checkinDate: checkin,
        checkoutDate: checkout,
        numGuests: rooms.reduce((acc, r) => acc + (Number(r.adults) || 2), 0),
        flatsCount: rooms.length,
        rooms,
        ratePlan,
        includeBreakfast: ratePlan === "with_breakfast",
        bedType: rooms.some(r => r.bedType === "twin") ? "twin" : "queen",
        twinBeds: rooms.some(r => r.bedType === "twin"),
        twinFee,
        extraBedFee,
        dailyRate: selectedDailyRate,
        cleaningFee,
        paymentMethod,
        totalAmount,
        pixTotalAmount,
        baseTotalAmount,
        cardTotalAmount,
        pixDiscountPercent,
        pixDiscountAmount: paymentMethod === "pix" ? pixDiscountAmount : 0,
        discountAmount: currentTotalDiscount,
        hasPet: bringingPet,
        petCount: bringingPet ? petCount : 0,
        petFee,
        petRulesAccepted: bringingPet ? petRulesAccepted : true,
        cancellationPolicy: cancellationPolicy.policyType,
        isWorkTrip,
        companyData: isWorkTrip ? { cnpj: companyCnpj, companyName, companyEmail, companyPhone } : null,
        vehicle: hasVehicle ? { plate: vehiclePlate, brand: vehicleBrand, model: vehicleModel, color: vehicleColor } : null
      }

      const res = await fetch("/api/reservations/direct-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (res.ok && data.reservation) {
        setConfirmedReservation(data.reservation)
        setCheckoutModalOpen(false)
        if (paymentMethod === "pix" && data.pixData) {
          setInterPixData(data.pixData)
          setCurrentPendingRes(data.reservation)
          setPixModalOpen(true)
        } else if (paymentMethod === "card" && data.initPoint) {
          setMpInitPoint(data.initPoint)
          setMpResData(data.reservation)
          setCardModalOpen(true)
          window.open(data.initPoint, "_blank")
        } else {
          setCurrentPendingRes(data.reservation)
          toast({
            title: "Reserva confirmada!",
            description: "Sua solicitação de reserva foi confirmada com sucesso.",
          })
        }
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível concluir a reserva",
          description: data.error || "Erro ao processar reserva.",
        })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Falha de conexão",
        description: "Erro ao conectar com o servidor. Tente novamente em instantes.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const whatsappNumber = siteConfig?.branding?.whatsapp || settings?.adminWhatsApp || "5522997124021"

  const handleOpenConcierge = (placement: ConciergePlacement) => {
    openSmartWhatsAppConcierge({
      whatsappNumber,
      placement,
      pagePath: lpSpec.path,
      pageLabel: lpSpec.breadcrumbLabel,
      checkinDate: checkin,
      checkoutDate: checkout,
      nights,
      adultsCount: totalGuestsCount,
      roomsCount: rooms.length,
      bedType: rooms.some((r) => r.bedType === "twin") ? "twin" : "queen",
      ratePlan,
      pixTotalAmount,
      isWorkTrip,
    })
  }

  // Hero Data & Conteúdo Real do Edifício Soho Residence Service (por LP + Site Editor)
  const heroTitle =
    activeSlug === "home" &&
    siteConfig?.hero?.title &&
    !siteConfig.hero.title.includes("Macaé") &&
    !siteConfig.hero.title.includes("Sua Estadia com Conforto")
      ? siteConfig.hero.title
      : lpSpec.h1
  const heroHighlight =
    activeSlug === "home" &&
    siteConfig?.hero?.highlightText &&
    !siteConfig.hero.highlightText.includes("Luz Natural e Sofisticação")
      ? siteConfig.hero.highlightText
      : lpSpec.highlightText
  const heroBg =
    activeSlug === "home" &&
    siteConfig?.hero?.backgroundImage &&
    !siteConfig.hero.backgroundImage.includes("images.unsplash.com")
      ? siteConfig.hero.backgroundImage
      : lpSpec.heroImageUrl

  const heroAvifSrcSet = useMemo(() => getHeroResponsiveSrcSet(heroBg, "avif"), [heroBg])
  const heroWebpSrcSet = useMemo(() => getHeroResponsiveSrcSet(heroBg, "webp"), [heroBg])

  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") ? siteConfig.branding.brandName : "CorpFlats"
  const instagramHandle = siteConfig?.branding?.instagram || "@corpflats"
  const instagramUrl = siteConfig?.branding?.instagramUrl || `https://instagram.com/${instagramHandle.replace(/^@/, "") || "corpflats"}`

  const amenitiesList = (Array.isArray(siteConfig?.amenities) && siteConfig.amenities.length > 0 && !siteConfig.amenities.some((a: any) => String(a?.title || "").includes("Piscina com Deck") || String(a?.title || "").includes("55\"")))
    ? siteConfig.amenities
    : [
        { id: "jacuzzi", icon: "Sparkles", title: "Jacuzzi Aquecida na Cobertura", description: "Hidromassagem com água aquecida e deck de madeira no rooftop, liberada para todos os hóspedes.", badge: "Cobertura" },
        { id: "terraco", icon: "Sun", title: "Terraço com Vista Panorâmica", description: "Área aberta no topo do Edifício Soho com vista panorâmica para toda Campos dos Goytacazes.", badge: "Vista" },
        { id: "saunas", icon: "Flame", title: "Saunas Seca e a Vapor", description: "Espaço de spa no condomínio com sauna seca, sauna úmida e área de descanso.", badge: "Spa" },
        { id: "academia", icon: "Dumbbell", title: "Academia Climatizada", description: "Sala de musculação e cardio equipada no próprio edifício, de livre acesso na estadia.", badge: "Fitness" },
        { id: "jogos", icon: "Gamepad2", title: "Sala de Jogos", description: "Salão climatizado com sinuca, tênis de mesa e pebolim disponível aos hóspedes.", badge: "Lazer" },
        { id: "garagem", icon: "Car", title: "1 Vaga de Garagem Coberta", description: "Estacionamento privativo no edifício para 1 veículo de passeio já incluso na diária.", badge: "Incluso" },
        { id: "recepcao", icon: "KeyRound", title: "Recepção 24h & Cartão NFC", description: "Pré-check-in digital rápido e retirada do cartão magnético NFC direto na recepção 24h.", badge: "24 Horas" },
        { id: "cafe", icon: "Coffee", title: "Café da Manhã no Flat", description: "Na tarifa com café, a bandeja é entregue no seu apartamento entre 05:00 e 09:30.", badge: "05h às 09h30" }
      ]

  const galleryList = (Array.isArray(siteConfig?.gallery) && siteConfig.gallery.length > 0 && !siteConfig.gallery.some((g: any) => String(g?.imageUrl || "").includes("images.unsplash.com")))
    ? siteConfig.gallery
    : [
        { id: 1, title: "Quarto Integrado & Bancada de Trabalho", category: "O Flat", imageUrl: "/photos/soho/01-quarto-bancada.jpg" },
        { id: 2, title: "Visão Geral do Flat (Quarto, Estar & Cozinha)", category: "O Flat", imageUrl: "/photos/soho/02-flat-integrado.jpg" },
        { id: 3, title: "Mesa de Refeições & Apoio", category: "O Flat", imageUrl: "/photos/soho/03-mesa-jantar.jpg" },
        { id: 4, title: "Cozinha Compacta Equipada", category: "Cozinha", imageUrl: "/photos/soho/04-cozinha-equipada.jpg" },
        { id: 5, title: "Café da manhã servido na mesa do flat", category: "Café no Flat", imageUrl: "/photos/soho/cafe-mesa-quarto.jpg" },
        { id: 6, title: "Banheiro Privativo com Secador de Parede", category: "Banheiro", imageUrl: "/photos/soho/05-banheiro.jpg" },
        { id: 7, title: "Cobertura com Jacuzzi Aquecida & Deck", category: "Lazer & Cobertura", imageUrl: "/photos/soho/06-cobertura-jacuzzi.jpg" },
        { id: 8, title: "Terraço Panorâmico no Topo do Soho", category: "Lazer & Cobertura", imageUrl: "/photos/soho/07-terraco-panoramico.jpg" },
        { id: 9, title: "Spa com Saunas Seca e a Vapor", category: "Lazer & Cobertura", imageUrl: "/photos/soho/08-spa-saunas.jpg" },
        { id: 10, title: "Academia Climatizada do Condomínio", category: "Lazer & Cobertura", imageUrl: "/photos/soho/09-academia.jpg" },
        { id: 11, title: "Sala de Jogos Climatizada", category: "Lazer & Cobertura", imageUrl: "/photos/soho/10-sala-de-jogos.jpg" },
        { id: 12, title: "Lobby & Elevadores do Edifício Soho", category: "Recepção & Acesso", imageUrl: "/photos/soho/11-lobby-elevadores.jpg" },
        { id: 13, title: "Fachada & Entrada da Garagem Coberta (nº 209)", category: "Recepção & Acesso", imageUrl: "/photos/soho/12-fachada-garagem.jpg" }
      ]

  const orderedGalleryList = useMemo(() => {
    const preferredBases = (lpSpec.preferredGalleryUrls || []).map((u) => normalizeSohoPhotoBase(u))
    if (preferredBases.length === 0) return galleryList
    return [...galleryList].sort((a: any, b: any) => {
      const idxA = preferredBases.indexOf(normalizeSohoPhotoBase(a?.imageUrl || ""))
      const idxB = preferredBases.indexOf(normalizeSohoPhotoBase(b?.imageUrl || ""))
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [galleryList, lpSpec.preferredGalleryUrls])

  const DEFAULT_GOOGLE_TESTIMONIALS = [
    {
      id: 1,
      name: "Giselia Correa",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "Passamos 4 diárias no flat, fomos muito bem atendidos pelo sr Miller e sua esposa, eles são pessoas muito atenciosas, nos trataram com muito carinho. O café da manhã é bem servido e pontual, tudo fresquinho, o pão de queijo bem quentinho, tudo com excelência. Amamos super recomendo!!!!"
    },
    {
      id: 2,
      name: "Carlos Aprigio",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "Hospedagem maravilhosa, com quarto limpinho, cheiroso, com um lugar super calmo e silencioso, tratamento super bacana, estacionamento seguro, as pessoas trabalhando com muito carinho e atenção!! Resumindo!! Muito bom 😊 Recomendo 💯"
    },
    {
      id: 3,
      name: "GG Cordeiro",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "Tudo perfeito, clareza nas informações, ambiente muito agradável, acomodação impecável, parabéns a Corp Flats!"
    },
    {
      id: 4,
      name: "Paula Ladeira Vidal",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "O Flat estava limpo e bem equipado, também fica localizado perto de bares, restaurantes e farmácias, em área central de Campos. O estacionamento é gratuito. Recomendo!"
    },
    {
      id: 5,
      name: "Hugo Alves",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "Quando vou a Campos sempre fico nesse Flat, muito limpo e organizado, tem tudo que preciso num lugar só."
    },
    {
      id: 6,
      name: "Jean Sant'Anna",
      city: "Avaliação 5★ no Google",
      rating: 5,
      comment: "Foi uma experiência bem legal. Ótimo café da manhã. Quarto limpo e aconchegante. Boa localização. Nada a reclamar 🙌"
    }
  ]

  const FAKE_DEFAULT_NAMES = new Set(["Mariana Silveira", "Carlos Eduardo Mendes", "Patrícia & Rodrigo"])
  const filteredSiteTestimonials = Array.isArray(siteConfig?.testimonials)
    ? siteConfig.testimonials.filter((t: any) => t?.comment && !FAKE_DEFAULT_NAMES.has(String(t?.name || "").trim()))
    : []
  const rawTestimonialsList = filteredSiteTestimonials.length > 0 ? filteredSiteTestimonials : DEFAULT_GOOGLE_TESTIMONIALS
  const testimonialsList = useMemo(() => {
    const prio = lpSpec.prioritizedTestimonialNames || []
    if (prio.length === 0) return rawTestimonialsList
    return [...rawTestimonialsList].sort((a: any, b: any) => {
      const idxA = prio.findIndex((n) => String(a?.name || "").toLowerCase().includes(n.toLowerCase()))
      const idxB = prio.findIndex((n) => String(b?.name || "").toLowerCase().includes(n.toLowerCase()))
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [rawTestimonialsList, lpSpec.prioritizedTestimonialNames])

  const aboutRoomItems: string[] = Array.isArray(siteConfig?.about?.roomItems) && siteConfig.about.roomItems.filter(Boolean).length > 0
    ? siteConfig.about.roomItems.filter(Boolean)
    : [
        "Cama Queen Casal com enxoval completo (ou 2 camas de solteiro mediante solicitação até 12h e taxa adicional)",
        "Bancada dedicada para notebook com tomadas ao alcance e Wi-Fi individual",
        "Smart TV 32\" e ar-condicionado",
        "Guarda-roupa, ferro de passar roupa e secador de cabelo no banheiro"
      ]

  const aboutKitchenItems: string[] = Array.isArray(siteConfig?.about?.kitchenItems) && siteConfig.about.kitchenItems.filter(Boolean).length > 0
    ? siteConfig.about.kitchenItems.filter(Boolean)
    : [
        "Fogão cooktop 2 bocas, frigobar, cafeteira elétrica e sanduicheira",
        "Pratos, talheres, copos, taças e saca-rolhas prontos para uso",
        "Mesa para refeições rápidas no próprio apartamento",
        "Opção de tarifa com café da manhã entregue no flat das 05:00 às 09:30"
      ]

  const faqList =
    activeSlug === "home" &&
    Array.isArray(siteConfig?.faq) &&
    siteConfig.faq.length > 0 &&
    !siteConfig.faq.some((f: any) => String(f?.a || "").includes("06:30"))
      ? siteConfig.faq
      : lpSpec.faqs

  const renderAmenityIcon = (iconName: string) => {
    switch (iconName) {
      case "Wifi": return <Wifi className="w-5 h-5" aria-hidden="true" />
      case "Wind": return <Wind className="w-5 h-5" aria-hidden="true" />
      case "Waves": return <Waves className="w-5 h-5" aria-hidden="true" />
      case "Coffee": return <Coffee className="w-5 h-5" aria-hidden="true" />
      case "Car": return <Car className="w-5 h-5" aria-hidden="true" />
      case "Utensils": return <Utensils className="w-5 h-5" aria-hidden="true" />
      case "Tv": return <Tv className="w-5 h-5" aria-hidden="true" />
      case "Dumbbell": return <Dumbbell className="w-5 h-5" aria-hidden="true" />
      case "Sun": return <Sun className="w-5 h-5" aria-hidden="true" />
      case "Flame": return <Flame className="w-5 h-5" aria-hidden="true" />
      case "Gamepad2": return <Gamepad2 className="w-5 h-5" aria-hidden="true" />
      case "KeyRound": return <KeyRound className="w-5 h-5" aria-hidden="true" />
      default: return <Sparkles className="w-5 h-5" aria-hidden="true" />
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-clip">
      {/* ── Barra Fixa Flutuante do Editor Visual Ao Vivo ── */}
      {isVisualEditMode && (
        <div className="sticky top-0 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 shadow-xl flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-600 font-sans">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-900 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-950"></span>
            </span>
            <span className="font-black text-xs uppercase tracking-wider">
              ✏️ Modo Editor Visual Ao Vivo Ativo
            </span>
            <span className="text-[11px] font-medium hidden sm:inline text-slate-900/80">
              — Clique em qualquer texto ou título para editar direto na tela!
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const newUrl = prompt("Insira a URL da nova foto de fundo do Hero:", heroBg)
                if (newUrl && newUrl.trim()) {
                  updateNestedConfig("hero.backgroundImage", newUrl.trim())
                }
              }}
              className="h-8 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-xl"
            >
              <ImageIcon className="w-3.5 h-3.5 mr-1" />
              Foto de Fundo
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => {
                const newUrl = prompt("Insira a URL do logotipo:", siteConfig?.branding?.logoImage || "")
                if (newUrl !== null) {
                  updateNestedConfig("branding.logoImage", newUrl.trim())
                }
              }}
              className="h-8 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-xl"
            >
              🏷️ Logotipo
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSaveVisualEdits}
              disabled={isSavingSite}
              className="h-8 px-4 text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-md flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingSite ? "Salvando..." : "Salvar Alterações"}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href = "/"
              }}
              className="h-8 text-xs font-bold bg-white text-slate-900 border-slate-300 hover:bg-slate-100 rounded-xl"
            >
              Sair da Edição
            </Button>
          </div>
        </div>
      )}

      {/* ── Top Announcement Bar (Discreta & Elegante) ────────────────── */}
      <div className="bg-[#091E26] text-[#E5C98B] border-b border-[#C5A059]/30 text-[11px] sm:text-xs py-1.5 px-4 text-center tracking-wide font-semibold flex items-center justify-center gap-1.5">
        <span
          contentEditable={isVisualEditMode}
          suppressContentEditableWarning={true}
          onBlur={(e) => updateNestedConfig("branding.badgeTop", e.currentTarget.innerText)}
          className={isVisualEditMode ? "outline-dashed outline-1 outline-amber-300 hover:bg-white/20 cursor-text rounded px-1" : ""}
        >
          {lpSpec.badgeTop}
        </span>
      </div>

      {/* ── Top Navigation Bar (Silo Local + Navegação Limpa) ───────── */}
      <nav className={`${isVisualEditMode ? "relative" : "sticky top-0"} z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/70 px-4 sm:px-8 py-2.5 sm:py-3 w-full max-w-full`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo CorpFlats */}
          <a
            href="/"
            onClick={(e) => {
              if (activeSlug !== "home") {
                handleSiloLinkClick(e, "/")
              } else {
                e.preventDefault()
                window.scrollTo({ top: 0, behavior: "smooth" })
              }
            }}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                width={32}
                height={32}
                className="w-8 h-8 object-contain rounded-lg shrink-0"
              />
            ) : (
              <CorpFlatsIcon className="w-8 h-8 sm:w-9 sm:h-9" />
            )}
            <div>
              {isVisualEditMode ? (
                <span
                  contentEditable={true}
                  suppressContentEditableWarning={true}
                  onBlur={(e) => updateNestedConfig("branding.brandName", e.currentTarget.innerText)}
                  className="font-bold text-base sm:text-lg tracking-tight text-[#0F3D4C] block leading-none outline-dashed outline-1 outline-[#C5A059] cursor-text rounded px-1"
                >
                  {brandName}
                </span>
              ) : (
                <span translate="no">
                  <CorpFlatsWordmark className="text-sm sm:text-base text-[#0F3D4C] group-hover:text-[#091E26] transition-colors block leading-none" />
                </span>
              )}
              <span
                translate="no"
                contentEditable={isVisualEditMode}
                suppressContentEditableWarning={true}
                onBlur={(e) => updateNestedConfig("branding.logoSubtext", e.currentTarget.innerText)}
                className={`text-[9.5px] sm:text-[10px] text-slate-500 font-medium tracking-wide block mt-0.5 ${
                  isVisualEditMode ? "outline-dashed outline-1 outline-[#C5A059] cursor-text rounded px-1" : ""
                }`}
              >
                {siteConfig?.branding?.logoSubtext || "Soho Residence"}
              </span>
            </div>
          </a>

          {/* Links desktop semânticos do Silo Local + âncoras */}
          <div className="hidden lg:flex items-center gap-3.5 xl:gap-5 whitespace-nowrap text-xs font-medium text-slate-600">
            <a
              href="/"
              onClick={(e) => handleSiloLinkClick(e, "/")}
              aria-current={activeSlug === "home" ? "page" : undefined}
              className={`transition-colors ${activeSlug === "home" ? "text-[#0F3D4C] font-bold" : "hover:text-[#0F3D4C]"}`}
            >
              Início
            </a>
            <a
              href="/hospedagem-corporativa-campos"
              onClick={(e) => handleSiloLinkClick(e, "/hospedagem-corporativa-campos")}
              aria-current={activeSlug === "hospedagem-corporativa-campos" ? "page" : undefined}
              className={`transition-colors ${activeSlug === "hospedagem-corporativa-campos" ? "text-[#0F3D4C] font-bold" : "hover:text-[#0F3D4C]"}`}
            >
              Empresas & Açu
            </a>
            <a
              href="/fim-de-semana-campos"
              onClick={(e) => handleSiloLinkClick(e, "/fim-de-semana-campos")}
              aria-current={activeSlug === "fim-de-semana-campos" ? "page" : undefined}
              className={`transition-colors ${activeSlug === "fim-de-semana-campos" ? "text-[#0F3D4C] font-bold" : "hover:text-[#0F3D4C]"}`}
            >
              Fim de Semana
            </a>
            <a
              href="/flat-centro-campos-rj"
              onClick={(e) => handleSiloLinkClick(e, "/flat-centro-campos-rj")}
              aria-current={activeSlug === "flat-centro-campos-rj" ? "page" : undefined}
              className={`transition-colors ${activeSlug === "flat-centro-campos-rj" ? "text-[#0F3D4C] font-bold" : "hover:text-[#0F3D4C]"}`}
            >
              Localização
            </a>
            <a
              href="/estadia-longa-campos"
              onClick={(e) => handleSiloLinkClick(e, "/estadia-longa-campos")}
              aria-current={activeSlug === "estadia-longa-campos" ? "page" : undefined}
              className={`transition-colors ${activeSlug === "estadia-longa-campos" ? "text-[#0F3D4C] font-bold" : "hover:text-[#0F3D4C]"}`}
            >
              Estadia Longa
            </a>
            <a href="#galeria" className="hover:text-[#0F3D4C] transition-colors">Fotos</a>
            {testimonialsList.length > 0 && (
              <a href="#avaliacoes" className="hover:text-[#0F3D4C] transition-colors">Avaliações</a>
            )}
          </div>

          {/* Ações: Entrar/Conta + Reservar destacado */}
          <div className="flex items-center gap-2 shrink-0">
            {guestAccount || guestName ? (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLocation("/minha-conta")}
                  className="h-9 px-2 sm:px-2.5 text-slate-700 font-medium text-xs hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                  title="Acessar Minha Conta"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="max-w-[75px] sm:max-w-[110px] truncate">
                    {guestAccount?.name?.split(" ")[0] || guestName?.split(" ")[0] || "Conta"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Sair da conta"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAuthModalOpen(true)}
                className="h-9 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 font-medium text-xs hover:bg-slate-100 rounded-lg flex items-center gap-1.5 shrink-0"
              >
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Entrar</span>
              </Button>
            )}

            <Button
              onClick={() => {
                const el = document.getElementById("reserva-rapida")
                if (el) el.scrollIntoView({ behavior: "smooth" })
              }}
              className="hidden sm:inline-flex bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-semibold text-xs h-9 px-3.5 rounded-lg shadow-xs transition-all shrink-0"
            >
              Reservar
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section (CSS Grid Responsivo: LCP AVIF/WebP + Card à Direita) ─ */}
      <header className="relative grid grid-cols-1 lg:grid-cols-12 lg:min-h-[540px] lg:max-h-[620px] lg:bg-[#091E26] overflow-clip">
        {/* Linha 1 Mobile (banner dedicado) / Colunas 1-8 Desktop */}
        <div className="relative row-start-1 col-start-1 lg:col-start-1 lg:col-span-8 aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:h-full lg:min-h-[540px] lg:max-h-[620px] overflow-hidden z-0">
          <picture>
            {heroAvifSrcSet && (
              <source type="image/avif" srcSet={heroAvifSrcSet} sizes="(max-width: 1023px) 100vw, 66vw" />
            )}
            {heroWebpSrcSet && (
              <source type="image/webp" srcSet={heroWebpSrcSet} sizes="(max-width: 1023px) 100vw, 66vw" />
            )}
            <img
              src={heroBg}
              alt={lpSpec.heroImageAlt}
              width={1600}
              height={1067}
              fetchPriority="high"
              decoding="sync"
              className="w-full h-full object-cover object-[center_68%] lg:object-[78%_68%] block"
            />
          </picture>
          <div className="absolute inset-x-0 top-0 h-[56%] sm:h-[48%] lg:h-[52%] bg-gradient-to-b from-slate-950/85 via-slate-950/35 to-transparent pointer-events-none" />
          <div className="hidden lg:block absolute inset-y-0 right-0 w-24 xl:w-44 bg-gradient-to-r from-transparent via-[#091E26]/65 to-[#091E26] pointer-events-none" />

          {isVisualEditMode && (
            <div className="absolute bottom-2.5 right-2.5 lg:bottom-4 lg:left-8 lg:right-auto z-30">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const newUrl = prompt("Insira a nova URL da foto do Hero:", heroBg)
                  if (newUrl && newUrl.trim()) {
                    updateNestedConfig("hero.backgroundImage", newUrl.trim())
                  }
                }}
                className="bg-black/65 hover:bg-black/85 text-white text-xs rounded-lg backdrop-blur-md border border-white/20 shadow-xs"
              >
                <ImageIcon className="w-3.5 h-3.5 mr-1" />
                Trocar Foto
              </Button>
            </div>
          )}
        </div>

        {/* Breadcrumb (nas LPs) + Selo Google Dinâmico + H1 & Subtítulo no Topo Esquerdo */}
        <div className="relative z-10 row-start-1 col-start-1 lg:col-start-1 lg:col-span-7 self-start p-3.5 sm:p-6 lg:pt-7 lg:pl-8 xl:pl-12 lg:pr-6 text-left pointer-events-none">
          {activeSlug !== "home" && (
            <nav aria-label="Breadcrumb" className="pointer-events-auto mb-1.5">
              <ol className="inline-flex items-center gap-1.5 text-[10.5px] sm:text-xs font-medium text-slate-200/95 bg-slate-950/55 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/15">
                <li>
                  <a
                    href="/"
                    onClick={(e) => handleSiloLinkClick(e, "/")}
                    className="hover:text-[#E5C98B] transition-colors"
                  >
                    <span translate="no">CorpFlats</span> Campos
                  </a>
                </li>
                <li aria-hidden="true" className="text-slate-400">›</li>
                <li aria-current="page" className="text-[#E5C98B] font-semibold truncate max-w-[200px] sm:max-w-none">
                  {lpSpec.breadcrumbLabel}
                </li>
              </ol>
            </nav>
          )}

          <a
            href="#avaliacoes"
            className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/65 hover:bg-slate-950/85 backdrop-blur-xs border border-[#C5A059]/50 text-[10.5px] sm:text-xs font-semibold text-white shadow-xs transition-colors mb-1.5 sm:mb-2"
          >
            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
            <span>{ratingSummary.ratingValuePtBr} ★ no Google • {ratingSummary.reviewCount} avaliações</span>
          </a>

          <h1
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.title", e.currentTarget.innerText)}
            className={`pointer-events-auto max-w-xl text-base sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-snug text-white drop-shadow-md text-balance whitespace-pre-line ${
              isVisualEditMode ? "outline-dashed outline-1 outline-amber-400 cursor-text rounded p-1" : ""
            }`}
          >
            {heroTitle}
          </h1>

          <p
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.highlightText", e.currentTarget.innerText)}
            className={`pointer-events-auto max-w-lg text-xs md:text-sm font-medium text-slate-100/95 tracking-wide drop-shadow-xs text-pretty mt-1 sm:mt-1.5 ${
              isVisualEditMode ? "block outline-dashed outline-1 outline-amber-400 cursor-text rounded p-1" : "hidden sm:block"
            }`}
          >
            {heroHighlight}
          </p>
        </div>

        {/* ── Card de Reserva: Abaixo da foto no Celular (row-2) e Ancorado à Direita no Desktop (col 8-12) ── */}
        <div className="relative z-20 row-start-2 col-start-1 lg:row-start-1 lg:col-start-8 lg:col-span-5 lg:self-center bg-slate-50 lg:bg-transparent px-3 sm:px-6 py-4 lg:py-6 lg:pl-2 lg:pr-6 xl:pr-10">
          <div
            id="reserva-rapida"
            onPointerEnter={preloadBookingFunnelModal}
            onFocus={preloadBookingFunnelModal}
            className="w-full max-w-lg lg:max-w-[416px] xl:max-w-md mx-auto lg:ml-auto lg:mr-0 text-left"
          >
            <div className="bg-white lg:bg-white/97 lg:backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-xl lg:shadow-2xl shadow-slate-900/10 lg:shadow-slate-950/35 border border-slate-200/80 lg:border-white/60 p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
              {/* Atalhos rápidos de duração para Estadia Longa (7, 14, 30 noites) */}
              {lpSpec.showLongStayQuickPills && (
                <div className="flex items-center justify-between gap-1.5 pb-1">
                  <span className="text-[10.5px] font-bold text-slate-600">Período rápido:</span>
                  <div className="inline-flex items-center gap-1">
                    {[7, 14, 30].map((targetNights) => (
                      <button
                        key={targetNights}
                        type="button"
                        onClick={() => {
                          try {
                            const baseDate = parseISO(checkin)
                            setCheckout(format(addDays(baseDate, targetNights), "yyyy-MM-dd"))
                          } catch {}
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all ${
                          nights === targetNights
                            ? "bg-[#0F3D4C] text-white border-[#0F3D4C]"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:border-[#0F3D4C]"
                        }`}
                      >
                        {targetNights} noites
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Seletor Compacto de Datas (font >= 16px no mobile contra iOS auto-zoom e min-h 44px) */}
              <div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-slate-100">
                <div className="space-y-1">
                  <label htmlFor="hero-checkin-input" className="text-[10.5px] font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#0F3D4C]" aria-hidden="true" />
                    <span>Entrada (a partir das 14h)</span>
                  </label>
                  <Input 
                    id="hero-checkin-input"
                    type="date" 
                    value={checkin} 
                    min={format(new Date(), "yyyy-MM-dd")}
                    onChange={e => setCheckin(e.target.value)} 
                    className="bg-slate-50/80 border-slate-200 text-base sm:text-xs text-slate-900 min-h-[44px] sm:h-9 font-bold rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="hero-checkout-input" className="text-[10.5px] font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#0F3D4C]" aria-hidden="true" />
                    <span>Saída (até as 12h)</span>
                  </label>
                  <Input 
                    id="hero-checkout-input"
                    type="date" 
                    value={checkout} 
                    min={checkin || format(new Date(), "yyyy-MM-dd")}
                    onChange={e => setCheckout(e.target.value)} 
                    className="bg-slate-50/80 border-slate-200 text-base sm:text-xs text-slate-900 min-h-[44px] sm:h-9 font-bold rounded-xl"
                  />
                </div>
              </div>

              {/* Seletor de Tarifas */}
              <div id="tarifas" className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-slate-900">
                    Escolha sua tarifa
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/80" role="group" aria-label="Quantidade de hóspedes">
                      <button
                        type="button"
                        onClick={() => updateRoom(rooms[0]?.id ?? 1, "adults", 1)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all min-h-[28px] ${
                          (rooms[0]?.adults ?? 1) === 1
                            ? "bg-white text-[#091E26] shadow-2xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        1 hósp.
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRoom(rooms[0]?.id ?? 1, "adults", 2)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all min-h-[28px] ${
                          (rooms[0]?.adults ?? 1) === 2
                            ? "bg-white text-[#091E26] shadow-2xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        2 hósp.
                      </button>
                      {isThirdGuestEnabled && (
                        <button
                          type="button"
                          onClick={() => updateRoom(rooms[0]?.id ?? 1, "adults", 3)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all min-h-[28px] ${
                            (rooms[0]?.adults ?? 1) === 3
                              ? "bg-white text-[#091E26] shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          3 hósp.
                        </button>
                      )}
                    </div>
                    <span className="text-[10.5px] text-slate-500 font-medium">
                      • {nights} {nights === 1 ? "noite" : "noites"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {/* Opção 1: COM CAFÉ (com miniatura WebP 160w de 3.4 KB) */}
                  <div
                    onClick={() => setRatePlan("with_breakfast")}
                    className={`cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-between ${
                      ratePlan === "with_breakfast"
                        ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRatePlan("with_breakfast")
                          setBreakfastZoomOpen(true)
                        }}
                        aria-label="Ampliar foto do café da manhã servido no flat"
                        title="Clique para ampliar a foto do café da manhã"
                        className="rounded-lg overflow-hidden border border-[#C5A059]/40 shrink-0 group/bf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D4C]"
                      >
                        <img
                          src="/photos/soho/cafe-mesa-close-160w.webp"
                          alt="Café da manhã servido na mesa do flat"
                          width={112}
                          height={84}
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                          className="w-14 h-10.5 aspect-[4/3] object-cover block group-hover/bf:scale-105 transition-transform"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 leading-none">
                          <span className="font-bold text-xs text-slate-900">COM CAFÉ</span>
                          {ratePlan === "with_breakfast" && (
                            <span className="text-[8.5px] font-bold text-[#091E26] bg-[#C5A059]/25 border border-[#C5A059]/50 px-1.5 py-0.5 rounded leading-none">Ativa</span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5">No flat das 05:00 às 09:30</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      {otaWithBreakfastDailyRate > withBreakfastConfig.dailyRate && (
                        <div translate="no" className="text-[10px] text-slate-400 line-through leading-none mb-0.5" title="Valor no Booking e Airbnb">
                          R$ {formatBrl(otaWithBreakfastDailyRate)}
                        </div>
                      )}
                      <div translate="no" className="font-extrabold text-xs sm:text-sm text-slate-900 leading-none">
                        R$ {formatBrl(withBreakfastConfig.dailyRate)}
                      </div>
                      <span className="text-[9px] text-slate-400 block mt-0.5">/ noite no <span translate="no">PIX</span></span>
                    </div>
                  </div>

                  {/* Opção 2: SEM CAFÉ */}
                  <div
                    onClick={() => setRatePlan("room_only")}
                    className={`cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-between ${
                      ratePlan === "room_only"
                        ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        ratePlan === "room_only" ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40" : "bg-slate-100 text-slate-600"
                      }`}>
                        <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 leading-none">
                          <span className="font-bold text-xs text-slate-900">SEM CAFÉ</span>
                          {ratePlan === "room_only" && (
                            <span className="text-[8.5px] font-bold text-[#091E26] bg-[#C5A059]/25 border border-[#C5A059]/50 px-1.5 py-0.5 rounded leading-none">Ativa</span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-slate-500 truncate mt-0.5">Somente hospedagem</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      {otaRoomOnlyDailyRate > roomOnlyConfig.dailyRate && (
                        <div translate="no" className="text-[10px] text-slate-400 line-through leading-none mb-0.5" title="Valor no Booking e Airbnb">
                          R$ {formatBrl(otaRoomOnlyDailyRate)}
                        </div>
                      )}
                      <div translate="no" className="font-extrabold text-xs sm:text-sm text-slate-900 leading-none">
                        R$ {formatBrl(roomOnlyConfig.dailyRate)}
                      </div>
                      <span className="text-[9px] text-slate-400 block mt-0.5">/ noite no <span translate="no">PIX</span></span>
                    </div>
                  </div>
                </div>

                {/* Barra de Economia Estável (anti-CLS) + Selos de Venda Direta */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="min-h-[30px] flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200/80 text-[10.5px] text-emerald-800 font-semibold">
                    <span className="truncate">Economia no Site Oficial vs. Booking/Airbnb:</span>
                    <span translate="no" className="font-extrabold shrink-0">
                      {otaSavingsAmount > 0 ? `- R$ ${formatBrl(otaSavingsAmount)}` : "-5% OFF PIX"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 font-semibold px-0.5">
                    <span className="flex items-center gap-1 truncate">
                      <Check className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>Menor Preço Garantido</span>
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Check className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>-5% OFF no <span translate="no">PIX</span></span>
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Check className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>1 Vaga Coberta Grátis</span>
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Check className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span><span translate="no">NFS-e</span> Automática</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão de Ação Principal Protagonista (Self-Service) + Rede de Segurança Concierge IA 24h */}
              <div className="pt-0.5 space-y-1.5">
                <Button
                  onClick={() => handleStartBooking()}
                  disabled={availabilityData?.available === false}
                  className="w-full bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 font-bold text-xs sm:text-sm min-h-[46px] rounded-xl shadow-md shadow-[#091E26]/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>{lpSpec.ctaButtonText || "Reservar agora"}</span>
                  <ArrowRight className="w-4 h-4 text-[#E5C98B] shrink-0" aria-hidden="true" />
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>Cancelamento grátis até 24h antes do check-in</span>
                </div>

                {/* Touchpoint A: Botão Secundário Inteligente de WhatsApp 24h (Concierge IA) */}
                <button
                  type="button"
                  onClick={() => handleOpenConcierge("booking_card")}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200/90 hover:border-emerald-300 hover:bg-emerald-50/50 text-[11px] font-semibold text-slate-600 hover:text-emerald-800 transition-colors flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span className="truncate">Dúvida rápida ou reserva PJ? Concierge 24h</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-w-0">
      {/* ── Diferenciais Reais do Edifício Soho + Comparativo Site Oficial vs. OTAs ── */}
      <section id="beneficios" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-slate-700 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#0F3D4C] shrink-0" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-medium">Recepção 24h (NFC)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Car className="w-4 h-4 text-[#0F3D4C] shrink-0" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-medium">1 vaga coberta</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#0F3D4C] shrink-0" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-medium">Jacuzzi aquecida</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Wifi className="w-4 h-4 text-[#0F3D4C] shrink-0" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-medium">Wi-Fi & bancada</span>
          </div>
        </div>

        {/* Selo Comparativo CRO: Site Oficial CorpFlats vs. Plataformas (Booking / Airbnb) */}
        <div className="rounded-2xl border border-[#C5A059]/45 bg-white shadow-xs p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0F3D4C] bg-[#0F3D4C]/8 px-2 py-0.5 rounded-md">
                Transparência de Tarifa Direta
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1">
                Por que reservar direto no Site Oficial <span translate="no">CorpFlats</span>?
              </h2>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const el = document.getElementById("reserva-rapida")
                if (el) el.scrollIntoView({ behavior: "smooth" })
              }}
              className="bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs min-h-[38px] px-3.5 rounded-xl self-start sm:self-auto"
            >
              Simular Economia Agora
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 text-xs">
            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
              <div className="font-extrabold text-emerald-900 flex items-center justify-between">
                <span>⭐ Site Oficial CorpFlats</span>
                <span className="text-[10px] bg-emerald-700 text-white px-2 py-0.5 rounded-full">Melhor Condição</span>
              </div>
              <ul className="space-y-1.5 text-slate-700 text-[11.5px]">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Menor Preço Garantido</strong> sem comissões de intermediários + <strong>5% OFF no <span translate="no">PIX</span></strong></span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong><span translate="no">NFS-e</span> Nacional Automática</strong> emitida para seu <span translate="no">CPF</span> ou <span translate="no">CNPJ</span> corporativo</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>1 Vaga Coberta Inclusa</strong> + Pré-Check-in Digital e Concierge WhatsApp 24h</span>
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-slate-500">
              <div className="font-bold text-slate-700 flex items-center justify-between">
                <span>Booking.com / Airbnb</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">+15% em média</span>
              </div>
              <ul className="space-y-1.5 text-[11.5px]">
                <li className="flex items-start gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Acréscimo médio de ~15% referente a taxas de serviço e comissões da plataforma</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Sem desconto adicional de 5% no <span translate="no">PIX</span> direto Banco Inter</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Faturamento PJ e ajustes de estadia sujeitos à intermediação externa</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pilares Específicos da Página (Silo Local / Intenção de Busca) ── */}
      {lpSpec.valuePillars && lpSpec.valuePillars.length > 0 && (
        <section id="diferenciais-perfil" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-8 border-t border-slate-200/60 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
              {lpSpec.sectionHeading}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed text-pretty">
              {lpSpec.sectionSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lpSpec.valuePillars.map((pillar: { title: string; description: string; badge?: string }, idx: number) => (
              <div
                key={idx}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/70 space-y-2 hover:border-[#C5A059]/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-900">{pillar.title}</h3>
                  {pillar.badge && (
                    <span className="text-[10px] font-semibold text-[#0F3D4C] bg-[#0F3D4C]/[0.07] px-2 py-0.5 rounded-md shrink-0">
                      {pillar.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed text-pretty">{pillar.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Galeria de Fotos Reais (13 fotos horizontais otimizadas em WebP) ── */}
      <section id="galeria" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Fotos Reais do Flat & Área de Lazer
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto text-pretty">
            Conheça por dentro o padrão dos apartamentos e a cobertura completa do Edifício <span translate="no">Soho Residence Service</span>.
          </p>
        </div>

        <div className="space-y-3 min-w-0">
          {(() => {
            const activePhoto = orderedGalleryList[activePhotoIdx] || orderedGalleryList[0]
            const activeImgUrl = activePhoto?.imageUrl || "/photos/soho/01-quarto-bancada.jpg"
            const activeBase = normalizeSohoPhotoBase(activeImgUrl)
            const isLocalSoho = activeBase.startsWith("/photos/soho/")
            return (
              <div className="relative aspect-[3/2] max-h-[440px] w-full rounded-2xl overflow-hidden bg-slate-200 shadow-sm group">
                <picture>
                  {isLocalSoho && (
                    <source
                      type="image/webp"
                      srcSet={`${activeBase}-640w.webp 640w, ${activeBase}-1024w.webp 1024w, ${activeBase}-1600w.webp 1600w`}
                      sizes="(max-width: 896px) 100vw, 896px"
                    />
                  )}
                  <img
                    src={activeImgUrl}
                    alt={activePhoto?.title || "Flat CorpFlats Soho Residence"}
                    width={1600}
                    height={1067}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-all duration-300 block"
                  />
                </picture>
                {orderedGalleryList.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Foto anterior"
                      onClick={() => setActivePhotoIdx((prev) => (prev - 1 + orderedGalleryList.length) % orderedGalleryList.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center backdrop-blur-xs transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Próxima foto"
                      onClick={() => setActivePhotoIdx((prev) => (prev + 1) % orderedGalleryList.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center backdrop-blur-xs transition-all"
                    >
                      <ChevronRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-white text-xs font-semibold">
                  <div className="bg-slate-900/75 backdrop-blur-md px-3 py-1.5 rounded-lg min-w-0 flex items-center gap-2">
                    {activePhoto?.category && (
                      <span className="text-[10px] uppercase tracking-wider text-[#E5C98B] font-bold shrink-0">
                        {activePhoto.category}
                      </span>
                    )}
                    <span className="truncate">{activePhoto?.title || "Flat Soho Residence"}</span>
                  </div>
                  <span className="bg-slate-900/75 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-[11px] shrink-0">
                    {activePhotoIdx + 1} / {orderedGalleryList.length}
                  </span>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-4 sm:grid-cols-7 md:grid-cols-13 gap-1.5 sm:gap-2">
            {orderedGalleryList.map((photo: any, idx: number) => {
              const thumbBase = normalizeSohoPhotoBase(photo.imageUrl || "")
              const thumbSrc = thumbBase.startsWith("/photos/soho/")
                ? `${thumbBase}-320w.webp`
                : photo.imageUrl
              return (
                <button
                  key={photo.id || idx}
                  type="button"
                  aria-label={`Ver foto ${idx + 1}: ${photo.title}`}
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`aspect-[3/2] rounded-xl overflow-hidden border-2 transition-all ${
                    activePhotoIdx === idx ? "border-[#C5A059] ring-2 ring-[#C5A059]/30 opacity-100" : "border-transparent opacity-65 hover:opacity-100"
                  }`}
                >
                  <img
                    src={thumbSrc}
                    onError={(e) => {
                      if (e.currentTarget.src !== photo.imageUrl) {
                        e.currentTarget.src = photo.imageUrl
                      }
                    }}
                    alt={photo.title}
                    width={320}
                    height={213}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover block"
                  />
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── O Flat: Padrão Único & Itens Reais ───────────────────────────── */}
      <section id="detalhes" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            {siteConfig?.about?.title && !siteConfig.about.title.includes("Boutique")
              ? siteConfig.about.title
              : "O Flat: padrão único, equipado para morar ou trabalhar"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed text-pretty">
            {siteConfig?.about?.description && !siteConfig.about.description.includes("Macaé") && !siteConfig.about.description.includes("hóspedes exigentes")
              ? siteConfig.about.description
              : "Operamos 19 flats de mesmo padrão no Edifício Soho Residence Service, dimensionados para até 2 pessoas. Todos entregam enxoval de cama e banho higienizado, ar-condicionado, mesa de trabalho, Wi-Fi individual e cozinha equipada para preparar refeições rápidas."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/70 space-y-2.5">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C5A059]" aria-hidden="true"></span>
              Quarto, Estar & Trabalho
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 font-normal leading-relaxed">
              {aboutRoomItems.map((item, i) => (
                <li key={i} className="text-pretty">• {item}</li>
              ))}
            </ul>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/70 space-y-2.5">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C5A059]" aria-hidden="true"></span>
              Cozinha & Apoio
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 font-normal leading-relaxed">
              {aboutKitchenItems.map((item, i) => (
                <li key={i} className="text-pretty">• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Estrutura do Edifício Soho Residence ─────────────────────────── */}
      <section id="comodidades" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Estrutura do <span translate="no">Soho Residence</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 text-pretty">
            Todas as áreas comuns do edifício estão liberadas para uso durante sua hospedagem.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {amenitiesList.map((amenity: any, idx: number) => (
            <div
              key={amenity.id || idx}
              className="p-4 rounded-2xl bg-white border border-slate-200/70 space-y-2 hover:border-[#C5A059]/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center">
                  {renderAmenityIcon(amenity.icon)}
                </div>
                {amenity.badge && (
                  <span className="text-[10px] font-semibold text-[#0F3D4C] bg-[#0F3D4C]/[0.06] px-2 py-0.5 rounded-md">
                    {amenity.badge}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">{amenity.title}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed text-pretty">{amenity.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Localização no Centro de Campos & Distâncias Hiperlocais ───────── */}
      <section id="localizacao" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Localização Central em Campos dos Goytacazes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 text-pretty">
            Na Rua Conselheiro Otaviano, 209 (Centro) — a 80 m do Hospital Geral Dr. Beda, próximo às universidades, fóruns, clínicas, gastronomia e saídas para a BR-101 e Porto do Açu.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <p translate="no" className="font-bold text-xs sm:text-sm text-slate-900">
                CorpFlats — Edifício Soho Residence Service
              </p>
              <p className="text-xs text-slate-500 text-pretty">
                Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140
              </p>
            </div>
          </div>

          <a
            href={siteConfig?.branding?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F3D4C] hover:text-[#091E26] bg-[#0F3D4C]/8 hover:bg-[#0F3D4C]/15 border border-[#C5A059]/30 px-3.5 py-2.5 min-h-[40px] rounded-xl transition-colors shrink-0"
          >
            <span>Abrir no Google Maps</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>

        {lpSpec.distanceGroups && lpSpec.distanceGroups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {lpSpec.distanceGroups.map((group: { category: string; items: Array<{ place: string; distance: string; note: string }> }, gIdx: number) => (
              <div key={gIdx} className="p-4 rounded-2xl bg-white border border-slate-200/70 space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0F3D4C]">
                  {group.category}
                </h3>
                <ul className="space-y-2.5 text-xs">
                  {group.items.map((item: { place: string; distance: string; note: string }, iIdx: number) => (
                    <li key={iIdx} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-slate-900">{item.place}</span>
                        <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                          {item.distance}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Avaliações Reais dos Hóspedes no Google ───────────────────────── */}
      {testimonialsList.length > 0 && (
        <section id="avaliacoes" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
                {lpSpec.reviewsHeading || "Avaliações de Hóspedes"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 text-pretty">
                Relatos reais de quem já se hospedou conosco no <span translate="no">Soho Residence</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 text-xs font-bold text-slate-900"
                aria-label={`Nota ${ratingSummary.ratingValuePtBr} de 5 estrelas no Google com ${ratingSummary.reviewCount} avaliações`}
              >
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
                <span>{ratingSummary.ratingValuePtBr} ★ no Google ({ratingSummary.reviewCount} avaliações)</span>
              </div>
              <a
                href={siteConfig?.branding?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F3D4C] hover:text-[#091E26] hover:underline transition-colors"
              >
                <span>Ver todas no Google</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testimonialsList.map((t: any, idx: number) => (
              <div
                key={t.id || idx}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/70 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-0.5 text-amber-400" aria-label={`Nota ${t.rating || 5} de 5 estrelas`}>
                    {[...Array(Math.min(5, Math.max(1, Number(t.rating) || 5)))].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="text-xs text-slate-600 leading-relaxed text-pretty">
                    &ldquo;{t.comment}&rdquo;
                  </blockquote>
                </div>
                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                  {t.avatar && !String(t.avatar).includes("images.unsplash.com") ? (
                    <img
                      src={t.avatar}
                      alt={t.name}
                      width={32}
                      height={32}
                      loading="lazy"
                      decoding="async"
                      className="w-8 h-8 aspect-square rounded-full object-cover border border-slate-200 shrink-0 block"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#0F3D4C] text-[#E5C98B] flex items-center justify-center font-bold text-xs shrink-0" aria-hidden="true">
                      {(t.name || "H").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span translate="no" className="font-bold text-xs text-slate-900 block">{t.name}</span>
                    {t.city && <span className="text-[10px] text-slate-400 block">{t.city}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Perguntas Frequentes (FAQ semântico da página) ────────────────── */}
      <section id="faq" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            {lpSpec.faqHeading || "Dúvidas Frequentes"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 text-pretty">
            Informações diretas sobre tarifas diretas, <span translate="no">NFS-e</span>, horários, acesso, pets, garagem e cancelamento.
          </p>
        </div>

        <div className="space-y-2">
          {faqList.map((item: any, idx: number) => {
            const isOpen = faqOpen === idx
            return (
              <div
                key={idx}
                className="bg-white rounded-xl border border-slate-200/70 overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setFaqOpen(isOpen ? null : idx)}
                  className="w-full p-4 min-h-[48px] text-left flex items-center justify-between gap-3 font-semibold text-xs sm:text-sm text-slate-900 hover:text-[#0F3D4C] transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180 text-[#0F3D4C]" : ""}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed font-normal border-t border-slate-50 pt-3 text-pretty">
                    {item.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Cross-Linking Interno do Silo Local (5 Páginas Indexáveis) ────── */}
      {lpSpec.relatedLinks && lpSpec.relatedLinks.length > 0 && (
        <section id="explorar-perfis" className="cv-auto-section w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight text-balance">
              {activeSlug === "home"
                ? "Encontre o perfil ideal para sua estadia em Campos"
                : "Veja também outras modalidades de hospedagem direta"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 text-pretty">
              Condições diretas pensadas para viagens corporativas, finais de semana a dois, compromissos médicos/universitários e estadias longas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {lpSpec.relatedLinks.map((rel: { slug: LandingPageSlug; path: string; label: string; desc: string }) => (
              <a
                key={rel.path}
                href={rel.path}
                onClick={(e) => handleSiloLinkClick(e, rel.path)}
                className="group p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-[#0F3D4C] hover:shadow-sm transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-[#0F3D4C] transition-colors block">
                    {rel.label}
                  </span>
                  <p className="text-[11.5px] text-slate-500 leading-relaxed text-pretty">
                    {rel.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#0F3D4C] group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}
      </main>

      {/* ── Rodapé Oficial CorpFlats (NAP Padronizado Google Meu Negócio + Links do Silo) ── */}
      <footer className="w-full min-w-0 bg-white border-t border-slate-200/80 py-10 px-4 sm:px-8 text-xs text-slate-600 mt-12 pb-28 sm:pb-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          {/* Coluna 1: NAP Oficial idêntico ao Google Business Profile */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <CorpFlatsIcon className="w-7 h-7" />
              <span translate="no">
                <CorpFlatsWordmark className="text-sm text-[#0F3D4C]" />
              </span>
            </div>
            <p className="font-bold text-slate-800 text-xs">
              <span translate="no">CorpFlats — Edifício Soho Residence Service</span>
            </p>
            <address className="not-italic text-[11.5px] text-slate-500 space-y-1 leading-relaxed">
              <p>Rua Conselheiro Otaviano, 209 - Centro</p>
              <p>Campos dos Goytacazes - RJ, CEP 28010-140</p>
              <p translate="no">CNPJ: 47.964.813/0001-65</p>
            </address>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleOpenConcierge("footer_contact")}
                className="text-emerald-700 font-semibold hover:underline inline-flex items-center gap-1.5 w-fit"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                <span translate="no">WhatsApp {formatPhoneNumber(whatsappNumber)}</span>
              </button>
              <a
                href={`mailto:${siteConfig?.branding?.email || "reservas@corpflats.com.br"}`}
                className="text-slate-600 hover:text-[#0F3D4C] break-all inline-flex items-center gap-1.5 w-fit"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                <span translate="no">{siteConfig?.branding?.email || "reservas@corpflats.com.br"}</span>
              </a>
            </div>
          </div>

          {/* Coluna 2: Navegação Semântica do Silo Local */}
          <div className="space-y-2.5">
            <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
              Hospedagem Direta em Campos
            </h3>
            <ul className="space-y-2 text-[11.5px]">
              <li>
                <a href="/" onClick={(e) => handleSiloLinkClick(e, "/")} className="hover:text-[#0F3D4C] hover:underline">
                  Flats Equipados no Centro — Reserva Direta
                </a>
              </li>
              <li>
                <a href="/hospedagem-corporativa-campos" onClick={(e) => handleSiloLinkClick(e, "/hospedagem-corporativa-campos")} className="hover:text-[#0F3D4C] hover:underline">
                  Hospedagem Corporativa & Porto do Açu (<span translate="no">NFS-e</span>)
                </a>
              </li>
              <li>
                <a href="/fim-de-semana-campos" onClick={(e) => handleSiloLinkClick(e, "/fim-de-semana-campos")} className="hover:text-[#0F3D4C] hover:underline">
                  Fim de Semana em Campos com Jacuzzi & Sauna
                </a>
              </li>
              <li>
                <a href="/flat-centro-campos-rj" onClick={(e) => handleSiloLinkClick(e, "/flat-centro-campos-rj")} className="hover:text-[#0F3D4C] hover:underline">
                  Flat no Centro (próximo ao Dr. Beda, FMC e UFF)
                </a>
              </li>
              <li>
                <a href="/estadia-longa-campos" onClick={(e) => handleSiloLinkClick(e, "/estadia-longa-campos")} className="hover:text-[#0F3D4C] hover:underline">
                  Estadia Longa e Mensalista (7 a 30 noites)
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Garantias Oficiais & Redes */}
          <div className="space-y-2.5">
            <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
              Garantias do Site Oficial
            </h3>
            <ul className="space-y-1.5 text-[11.5px] text-slate-600">
              <li>✓ Menor Preço Garantido vs. Booking / Airbnb</li>
              <li>✓ +5% de desconto instantâneo no <span translate="no">PIX</span></li>
              <li>✓ 1 vaga de garagem coberta inclusa</li>
              <li>✓ <span translate="no">NFS-e</span> automática e Cancelamento Grátis 24h</li>
            </ul>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={siteConfig?.branding?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2"}
                target="_blank"
                rel="noreferrer"
                className="text-[#0F3D4C] font-semibold hover:underline inline-flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Google Maps</span>
              </a>
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-700 hover:text-[#0F3D4C] font-semibold inline-flex items-center gap-1"
              >
                <Instagram className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" aria-hidden="true" />
                <span translate="no">{instagramHandle.startsWith("@") ? instagramHandle : `@${instagramHandle}`}</span>
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-6 mt-8 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          © {new Date().getFullYear()} <span translate="no">{brandName}</span>. Todos os direitos reservados.
        </div>
      </footer>

      {/* ── Touchpoint B (Desktop): Pílula Scroll-Aware da Concierge 24h (zero ruído acima da dobra) ── */}
      {showStickyBottom && !checkoutModalOpen && !authModalOpen && (
        <button
          type="button"
          onClick={() => handleOpenConcierge("desktop_sticky_pill")}
          aria-label="Falar com Concierge 24h no WhatsApp"
          className="hidden sm:inline-flex fixed bottom-5 right-5 z-30 items-center gap-2 px-4 min-h-[44px] rounded-full bg-white/95 hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border border-slate-200 hover:border-emerald-300 shadow-lg backdrop-blur-md text-xs font-bold transition-all animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>Concierge 24h • Tirar dúvida</span>
        </button>
      )}

      {/* ── Touchpoint B (Mobile): Barra Única Inferior c/ Safe-Area, WhatsApp 44px + Reservar Protagonista ── */}
      <div
        className={`sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3.5 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] flex items-center justify-between gap-2 shadow-lg transition-transform duration-300 ${
          showStickyBottom && !checkoutModalOpen && !authModalOpen
            ? "translate-y-0"
            : "translate-y-full pointer-events-none"
        }`}
      >
        <div className="min-w-0">
          <span className="text-[10px] text-slate-500 font-medium block truncate">
            {ratePlan === "with_breakfast" ? "Com café no flat" : "Sem café"} • -5% PIX
          </span>
          <div className="text-xs font-bold text-slate-900 flex items-baseline gap-1.5">
            {otaReferenceMarkupPercent > 0 && (
              <span translate="no" className="text-[10px] font-normal text-slate-400 line-through">
                R$ {formatBrl(ratePlan === "with_breakfast" ? otaWithBreakfastDailyRate : otaRoomOnlyDailyRate)}
              </span>
            )}
            <span>
              <span translate="no">
                R$ {formatBrl(ratePlan === "with_breakfast" ? withBreakfastConfig.dailyRate : roomOnlyConfig.dailyRate)}
              </span>
              <span className="text-[10px] font-normal text-slate-500"> /noite</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenConcierge("mobile_sticky_bar")}
            aria-label="Tirar dúvida no WhatsApp 24h"
            title="Tirar dúvida no WhatsApp 24h"
            className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 transition-colors"
          >
            <MessageCircle className="w-5 h-5" aria-hidden="true" />
          </button>

          <Button
            onClick={() => handleStartBooking()}
            className="bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs min-h-[44px] px-4 rounded-xl shadow-xs"
          >
            Reservar
          </Button>
        </div>
      </div>

      {/* ── Modal de Zoom da Foto do Café da Manhã (WebP 640w + fallback JPG) ── */}
      <Dialog open={breakfastZoomOpen} onOpenChange={setBreakfastZoomOpen}>
        <DialogContent className="sm:max-w-xl p-4 sm:p-5 rounded-3xl bg-white border border-slate-200 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2 text-balance">
              <Coffee className="w-4 h-4 text-[#0F3D4C] shrink-0" aria-hidden="true" />
              <span>Café da manhã servido no seu flat</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 text-pretty">
              Entregue diretamente no apartamento entre 05:00 e 09:30, no horário escolhido por você no Portal do Hóspede.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
            <picture>
              <source type="image/webp" srcSet="/photos/soho/cafe-mesa-close-640w.webp" />
              <img
                src="/photos/soho/cafe-mesa-close.jpg"
                alt="Mesa posta de café da manhã no flat da CorpFlats Soho Residence"
                width={1200}
                height={670}
                loading="lazy"
                decoding="async"
                className="w-full h-auto aspect-[1200/670] object-cover block"
              />
            </picture>
          </div>

          <DialogFooter className="sm:justify-between items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              Pães, pão de queijo quentinho, frios, frutas frescas, ovos mexidos, bolo, suco e café.
            </span>
            <Button
              type="button"
              onClick={() => setBreakfastZoomOpen(false)}
              className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs min-h-[40px] px-4 rounded-xl shrink-0"
            >
              Continuar na reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Funil de Vendas Interativo do Motor de Reservas (Lazy Chunk Sob Demanda) ── */}
      {(hasOpenedFunnel || checkoutModalOpen) && (
        <Suspense fallback={null}>
          <LazyBookingFunnelModal
            open={checkoutModalOpen}
            onOpenChange={setCheckoutModalOpen}
            checkin={checkin}
            checkout={checkout}
            nights={nights}
            rooms={rooms}
            ratePlan={ratePlan}
            setRatePlan={setRatePlan}
            updateRoom={updateRoom}
            addRoom={addRoom}
            removeRoom={removeRoom}
            siteConfig={siteConfig}
            guestAccount={guestAccount}
            availabilityData={availabilityData}
            initialIsWorkTrip={isWorkTrip}
            initialBringingPet={bringingPet}
            pagePath={lpSpec.path}
            pageLabel={lpSpec.breadcrumbLabel}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onSuccessBooking={(res: any) => {
              setConfirmedReservation(res)
            }}
          />
        </Suspense>
      )}

      {/* ── Modal de Pagamento PIX Banco Inter ────────────────────────────── */}
      <Dialog open={pixModalOpen} onOpenChange={setPixModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 rounded-3xl p-6 text-center space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
              <QrCode className="w-6 h-6 text-[#0F3D4C]" />
              Pagamento PIX Banco Inter
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escaneie o QR Code ou copie o código Copia e Cola para confirmação automática.
            </DialogDescription>
          </DialogHeader>

          {interPixData?.pixCopiaECola && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block mx-auto">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(interPixData.pixCopiaECola)}`}
                  alt="QR Code PIX"
                  className="w-44 h-44 mx-auto rounded-xl"
                />
              </div>

              <div className="space-y-2 text-left">
                <Label className="text-xs font-bold text-slate-700">PIX Copia e Cola</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={interPixData.pixCopiaECola}
                    className="text-xs font-mono bg-slate-50 h-9 rounded-xl"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(interPixData.pixCopiaECola)
                      setPixCopied(true)
                      setTimeout(() => setPixCopied(false), 3000)
                    }}
                    className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs h-9 px-3 rounded-xl shrink-0"
                  >
                    {pixCopied ? <Check className="w-4 h-4 text-[#C5A059]" /> : <Copy className="w-4 h-4" />}
                    <span>{pixCopied ? "Copiado!" : "Copiar"}</span>
                  </Button>
                </div>

                {/* Alternativa via Chave CNPJ Banco Inter */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-2.5 rounded-xl">
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 font-semibold block">Chave Oficial (CNPJ Banco Inter):</span>
                    <span className="font-mono font-bold text-slate-800 text-xs">47.964.813/0001-65</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText("47964813000165")
                      setPixKeyCopied(true)
                      setTimeout(() => setPixKeyCopied(false), 3000)
                    }}
                    className="h-8 text-xs font-semibold border-slate-300 text-[#0F3D4C] hover:bg-slate-100 rounded-xl px-3 shrink-0"
                  >
                    {pixKeyCopied ? <Check className="w-3.5 h-3.5 mr-1 text-[#0F3D4C]" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    <span>{pixKeyCopied ? "Copiado!" : "Copiar CNPJ"}</span>
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <AddToCalendar
                  variant="compact"
                  reservation={{
                    id: currentPendingRes?.id || "res_temp",
                    reservationCode: currentPendingRes?.code || currentPendingRes?.reservationCode || "CORPFLATS",
                    guestName: guestName || "Hóspede",
                    flatNumber: currentPendingRes?.flatNumber || "Studio",
                    checkinDate: checkin,
                    checkoutDate: checkout,
                    numGuests: rooms.reduce((acc, r) => acc + (Number(r.adults) || 2), 0)
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              className="w-full bg-[#091E26] hover:bg-[#0F3D4C] text-white font-bold text-xs rounded-xl"
              onClick={() => setPixModalOpen(false)}
            >
              Já realizei o pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal de Pagamento Cartão de Crédito Mercado Pago ──────────────── */}
      <Dialog open={cardModalOpen} onOpenChange={setCardModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 rounded-3xl p-6 text-center space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
              <CreditCard className="w-6 h-6 text-[#0F3D4C] shrink-0" />
              <span>Pagamento com Cartão de Crédito</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Checkout Seguro do Mercado Pago para Cartão de Crédito.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium shrink-0">Código da Reserva:</span>
                <span className="font-mono font-black text-[#0F3D4C] text-right">{mpResData?.code || mpResData?.reservationCode || "CORPFLATS"}</span>
              </div>
              <div className="flex justify-between items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium shrink-0">Hóspede:</span>
                <span className="font-bold text-slate-900 text-right break-words">{guestName}</span>
              </div>
              <div className="flex justify-between items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium shrink-0">Período:</span>
                <span className="font-bold text-slate-900 text-right">{nights} {nights === 1 ? 'noite' : 'noites'}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center gap-2">
                <span className="text-xs font-black text-slate-900">Valor no Cartão de Crédito:</span>
                <span className="text-lg font-black text-[#0F3D4C] shrink-0">R$ {cardTotalAmount.toLocaleString('pt-BR')}</span>
              </div>
            </div>

            {mpInitPoint && (
              <div className="space-y-3">
                <Button
                  className="w-full bg-[#091E26] hover:bg-[#0F3D4C] text-white font-black text-xs sm:text-sm h-auto min-h-12 py-2.5 px-4 whitespace-normal leading-tight text-center rounded-2xl shadow-md gap-2 flex items-center justify-center"
                  onClick={() => window.open(mpInitPoint, "_blank")}
                >
                  <CreditCard className="w-5 h-5 text-[#C5A059] shrink-0" />
                  <span>Ir para Pagamento com Cartão</span>
                  <ExternalLink className="w-4 h-4 opacity-75 shrink-0" />
                </Button>
                
                <p className="text-[11px] text-center text-slate-500 font-medium">
                  🔒 Ambiente 100% criptografado e exclusivo para Cartão de Crédito via Mercado Pago.
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <AddToCalendar
                variant="compact"
                reservation={{
                  id: mpResData?.id || "res_temp",
                  reservationCode: mpResData?.code || mpResData?.reservationCode || "CORPFLATS",
                  guestName: guestName || "Hóspede",
                  flatNumber: mpResData?.flatNumber || "Studio",
                  checkinDate: checkin,
                  checkoutDate: checkout,
                  numGuests: rooms.reduce((acc, r) => acc + (Number(r.adults) || 2), 0)
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full border-slate-300 text-slate-700 font-bold text-xs rounded-xl"
              onClick={() => setCardModalOpen(false)}
            >
              Fechar Janela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Autenticação (Login, Cadastro, Google One Tap, Passkeys) */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={(open) => {
          setAuthModalOpen(open)
          if (!open) returnToAccountRef.current = false
        }}
        onSuccess={(user) => {
          applyGuestData(user, true)
          setAuthModalOpen(false)
          if (returnToAccountRef.current) {
            returnToAccountRef.current = false
            setLocation("/minha-conta")
          }
        }}
      />

      {/* Modal de Conclusão / Compartilhamento de Dados Cadastrais */}
      <CompleteProfileModal
        open={completeProfileModalOpen}
        onOpenChange={setCompleteProfileModalOpen}
        user={profileToComplete || guestAccount}
        onSuccess={(updated) => {
          applyGuestData(updated, false)
        }}
      />
    </div>
  )
}

