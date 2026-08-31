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
  Ban, MessageCircle, Clock, KeyRound, FileText, MapPin, Navigation, ExternalLink,
  Dumbbell, Waves, Flame, Award, Heart, HelpCircle, ChevronDown, PhoneCall, Shield, Home,
  Pencil, UserCheck, LogOut, User, Settings, Key, Briefcase, Lock, ChevronRight, Layers, Image as ImageIcon,
  CheckSquare, X, Fingerprint, Save
} from "lucide-react"
import { format, addDays, differenceInDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useLocation } from "wouter"
import { AddToCalendar } from "@/components/add-to-calendar"
import { AuthModal } from "@/components/auth-modal"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { initGoogleOneTap, loginWithGooglePopup, UserProfile } from "@/lib/auth-client"

export interface RoomConfig {
  id: number
  bedType: "queen" | "twin"
  adults: number
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
    : "Flats decorados com estética contemporânea e arejada, ar-condicionado split em todos os ambientes, Wi-Fi 500MB ultra rápido e localização nobre no Edifício Soho Residence Service no Centro de Campos dos Goytacazes."
  const heroBg = siteConfig?.hero?.backgroundImage || "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1920&q=80"
  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") ? siteConfig.branding.brandName : "CorpFlats"
  const badgeTop = siteConfig?.branding?.badgeTop && !siteConfig.branding.badgeTop.includes("15% OFF")
    ? siteConfig.branding.badgeTop 
    : "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial"

