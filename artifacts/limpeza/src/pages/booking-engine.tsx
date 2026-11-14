import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, Calendar, Users, Wifi, Tv, Wind, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, CreditCard, QrCode, Copy, Check, Star, Car, Utensils,
  Ban, MessageCircle, Clock, KeyRound, FileText, MapPin, Navigation, ExternalLink, Mail,
  Dumbbell, Waves, Flame, Award, Heart, HelpCircle, ChevronDown, PhoneCall, Shield, Home,
  Pencil, UserCheck, LogOut, User, Settings, Key, Briefcase, Lock, ChevronRight, ChevronLeft, Layers, Image as ImageIcon,
  CheckSquare, X, Fingerprint, Save, Sun, Gamepad2, Instagram
} from "lucide-react"
import { format, addDays, differenceInDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useLocation } from "wouter"
import { AddToCalendar } from "@/components/add-to-calendar"
import { AuthModal } from "@/components/auth-modal"
import { CompleteProfileModal } from "@/components/complete-profile-modal"
import { BookingFunnelModal, formatDisplayDate } from "@/components/booking-funnel-modal"
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { initGoogleOneTap, cancelGoogleOneTap, clearGoogleCooldown, loginWithGooglePopup, getCurrentSession, logoutAccount, UserProfile } from "@/lib/auth-client"

