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
  Pencil, UserCheck, LogOut, User, Settings, Key, Briefcase, Lock, ChevronRight, Layers, Image as ImageIcon,
  CheckSquare, X, Fingerprint, Save
} from "lucide-react"
import { format, addDays, differenceInDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useLocation } from "wouter"
import { AddToCalendar } from "@/components/add-to-calendar"
import { AuthModal } from "@/components/auth-modal"
import { BookingFunnelModal } from "@/components/booking-funnel-modal"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { initGoogleOneTap, cancelGoogleOneTap, loginWithGooglePopup, UserProfile } from "@/lib/auth-client"

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
    { id: 1, bedType: "queen", adults: 2 }
  ])
  
  const [availabilityData, setAvailabilityData] = useState<any>(null)
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)

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
  const [settings, setSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  // Guest Account & Auth States
  const [guestAccount, setGuestAccount] = useState<any | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
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

  // Guest fields & Auto-Fill Mode
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [guestDocument, setGuestDocument] = useState("")

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

  const applyGuestData = (account: any) => {
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
      localStorage.setItem("corpflats_guest_profile", JSON.stringify({
        name: account.name,
        phone: account.phone,
        email: account.email,
        document: account.document
      }))
    } catch {}
  }

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")
    try {
      const res = await fetch("/api/guest-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      })
      const data = await res.json()
      if (res.ok && data.guest) {
        applyGuestData(data.guest)
        localStorage.setItem("corpflats_guest_token", data.token)
        localStorage.setItem("corpflats_guest_email", data.guest.email)
        setAuthModalOpen(false)
      } else {
        setAuthError(data.error || "E-mail ou senha inválidos.")
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
        localStorage.setItem("corpflats_guest_token", data.token)
        localStorage.setItem("corpflats_guest_email", data.guest.email)
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
        vehicle: profilePlateInput ? { plate: profilePlateInput, model: profileModelInput, brand: "", color: "" } : null,
        companyData: profileCnpjInput ? { cnpj: profileCnpjInput, companyName: profileCompanyInput } : null,
        newEmail: profileEmailInput !== emailToUse ? profileEmailInput : undefined,
        newPassword: profileNewPassword || undefined
      }

      const res = await fetch("/api/guest-auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  const handleLogout = () => {
    setGuestAccount(null)
    setGuestName("")
    setGuestPhone("")
    setGuestEmail("")
    setGuestDocument("")
    localStorage.removeItem("corpflats_guest_email")
    localStorage.removeItem("corpflats_guest_token")
    setGuestProfileModalOpen(false)
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

    const savedEmail = localStorage.getItem("corpflats_guest_email")
    if (savedEmail) {
      fetch(`/api/guest-auth/profile?email=${encodeURIComponent(savedEmail)}`)
        .then(r => r.json())
        .then(d => {
          if (d.guest) applyGuestData(d.guest)
        })
        .catch(() => {})
    }

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
            applyGuestData(data.user)
          }
        } catch {}
      }
    }

    // Inicializa o prompt oficial do Google One Tap que desce no topo
    initGoogleOneTap((user) => {
      applyGuestData(user)
    })

    return () => {
      cancelGoogleOneTap()
    }
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
        if (!data.allowTwinBeds && bedType === "twin") {
          setBedType("queen")
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
  
  // Regra de corte temporal: Reservas para HOJE efetuadas após as 12:00
  // Bloqueia 3 hóspedes (colchonete extra) e 2 camas de solteiro
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const currentHour = new Date().getHours()
  const isCheckinToday = checkin === todayStr
  const isCutoffActive = isCheckinToday && currentHour >= 12

  // Sanitização automática caso a regra de corte esteja ativa
  useEffect(() => {
    if (isCutoffActive) {
      setRooms(prev => prev.map(r => ({
        ...r,
        bedType: "queen",
        adults: r.adults > 2 ? 2 : r.adults
      })))
    }
  }, [checkin, isCutoffActive])

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
    if (isCutoffActive && field === "adults" && Number(value) > 2) {
      alert("Para reservas com check-in hoje após as 12:00, a lotação é limitada a até 2 hóspedes por flat.")
      return
    }
    if (isCutoffActive && field === "bedType" && value === "twin") {
      alert("Para reservas com check-in hoje após as 12:00, apenas a configuração de Cama Queen Casal está disponível.")
      return
    }
    setRooms(rooms.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  // Obtenção dinâmica do plano tarifário selecionado
  const withBreakfastConfig = siteConfig?.ratePlans?.with_breakfast || { 
    dailyRate: 225, 
    cleaningFeeEnabled: false, 
    cleaningFeeAmount: 0, 
    cleaningFeeType: "per_stay", 
    description: "Diária com Café da Manhã servido exclusivamente no flat" 
  }
  const roomOnlyConfig = siteConfig?.ratePlans?.room_only || { 
    dailyRate: 190, 
    cleaningFeeEnabled: true, 
    cleaningFeeAmount: 70, 
    cleaningFeeType: "per_stay", 
    description: "Tarifa econômica sem café da manhã" 
  }
  
  const currentPlan = ratePlan === "with_breakfast" ? withBreakfastConfig : roomOnlyConfig
  const selectedDailyRate = Number(currentPlan.dailyRate) || (ratePlan === "with_breakfast" ? 225 : 190)
  const subtotal = selectedDailyRate * nights * flatsCount
  
  const discountPercent = siteConfig?.pricing?.directDiscountPercent ?? 15
  const discountAmount = Math.round(subtotal * (discountPercent / 100))
  
  // Cálculo dinâmico da Taxa de Limpeza específica do plano por flat
  const cleaningFeePerFlat = currentPlan.cleaningFeeEnabled
    ? (currentPlan.cleaningFeeType === "per_night" ? (Number(currentPlan.cleaningFeeAmount) || 0) * nights : (Number(currentPlan.cleaningFeeAmount) || 0))
    : 0
  const cleaningFee = cleaningFeePerFlat * flatsCount

  // Cálculo dinâmico da Taxa Pet
  const petFeePerUnit = siteConfig?.petPolicy?.feeAmount ?? 80
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

  // Preço Base / Cartão de Crédito
  const baseTotalAmount = subtotal - discountAmount + cleaningFee + petFee + twinFee + extraBedFee
  const cardTotalAmount = baseTotalAmount

  // Desconto Exclusivo PIX Instantâneo
  const pixDiscountPercent = siteConfig?.pricing?.pixDiscountPercent ?? 5
  const pixDiscountAmount = Math.round(baseTotalAmount * (pixDiscountPercent / 100))
  const pixTotalAmount = Math.max(0, baseTotalAmount - pixDiscountAmount)

  // Valor ativo conforme forma de pagamento escolhida
  const totalAmount = paymentMethod === "pix" ? pixTotalAmount : cardTotalAmount
  const currentTotalDiscount = paymentMethod === "pix" ? (discountAmount + pixDiscountAmount) : discountAmount

  // Política de cancelamento ativa baseada em antecedência
  const cancellationPolicy = calculateCancellationPolicy(new Date(), checkin, totalAmount)

  const handleStartBooking = (overridePlan?: "with_breakfast" | "room_only") => {
    if (overridePlan) setRatePlan(overridePlan)
    setCheckoutModalOpen(true)
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
          // Abre o checkout oficial do Mercado Pago para parcelamento seguro em até 12x
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

  // Hero Data com fallbacks
  const heroTitle = siteConfig?.hero?.title && !siteConfig.hero.title.includes("Macaé") 
    ? siteConfig.hero.title 
    : "Sua Estadia com Conforto & Estilo em Campos dos Goytacazes"
  const heroHighlight = siteConfig?.hero?.highlightText || "Conforto, Luz Natural e Sofisticação"
  const heroDesc = siteConfig?.hero?.description && !siteConfig.hero.description.includes("Cavaleiros") && !siteConfig.hero.description.includes("Macaé")
    ? siteConfig.hero.description 
    : "Flats decorados com estética contemporânea e arejada, ar-condicionado split em todos os ambientes, Wi-Fi nos flats e localização nobre no Edifício Soho Residence Service no Centro de Campos dos Goytacazes."
  const heroBg = siteConfig?.hero?.backgroundImage || "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1920&q=80"
  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") ? siteConfig.branding.brandName : "CorpFlats"
  const badgeTop = siteConfig?.branding?.badgeTop && !siteConfig.branding.badgeTop.includes("15% OFF")
    ? siteConfig.branding.badgeTop 
    : "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial"

  const amenitiesList = siteConfig?.amenities || [
    { icon: "Waves", title: "Piscina com Deck Panorâmico", description: "Área de lazer ensolarada no condomínio com vista privilegiada para relaxar.", badge: "Lazer" },
    { icon: "Wifi", title: "Rede Wi-Fi", description: "Conexão de internet sem fio disponível em todos os flats.", badge: "Gratuito" },
    { icon: "Wind", title: "Ar-Condicionado Climatizado", description: "Ambientes frescos e arejados com splits modernos e silenciosos.", badge: "Conforto" },
    { icon: "Car", title: "Garagem Coberta Privativa", description: "Vaga demarcada e portão eletrônico automático com segurança 24h.", badge: "Incluso" },
    { icon: "Utensils", title: "Cozinha Compacta Equipada", description: "Cooktop, micro-ondas, frigobar/geladeira, cafeteira e utensílios completos.", badge: "Praticidade" },
    { icon: "Coffee", title: "Café da Manhã Servido no Flat", description: "Pedido gourmet artesanal montado com frutas, pães e sucos selecionados.", badge: "Opcional" },
    { icon: "Tv", title: "Smart TV 55\" 4K", description: "Acesso a Netflix, YouTube, canais digitais e streaming para relaxar.", badge: "Entretenimento" },
    { icon: "Dumbbell", title: "Espaço Fitness", description: "Academia equipada no condomínio para manter seus treinos e saúde em dia.", badge: "Fitness" }
  ]

  const galleryList = siteConfig?.gallery || [
    { id: 1, title: "Suíte Master Arejada & Cama King", category: "Quartos", imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80" },
    { id: 2, title: "Living com Luz Natural e Decoração Clean", category: "Living", imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80" },
    { id: 3, title: "Varanda com Vista e Brisa Fresca", category: "Varanda", imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80" },
    { id: 4, title: "Cozinha Moderna Integrada", category: "Cozinha", imageUrl: "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=800&q=80" },
    { id: 5, title: "Banheiro Impecável com Ducha Relaxante", category: "Banheiro", imageUrl: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80" },
    { id: 6, title: "Deck com Piscina e Relaxamento", category: "Lazer", imageUrl: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80" }
  ]

  const testimonialsList = siteConfig?.testimonials || [
    { id: 1, name: "Mariana Silveira", city: "Rio de Janeiro, RJ", rating: 5, comment: "O flat é incrivelmente arejado, com iluminação natural maravilhosa e limpeza impecável. Dá uma paz enorme ao entrar. A localização em Campos dos Goytacazes no Soho é perfeita!", date: "Fevereiro de 2026", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80" },
    { id: 2, name: "Carlos Eduardo Mendes", city: "São Paulo, SP", rating: 5, comment: "Melhor experiência de hospedagem em Campos dos Goytacazes. Decoração moderna, internet super estável para trabalhar e cama de hotel 5 estrelas. Recomendo de olhos fechados.", date: "Janeiro de 2026", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80" },
    { id: 3, name: "Patrícia & Rodrigo", city: "Belo Horizonte, MG", rating: 5, comment: "O café da manhã servido no flat é um diferencial sensacional. Tudo quentinho e fresco. O atendimento pelo WhatsApp é ágil e educado.", date: "Fevereiro de 2026", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" }
  ]

  const faqList = siteConfig?.faq || [
    { q: "Qual a diferença entre a Tarifa com Café e a Tarifa sem Café?", a: "A Tarifa com Café da Manhã já embute na diária o seu pedido gourmet artesanal servido exclusivamente no seu flat no horário de sua escolha. A Tarifa sem Café contempla exclusivamente a hospedagem e a estrutura completa do flat." },
    { q: "Qual o horário de check-in e check-out?", a: "O check-in inicia a partir das 14:00 e o check-out é até as 12:00. Caso precise de early check-in ou late check-out, solicite diretamente pelo WhatsApp com nossa equipe." },
    { q: "Como funciona o estacionamento / garagem?", a: "Dispomos de vagas privativas cobertas no condomínio com portão eletrônico e monitoramento 24h, inclusas gratuitamente na sua diária em qualquer tarifa." },
    { q: "Como é servido o café da manhã?", a: "O café da manhã é servido sob pedido personalizado diretamente no seu flat, no horário de sua preferência entre 05:00 e 09:30." },
    { q: "Quais são as formas de pagamento aceitas?", a: "Aceitamos PIX Instantâneo com confirmação automática na hora e Cartão de Crédito com parcelamento facilitado." },
    { q: "O flat possui Wi-Fi veloz para trabalhar?", a: "Sim! Todos os nossos flats contam com fibra óptica dedicada de 500 Mega de alta estabilidade e bancada própria para notebook." }
  ]

  const renderAmenityIcon = (iconName: string) => {
    switch (iconName) {
      case "Wifi": return <Wifi className="w-5 h-5" />
      case "Wind": return <Wind className="w-5 h-5" />
      case "Waves": return <Waves className="w-5 h-5" />
      case "Coffee": return <Coffee className="w-5 h-5" />
      case "Car": return <Car className="w-5 h-5" />
      case "Utensils": return <Utensils className="w-5 h-5" />
      case "Tv": return <Tv className="w-5 h-5" />
      case "Dumbbell": return <Dumbbell className="w-5 h-5" />
      default: return <Sparkles className="w-5 h-5" />
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
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

          <div className="flex items-center gap-2">
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
      <div className="bg-slate-100/90 text-slate-500 border-b border-slate-200/50 text-[11px] sm:text-xs py-1.5 px-4 text-center tracking-normal font-medium flex items-center justify-center gap-1.5">
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
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/70 px-4 sm:px-8 py-2.5 sm:py-3 w-full max-w-full">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Logo CorpFlats */}
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 object-contain rounded-lg"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-sky-600 group-hover:bg-sky-700 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs transition-colors">
                CF
              </div>
            )}
            <div>
              <span
                contentEditable={isVisualEditMode}
                suppressContentEditableWarning={true}
                onBlur={(e) => updateNestedConfig("branding.brandName", e.currentTarget.innerText)}
                className={`font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-sky-600 transition-colors block leading-none ${
                  isVisualEditMode ? "outline-dashed outline-1 outline-sky-500 cursor-text rounded px-1" : ""
                }`}
              >
                {brandName}
              </span>
              <span
                contentEditable={isVisualEditMode}
                suppressContentEditableWarning={true}
                onBlur={(e) => updateNestedConfig("branding.logoSubtext", e.currentTarget.innerText)}
                className={`text-[9.5px] sm:text-[10px] text-slate-500 font-medium tracking-wide block mt-0.5 ${
                  isVisualEditMode ? "outline-dashed outline-1 outline-sky-500 cursor-text rounded px-1" : ""
                }`}
              >
                {siteConfig?.branding?.logoSubtext || "Soho Residence"}
              </span>
            </div>
          </div>

          {/* Links desktop discretos */}
          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <a href="#tarifas" className="hover:text-sky-600 transition-colors">Tarifas</a>
            <a href="#beneficios" className="hover:text-sky-600 transition-colors">Comodidades</a>
            <a href="#galeria" className="hover:text-sky-600 transition-colors">Fotos</a>
            <a href="#detalhes" className="hover:text-sky-600 transition-colors">O Flat</a>
            <a href="#localizacao" className="hover:text-sky-600 transition-colors">Localização</a>
            <a href="#faq" className="hover:text-sky-600 transition-colors">Dúvidas</a>
          </div>

          {/* Ações: Entrar discreto + Reservar destacado */}
          <div className="flex items-center gap-2 shrink-0">
            {guestAccount || guestName ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/minha-conta")}
                className="h-8 px-2.5 text-slate-700 font-medium text-xs hover:bg-slate-100 rounded-lg flex items-center gap-1.5 shrink-0"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="max-w-[90px] truncate">{guestAccount?.name?.split(" ")[0] || guestName?.split(" ")[0] || "Conta"}</span>
              </Button>
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
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs h-8 px-3.5 rounded-lg shadow-xs transition-all shrink-0"
            >
              Reservar
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Google One Tap Oficial (Nativo do Google) ── */}
      <div
        id="g_id_onload"
        data-client_id={siteConfig?.authConfig?.googleClientId || "231444843725-mndgdjij2nj29nd010oniqc8vu8vgqp2.apps.googleusercontent.com"}
        data-callback="handleGoogleOneTapGlobal"
        data-auto_prompt="true"
        data-auto_select="false"
        data-cancel_on_tap_outside="false"
        data-itp_support="true"
        data-use_fedcm_for_prompt="true"
      />

      {/* ── Hero Section (Protagonista Absoluta: A Imagem e a Experiência) ─ */}
      <header className="relative h-[360px] sm:h-[440px] lg:h-[480px] flex items-end justify-center px-4 sm:px-8 pb-12 sm:pb-16 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroBg}
            alt="CorpFlats Soho Residence"
            className="w-full h-full object-cover object-center"
          />
          {/* Overlay sutil apenas para contraste da tipografia */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-slate-950/10" />
        </div>

        {isVisualEditMode && (
          <div className="absolute top-4 right-4 z-20">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const newUrl = prompt("Insira a nova URL da foto do Hero:", heroBg)
                if (newUrl && newUrl.trim()) {
                  updateNestedConfig("hero.backgroundImage", newUrl.trim())
                }
              }}
              className="bg-black/60 hover:bg-black/80 text-white text-xs rounded-lg backdrop-blur-md border border-white/20 shadow-xs"
            >
              <ImageIcon className="w-3.5 h-3.5 mr-1" />
              Trocar Foto
            </Button>
          </div>
        )}

        <div className="relative z-10 max-w-xl mx-auto space-y-2 text-white">
          <h1
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.title", e.currentTarget.innerText)}
            className={`text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight drop-shadow-sm whitespace-pre-line ${
              isVisualEditMode ? "outline-dashed outline-1 outline-amber-400 cursor-text rounded p-1" : ""
            }`}
          >
            {siteConfig?.hero?.title && !siteConfig.hero.title.includes("Sua Estadia com Conforto") ? siteConfig.hero.title : "Conforto e estilo em\nCampos dos Goytacazes"}
          </h1>

          <p
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.highlightText", e.currentTarget.innerText)}
            className={`text-sm sm:text-base font-medium text-slate-200 tracking-wide drop-shadow-xs ${
              isVisualEditMode ? "outline-dashed outline-1 outline-amber-400 cursor-text rounded p-1" : ""
            }`}
          >
            {siteConfig?.hero?.highlightText && !siteConfig.hero.highlightText.includes("Luz Natural e Sofisticação") ? siteConfig.hero.highlightText : "Flats sofisticados no Soho Residence"}
          </p>
        </div>
      </header>

      {/* ── Primeira Tela: Card de Reserva Minimalista (Imagem -> Experiência -> Tarifa -> Reserva) ── */}
      <main id="reserva-rapida" className="max-w-md sm:max-w-lg w-full mx-auto px-4 -mt-8 sm:-mt-12 relative z-20">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 p-5 sm:p-7 space-y-4">
          {/* Seletor Compacto de Datas */}
          <div className="grid grid-cols-2 gap-2.5 pb-3.5 border-b border-slate-100">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-600" />
                <span>Entrada</span>
              </label>
              <Input 
                type="date" 
                value={checkin} 
                onChange={e => setCheckin(e.target.value)} 
                className="bg-slate-50/80 border-slate-200 text-xs text-slate-900 h-9 font-bold rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-600" />
                <span>Saída</span>
              </label>
              <Input 
                type="date" 
                value={checkout} 
                onChange={e => setCheckout(e.target.value)} 
                className="bg-slate-50/80 border-slate-200 text-xs text-slate-900 h-9 font-bold rounded-xl"
              />
            </div>
          </div>

          {/* Seletor de Tarifas */}
          <div id="tarifas" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Escolha sua tarifa
              </h2>
              <span className="text-[11px] text-slate-500 font-medium">
                {nights} {nights === 1 ? "noite" : "noites"}
              </span>
            </div>

            <div className="space-y-2">
              {/* Opção 1: COM CAFÉ */}
              <div
                onClick={() => setRatePlan("with_breakfast")}
                className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center justify-between ${
                  ratePlan === "with_breakfast"
                    ? "border-sky-600 bg-sky-50/50 text-slate-900 ring-2 ring-sky-600/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    ratePlan === "with_breakfast" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm text-slate-900">COM CAFÉ</span>
                      {ratePlan === "with_breakfast" && (
                        <span className="text-[9px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-md">Ativa</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">Café da manhã no flat</p>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <div className="font-extrabold text-sm sm:text-base text-slate-900">
                    R$ {withBreakfastConfig.dailyRate}
                  </div>
                  <span className="text-[10px] text-slate-400 block -mt-0.5">/ noite</span>
                </div>
              </div>

              {/* Opção 2: SEM CAFÉ */}
              <div
                onClick={() => setRatePlan("room_only")}
                className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center justify-between ${
                  ratePlan === "room_only"
                    ? "border-sky-600 bg-sky-50/50 text-slate-900 ring-2 ring-sky-600/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    ratePlan === "room_only" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm text-slate-900">SEM CAFÉ</span>
                      {ratePlan === "room_only" && (
                        <span className="text-[9px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-md">Ativa</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">Tarifa econômica</p>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <div className="font-extrabold text-sm sm:text-base text-slate-900">
                    R$ {roomOnlyConfig.dailyRate}
                  </div>
                  <span className="text-[10px] text-slate-400 block -mt-0.5">/ noite</span>
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Ação Principal (CTA) */}
          <div className="pt-2 space-y-2.5">
            <Button
              onClick={() => handleStartBooking()}
              disabled={availabilityData?.available === false}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm h-12 rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
            >
              <span>Reservar agora</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Confirmação imediata • Cancelamento gratuito</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Benefícios (Apresentados após a reserva, discretos & naturais) ── */}
      <section id="beneficios" className="max-w-md sm:max-w-lg mx-auto px-4 py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 text-slate-700">
          <div className="flex items-center gap-2.5">
            <Wifi className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Wi-Fi 500 MB</span>
          </div>
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Check-in digital</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Wind className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Ar-condicionado</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Car className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Garagem privativa</span>
          </div>
        </div>
      </section>

      {/* ── Galeria de Fotos dos Ambientes ───────────────────────────────── */}
      <section id="galeria" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            O Flat Soho Residence
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Apartamentos arejados, decorados com sofisticação, conforto e muita luz natural.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative h-64 sm:h-96 rounded-2xl overflow-hidden bg-slate-200 shadow-sm">
            <img
              src={galleryList[activePhotoIdx]?.imageUrl || galleryList[0]?.imageUrl}
              alt={galleryList[activePhotoIdx]?.title || "Flat CorpFlats"}
              className="w-full h-full object-cover transition-all duration-500"
            />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-semibold">
              <span className="bg-slate-900/75 backdrop-blur-md px-3 py-1 rounded-lg">
                {galleryList[activePhotoIdx]?.title || "Ambiente Arejado"}
              </span>
              <span className="bg-slate-900/75 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px]">
                {activePhotoIdx + 1} / {galleryList.length}
              </span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sm:grid sm:grid-cols-6">
            {galleryList.map((photo: any, idx: number) => (
              <button
                key={photo.id || idx}
                type="button"
                onClick={() => setActivePhotoIdx(idx)}
                className={`h-14 flex-1 min-w-[64px] sm:min-w-0 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                  activePhotoIdx === idx ? "border-sky-600 ring-2 ring-sky-600/20" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={photo.imageUrl} alt={photo.title} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Detalhes do Flat & Estrutura ─────────────────────────────────── */}
      <section id="detalhes" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Flats Sofisticados no Soho Residence
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xl">
            Flats sofisticados no Soho Residence, no coração de Campos dos Goytacazes. Projetados para unir o conforto de casa à praticidade de um hotel moderno.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/70 space-y-2">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-600"></span>
              Acomodação & Conforto
            </h4>
            <ul className="text-xs text-slate-600 space-y-1.5 font-normal">
              <li>• Cama Queen Casal com colchão ortopédico de alta densidade</li>
              <li>• Enxoval completo em percal e toalhas felpudas higienizadas</li>
              <li>• Ar-condicionado split silencioso com controle térmico</li>
              <li>• Armários planejados e espaço de apoio para malas</li>
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/70 space-y-2">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-600"></span>
              Praticidade & Home Office
            </h4>
            <ul className="text-xs text-slate-600 space-y-1.5 font-normal">
              <li>• Cozinha compacta com frigobar, micro-ondas, cooktop e cafeteira</li>
              <li>• Bancada dedicada de trabalho com tomadas acessíveis</li>
              <li>• Fibra óptica dedicada de 500 MB com alta estabilidade</li>
              <li>• Smart TV com canais digitais e aplicativos de streaming</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Comodidades do Condomínio ─────────────────────────────────────── */}
      <section id="comodidades" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Comodidades da Hospedagem
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Tudo o que você precisa para uma estadia impecável em Campos dos Goytacazes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {amenitiesList.map((amenity: any, idx: number) => (
            <div
              key={amenity.id || idx}
              className="p-4 rounded-2xl bg-white border border-slate-200/70 space-y-2 hover:border-slate-300 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                {renderAmenityIcon(amenity.icon)}
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-900">{amenity.title}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{amenity.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Localização Privilegiada ─────────────────────────────────────── */}
      <section id="localizacao" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-4">
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Localização Privilegiada
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Flats no Edifício Soho Residence Service, no coração de Campos dos Goytacazes.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="font-bold text-xs sm:text-sm text-slate-900">
                Edifício Soho Residence Service
              </p>
              <p className="text-xs text-slate-500">
                {siteConfig?.branding?.address || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ"}
              </p>
            </div>
          </div>

          <a
            href={siteConfig?.branding?.googleMapsUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-3.5 py-2 rounded-xl transition-colors shrink-0"
          >
            <span>Abrir no Google Maps</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      {/* ── Avaliações dos Hóspedes ───────────────────────────────────────── */}
      <section id="avaliacoes" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Experiências dos Hóspedes
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Avaliação média 4.9 ★ com conforto e excelência.
            </p>
          </div>
          <div className="flex items-center gap-1 text-amber-400">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-amber-400" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonialsList.map((t: any, idx: number) => (
            <div
              key={t.id || idx}
              className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/70 space-y-3 flex flex-col justify-between"
            >
              <p className="text-xs text-slate-600 leading-relaxed italic">
                "{t.comment}"
              </p>
              <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                <img
                  src={t.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"}
                  alt={t.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">{t.name}</span>
                  <span className="text-[10px] text-slate-400 block">{t.city}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Perguntas Frequentes (FAQ) ───────────────────────────────────── */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-8 py-10 border-t border-slate-200/60 space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Dúvidas Frequentes
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Respostas sobre sua reserva e estadia.
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
                  onClick={() => setFaqOpen(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-3 font-semibold text-xs sm:text-sm text-slate-900 hover:text-sky-600 transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180 text-sky-600" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed font-normal border-t border-slate-50">
                    {item.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Rodapé Clean ─────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200/80 py-10 px-4 sm:px-8 text-xs text-slate-600 mt-12 pb-24 sm:pb-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <div className="w-6 h-6 rounded-md bg-sky-600 text-white font-bold flex items-center justify-center text-[10px]">
                CF
              </div>
              <span className="font-bold text-sm text-slate-900">{brandName}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Edifício Soho Residence Service • Centro, Campos dos Goytacazes - RJ
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 font-semibold hover:underline flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp ({formatPhoneNumber(whatsappNumber)})</span>
            </a>
            <a
              href={`mailto:${siteConfig?.branding?.email || "reservas@corpflats.com.br"}`}
              className="text-slate-600 hover:text-sky-600"
            >
              {siteConfig?.branding?.email || "reservas@corpflats.com.br"}
            </a>
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-6 mt-6 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          © {new Date().getFullYear()} {brandName}. Todos os direitos reservados.
        </div>
      </footer>

      {/* ── Mobile Sticky Bottom CTA Bar ─────────────────────────────────── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-lg">
        <div>
          <span className="text-[10px] text-slate-500 font-medium block">
            {ratePlan === "with_breakfast" ? "Com café da manhã" : "Sem café da manhã"}
          </span>
          <div className="text-xs font-bold text-slate-900">
            R$ {ratePlan === "with_breakfast" ? withBreakfastConfig.dailyRate : roomOnlyConfig.dailyRate}
            <span className="text-[10px] font-normal text-slate-500"> / noite</span>
          </div>
        </div>

        <Button
          onClick={() => handleStartBooking()}
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
        >
          Reservar agora
        </Button>
      </div>

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
              <QrCode className="w-6 h-6 text-emerald-600" />
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
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3 rounded-xl shrink-0"
                  >
                    {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{pixCopied ? "Copiado!" : "Copiar"}</span>
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
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl"
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
              <CreditCard className="w-6 h-6 text-sky-600" />
              Pagamento com Cartão de Crédito
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Checkout Seguro do Mercado Pago (à vista ou parcelado com juros do cartão).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div className="p-4 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Código da Reserva:</span>
                <span className="font-mono font-black text-sky-950">{mpResData?.code || mpResData?.reservationCode || "CORPFLATS"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Hóspede:</span>
                <span className="font-bold text-slate-900">{guestName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Período:</span>
                <span className="font-bold text-slate-900">{nights} {nights === 1 ? 'noite' : 'noites'}</span>
              </div>
              <div className="border-t border-sky-200/80 pt-2 flex justify-between items-center">
                <span className="text-xs font-black text-slate-900">Total à Vista:</span>
                <span className="text-lg font-black text-sky-700">R$ {totalAmount.toLocaleString('pt-BR')}</span>
              </div>
            </div>

            {mpInitPoint && (
              <div className="space-y-3">
                <Button
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black text-sm h-12 rounded-2xl shadow-md gap-2 flex items-center justify-center"
                  onClick={() => window.open(mpInitPoint, "_blank")}
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Ir para Pagamento com Cartão</span>
                  <ExternalLink className="w-4 h-4 opacity-75" />
                </Button>
                
                <p className="text-[11px] text-center text-slate-500 font-medium">
                  🔒 Ambiente 100% criptografado e exclusivo para Cartão de Crédito. Se desejar parcelar, as opções e taxas são simuladas diretamente pela sua operadora.
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
          applyGuestData(user)
          setAuthModalOpen(false)
        }}
      />
    </div>
  )
}