  const amenitiesList = siteConfig?.amenities || [
    { icon: "Waves", title: "Piscina com Deck Panorâmico", description: "Área de lazer ensolarada no condomínio com vista privilegiada para relaxar.", badge: "Lazer" },
    { icon: "Wifi", title: "Wi-Fi Fibra 500 Mega", description: "Conexão dedicada de alta estabilidade para home office e streaming em 4K.", badge: "Gratuito" },
    { icon: "Wind", title: "Ar-Condicionado Climatizado", description: "Ambientes frescos e arejados com splits modernos e silenciosos.", badge: "Conforto" },
    { icon: "Car", title: "Garagem Coberta Privativa", description: "Vaga demarcada e portão eletrônico automático com segurança 24h.", badge: "Incluso" },
    { icon: "Utensils", title: "Cozinha Compacta Equipada", description: "Cooktop, micro-ondas, frigobar/geladeira, cafeteira e utensílios completos.", badge: "Praticidade" },
    { icon: "Coffee", title: "Café da Manhã Servido no Flat", description: "Cestas gourmet artesanais montadas com frutas, pães e sucos selecionados.", badge: "Opcional" },
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
    { q: "Qual a diferença entre a Tarifa com Café e a Tarifa sem Café?", a: "A Tarifa com Café da Manhã já embute na diária a nossa cesta gourmet artesanal servida exclusivamente no seu flat no horário de sua escolha. A Tarifa sem Café contempla exclusivamente a hospedagem e a estrutura completa do flat." },
    { q: "Qual o horário de check-in e check-out?", a: "O check-in inicia a partir das 14:00 e o check-out é até as 12:00. Caso precise de early check-in ou late check-out, solicite diretamente pelo WhatsApp com nossa equipe." },
    { q: "Como funciona o estacionamento / garagem?", a: "Dispomos de vagas privativas cobertas no condomínio com portão eletrônico e monitoramento 24h, inclusas gratuitamente na sua diária em qualquer tarifa." },
    { q: "Como é servido o café da manhã?", a: "O café da manhã é servido em cesta gourmet personalizada diretamente no seu flat, no horário de sua preferência entre 06:30 e 09:30." },
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

      {/* ── Top Announcement Bar ────────────────────────────────────────── */}
      <div className="bg-sky-600 text-white text-[11px] font-bold py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-1.5 shadow-2xs">
        <span
          contentEditable={isVisualEditMode}
          suppressContentEditableWarning={true}
          onBlur={(e) => updateNestedConfig("branding.badgeTop", e.currentTarget.innerText)}
          className={isVisualEditMode ? "outline-dashed outline-1 outline-amber-300 hover:bg-white/20 cursor-text rounded px-1" : ""}
        >
          {siteConfig?.branding?.badgeTop || "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial"}
        </span>
      </div>

      {/* ── Top Navigation Bar (Clean & Arejado) ─────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-8 py-2.5 sm:py-3.5 shadow-2xs w-full max-w-full">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-600 group-hover:bg-sky-700 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm transition-colors">
                CF
              </div>
            )}
            <div>
              <span
                contentEditable={isVisualEditMode}
                suppressContentEditableWarning={true}
                onBlur={(e) => updateNestedConfig("branding.brandName", e.currentTarget.innerText)}
                className={`font-black text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-sky-600 transition-colors block leading-none ${
                  isVisualEditMode ? "outline-dashed outline-1 outline-sky-500 cursor-text rounded px-1" : ""
                }`}
              >
                {brandName}
              </span>
              <span
                contentEditable={isVisualEditMode}
                suppressContentEditableWarning={true}
                onBlur={(e) => updateNestedConfig("branding.logoSubtext", e.currentTarget.innerText)}
                className={`text-[9px] sm:text-[10px] text-sky-600 font-bold uppercase tracking-wider block mt-0.5 ${
                  isVisualEditMode ? "outline-dashed outline-1 outline-sky-500 cursor-text rounded px-1" : ""
                }`}
              >
                {siteConfig?.branding?.logoSubtext || "Campos dos Goytacazes"}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-6 text-xs font-bold text-slate-600">
            <a href="#flats" className="hover:text-sky-600 transition-colors">Nossos Flats</a>
            <a href="#tarifas" className="hover:text-sky-600 transition-colors">Planos & Tarifas</a>
            <a href="#comodidades" className="hover:text-sky-600 transition-colors">Comodidades</a>
            <a href="#galeria" className="hover:text-sky-600 transition-colors">Galeria</a>
            <a href="#avaliacoes" className="hover:text-sky-600 transition-colors">Avaliações</a>
            <a href="#faq" className="hover:text-sky-600 transition-colors">Dúvidas</a>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isVisualEditMode && (
              <Button
                type="button"
                size="sm"
                onClick={handleSaveVisualEdits}
                disabled={isSavingSite}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSavingSite ? "Salvando..." : "Salvar Edições"}</span>
              </Button>
            )}

            {guestAccount || guestName ? (
              <Button
                type="button"
                onClick={() => setLocation("/minha-conta")}
                className="h-8 sm:h-9 px-2.5 sm:px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1 sm:gap-1.5 shadow-2xs shrink-0"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="max-w-[80px] sm:max-w-[120px] truncate">{guestAccount?.name?.split(" ")[0] || guestName?.split(" ")[0] || "Conta"}</span>
                <ChevronRight className="w-3 h-3 text-slate-400 hidden xs:inline" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setAuthModalOpen(true)}
                className="h-8 sm:h-9 px-2.5 sm:px-3.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 sm:gap-1.5 shadow-2xs shrink-0"
              >
                <User className="w-3.5 h-3.5 text-sky-600" />
                <span>Entrar</span>
              </Button>
            )}

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp</span>
            </a>

            <Button
              onClick={() => {
                const el = document.getElementById("search-box")
                if (el) el.scrollIntoView({ behavior: "smooth" })
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-8 sm:h-9 px-3 sm:px-4 rounded-xl shadow-md shadow-sky-600/20 transition-all shrink-0 flex items-center gap-1"
            >
              <span className="hidden sm:inline">Ver Disponibilidade</span>
              <span className="sm:hidden">Reservar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Google One Tap Oficial (Nativo do Google) ── */}
      <div
        id="g_id_onload"
        data-client_id={siteConfig?.authConfig?.googleClientId || "415372338786-m41g9g4g0h6e5q745h5k1k9r4p0a9n.apps.googleusercontent.com"}
        data-callback="handleGoogleOneTapGlobal"
        data-auto_prompt="true"
        data-auto_select="false"
        data-cancel_on_tap_outside="false"
        data-itp_support="true"
      />

      {/* ── Hero Section (Luz Natural & Arejado) ─────────────────────────── */}
      <header className="relative min-h-[460px] sm:min-h-[520px] flex items-center justify-center px-4 sm:px-8 py-16 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroBg}
            alt="Flat Arejado"
            className="w-full h-full object-cover object-center scale-105 transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-slate-950/30 backdrop-blur-[0.5px]" />
        </div>

        {/* Botão de Troca de Imagem de Fundo no Modo Editor Visual */}
        {isVisualEditMode && (
          <div className="absolute top-4 right-4 z-20">
            <Button
              type="button"
              onClick={() => {
                const newUrl = prompt("Insira a nova URL da foto de fundo do Hero:", heroBg)
                if (newUrl && newUrl.trim()) {
                  updateNestedConfig("hero.backgroundImage", newUrl.trim())
                }
              }}
              className="bg-black/60 hover:bg-black/80 text-white font-bold text-xs rounded-xl backdrop-blur-md border border-white/20 shadow-md"
            >
              <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
              Trocar Foto de Fundo
            </Button>
          </div>
        )}

        <div className="relative z-10 max-w-3xl mx-auto space-y-4 text-white">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/30 text-xs font-bold shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-sky-300" />
            <span
              contentEditable={isVisualEditMode}
              suppressContentEditableWarning={true}
              onBlur={(e) => updateNestedConfig("branding.tagline", e.currentTarget.innerText)}
              className={isVisualEditMode ? "outline-dashed outline-1 outline-amber-300 hover:bg-white/20 cursor-text rounded px-1" : ""}
            >
              {siteConfig?.branding?.tagline || "Hospitalidade Premium & Decoração Contemporânea em Campos dos Goytacazes"}
            </span>
          </div>

          <h1
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.title", e.currentTarget.innerText)}
            className={`text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight drop-shadow-md ${
              isVisualEditMode ? "outline-dashed outline-2 outline-amber-400 hover:bg-white/10 cursor-text rounded-lg p-1" : ""
            }`}
          >
            {heroTitle}
          </h1>

          <p
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.highlightText", e.currentTarget.innerText)}
            className={`text-base sm:text-xl font-bold text-sky-200 max-w-xl mx-auto drop-shadow-sm ${
              isVisualEditMode ? "outline-dashed outline-2 outline-amber-400 hover:bg-white/10 cursor-text rounded-lg p-1" : ""
            }`}
          >
            {heroHighlight}
          </p>

          <p
            contentEditable={isVisualEditMode}
            suppressContentEditableWarning={true}
            onBlur={(e) => updateNestedConfig("hero.description", e.currentTarget.innerText)}
            className={`text-xs sm:text-sm text-slate-100/90 max-w-xl mx-auto font-medium leading-relaxed drop-shadow-xs ${
              isVisualEditMode ? "outline-dashed outline-2 outline-amber-400 hover:bg-white/10 cursor-text rounded-lg p-1" : ""
            }`}
          >
            {heroDesc}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-bold text-white">
            <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/25">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Sem taxas ocultas
            </span>
            <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/25">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Check-in 100% Digital
            </span>
            <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/25">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Wi-Fi 500MB & Garagem
            </span>
          </div>
        </div>
      </header>

      {/* ── Barra Flutuante de Busca com Seleção de Regime de Hospedagem ───── */}
      <div id="search-box" className="max-w-5xl w-full mx-auto px-4 -mt-10 z-20">
        <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-6 space-y-4">
          {/* Seletor de Regime de Hospedagem / Tarifa */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-800 block">
              Selecione a sua Tarifa de Hospedagem:
            </Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Opção 1: Tarifa com Café da Manhã Incluso */}
              <div
                onClick={() => setRatePlan("with_breakfast")}
                className={`cursor-pointer p-3.5 rounded-2xl border-2 transition-all flex items-start gap-3 relative ${
                  ratePlan === "with_breakfast"
                    ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  ratePlan === "with_breakfast" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  <Coffee className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-xs sm:text-sm text-slate-900 block">
                      {withBreakfastConfig.name || "Com Café da Manhã Incluso"}
                    </span>
                    {ratePlan === "with_breakfast" && (
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9px] px-1.5 py-0 shadow-2xs">
                        R$ {withBreakfastConfig.dailyRate}/noite
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug mt-0.5 font-medium">
                    {withBreakfastConfig.description || "Diária com Café da Manhã servido exclusivamente no flat"}
                  </p>
                </div>
              </div>

              {/* Opção 2: Tarifa Sem Café (Apenas Hospedagem) */}
              <div
                onClick={() => setRatePlan("room_only")}
                className={`cursor-pointer p-3.5 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                  ratePlan === "room_only"
                    ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  ratePlan === "room_only" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-xs sm:text-sm text-slate-900 block">
                      {roomOnlyConfig.name || "Apenas Hospedagem (Sem Café)"}
                    </span>
                    {ratePlan === "room_only" && (
                      <Badge className="bg-slate-800 text-white font-bold text-[9px] px-1.5 py-0 shadow-2xs">
                        R$ {roomOnlyConfig.dailyRate}/noite
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug mt-0.5 font-medium">
                    {roomOnlyConfig.description || "Tarifa econômica sem café da manhã"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Linha de Datas e Ação */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                Check-in (Entrada)
              </Label>
              <Input 
                type="date" 
                value={checkin} 
                onChange={e => setCheckin(e.target.value)} 
                className="bg-slate-50 border-slate-200 text-xs text-slate-900 h-10 font-bold rounded-xl"
              />
              <span className="text-[10px] text-slate-400 block font-medium">A partir das {settings?.checkinTime || "14:00"}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                Check-out (Saída)
              </Label>
              <Input 
                type="date" 
                value={checkout} 
                onChange={e => setCheckout(e.target.value)} 
                className="bg-slate-50 border-slate-200 text-xs text-slate-900 h-10 font-bold rounded-xl"
              />
              <span className="text-[10px] text-slate-400 block font-medium">{nights} {nights === 1 ? "diária" : "diárias"} (Até as {settings?.checkoutTime || "12:00"})</span>
            </div>

            <div>
              <Button 
                onClick={() => {
                  searchAvailability()
                  const el = document.getElementById("flats")
                  if (el) el.scrollIntoView({ behavior: "smooth" })
                }}
                className="w-full h-10 bg-sky-600 hover:bg-sky-700 text-white font-black text-xs rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Checar Disponibilidade</span>
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Apresentação Unificada da Acomodação Master com Seletor de Camas ──── */}
      <main id="flats" className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-16 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Padrão Único de Excelência & Alocação Inteligente</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Flat Studio Executivo Completo
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
            Todos os nossos flats possuem a mesma metragem, conforto e decoração de alto padrão. Sua reserva é alocada automaticamente em um apartamento perfeitamente higienizado e preparado.
          </p>
        </div>

        {/* Card Master da Acomodação */}
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Coluna Esquerda: Galeria de Fotos Interativa */}
          <div className="lg:col-span-7 p-6 sm:p-8 space-y-4 bg-slate-50/50 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="space-y-3">
              <div className="relative h-72 sm:h-96 rounded-2xl overflow-hidden bg-slate-200 shadow-inner group">
                <img
                  src={galleryList[activePhotoIdx]?.imageUrl || "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80"}
                  alt={galleryList[activePhotoIdx]?.title || "Flat CorpFlats"}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
                
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs font-bold">
                  <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl">
                    {galleryList[activePhotoIdx]?.title || "Ambiente Arejado & Confortável"}
                  </span>
                  <span className="bg-sky-600 px-2.5 py-1 rounded-xl">
                    Foto {activePhotoIdx + 1} de {galleryList.length}
                  </span>
                </div>
              </div>

              {/* Miniaturas Navegáveis */}
              <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 no-scrollbar">
                {galleryList.map((photo: any, idx: number) => (
                  <button
                    key={photo.id || idx}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    className={`min-w-[64px] sm:min-w-0 h-14 flex-1 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      activePhotoIdx === idx ? "border-sky-600 ring-2 ring-sky-500/30 scale-102" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={photo.imageUrl} alt={photo.title} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Destaques Rápidos da Acomodação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/80 text-xs text-slate-700">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/60 font-semibold flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Ar Split Silent</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/60 font-semibold flex items-center gap-2">
                <Wifi className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Wi-Fi 500MB</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/60 font-semibold flex items-center gap-2">
                <Car className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Garagem Coberta</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/60 font-semibold flex items-center gap-2">
                <Utensils className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Cozinha Equipada</span>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Configurador da Estadia (Camas, Tarifas e Reserva) */}
          <div className="lg:col-span-5 p-6 sm:p-8 space-y-6 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Status de Disponibilidade das Datas */}
              <div className="flex items-center justify-between">
                <Badge className={availabilityData?.available !== false ? "bg-emerald-100 text-emerald-800 border-emerald-200 font-bold" : "bg-rose-100 text-rose-800 border-rose-200 font-bold"}>
                  {availabilityData?.available !== false ? "🟢 Flats Disponíveis para suas Datas" : "🔴 Esgotado para as datas"}
                </Badge>
                <span className="text-xs font-bold text-slate-500">
                  {nights} {nights === 1 ? "diária" : "diárias"} • {rooms.length} {rooms.length === 1 ? "flat" : "flats"}
                </span>
              </div>

              {/* 1. SELETOR DE REGIME DE HOSPEDAGEM */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-800">
                  1. Regime de Hospedagem:
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRatePlan("with_breakfast")}
                    className={`p-2.5 rounded-2xl border-2 text-left transition-all ${
                      ratePlan === "with_breakfast"
                        ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                      <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">Com Café Incluso</span>
                    </div>
                    {ratePlan === "with_breakfast" ? (
                      <span className="text-[10px] text-amber-700 block mt-0.5 font-bold">R$ {withBreakfastConfig.dailyRate}/noite</span>
                    ) : (
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">Servido no flat</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRatePlan("room_only")}
                    className={`p-2.5 rounded-2xl border-2 text-left transition-all ${
                      ratePlan === "room_only"
                        ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <Building2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span className="truncate">Sem Café</span>
                    </div>
                    {ratePlan === "room_only" ? (
                      <span className="text-[10px] text-slate-900 block mt-0.5 font-bold">R$ {roomOnlyConfig.dailyRate}/noite</span>
                    ) : (
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">Tarifa econômica</span>
                    )}
                  </button>
                </div>
              </div>

              {/* 2. CONFIGURADOR DE FLATS, CAMAS E HÓSPEDES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800">
                    2. Flats & Configuração dos Quartos ({rooms.length}):
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRoom}
                    className="h-6 text-[11px] font-bold text-sky-600 hover:text-sky-700 border-sky-200 hover:bg-sky-50 rounded-lg px-2"
                  >
                    + Adicionar flat
                  </Button>
                </div>

                {/* Aviso de Corte de Horário após 12:00 */}
                {isCutoffActive && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium leading-tight">
                    ⏰ <strong>Horário de Corte (12:00):</strong> Para reservas com check-in hoje após as 12:00, os serviços de montagem de camas de solteiro e colchonete extra não estão disponíveis (apenas cama Queen para até 2 hóspedes por flat).
                  </div>
                )}

                <div className="space-y-2.5">
                  {rooms.map((room, idx) => (
                    <div key={room.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[9px] font-bold">
                            {idx + 1}
                          </span>
                          Flat #{idx + 1}
                        </span>
                        {rooms.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRoom(room.id)}
                            className="text-[10px] text-rose-600 hover:text-rose-700 font-bold hover:underline"
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Cama */}
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-600">Cama:</Label>
                          <select
                            value={room.bedType}
                            onChange={e => updateRoom(room.id, "bedType", e.target.value as any)}
                            className="w-full h-8 rounded-xl border border-slate-200 bg-white px-2 text-[11px] text-slate-900 font-bold focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                          >
                            <option value="queen">👑 Cama Queen Casal</option>
                            {!isCutoffActive && (
                              <option value="twin">🛏️ 2 Camas Solteiro (+R${siteConfig?.bedConfig?.twinFeeAmount || 30})</option>
                            )}
                          </select>
                        </div>

                        {/* Hóspedes */}
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-600">Hóspedes:</Label>
                          <select
                            value={room.adults}
                            onChange={e => updateRoom(room.id, "adults", Number(e.target.value))}
                            className="w-full h-8 rounded-xl border border-slate-200 bg-white px-2 text-[11px] text-slate-900 font-bold focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                          >
                            <option value="1">1 Hóspede</option>
                            <option value="2">2 Hóspedes (Ideal)</option>
                            {!isCutoffActive && (
                              <option value="3">3 Hósp. (Colchonete)</option>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Aviso Explicativo para 3 Hóspedes */}
                      {!isCutoffActive && room.adults === 3 && (
                        <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-[10px] font-medium leading-tight">
                          ℹ️ Flat #{idx + 1}: flats projetados para 2 pessoas. Para o 3º hóspede, montamos 1 colchonete extra com enxoval completo (+ R$ {siteConfig?.extraBedConfig?.feeAmount || 60}).
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumo Financeiro Consolidado */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Diárias ({nights}x • {rooms.length} {rooms.length === 1 ? "flat" : "flats"}):</span>
                  <span>R$ {subtotal}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-700 font-bold">
                  <span>Desconto Reserva Direta ({discountPercent}%):</span>
                  <span>- R$ {discountAmount}</span>
                </div>
                {twinFee > 0 && (
                  <div className="flex items-center justify-between text-slate-700 font-bold">
                    <span>Acréscimo 2 Camas Solteiro:</span>
                    <span>+ R$ {twinFee}</span>
                  </div>
                )}
                {extraBedFee > 0 && (
                  <div className="flex items-center justify-between text-slate-700 font-bold">
                    <span>Acréscimo Colchonete 3º Hóspede:</span>
                    <span>+ R$ {extraBedFee}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-black text-sm text-slate-900">
                  <span>Total da Estadia:</span>
                  <span className="text-sky-600 text-lg">R$ {totalAmount}</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => handleStartBooking()}
              disabled={availabilityData?.available === false}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black text-sm h-12 rounded-2xl shadow-lg shadow-sky-600/25 transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Sparkles className="w-4 h-4" />
              <span>Garantir Reserva ({rooms.length} {rooms.length === 1 ? "Flat" : "Flats"}) por R$ {totalAmount}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </main>

      {/* ── Seção de Comodidades (Grid Clean) ─────────────────────────────── */}
      <section id="comodidades" className="bg-white border-y border-slate-200/80 py-16 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-1.5">
            <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs font-bold">
              Estrutura & Conforto
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Tudo o que você precisa para uma estadia perfeita
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Ambientes preparados para seu descanso, lazer e trabalho com o mais alto padrão.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {amenitiesList.map((amenity: any, idx: number) => (
              <div
                key={amenity.id || idx}
                className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-sky-300 hover:bg-sky-50/30 transition-all duration-300 space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  {renderAmenityIcon(amenity.icon)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-sm text-slate-900">{amenity.title}</h4>
                    {amenity.badge && (
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-md">
                        {amenity.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    {amenity.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Galeria de Fotos dos Ambientes ───────────────────────────────── */}
      <section id="galeria" className="py-16 px-4 sm:px-8 max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-1.5">
          <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs font-bold">
            Tour Fotográfico
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Conheça nossos Ambientes Arejados
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Apartamentos decorados com sofisticação, amplitude e muita luz natural.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {galleryList.map((item: any, idx: number) => (
            <div
              key={item.id || idx}
              className="group relative h-64 rounded-3xl overflow-hidden shadow-xs border border-slate-200/80 bg-slate-100"
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent flex flex-col justify-end p-5 text-white space-y-1">
                <Badge className="bg-white/90 text-slate-900 font-bold text-[10px] w-fit">
                  {item.category || "Ambiente"}
                </Badge>
                <h4 className="font-bold text-sm drop-shadow-sm">{item.title}</h4>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Depoimentos de Hóspedes Reais ────────────────────────────────── */}
      <section id="avaliacoes" className="bg-slate-100/70 border-y border-slate-200/80 py-16 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-1.5">
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-bold flex items-center gap-1 w-fit mx-auto">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>Avaliação Média 4.9 ★</span>
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              O que dizem os nossos Hóspedes
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Depoimentos reais de quem já viveu a experiência CorpFlats.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonialsList.map((t: any, idx: number) => (
              <div
                key={t.id || idx}
                className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(t.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed italic">
                    "{t.comment}"
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                  <img
                    src={t.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"}
                    alt={t.name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">{t.name}</h5>
                    <span className="text-[11px] text-slate-500 block">{t.city} • {t.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Perguntas Frequentes (FAQ) ───────────────────────────────────── */}
      <section id="faq" className="py-16 px-4 sm:px-8 max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-1.5">
          <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs font-bold">
            Tire suas Dúvidas
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Perguntas Frequentes
          </h2>
        </div>

        <div className="space-y-3">
          {faqList.map((item: any, idx: number) => {
            const isOpen = faqOpen === idx
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
              >
                <button
                  onClick={() => setFaqOpen(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 font-bold text-xs sm:text-sm text-slate-900 hover:text-sky-600 transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180 text-sky-600" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-0 text-xs sm:text-sm text-slate-600 leading-relaxed font-medium border-t border-slate-50">
                    {item.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Rodapé Clean & Moderno ───────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200/80 py-12 px-4 sm:px-8 text-xs text-slate-600">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-600 text-white font-black flex items-center justify-center text-xs">
                CF
              </div>
              <span className="font-black text-base text-slate-900">{brandName}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {siteConfig?.branding?.tagline || "Hospitalidade contemporânea, flats arejados e conforto total."}
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Links Rápidos</h5>
            <ul className="space-y-1.5">
              <li><a href="#flats" className="hover:text-sky-600">Acomodações</a></li>
              <li><a href="#comodidades" className="hover:text-sky-600">Comodidades</a></li>
              <li><a href="#galeria" className="hover:text-sky-600">Galeria de Fotos</a></li>
              <li><a href="#avaliacoes" className="hover:text-sky-600">Avaliações</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Contato & Localização</h5>
            <p className="text-slate-600 font-medium">
              {siteConfig?.branding?.address || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ"}
            </p>
            <p className="text-slate-500">Edifício Soho Residence Service</p>
            <a 
              href={siteConfig?.branding?.googleMapsUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"} 
              target="_blank" 
              rel="noreferrer"
              className="text-sky-600 font-bold hover:underline inline-flex items-center gap-1"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Ver no Google Maps</span>
            </a>
            <p className="font-bold text-slate-800 pt-1">WhatsApp: {siteConfig?.branding?.whatsapp || "(22) 99712-4021"}</p>
            <p className="text-slate-500">E-mail: {siteConfig?.branding?.email || "reservas@corpflats.com.br"}</p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Segurança & Garantia</h5>
            <p className="text-slate-500 leading-relaxed">
              Reserva direta 100% segura com confirmação instantânea via PIX Banco Inter ou Cartão.
            </p>
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
              ✓ Pagamento Blindado
            </Badge>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-8 mt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400 text-[11px]">
          <p>© {new Date().getFullYear()} {brandName} • Campos dos Goytacazes - RJ. Todos os direitos reservados.</p>
          <p>Plataforma Desenvolvida com Tecnologia de Alta Performance.</p>
        </div>
      </footer>

      {/* ── Modal de Finalização de Reserva (Clean & Luminoso) ─────────────── */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent className="sm:max-w-xl max-w-[95vw] w-full bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-600" />
              Finalizar Reserva • {rooms.length} {rooms.length === 1 ? "Flat Studio" : "Flats Studios"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Revise os detalhes da sua estadia em Campos dos Goytacazes e preencha seus dados para confirmação imediata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 🧹 DESTAQUE ESPECIAL E CLARO DA TAXA DE LIMPEZA */}
            {cleaningFee > 0 ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-950 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🧹</span>
                  <div>
                    <span className="font-black text-xs block text-amber-950">Taxa de Limpeza & Higienização Completa</span>
                    <span className="text-[11px] text-amber-800 font-semibold">Cobrada 1x por estadia para entrega do flat 100% esterilizado</span>
                  </div>
                </div>
                <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-2.5 py-1 shrink-0">
                  + R$ {cleaningFee}
                </Badge>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-950 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">✨</span>
                  <div>
                    <span className="font-black text-xs block text-emerald-950">Taxa de Limpeza Isenta</span>
                    <span className="text-[11px] text-emerald-800 font-semibold">Inclusa gratuitamente na sua diária com Café da Manhã</span>
                  </div>
                </div>
                <Badge className="bg-emerald-600 text-white font-black text-xs px-2.5 py-1 shrink-0">
                  R$ 0,00 (Grátis)
                </Badge>
              </div>
            )}

            {/* Resumo da Estadia com Tarifa Embutida */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Período: {checkin} até {checkout}</span>
                <span className="text-sky-600">{nights} {nights === 1 ? "noite" : "noites"} • {rooms.length} {rooms.length === 1 ? "flat" : "flats"}</span>
              </div>

              {/* Detalhe do Plano de Tarifa Escolhido */}
              <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {ratePlan === "with_breakfast" ? (
                    <>
                      <Coffee className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-slate-800">Tarifa com Café da Manhã Incluso</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="w-4 h-4 text-slate-600" />
                      <span className="font-bold text-slate-800">Tarifa Econômica (Sem Café)</span>
                    </>
                  )}
                </div>
                <span className="font-bold text-slate-900">R$ {selectedDailyRate}/noite</span>
              </div>

              {/* Detalhamento dos Flats Configurados */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-700 block">Flats Selecionados:</span>
                {rooms.map((r, idx) => (
                  <div key={r.id} className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800">
                      Flat #{idx + 1}: {r.bedType === "twin" ? "2 Camas de Solteiro" : "1 Cama Queen Casal"}
                    </span>
                    <span className="text-slate-500 font-medium">
                      {r.adults} {r.adults === 1 ? "hóspede" : "hóspedes"} {r.adults === 3 ? "(com colchonete)" : ""}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-slate-600 pt-1">
                <span>Valor Total das Diárias ({nights}x • {rooms.length} {rooms.length === 1 ? "flat" : "flats"}):</span>
                <span>R$ {subtotal}</span>
              </div>

              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span>Desconto Reserva Direta ({discountPercent}%):</span>
                <span>- R$ {discountAmount}</span>
              </div>

              {cleaningFee > 0 ? (
                <div className="flex items-center justify-between text-slate-700 font-bold">
                  <span>Taxa de Limpeza ({currentPlan.cleaningFeeType === "per_night" ? "por noite" : "por estadia"}):</span>
                  <span>+ R$ {cleaningFee}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-emerald-700 font-semibold text-[11px]">
                  <span>Taxa de Limpeza:</span>
                  <span>✓ Isento (Incluso no plano)</span>
                </div>
              )}

              {twinFee > 0 && (
                <div className="flex items-center justify-between text-slate-700 font-bold">
                  <span>Acréscimo 2 Camas de Solteiro ({twinCount} {twinCount === 1 ? "flat" : "flats"}):</span>
                  <span>+ R$ {twinFee}</span>
                </div>
              )}

              {extraBedFee > 0 && (
                <div className="flex items-center justify-between text-slate-700 font-bold">
                  <span>Acréscimo Colchonete Extra ({extraBedCount} {extraBedCount === 1 ? "unidade" : "unidades"}):</span>
                  <span>+ R$ {extraBedFee}</span>
                </div>
              )}

              {/* Desconto Extra Exclusivo do PIX */}
              {paymentMethod === "pix" && pixDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-black text-xs bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>⚡ Desconto Especial PIX ({pixDiscountPercent}% OFF):</span>
                  </span>
                  <span>- R$ {pixDiscountAmount.toLocaleString('pt-BR')}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-base font-black text-slate-900">
                <span>Total a Pagar {paymentMethod === "pix" ? "(no PIX)" : "(no Cartão)"}:</span>
                <span className={paymentMethod === "pix" ? "text-emerald-600 text-xl font-black" : "text-sky-700 text-lg font-black"}>
                  R$ {totalAmount.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Política de Cancelamento Ativa */}
            <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
              cancellationPolicy.policyType === "flexivel" && cancellationPolicy.isEligibleForRefund
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : "bg-rose-50/70 border-rose-200 text-rose-950"
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Política de Cancelamento da Estadia
                </span>
                <Badge className={cancellationPolicy.policyType === "flexivel" ? "bg-emerald-600 text-white font-bold text-[10px]" : "bg-rose-600 text-white font-bold text-[10px]"}>
                  {cancellationPolicy.policyType === "flexivel" ? "✓ Cancelamento Flexível" : "🔒 Política Rigorosa"}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 font-medium">
                {cancellationPolicy.explanation}
              </p>
            </div>

            {/* Módulo Pet Friendly (Opcional) */}
            {siteConfig?.petPolicy?.enabled !== false && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500" />
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Vai viajar com animal de estimação?</h4>
                      <p className="text-[11px] text-slate-500">Taxa de higienização especial: R$ {siteConfig?.petPolicy?.feeAmount || 80}/pet</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={bringingPet ? "default" : "outline"}
                      onClick={() => setBringingPet(true)}
                      className="text-xs font-bold rounded-xl h-7 px-3"
                    >
                      Sim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!bringingPet ? "default" : "outline"}
                      onClick={() => { setBringingPet(false); setPetRulesAccepted(false); }}
                      className="text-xs font-bold rounded-xl h-7 px-3"
                    >
                      Não
                    </Button>
                  </div>
                </div>

                {bringingPet && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Quantidade de Pets:</span>
                      <div className="flex gap-2">
                        {[1, 2].map(n => (
                          <Button
                            key={n}
                            type="button"
                            size="sm"
                            variant={petCount === n ? "default" : "outline"}
                            onClick={() => setPetCount(n)}
                            className="text-xs font-bold rounded-xl h-7 w-8"
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Regulamento Pet com Proibição Expressa */}
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-[11px] text-slate-700 leading-relaxed space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Regras da Casa para Animais de Estimação:</span>
                      </div>
                      <div className="text-[11px] font-semibold text-rose-950 bg-rose-50/90 p-2 rounded-xl border border-rose-200">
                        🚫 É expressamente proibida a entrada de quaisquer outros animais, EXCETO <u>{siteConfig?.petPolicy?.allowedSpecies || "Cachorros (Cães)"}</u> de pequeno e médio porte (até 15kg).
                      </div>
                      <p className="whitespace-pre-line text-[10px] text-slate-600 font-medium">
                        {siteConfig?.petPolicy?.rules || "• Uso obrigatório de guia/coleira nas áreas sociais do condomínio.\n• Proibido deixar o animal sozinho no flat por longos períodos.\n• O hóspede tutor é responsável pela conservação e integridade do apartamento."}
                      </p>
                    </div>

                    {/* Checkbox de Aceite Obrigatório */}
                    <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={petRulesAccepted}
                        onChange={e => setPetRulesAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>Li e concordo com o regulamento de hospedagem e a taxa de higienização de animais de estimação.</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Dados do Hóspede com Atalho de Login */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Dados do Hóspede</h4>
                {guestAccount && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-[10px]">
                    ✓ Conectado como {guestAccount.name?.split(" ")[0]}
                  </Badge>
                )}
              </div>

              {/* Banner de Login para Clientes Cadastrados */}
              {!guestAccount && !guestName && (
                <div className="p-3 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 block leading-tight truncate">Já tem uma conta CorpFlats?</span>
                      <span className="text-[11px] text-slate-500 block truncate">Faça login para preencher seus dados instantaneamente.</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAuthModalOpen(true)}
                    className="h-8 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shrink-0 shadow-xs"
                  >
                    Fazer Login
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Nome Completo *</Label>
                  <Input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Seu nome..."
                    className="text-xs h-9 rounded-xl bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">WhatsApp / Celular *</Label>
                  <Input
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value)}
                    placeholder="(22) 99999-9999"
                    className="text-xs h-9 rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">E-mail *</Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="text-xs h-9 rounded-xl bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">CPF / Documento</Label>
                  <Input
                    value={guestDocument}
                    onChange={e => setGuestDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    className="text-xs h-9 rounded-xl bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {/* Forma de Pagamento */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Forma de Pagamento</h4>
                {paymentMethod !== "pix" && (
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 animate-pulse">
                    ⚡ Ganhe {pixDiscountPercent}% OFF no PIX
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opção 1: PIX Instantâneo com 5% de Desconto */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3 rounded-2xl border text-left relative transition-all ${
                    paymentMethod === "pix"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500 shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="absolute -top-2.5 right-3 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full shadow-xs uppercase tracking-wide">
                    ⚡ {pixDiscountPercent}% OFF no PIX
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-black text-xs block text-slate-900 leading-tight">PIX Instantâneo</span>
                      <span className="text-emerald-700 font-black text-sm block leading-tight">
                        R$ {pixTotalAmount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800 font-semibold mt-1.5 leading-tight">
                    Economia de R$ {pixDiscountAmount.toLocaleString('pt-BR')} • Confirmação na hora
                  </p>
                </button>

                {/* Opção 2: Cartão de Crédito */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    paymentMethod === "card"
                      ? "border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500 shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-black text-xs block text-slate-900 leading-tight">Cartão de Crédito</span>
                      <span className="text-slate-800 font-black text-sm block leading-tight">
                        R$ {cardTotalAmount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium mt-1.5 leading-tight">
                    À vista ou parcelado c/ juros
                  </p>
                </button>
              </div>

              {/* Callout de incentivo se Cartão estiver selecionado */}
              {paymentMethod === "card" && (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center justify-between gap-2 animate-in fade-in shadow-2xs">
                  <div className="flex items-center gap-2 text-xs text-emerald-950">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Pague no <strong>PIX</strong> por <strong>R$ {pixTotalAmount.toLocaleString('pt-BR')}</strong> (Economize <strong>R$ {pixDiscountAmount.toLocaleString('pt-BR')}</strong>)
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPaymentMethod("pix")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-7 px-3 rounded-xl shrink-0 shadow-2xs"
                  >
                    Mudar p/ PIX
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCheckoutModalOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmBooking}
              disabled={isProcessing}
              className={paymentMethod === "pix" 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 rounded-xl shadow-md shadow-emerald-600/20 gap-1.5"
                : "bg-sky-600 hover:bg-sky-700 text-white font-black text-xs px-6 rounded-xl shadow-md shadow-sky-600/20 gap-1.5"
              }
            >
              {isProcessing ? "Confirmando..." : (paymentMethod === "pix" ? `Pagar com PIX: R$ ${totalAmount.toLocaleString('pt-BR')}` : `Pagar com Cartão: R$ ${totalAmount.toLocaleString('pt-BR')}`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          if (!checkoutModalOpen) {
            setLocation("/minha-conta")
          }
        }}
      />
    </div>
  )
}