export interface RoomConfig {
  id: number
  bedType: "queen" | "twin"
  adults: number
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

export default function BookingEngine() {
  const [, setLocation] = useLocation()
  const [checkin, setCheckin] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [checkout, setCheckout] = useState(format(addDays(new Date(), 3), "yyyy-MM-dd"))
  
  // Carrinho de Flats / Multi-Quartos (1 a N flats)
  const [rooms, setRooms] = useState<RoomConfig[]>([
    { id: 1, bedType: "queen", adults: 1 }
  ])
  
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

  const updateNestedConfig = (path: string, val: string) => {
    const keys = path.split(".")
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
        alert("✅ Alterações salvas com sucesso no site público!")
      } else {
        alert("Erro ao salvar alterações no servidor.")
      }
    } catch {
      alert("Erro de conexão ao salvar.")
    } finally {
      setIsSavingSite(false)
    }
  }

  // Pet Friendly States
  const [bringingPet, setBringingPet] = useState(false)
  const [petCount, setPetCount] = useState(1)
  const [petRulesAccepted, setPetRulesAccepted] = useState(false)
  
  // Regime de Hospedagem: "with_breakfast" (Tarifa com Café Incluso) | "room_only" (Tarifa sem Café)
  const [ratePlan, setRatePlan] = useState<"with_breakfast" | "room_only">("with_breakfast")

  // Booking Flow States
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [selectedFlat, setSelectedFlat] = useState<any | null>(null)
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
  const [showQuickAuthFloater, setShowQuickAuthFloater] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authName, setAuthName] = useState("")
  const [authPhone, setAuthPhone] = useState("")
  const [authDocument, setAuthDocument] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState("")

  // Guest Profile Modal & Management States
  const [guestProfileModalOpen, setGuestProfileModalOpen] = useState(false)
  const [profileNameInput, setProfileNameInput] = useState("")
  const [profileEmailInput, setProfileEmailInput] = useState("")
  const [profilePhoneInput, setProfilePhoneInput] = useState("")
  const [profileDocInput, setProfileDocInput] = useState("")
  const [profileNewPassword, setProfileNewPassword] = useState("")
  const [profilePlateInput, setProfilePlateInput] = useState("")
  const [profileModelInput, setProfileModelInput] = useState("")
  const [profileCnpjInput, setProfileCnpjInput] = useState("")
  const [profileCompanyInput, setProfileCompanyInput] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("")

  // Guest fields & Auto-Fill Mode (com inicialização síncrona do cache local)
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
  const [isWorkTrip, setIsWorkTrip] = useState(false)
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")

  // Flats disponíveis
  const [flats, setFlats] = useState<any[]>([])
  const [loadingFlats, setLoadingFlats] = useState(false)

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

    // Cancela qualquer prompt de login que possa estar aberto
    cancelGoogleOneTap()

    // Se o login acabou de ocorrer (ex: Google) e falta WhatsApp ou CPF:
    if (triggerCompletionCheck && (!account.phone || !account.document || account.phone.replace(/\D/g, "").length < 10)) {
      setProfileToComplete(account)
      setCompleteProfileModalOpen(true)
    }
  }

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")
    try {
      const res = await fetch("/api/guest-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: authEmail, email: authEmail, password: authPassword })
      })
      const data = await res.json()
      if (res.ok && data.guest) {
        applyGuestData(data.guest)
        if (data.token) localStorage.setItem("corpflats_guest_token", data.token)
        if (data.guest.email) localStorage.setItem("corpflats_guest_email", data.guest.email)
        setAuthModalOpen(false)
      } else {
        setAuthError(data.error || "Credenciais inválidas.")
      }
    } catch (err: any) {
      setAuthError("Erro ao conectar com o servidor.")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGuestRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")
    try {
      const res = await fetch("/api/guest-auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: authName,
          email: authEmail,
          password: authPassword,
          phone: authPhone,
          document: authDocument,
          vehicle: vehiclePlate ? { plate: vehiclePlate, brand: vehicleBrand, model: vehicleModel, color: vehicleColor } : null
        })
      })
      const data = await res.json()
      if (res.ok && data.guest) {
        applyGuestData(data.guest)
        if (data.token) localStorage.setItem("corpflats_guest_token", data.token)
        if (data.guest.email) localStorage.setItem("corpflats_guest_email", data.guest.email)
        setAuthModalOpen(false)
      } else {
        setAuthError(data.error || "Erro ao cadastrar conta.")
      }
    } catch (err: any) {
      setAuthError("Erro ao conectar com o servidor.")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleOpenProfileModal = () => {
    setProfileNameInput(guestAccount?.name || guestName || "")
    setProfileEmailInput(guestAccount?.email || guestEmail || "")
    setProfilePhoneInput(guestAccount?.phone || guestPhone || "")
    setProfileDocInput(guestAccount?.document || guestDocument || "")
    setProfilePlateInput(guestAccount?.vehicle?.plate || vehiclePlate || "")
    setProfileModelInput(guestAccount?.vehicle?.model || vehicleModel || "")
    setProfileCnpjInput(guestAccount?.companyData?.cnpj || companyCnpj || "")
    setProfileCompanyInput(guestAccount?.companyData?.companyName || companyName || "")
    setProfileNewPassword("")
    setProfileSuccessMsg("")
    setGuestProfileModalOpen(true)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSuccessMsg("")
    try {
      const emailToUse = guestAccount?.email || guestEmail || profileEmailInput
      const payload: any = {
        email: emailToUse,
        name: profileNameInput,
        phone: profilePhoneInput,
        document: profileDocInput,
        vehicle: profilePlateInput
          ? {
              ...(guestAccount?.vehicle || {}),
              plate: profilePlateInput,
              model: profileModelInput,
              brand: guestAccount?.vehicle?.brand || vehicleBrand || "",
              color: guestAccount?.vehicle?.color || vehicleColor || ""
            }
          : null,
        companyData: profileCnpjInput
          ? {
              ...(guestAccount?.companyData || {}),
              cnpj: profileCnpjInput,
              companyName: profileCompanyInput,
              companyEmail: guestAccount?.companyData?.companyEmail || companyEmail || "",
              companyPhone: guestAccount?.companyData?.companyPhone || companyPhone || ""
            }
          : null,
        newEmail: profileEmailInput !== emailToUse ? profileEmailInput : undefined,
        newPassword: profileNewPassword || undefined
      }

      const savedToken = localStorage.getItem("corpflats_guest_token") || ""
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (savedToken) headers["Authorization"] = `Bearer ${savedToken}`

      const res = await fetch("/api/guest-auth/profile", {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (res.ok && json.guest) {
        applyGuestData(json.guest)
        if (payload.newEmail) {
          localStorage.setItem("corpflats_guest_email", payload.newEmail)
        }
      } else {
        setGuestName(profileNameInput)
        setGuestPhone(profilePhoneInput)
        setGuestEmail(profileEmailInput)
        setGuestDocument(profileDocInput)
        if (profilePlateInput) {
          setVehiclePlate(profilePlateInput)
          setVehicleModel(profileModelInput)
        }
      }
      setProfileSuccessMsg("✓ Seus dados foram atualizados com sucesso!")
      setTimeout(() => setProfileSuccessMsg(""), 4000)
    } catch {
      setProfileSuccessMsg("✓ Dados salvos localmente!")
    } finally {
      setSavingProfile(false)
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
    setIsWorkTrip(false)
    setCompanyCnpj("")
    setCompanyName("")
    setCompanyEmail("")
    setCompanyPhone("")
    localStorage.removeItem("corpflats_guest_email")
    localStorage.removeItem("corpflats_guest_token")
    localStorage.removeItem("corpflats_guest_profile")
    setGuestProfileModalOpen(false)
    cancelGoogleOneTap()
  }

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})

    fetch("/api/site-content")
      .then(r => r.json())
      .then(d => setSiteConfig(d))
      .catch(() => {})

    // Registra o callback global oficial para o Google One Tap nativo
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

    // Inicialização robusta e validação de sessão
    const initAuthSession = async () => {
      // 1. Tenta restaurar sessão HttpOnly V2 ativa no servidor
      const sessionUser = await getCurrentSession()
      if (sessionUser) {
        applyGuestData(sessionUser, false)
        cancelGoogleOneTap()
        return
      }

      // 2. Fallback legado por token salvo
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
              cancelGoogleOneTap()
              return
            }
          }
        } catch {}
      }

      // 3. Fallback de perfil local se já existir
      const rawProfile = localStorage.getItem("corpflats_guest_profile")
      if (rawProfile) {
        try {
          const parsed = JSON.parse(rawProfile)
          if (parsed && (parsed.email || parsed.name)) {
            applyGuestData(parsed, false)
            cancelGoogleOneTap()
            return
          }
        } catch {}
      }

      // 4. Se e somente se não há nenhuma conta logada nem perfil local:
      initGoogleOneTap((user) => {
        applyGuestData(user, true)
      })
    }

    initAuthSession()
  }, [])

  useEffect(() => {
    searchAvailability()
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
      // Fallback
    } finally {
      setLoadingFlats(false)
    }
  }

  const searchAvailableFlats = searchAvailability

  const nights = Math.max(1, differenceInDays(parseISO(checkout || checkin), parseISO(checkin)))
  const flatsCount = rooms.length
  
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

  // Sanitização automática caso a regra de corte esteja ativa ou 3º hóspede esteja desativado
  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => ({
        ...r,
        bedType: isCutoffActive || siteConfig?.bedConfig?.allowTwinBeds === false ? "queen" : r.bedType,
        adults: !isThirdGuestEnabled && r.adults > 2 ? 2 : r.adults,
      }))
    )
  }, [checkin, isCutoffActive, isThirdGuestEnabled, siteConfig?.bedConfig?.allowTwinBeds])

  // Handlers para adicionar/remover e atualizar flats na reserva
  const addRoom = () => {
    const maxAvailable = availabilityData?.totalAvailableFlats || 5
    if (rooms.length >= maxAvailable) {
      alert(`No momento há ${maxAvailable} flats disponíveis para as datas selecionadas.`)
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
        alert("Para reservas com check-in hoje após as 12:00, a lotação é limitada a até 2 hóspedes por flat.")
      }
      return
    }
    if (field === "bedType" && value === "twin") {
      if (siteConfig?.bedConfig?.allowTwinBeds === false) return
      if (isCutoffActive) {
        alert(`Para reservas com check-in no mesmo dia, a montagem de 2 camas de solteiro só pode ser solicitada até as ${twinCutoffTimeStr}.`)
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

  // Obtenção dinâmica do plano tarifário selecionado (sincronizado com SEBRAE / Calendário / Preços)
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

  const discountPercent = 0
  const discountAmount = 0

  // Cálculo dinâmico da Taxa de Limpeza específica do plano por flat
  const cleaningFeePerFlat = currentPlan.cleaningFeeEnabled
    ? (currentPlan.cleaningFeeType === "per_night" ? (Number(currentPlan.cleaningFeeAmount) || 0) * nights : (Number(currentPlan.cleaningFeeAmount) || 0))
    : 0
  const cleaningFee = Math.round(cleaningFeePerFlat * flatsCount * 100) / 100

  // Cálculo dinâmico da Taxa Pet
  const petFeePerUnit = siteConfig?.petPolicy?.feeAmount ?? 40
  const petFee = bringingPet
    ? (siteConfig?.petPolicy?.feeType === "per_night" ? petFeePerUnit * nights * petCount : petFeePerUnit * petCount)
    : 0

  // Cálculo dinâmico do Acréscimo para 2 Camas de Solteiro (somatório dos flats que escolheram twin)
  const twinCount = rooms.filter(r => r.bedType === "twin").length
  const twinFeeUnit = siteConfig?.bedConfig?.twinFeeAmount ?? 30
  const twinFee = twinCount * (siteConfig?.bedConfig?.twinFeeType === "per_night" ? twinFeeUnit * nights : twinFeeUnit)

  // Cálculo dinâmico da Taxa de Colchonete Extra para 3º hóspede
  const extraBedCount = rooms.filter(r => r.adults === 3).length
  const extraBedFeeUnit = siteConfig?.extraBedConfig?.feeAmount ?? 60
  const extraBedFee = extraBedCount * (siteConfig?.extraBedConfig?.feeType === "per_night" ? extraBedFeeUnit * nights : extraBedFeeUnit)

  // Preço Normal Canônico = Valor Final no PIX (100% integral)
  const pixTotalAmount = Math.round((subtotal + cleaningFee + petFee + twinFee + extraBedFee) * 100) / 100
  // Preço no Cartão = Incremento silencioso configurado (ex: +5%) exibido como preço padrão
  const cardTotalAmount = Math.round(pixTotalAmount * (1 + cardMarkupPercent / 100) * 100) / 100
  const baseTotalAmount = cardTotalAmount

  // Desconto exibido ao selecionar PIX
  const pixDiscountPercent = cardMarkupPercent
  const pixDiscountAmount = Math.round((cardTotalAmount - pixTotalAmount) * 100) / 100

  // Valor ativo conforme forma de pagamento escolhida
  const totalAmount = paymentMethod === "pix" ? pixTotalAmount : cardTotalAmount
  const currentTotalDiscount = paymentMethod === "pix" ? pixDiscountAmount : 0

  // Referência comparativa contra plataformas (Booking / Airbnb = Preço Base + Comissão da Plataforma)
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

  // Política de cancelamento ativa baseada em antecedência (configurável em /tarifas)
  const cancellationPolicy = calculateCancellationPolicy(
    new Date(),
    checkin,
    totalAmount,
    "14:00",
    new Date(),
    Number(siteConfig?.cancellationPolicy?.freeCancellationHours ?? 24),
    Number(siteConfig?.cancellationPolicy?.noShowPenaltyPercent ?? 100)
  )

  const handleStartBooking = (overridePlan?: "with_breakfast" | "room_only") => {
    if (overridePlan) setRatePlan(overridePlan)
    setCheckoutModalOpen(true)
    try {
      fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: (typeof window !== "undefined" && sessionStorage.getItem("corpflats_funnel_session")) || `funnel_${Date.now()}`,
          step: 1,
          stepName: "busca_datas",
          checkinDate: checkin,
          checkoutDate: checkout,
          ratePlan: overridePlan || ratePlan,
          status: "pesquisando"
        })
      }).catch(() => {})
    } catch {}
  }

  const handleConfirmBooking = async () => {
    if (!guestName.trim() || !guestPhone.trim() || !guestEmail.trim()) {
      alert("Por favor, preencha nome, WhatsApp e e-mail para confirmar a sua reserva.")
      return
    }

    if (bringingPet && !petRulesAccepted) {
      alert("Por favor, leia e aceite as regras de convivência para animais de estimação antes de prosseguir.")
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
        ratePlan, // "with_breakfast" | "room_only"
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
        } else if ((paymentMethod === "card" || paymentMethod === "cartao_credito") && data.initPoint) {
          setMpInitPoint(data.initPoint)
          setMpResData(data.reservation)
          setCardModalOpen(true)
          window.open(data.initPoint, "_blank")
        } else {
          setCurrentPendingRes(data.reservation)
          alert("✓ Sua solicitação de reserva foi confirmada com sucesso!")
        }
      } else {
        alert(data.error || "Erro ao processar reserva.")
      }
    } catch {
      alert("Erro ao conectar com o servidor.")
    } finally {
      setIsProcessing(false)
    }
  }

  const whatsappNumber = siteConfig?.branding?.whatsapp || settings?.adminWhatsApp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Olá! Gostaria de informações sobre disponibilidade e reservas nos flats da CorpFlats.")}`

  // Hero Data & Conteúdo Real do Edifício Soho Residence Service
  const heroTitle = siteConfig?.hero?.title && !siteConfig.hero.title.includes("Macaé") && !siteConfig.hero.title.includes("Sua Estadia com Conforto")
    ? siteConfig.hero.title
    : "Seu flat pronto no Centro de Campos dos Goytacazes"
  const heroHighlight = siteConfig?.hero?.highlightText && !siteConfig.hero.highlightText.includes("Luz Natural e Sofisticação")
    ? siteConfig.hero.highlightText
    : "Edifício Soho Residence Service • Recepção 24h, Garagem Inclusa e Jacuzzi na Cobertura"
  const heroBg = siteConfig?.hero?.backgroundImage && !siteConfig.hero.backgroundImage.includes("images.unsplash.com")
    ? siteConfig.hero.backgroundImage
    : "/photos/soho/hero-jacuzzi-cobertura.jpg"
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
  const testimonialsList = filteredSiteTestimonials.length > 0 ? filteredSiteTestimonials : DEFAULT_GOOGLE_TESTIMONIALS

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

  const faqList = (Array.isArray(siteConfig?.faq) && siteConfig.faq.length > 0 && !siteConfig.faq.some((f: any) => String(f?.a || "").includes("06:30")))
    ? siteConfig.faq
    : [
        { q: "Como funcionam o check-in, o check-out e a entrega da chave?", a: "O check-in começa às 14:00 e o check-out vai até as 12:00. Você preenche o pré-check-in digital rapidinho pelo celular antes de chegar e retira o cartão de acesso NFC diretamente na recepção 24h do Edifício Soho (não utilizamos senha em fechadura)." },
        { q: "Qual o horário e como é servido o café da manhã?", a: "Na tarifa Com Café, sua bandeja é entregue diretamente no flat no horário escolhido por você entre 05:00 e 09:30 — ideal inclusive para quem sai cedo a trabalho." },
        { q: "Tem vaga de garagem inclusa?", a: "Sim. Cada flat dá direito a 1 vaga de garagem coberta no próprio Edifício Soho Residence Service, sem custo adicional." },
        { q: "O que tem na cozinha do flat? Tem micro-ondas?", a: "A cozinha conta com cooktop de 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres, copos, taças e saca-rolhas. Não dispomos de micro-ondas nos apartamentos." },
        { q: "Posso pedir 2 camas de solteiro no lugar da cama de casal?", a: "Sim, em unidades compatíveis mediante taxa adicional de configuração. Para reservas com entrada no mesmo dia, o pedido de 2 camas de solteiro precisa ser feito até as 12:00." },
        { q: "Vocês aceitam animais de estimação (Pet Friendly)?", a: "Sim! Aceitamos exclusivamente cachorros de porte pequeno (até 10 kg), com limite de até 2 cães por flat e taxa de R$ 40 por cachorro por estadia." },
        { q: "Qual é a política de cancelamento?", a: "Cancelamento gratuito com 100% de reembolso até 24 horas antes das 14:00 do dia do check-in. Faltando menos de 24 horas para o check-in, é cobrado 100% do valor da reserva." }
      ]

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
                window.location.href = "/reservar"
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
          {siteConfig?.branding?.badgeTop || "⭐ Melhor tarifa garantida no site oficial"}
        </span>
      </div>

      {/* ── Top Navigation Bar (Hotel Boutique: Limpo & Reduzido) ───────── */}
      <nav className={`${isVisualEditMode ? "relative" : "sticky top-0"} z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/70 px-4 sm:px-8 py-2.5 sm:py-3 w-full max-w-full`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo CorpFlats */}
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
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
                <CorpFlatsWordmark className="text-sm sm:text-base text-[#0F3D4C] group-hover:text-[#091E26] transition-colors block leading-none" />
              )}
              <span
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
          </div>

          {/* Links desktop discretos */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-6 whitespace-nowrap text-xs font-medium text-slate-600">
            <a href="#tarifas" className="hover:text-[#0F3D4C] transition-colors">Tarifas</a>
            <a href="#galeria" className="hover:text-[#0F3D4C] transition-colors">Fotos</a>
            <a href="#detalhes" className="hover:text-[#0F3D4C] transition-colors">O Flat</a>
            <a href="#comodidades" className="hover:text-[#0F3D4C] transition-colors">Estrutura Soho</a>
            <a href="#localizacao" className="hover:text-[#0F3D4C] transition-colors">Localização</a>
            {testimonialsList.length > 0 && (
              <a href="#avaliacoes" className="hover:text-[#0F3D4C] transition-colors">Avaliações</a>
            )}
            <a href="#faq" className="hover:text-[#0F3D4C] transition-colors">Dúvidas</a>
          </div>

          {/* Ações: Entrar/Conta + Reservar destacado */}
          <div className="flex items-center gap-2 shrink-0">
            {guestAccount || guestName ? (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLocation("/minha-conta")}
                  className="h-8 px-2 sm:px-2.5 text-slate-700 font-medium text-xs hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
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
                  className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
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
                className="h-8 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 font-medium text-xs hover:bg-slate-100 rounded-lg flex items-center gap-1.5 shrink-0"
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
              className="hidden sm:inline-flex bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-semibold text-xs h-8 px-3.5 rounded-lg shadow-xs transition-all shrink-0"
            >
              Reservar
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section (CSS Grid Responsivo: Jacuzzi 100% visível no Mobile e no Desktop + Card à Direita) ─ */}
      <header className="relative grid grid-cols-1 lg:grid-cols-12 lg:min-h-[540px] lg:max-h-[600px] lg:bg-[#091E26] overflow-clip">
        {/* Linha 1 Mobile (banner dedicado) / Colunas 1-8 Desktop (jacuzzi livre à esquerda/centro-esquerda) */}
        <div className="relative row-start-1 col-start-1 lg:col-start-1 lg:col-span-8 aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:h-full lg:min-h-[540px] lg:max-h-[600px] overflow-hidden z-0">
          <img
            src={heroBg}
            alt="Cobertura com jacuzzi aquecida e deck de madeira no Edifício Soho Residence Service"
            width={1920}
            height={1280}
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-[center_68%] lg:object-[78%_68%] block"
          />
          {/* Gradiente apenas na faixa superior para leitura do título, deixando toda a jacuzzi e o deck claros */}
          <div className="absolute inset-x-0 top-0 h-[52%] sm:h-[46%] lg:h-[48%] bg-gradient-to-b from-slate-950/85 via-slate-950/30 to-transparent pointer-events-none" />
          {/* Transição lateral suave no Desktop para o painel escuro à direita onde fica o seletor */}
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

        {/* Selo Google + Título & Subtítulo no Topo Esquerdo (sem cobrir jacuzzi nem espreguiçadeiras) */}
        <div className="relative z-10 row-start-1 col-start-1 lg:col-start-1 lg:col-span-7 self-start p-3.5 sm:p-6 lg:pt-8 lg:pl-8 xl:pl-12 lg:pr-6 text-left pointer-events-none">
          <a
            href="#avaliacoes"
            className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/65 hover:bg-slate-950/85 backdrop-blur-xs border border-[#C5A059]/50 text-[10.5px] sm:text-xs font-semibold text-white shadow-xs transition-colors mb-1.5 sm:mb-2"
          >
            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
            <span>4,9 ★ no Google • 27 avaliações</span>
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
        <div className="relative z-20 row-start-2 col-start-1 lg:row-start-1 lg:col-start-8 lg:col-span-5 lg:self-center bg-slate-50 lg:bg-transparent px-3 sm:px-6 py-4 lg:py-7 lg:pl-2 lg:pr-6 xl:pr-10">
          <div id="reserva-rapida" className="w-full max-w-lg lg:max-w-[408px] xl:max-w-md mx-auto lg:ml-auto lg:mr-0 text-left">
            <div className="bg-white lg:bg-white/97 lg:backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-xl lg:shadow-2xl shadow-slate-900/10 lg:shadow-slate-950/35 border border-slate-200/80 lg:border-white/60 p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
              {/* Seletor Compacto de Datas */}
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
                    className="bg-slate-50/80 border-slate-200 text-xs text-slate-900 h-8.5 font-bold rounded-xl"
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
                    className="bg-slate-50/80 border-slate-200 text-xs text-slate-900 h-8.5 font-bold rounded-xl"
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
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
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
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
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
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
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
                  {/* Opção 1: COM CAFÉ (com miniatura clicável para zoom) */}
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
                          src="/photos/soho/cafe-mesa-close.jpg"
                          alt="Café da manhã servido na mesa do flat"
                          width={112}
                          height={84}
                          decoding="async"
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
                        <div className="text-[10px] text-slate-400 line-through leading-none mb-0.5" title="Valor no Booking e Airbnb">
                          R$ {formatBrl(otaWithBreakfastDailyRate)}
                        </div>
                      )}
                      <div className="font-extrabold text-xs sm:text-sm text-slate-900 leading-none">
                        R$ {formatBrl(withBreakfastConfig.dailyRate)}
                      </div>
                      <span className="text-[9px] text-slate-400 block mt-0.5">/ noite no PIX</span>
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
                        <div className="text-[10px] text-slate-400 line-through leading-none mb-0.5" title="Valor no Booking e Airbnb">
                          R$ {formatBrl(otaRoomOnlyDailyRate)}
                        </div>
                      )}
                      <div className="font-extrabold text-xs sm:text-sm text-slate-900 leading-none">
                        R$ {formatBrl(roomOnlyConfig.dailyRate)}
                      </div>
                      <span className="text-[9px] text-slate-400 block mt-0.5">/ noite no PIX</span>
                    </div>
                  </div>
                </div>

                {otaSavingsAmount > 0 && (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200/80 text-[10.5px] text-emerald-800 font-semibold">
                    <span className="truncate">Reserva direta vs. Booking / Airbnb:</span>
                    <span className="font-extrabold shrink-0">- R$ {formatBrl(otaSavingsAmount)}</span>
                  </div>
                )}
              </div>

              {/* Botão de Ação Principal (CTA) */}
              <div className="pt-0.5 space-y-1.5">
                <Button
                  onClick={() => handleStartBooking()}
                  disabled={availabilityData?.available === false}
                  className="w-full bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 font-bold text-xs sm:text-sm h-10.5 sm:h-11 rounded-xl shadow-md shadow-[#091E26]/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>Reservar agora</span>
                  <ArrowRight className="w-4 h-4 text-[#E5C98B]" aria-hidden="true" />
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>Cancelamento grátis até 24h antes do check-in</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-w-0">
      {/* ── Diferenciais Reais do Edifício Soho (Diretos e sem redundância) ── */}
      <section id="beneficios" className="w-full min-w-0 max-w-2xl mx-auto px-4 py-8 sm:py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-slate-700">
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
      </section>

      {/* ── Galeria de Fotos Reais (13 fotos horizontais do Soho Residence) ── */}
      <section id="galeria" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Fotos Reais do Flat & Área de Lazer
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto text-pretty">
            Conheça por dentro o padrão dos apartamentos e a cobertura completa do Edifício Soho Residence Service.
          </p>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="relative aspect-[3/2] max-h-[440px] w-full rounded-2xl overflow-hidden bg-slate-200 shadow-sm group">
            <img
              src={galleryList[activePhotoIdx]?.imageUrl || galleryList[0]?.imageUrl}
              alt={galleryList[activePhotoIdx]?.title || "Flat CorpFlats Soho Residence"}
              width={1600}
              height={1067}
              decoding="async"
              className="w-full h-full object-cover transition-all duration-300 block"
            />
            {galleryList.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => setActivePhotoIdx((prev) => (prev - 1 + galleryList.length) % galleryList.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center backdrop-blur-xs transition-all"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima foto"
                  onClick={() => setActivePhotoIdx((prev) => (prev + 1) % galleryList.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center backdrop-blur-xs transition-all"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </>
            )}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-white text-xs font-semibold">
              <div className="bg-slate-900/75 backdrop-blur-md px-3 py-1.5 rounded-lg min-w-0 flex items-center gap-2">
                {galleryList[activePhotoIdx]?.category && (
                  <span className="text-[10px] uppercase tracking-wider text-[#E5C98B] font-bold shrink-0">
                    {galleryList[activePhotoIdx].category}
                  </span>
                )}
                <span className="truncate">{galleryList[activePhotoIdx]?.title || "Flat Soho Residence"}</span>
              </div>
              <span className="bg-slate-900/75 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-[11px] shrink-0">
                {activePhotoIdx + 1} / {galleryList.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 md:grid-cols-13 gap-1.5 sm:gap-2">
            {galleryList.map((photo: any, idx: number) => (
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
                  src={photo.imageUrl}
                  alt={photo.title}
                  width={320}
                  height={213}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover block"
                />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── O Flat: Padrão Único & Itens Reais ───────────────────────────── */}
      <section id="detalhes" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
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
      <section id="comodidades" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Estrutura do Soho Residence
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

      {/* ── Localização no Centro de Campos ──────────────────────────────── */}
      <section id="localizacao" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Localização Central
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 text-pretty">
            Fácil acesso a fóruns, bancos, clínicas, restaurantes e vias de saída da cidade.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <p className="font-bold text-xs sm:text-sm text-slate-900">
                Edifício Soho Residence Service
              </p>
              <p className="text-xs text-slate-500 text-pretty">
                {siteConfig?.branding?.address || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ"}
              </p>
            </div>
          </div>

          <a
            href={siteConfig?.branding?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F3D4C] hover:text-[#091E26] bg-[#0F3D4C]/8 hover:bg-[#0F3D4C]/15 border border-[#C5A059]/30 px-3.5 py-2 rounded-xl transition-colors shrink-0"
          >
            <span>Abrir no Google Maps</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* ── Avaliações Reais dos Hóspedes no Google ───────────────────────── */}
      {testimonialsList.length > 0 && (
        <section id="avaliacoes" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
                Avaliações de Hóspedes
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 text-pretty">
                Relatos reais de quem já se hospedou conosco no Soho Residence.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 text-xs font-bold text-slate-900"
                aria-label="Nota 4,9 de 5 estrelas no Google com 27 avaliações"
              >
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
                <span>4,9 ★ no Google (27 avaliações)</span>
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
                    <span className="font-bold text-xs text-slate-900 block">{t.name}</span>
                    {t.city && <span className="text-[10px] text-slate-400 block">{t.city}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Perguntas Frequentes (FAQ) ───────────────────────────────────── */}
      <section id="faq" className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight text-balance">
            Dúvidas Frequentes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 text-pretty">
            Informações diretas sobre horários, acesso, pets, garagem e cancelamento.
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
                  className="w-full p-4 text-left flex items-center justify-between gap-3 font-semibold text-xs sm:text-sm text-slate-900 hover:text-[#0F3D4C] transition-colors"
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
      </main>

      {/* ── Rodapé Oficial CorpFlats ─────────────────────────────────────── */}
      <footer className="w-full min-w-0 bg-white border-t border-slate-200/80 py-10 px-4 sm:px-8 text-xs text-slate-600 mt-12 pb-24 sm:pb-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <CorpFlatsIcon className="w-7 h-7" />
              <CorpFlatsWordmark className="text-sm text-[#0F3D4C]" />
            </div>
            <p className="text-[11px] text-slate-500">
              Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ (Edifício Soho Residence Service)
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 text-xs">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 font-semibold hover:underline flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>WhatsApp {formatPhoneNumber(whatsappNumber)}</span>
            </a>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-[#0F3D4C] font-semibold flex items-center gap-1"
            >
              <Instagram className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" aria-hidden="true" />
              <span>{instagramHandle.startsWith("@") ? instagramHandle : `@${instagramHandle}`}</span>
            </a>
            <a
              href={`mailto:${siteConfig?.branding?.email || "reservas@corpflats.com.br"}`}
              className="text-slate-600 hover:text-[#0F3D4C] break-all flex items-center gap-1"
            >
              <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span>{siteConfig?.branding?.email || "reservas@corpflats.com.br"}</span>
            </a>
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-6 mt-6 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          © {new Date().getFullYear()} {brandName}. Todos os direitos reservados.
        </div>
      </footer>

      {/* ── Mobile Sticky Bottom CTA Bar (aparece suavemente apenas quando rolar para baixo) ── */}
      <div className={`sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-lg transition-transform duration-300 ${
        showStickyBottom ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}>
        <div>
          <span className="text-[10px] text-slate-500 font-medium block">
            {ratePlan === "with_breakfast" ? "Com café da manhã" : "Sem café da manhã"}
          </span>
          <div className="text-xs font-bold text-slate-900 flex items-baseline gap-1.5">
            {otaReferenceMarkupPercent > 0 && (
              <span className="text-[10px] font-normal text-slate-400 line-through">
                R$ {formatBrl(ratePlan === "with_breakfast" ? otaWithBreakfastDailyRate : otaRoomOnlyDailyRate)}
              </span>
            )}
            <span>
              R$ {formatBrl(ratePlan === "with_breakfast" ? withBreakfastConfig.dailyRate : roomOnlyConfig.dailyRate)}
              <span className="text-[10px] font-normal text-slate-500"> / noite no PIX</span>
            </span>
          </div>
        </div>

        <Button
          onClick={() => handleStartBooking()}
          className="bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
        >
          Reservar agora
        </Button>
      </div>

      {/* ── Modal de Zoom da Foto do Café da Manhã (sem sair do seletor) ────── */}
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
            <img
              src="/photos/soho/cafe-mesa-close.jpg"
              alt="Mesa posta de café da manhã no flat da CorpFlats Soho Residence"
              width={1200}
              height={670}
              decoding="async"
              className="w-full h-auto aspect-[1200/670] object-cover block"
            />
          </div>

          <DialogFooter className="sm:justify-between items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              Pães, pão de queijo quentinho, frios, frutas frescas, ovos mexidos, bolo, suco e café.
            </span>
            <Button
              type="button"
              onClick={() => setBreakfastZoomOpen(false)}
              className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs h-9 px-4 rounded-xl shrink-0"
            >
              Continuar na reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Funil de Vendas Interativo do Motor de Reservas (5 Etapas) ─────── */}
      <BookingFunnelModal
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
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onSuccessBooking={(res) => {
          setConfirmedReservation(res)
        }}
      />

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
        onOpenChange={setAuthModalOpen}
        onSuccess={(user) => {
          applyGuestData(user, true)
          setAuthModalOpen(false)
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
