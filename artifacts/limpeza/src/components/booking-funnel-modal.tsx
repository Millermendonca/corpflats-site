import { useState, useEffect, useRef, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, Coffee, Building2, Sparkles, User, ShieldCheck, Check, ArrowRight, ArrowLeft,
  QrCode, CreditCard, Copy, ExternalLink, Clock, Car, Heart, AlertTriangle, MessageCircle,
  Lock, CheckCircle2, Shield, Flame, Zap, HelpCircle, PhoneCall, RefreshCw
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AddToCalendar } from "@/components/add-to-calendar"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { RoomConfig } from "@/pages/booking-engine"
import { loginWithGooglePopup, updateAccountProfile, saveSessionLocally } from "@/lib/auth-client"
import { maskPhone, maskCpf } from "@/components/complete-profile-modal"

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const parts = dateStr.split("-").map(Number)
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
      const rawWeek = format(d, "EEE", { locale: ptBR })
      const cleanWeek = rawWeek.replace(".", "").trim()
      const capitalizedWeek = cleanWeek.charAt(0).toUpperCase() + cleanWeek.slice(1)
      const day = format(d, "dd")
      const rawMonth = format(d, "MMMM", { locale: ptBR })
      const capitalizedMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)
      return `${capitalizedWeek}, ${day} ${capitalizedMonth}`
    }
  } catch {}
  return dateStr
}

export interface BookingFunnelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkin: string
  checkout: string
  nights: number
  rooms: RoomConfig[]
  ratePlan: "with_breakfast" | "room_only"
  setRatePlan: (plan: "with_breakfast" | "room_only") => void
  updateRoom: (id: number, field: "bedType" | "adults", value: any) => void
  addRoom: () => void
  removeRoom: (id: number) => void
  siteConfig: any
  guestAccount: any
  onOpenAuthModal: () => void
  onSuccessBooking?: (reservation: any) => void
  availabilityData?: any
}

export function BookingFunnelModal({
  open,
  onOpenChange,
  checkin,
  checkout,
  nights,
  rooms,
  ratePlan,
  setRatePlan,
  updateRoom,
  addRoom,
  removeRoom,
  siteConfig,
  guestAccount,
  onOpenAuthModal,
  onSuccessBooking,
  availabilityData
}: BookingFunnelModalProps) {
  // Funnel Stepper (1 to 4: 1. Extras, 2. Seus Dados, 3. Pagamento, 4. Conclusão)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

  // Session ID única para telemetria e recuperação de carrinho
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const existing = sessionStorage.getItem("corpflats_funnel_session")
      if (existing) return existing
      const newId = `funnel_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      sessionStorage.setItem("corpflats_funnel_session", newId)
      return newId
    }
    return `funnel_${Date.now()}`
  })

  // Helper para carregar perfil em cache local
  const getCachedProfile = () => {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  // Guest Details com inicialização a partir de guestAccount ou cache local
  const [guestName, setGuestName] = useState(() => guestAccount?.name || getCachedProfile()?.name || "")
  const [guestPhone, setGuestPhone] = useState(() => maskPhone(guestAccount?.phone || getCachedProfile()?.phone || ""))
  const [guestEmail, setGuestEmail] = useState(() => guestAccount?.email || getCachedProfile()?.email || (typeof window !== "undefined" ? localStorage.getItem("corpflats_guest_email") || "" : ""))
  const [guestDocument, setGuestDocument] = useState(() => maskCpf(guestAccount?.document || getCachedProfile()?.document || ""))

  // PJ Corporate Billing
  const [isWorkTrip, setIsWorkTrip] = useState(false)
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")

  // Veículo
  const [hasVehicle, setHasVehicle] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")

  // Upsells & Extras
  const earlyCheckin = false // Early check-in nunca oferecido conforme regra de negócio
  const [lateCheckout, setLateCheckout] = useState(false)
  const [lateCheckoutTime, setLateCheckoutTime] = useState("18:00")
  const [bringingPet, setBringingPet] = useState(false)
  const [petCount, setPetCount] = useState(1)
  const [petRulesAccepted, setPetRulesAccepted] = useState(false)

  // Valida se o check-out ocorre no Domingo (0 = Domingo)
  const isSundayCheckout = useMemo(() => {
    if (!checkout) return false
    const parts = checkout.split("-").map(Number)
    if (parts.length !== 3) return false
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
    return d.getDay() === 0
  }, [checkout])

  // Se a data de checkout mudar para outro dia que não é domingo, desativa o late check-out
  useEffect(() => {
    if (!isSundayCheckout && lateCheckout) {
      setLateCheckout(false)
      setLateCheckoutTime("18:00")
    }
  }, [isSundayCheckout, lateCheckout])

  // Payment Selection
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState<any | null>(null)
  const [pixData, setPixData] = useState<any | null>(null)
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pixKeyCopied, setPixKeyCopied] = useState(false)
  const [isPixPaid, setIsPixPaid] = useState(false)

  // Polling para checar status do pagamento PIX automaticamente na etapa 4 (Concluído)
  useEffect(() => {
    if (currentStep !== 4 || paymentMethod !== "pix" || !confirmedReservation || isPixPaid) return;
    const resCode = confirmedReservation.code || confirmedReservation.reservationCode;
    if (!resCode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/reservations/${encodeURIComponent(resCode)}/payment-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.paid || data.paymentStatus === "pago_total" || data.paymentStatus === "pago") {
            setIsPixPaid(true);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [currentStep, paymentMethod, confirmedReservation, isPixPaid]);

  const handleResetAndNewBooking = () => {
    setCurrentStep(1);
    setConfirmedReservation(null);
    setPixData(null);
    setIsPixPaid(false);
    setMpInitPoint(null);
    setPixCopied(false);
    setPixKeyCopied(false);
  };

  const handleCloseModal = () => {
    onOpenChange(false);
    if (currentStep === 4) {
      setTimeout(() => {
        handleResetAndNewBooking();
      }, 300);
    }
  };

  // Se o modal for reaberto e estava na etapa 4 (concluída), reinicia na etapa 1 para uma nova reserva
  useEffect(() => {
    if (open && currentStep === 4 && isPixPaid) {
      handleResetAndNewBooking();
    }
  }, [open]);

  // Exit-Intent Modal
  const [showExitIntent, setShowExitIntent] = useState(false)
  const exitIntentTriggeredRef = useRef(false)

  // Auto-fill from guestAccount if logged in or when modal opens
  useEffect(() => {
    const acc = guestAccount || getCachedProfile()
    if (acc) {
      if (acc.name && (!guestName || guestName !== acc.name)) setGuestName(acc.name)
      if (acc.phone) setGuestPhone(maskPhone(acc.phone))
      if (acc.email && (!guestEmail || guestEmail !== acc.email)) setGuestEmail(acc.email)
      if (acc.document) setGuestDocument(maskCpf(acc.document))
      if (acc.vehicle?.plate) {
        setHasVehicle(true)
        setVehiclePlate(acc.vehicle.plate)
        setVehicleModel(acc.vehicle.model || "")
      }
      if (acc.companyData?.cnpj) {
        setIsWorkTrip(true)
        setCompanyCnpj(acc.companyData.cnpj)
        setCompanyName(acc.companyData.companyName || "")
      }
    }
  }, [guestAccount, open])

  // Login direto com o Google de dentro da etapa 3 do funil
  const handleGoogleLoginInFunnel = async () => {
    try {
      await loginWithGooglePopup((user) => {
        if (user.name) setGuestName(user.name)
        if (user.email) setGuestEmail(user.email)
        if (user.phone) setGuestPhone(maskPhone(user.phone))
        if (user.document) setGuestDocument(maskCpf(user.document))
        if (user.vehicle?.plate) {
          setHasVehicle(true)
          setVehiclePlate(user.vehicle.plate)
          setVehicleModel(user.vehicle.model || "")
        }
      })
    } catch {}
  }

  // Consulta e Estado de Disponibilidade Real
  const [internalAvailability, setInternalAvailability] = useState<any>(availabilityData || null)

  useEffect(() => {
    if (availabilityData) {
      setInternalAvailability(availabilityData)
    } else if (open && checkin && checkout) {
      fetch(`/api/reservations/availability?checkin=${checkin}&checkout=${checkout}`)
        .then(res => res.json())
        .then(data => setInternalAvailability(data))
        .catch(() => {})
    }
  }, [availabilityData, open, checkin, checkout])

  const activeAvailability = availabilityData || internalAvailability
  const minAvailable = typeof activeAvailability?.minAvailableOnAnyDate === "number"
    ? activeAvailability.minAvailableOnAnyDate
    : (typeof activeAvailability?.totalAvailableFlats === "number" ? activeAvailability.totalAvailableFlats : null)

  // Mostrar essa mensagem somente quando tiver 5 flats ou menos disponíveis para uma ou mais datas solicitadas
  const showUrgencyBanner = Boolean(
    activeAvailability?.hasLowAvailability ?? (minAvailable !== null ? minAvailable <= 5 : false)
  )

  // Pricing & Calculations
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
  const flatsCount = rooms.length
  const subtotal = selectedDailyRate * nights * flatsCount

  // Desconto Reserva Direta (15% OFF)
  const discountPercent = siteConfig?.pricing?.directDiscountPercent ?? 15
  const discountAmount = Math.round(subtotal * (discountPercent / 100))

  // Taxa de Limpeza
  const cleaningFeePerFlat = currentPlan.cleaningFeeEnabled
    ? (currentPlan.cleaningFeeType === "per_night" ? (Number(currentPlan.cleaningFeeAmount) || 0) * nights : (Number(currentPlan.cleaningFeeAmount) || 0))
    : 0
  const cleaningFee = cleaningFeePerFlat * flatsCount

  // Taxa de Camas Solteiro (Twin)
  const twinCount = rooms.filter(r => r.bedType === "twin").length
  const twinFeeUnit = siteConfig?.bedConfig?.twinFeeAmount ?? 30
  const twinFee = twinCount * (siteConfig?.bedConfig?.twinFeeType === "per_night" ? twinFeeUnit * nights : twinFeeUnit)

  // Taxa de Colchonete Extra
  const extraBedCount = rooms.filter(r => r.adults === 3).length
  const extraBedFeeUnit = siteConfig?.extraBedConfig?.feeAmount ?? 60
  const extraBedFee = extraBedCount * (siteConfig?.extraBedConfig?.feeType === "per_night" ? extraBedFeeUnit * nights : extraBedFeeUnit)

  // Taxa Pet
  const petFeePerUnit = siteConfig?.petPolicy?.feeAmount ?? 80
  const petFee = bringingPet 
    ? (siteConfig?.petPolicy?.feeType === "per_night" ? petFeePerUnit * nights * petCount : petFeePerUnit * petCount)
    : 0

  // Upsell Domingo: Late Check-out com Tarifação Dinâmica por Horário
  // Regras:
  // - Até 13:00: Cortesia / Não cobrar (R$ 0)
  // - Além de 13:00 até 18:00: R$ 50 por flat
  // - Além de 18:00: Cobrar 1 diária adicional em vigência (selectedDailyRate) por flat
  const lateCheckoutTier = useMemo(() => {
    if (!isSundayCheckout || !lateCheckout) {
      return { feePerFlat: 0, feeTotal: 0, isFree: false, isDailyRate: false }
    }
    const [hStr, mStr] = (lateCheckoutTime || "18:00").split(":")
    const hours = (parseInt(hStr, 10) || 0) + ((parseInt(mStr || "0", 10) || 0) / 60)

    if (hours <= 13.0) {
      return {
        feePerFlat: 0,
        feeTotal: 0,
        isFree: true,
        isDailyRate: false
      }
    } else if (hours <= 18.0) {
      return {
        feePerFlat: 50,
        feeTotal: 50 * flatsCount,
        isFree: false,
        isDailyRate: false
      }
    } else {
      return {
        feePerFlat: selectedDailyRate,
        feeTotal: selectedDailyRate * flatsCount,
        isFree: false,
        isDailyRate: true
      }
    }
  }, [isSundayCheckout, lateCheckout, lateCheckoutTime, selectedDailyRate, flatsCount])

  const earlyCheckinFee = 0
  const lateCheckoutFee = lateCheckoutTier.feeTotal

  // Valor Total Base (Sem desconto extra de PIX)
  const baseTotalAmount = (subtotal - discountAmount) + cleaningFee + twinFee + extraBedFee + petFee + earlyCheckinFee + lateCheckoutFee

  // Desconto Exclusivo PIX (5% OFF)
  const pixDiscountPercent = siteConfig?.pricing?.pixDiscountPercent ?? 5
  const pixDiscountAmount = Math.round(baseTotalAmount * (pixDiscountPercent / 100))
  const pixTotalAmount = Math.max(0, baseTotalAmount - pixDiscountAmount)

  // Valor Ativo
  const totalAmount = paymentMethod === "pix" ? pixTotalAmount : baseTotalAmount
  const currentTotalDiscount = paymentMethod === "pix" ? (discountAmount + pixDiscountAmount) : discountAmount

  // Política de Cancelamento
  const cancellationPolicy = calculateCancellationPolicy(new Date(), checkin, totalAmount)

  // Telemetria do Funil
  const sendFunnelTelemetry = async (stepNum: number, stepNameStr: string, customStatus?: string) => {
    try {
      await fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          step: stepNum,
          stepName: stepNameStr,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim(),
          guestEmail: guestEmail.trim(),
          guestDocument: guestDocument.trim(),
          checkinDate: checkin,
          checkoutDate: checkout,
          flatsCount,
          ratePlan,
          rooms,
          extras: {
            earlyCheckin: false,
            lateCheckout,
            lateCheckoutTime: lateCheckout ? lateCheckoutTime : null,
            earlyCheckinFee: 0,
            lateCheckoutFee,
            hasPet: bringingPet,
            petCount,
            twinCount,
            extraBedCount
          },
          paymentMethod,
          totalAmount,
          subtotal,
          discountAmount: currentTotalDiscount,
          status: customStatus || (stepNum === 5 ? "concluido" : (stepNum >= 3 ? "em_andamento" : "pesquisando"))
        })
      })
    } catch {
      // Ignora falhas silenciosas de telemetria
    }
  }

  // Dispara telemetria ao abrir ou avançar etapas (mantendo compatibilidade com métricas analíticas)
  useEffect(() => {
    if (open) {
      const telemetryMap: Record<number, { num: number; name: string }> = {
        1: { num: 2, name: "personalizacao_extras" },
        2: { num: 3, name: "identificacao_lead" },
        3: { num: 4, name: "checkout_pagamento" },
        4: { num: 5, name: "reserva_confirmada" }
      }
      const item = telemetryMap[currentStep] || { num: 2, name: "personalizacao_extras" }
      sendFunnelTelemetry(item.num, item.name)
    }
  }, [open, currentStep])

  // Exit-Intent Listener (apenas se já estiver em etapa de extras, dados ou checkout)
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (open && currentStep >= 1 && currentStep <= 3 && !exitIntentTriggeredRef.current && e.clientY <= 10) {
        exitIntentTriggeredRef.current = true
        setShowExitIntent(true)
      }
    }
    window.addEventListener("mouseleave", handleMouseLeave)
    return () => window.removeEventListener("mouseleave", handleMouseLeave)
  }, [open, currentStep])

  // Avançar Etapa com Validações
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (bringingPet && !petRulesAccepted) {
        alert("Por favor, aceite as regras para animais de estimação para prosseguir.")
        return
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      if (!guestName.trim()) {
        alert("Por favor, informe seu nome completo.")
        return
      }
      if (!guestPhone.trim() || guestPhone.replace(/\D/g, "").length < 10) {
        alert("Por favor, informe um WhatsApp válido com DDD.")
        return
      }
      if (!guestEmail.trim() || !guestEmail.includes("@")) {
        alert("Por favor, informe um e-mail válido para envio do voucher.")
        return
      }

      // Sincroniza dados com a conta no servidor para nunca mais pedir novamente
      if (guestPhone.replace(/\D/g, "").length >= 10 || guestDocument.replace(/\D/g, "").length >= 5) {
        updateAccountProfile({
          name: guestName.trim(),
          phone: guestPhone.trim(),
          document: guestDocument.trim(),
          vehicle: hasVehicle && vehiclePlate ? { plate: vehiclePlate.toUpperCase().trim(), model: vehicleModel.trim() } : null,
          companyData: isWorkTrip && companyCnpj ? { cnpj: companyCnpj.trim(), companyName: companyName.trim() } : null
        }).then(res => {
          if (res?.success && res.user) {
            saveSessionLocally(res.user)
          }
        }).catch(() => {})
      }

      // Registra o lead imediatamente no backend como carrinho ativo
      sendFunnelTelemetry(3, "identificacao_lead", "em_andamento")
      setCurrentStep(3)
    }
  }

  // Finalizar Reserva no Passo 4
  const handleConfirmReservation = async () => {
    setIsProcessing(true)
    try {
      const payload = {
        sessionId,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        guestDocument: guestDocument.trim(),
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
        earlyCheckin: false,
        lateCheckout,
        lateCheckoutTime: lateCheckout ? lateCheckoutTime : null,
        earlyCheckinFee: 0,
        lateCheckoutFee,
        hasPet: bringingPet,
        petCount: bringingPet ? petCount : 0,
        petFee,
        paymentMethod,
        totalAmount,
        baseTotalAmount,
        pixDiscountPercent,
        pixDiscountAmount: paymentMethod === "pix" ? pixDiscountAmount : 0,
        discountAmount: currentTotalDiscount,
        isWorkTrip,
        companyData: isWorkTrip ? { cnpj: companyCnpj, companyName, companyEmail, companyPhone } : null,
        vehicle: hasVehicle ? { plate: vehiclePlate, model: vehicleModel } : null
      }

      const res = await fetch("/api/reservations/direct-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (res.ok && data.reservation) {
        setConfirmedReservation(data.reservation)
        if (paymentMethod === "pix" && data.pixData) {
          setPixData(data.pixData)
        }
        if (data.initPoint) {
          setMpInitPoint(data.initPoint)
        }
        sendFunnelTelemetry(5, "reserva_confirmada", "concluido")
        setCurrentStep(4)
        if (onSuccessBooking) onSuccessBooking(data.reservation)
      } else {
        alert(data.error || "Erro ao processar sua reserva.")
      }
    } catch {
      alert("Erro ao conectar ao servidor. Tente novamente.")
    } finally {
      setIsProcessing(false)
    }
  }

  const whatsappNumber = siteConfig?.branding?.whatsapp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    `Olá! Estou concluindo minha reserva no site da CorpFlats para os dias ${checkin} a ${checkout} e gostaria de tirar uma dúvida.`
  )}`

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleCloseModal();
      else onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-2xl max-w-[96vw] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-xl text-white flex items-center justify-center font-black text-xs shadow-xs ${
                currentStep === 4 && paymentMethod === "pix" && !isPixPaid ? "bg-amber-600" : "bg-sky-600"
              }`}>
                CF
              </span>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                  {currentStep === 4 
                    ? (paymentMethod === "pix" && !isPixPaid ? "⏳ Aguardando Pagamento PIX" : "🎉 Reserva Confirmada!") 
                    : "Motor de Reservas Diretas"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {currentStep === 4 
                    ? (paymentMethod === "pix" && !isPixPaid 
                        ? "Efetue o pagamento PIX para garantir sua vaga e emitir seu voucher." 
                        : "Sua estadia nos flats CorpFlats está 100% garantida.") 
                    : "Melhor tarifa garantida sem taxas de intermediação de OTAs."}
                </DialogDescription>
              </div>
            </div>

            {currentStep < 4 && (
              <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-[11px] font-bold">
                Etapa {currentStep} de 3
              </Badge>
            )}
          </div>

          {/* ── Stepper Visual do Funil de Conversão ───────────────────────── */}
          {currentStep < 4 && (
            <div className="pt-3">
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[
                  { step: 1, label: "1. Extras & Camas", icon: Sparkles },
                  { step: 2, label: "2. Seus Dados", icon: User },
                  { step: 3, label: "3. Pagamento", icon: ShieldCheck }
                ].map((s) => (
                  <div key={s.step} className="space-y-1">
                    <div className={`h-1.5 rounded-full transition-all duration-300 ${
                      currentStep === s.step 
                        ? "bg-sky-600" 
                        : currentStep > s.step 
                        ? "bg-emerald-500" 
                        : "bg-slate-200 dark:bg-slate-800"
                    }`} />
                    <span className={`text-[10px] font-bold block truncate ${
                      currentStep === s.step 
                        ? "text-sky-600" 
                        : currentStep > s.step 
                        ? "text-emerald-600" 
                        : "text-slate-400"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* ── ETAPA 1: PERSONALIZAÇÃO & EXTRAS ────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Urgência & Prova Social (Apenas quando restar 5 flats ou menos para uma ou mais datas solicitadas) */}
            {showUrgencyBanner && (
              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-semibold">
                  <Flame className="w-4 h-4 text-orange-500 animate-pulse shrink-0" />
                  <span>
                    Alta procura para essas datas! {minAvailable === 1 ? "Resta apenas 1 unidade" : "Restam poucas unidades"} no Soho Residence.
                  </span>
                </div>
                <Badge className="bg-orange-500 text-white font-black text-[10px] shrink-0">
                  {discountPercent}% OFF
                </Badge>
              </div>
            )}

            {/* ── Card Resumo da Hospedagem: Datas & Tarifa (Design Organizado e Harmonioso) ── */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 sm:p-4 space-y-3 shadow-2xs">
              {/* Linha de Título com Duração */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                  <span>Resumo da Hospedagem</span>
                </span>
                <Badge variant="secondary" className="bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-bold text-[11px] px-2.5 py-0.5 rounded-lg">
                  {nights} {nights === 1 ? "diária" : "diárias"}
                </Badge>
              </div>

              {/* Grid Check-in e Check-out com Formatação Clara */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Card Check-in */}
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Check-in
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">
                      {formatDisplayDate(checkin)}
                    </span>
                  </div>
                </div>

                {/* Card Check-out */}
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Check-out
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">
                      {formatDisplayDate(checkout)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Tarifa Ativa + Ação de Troca */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                    ratePlan === "with_breakfast"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}>
                    {ratePlan === "with_breakfast" ? <Coffee className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Tarifa Selecionada
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {ratePlan === "with_breakfast" ? "Com Café da Manhã" : "Sem Café (Econômica)"}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        • R$ {selectedDailyRate}/noite
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRatePlan(ratePlan === "with_breakfast" ? "room_only" : "with_breakfast")}
                  className="h-8 px-3 text-xs font-bold rounded-xl border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/50 shrink-0 self-start sm:self-auto gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                  <span>Trocar para {ratePlan === "with_breakfast" ? "Sem Café" : "Com Café"}</span>
                </Button>
              </div>
            </div>

            {/* Configuração de Camas & Lotação por Flat */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Configuração dos Flats ({rooms.length}):
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRoom}
                  className="text-[11px] font-bold h-6 px-2 rounded-lg text-sky-600 border-sky-300"
                >
                  + Adicionar Flat
                </Button>
              </div>

              <div className="space-y-2">
                {rooms.map((r, idx) => (
                  <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-900 dark:text-slate-100">Flat Studio #{idx + 1}</span>
                      {rooms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRoom(r.id)}
                          className="text-rose-600 hover:underline text-[10px]"
                        >
                          Remover
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-bold">Configuração de Cama:</Label>
                        <select
                          value={r.bedType}
                          onChange={e => updateRoom(r.id, "bedType", e.target.value as any)}
                          className="w-full h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                        >
                          <option value="queen">👑 1 Cama Queen Casal</option>
                          <option value="twin">🛏️ 2 Camas Solteiro (+R$ {twinFeeUnit})</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-bold">Hóspedes:</Label>
                        <select
                          value={r.adults}
                          onChange={e => updateRoom(r.id, "adults", Number(e.target.value))}
                          className="w-full h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                        >
                          <option value="1">1 Hóspede</option>
                          <option value="2">2 Hóspedes (Ideal)</option>
                          <option value="3">3 Hósp. (Colchonete +R$ {extraBedFeeUnit})</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Up-sell Exclusivo de Domingo: Late Check-out com Tarifação Inteligente */}
            {isSundayCheckout && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Adicional Exclusivo para sua Estadia:</span>
                </Label>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* Late Check-out Especial no Domingo */}
                  <div
                    onClick={() => {
                      if (!lateCheckout) {
                        setLateCheckout(true)
                      }
                    }}
                    className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                      lateCheckout
                        ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={lateCheckout}
                        onChange={(e) => {
                          e.stopPropagation()
                          setLateCheckout(!lateCheckout)
                        }}
                        className="mt-1 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className="font-bold text-xs flex items-center gap-1 text-slate-900 dark:text-slate-100">
                            <span>🕒 Late Check-out no Domingo</span>
                          </span>
                          <Badge className="bg-amber-600 text-white text-[10px] px-2 py-0.5">
                            {lateCheckout
                              ? (lateCheckoutTier.isFree
                                  ? "Cortesia (R$ 0)"
                                  : (lateCheckoutTier.isDailyRate
                                      ? `+ R$ ${lateCheckoutFee} (1 diária)`
                                      : `+ R$ ${lateCheckoutFee}`))
                              : "+ R$ 50"
                            }
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          {lateCheckout
                            ? "Aproveite seu domingo sem pressa. Escolha abaixo o horário que deseja desocupar o flat:"
                            : "Estenda sua saída no domingo além das 12h e aproveite o dia sem pressa."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Sub-painel com horário pretendido de saída revelado ao selecionar */}
                    {lateCheckout && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pt-2 border-t border-amber-200/70 dark:border-amber-900/50 space-y-2.5 animate-in fade-in-50 duration-200"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <Label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            Preencha até que horas deseja sair:
                          </Label>

                          <div className="flex items-center gap-2">
                            <select
                              value={lateCheckoutTime}
                              onChange={(e) => setLateCheckoutTime(e.target.value)}
                              className="h-8 text-xs font-semibold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl px-2.5 py-0 text-slate-800 dark:text-slate-100 shadow-xs focus:ring-1 focus:ring-amber-500 outline-none"
                            >
                              <optgroup label="Cortesia CorpFlats (Gratuito)">
                                <option value="12:30">Até 12:30 — Cortesia (R$ 0)</option>
                                <option value="13:00">Até 13:00 — Cortesia (R$ 0)</option>
                              </optgroup>
                              <optgroup label="Saída até 18:00 (R$ 50 por flat)">
                                <option value="14:00">Até 14:00 — + R$ 50</option>
                                <option value="15:00">Até 15:00 — + R$ 50</option>
                                <option value="16:00">Até 16:00 — + R$ 50</option>
                                <option value="17:00">Até 17:00 — + R$ 50</option>
                                <option value="18:00">Até 18:00 — + R$ 50 (Recomendado)</option>
                              </optgroup>
                              <optgroup label="Após 18:00 (+ 1 diária)">
                                <option value="19:00">Até 19:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="20:00">Até 20:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="21:00">Até 21:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="22:00">Até 22:00 — +1 diária (R$ {selectedDailyRate})</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {/* Detalhe da condição com feedback claro */}
                        <div className={`p-2 rounded-xl text-[11px] leading-relaxed flex items-center gap-2 ${
                          lateCheckoutTier.isFree
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                            : lateCheckoutTier.isDailyRate
                              ? "bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800"
                              : "bg-amber-100/60 text-amber-900 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800"
                        }`}>
                          <span className="shrink-0 font-bold">
                            {lateCheckoutTier.isFree ? "✓" : (lateCheckoutTier.isDailyRate ? "ℹ️" : "✨")}
                          </span>
                          <span>
                            {lateCheckoutTier.isFree && (
                              <>
                                <strong>Cortesia CorpFlats:</strong> Saída até as 13:00 concedida sem custo adicional (R$ 0).
                              </>
                            )}
                            {!lateCheckoutTier.isFree && !lateCheckoutTier.isDailyRate && (
                              <>
                                <strong>Saída Estendida de Domingo:</strong> Até as {lateCheckoutTime} por R$ 50{flatsCount > 1 ? ` por flat (R$ ${lateCheckoutFee})` : ""}.
                              </>
                            )}
                            {lateCheckoutTier.isDailyRate && (
                              <>
                                <strong>Saída Após as 18h:</strong> Cobrança de 1 diária adicional em vigência (R$ {selectedDailyRate}{flatsCount > 1 ? ` x ${flatsCount} flats = R$ ${lateCheckoutFee}` : ""}).
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Módulo Pet Friendly */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Vai viajar com animal de estimação?</span>
                    <span className="text-[10px] text-slate-500">Taxa de higienização: R$ {petFeePerUnit}/pet ({siteConfig?.petPolicy?.feeType === "per_night" ? "por diária" : "taxa única por estadia"})</span>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={bringingPet ? "default" : "outline"}
                    onClick={() => setBringingPet(true)}
                    className="h-7 text-xs font-bold rounded-xl px-3"
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!bringingPet ? "default" : "outline"}
                    onClick={() => { setBringingPet(false); setPetRulesAccepted(false); }}
                    className="h-7 text-xs font-bold rounded-xl px-3"
                  >
                    Não
                  </Button>
                </div>
              </div>

              {bringingPet && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-700 dark:text-slate-200 font-bold block">
                        Quantidade de Cães (Pequeno Porte):
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {siteConfig?.petPolicy?.allowedSpecies || "Cachorros (Cães) de pequeno porte (até 10kg)"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2].map(n => (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={petCount === n ? "default" : "outline"}
                          onClick={() => setPetCount(n)}
                          className="h-6 w-7 text-xs font-bold rounded-lg"
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Regulamento Detalhado e Completo */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed shadow-2xs">
                    <div className="font-bold flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-100">
                      <span>🐾 Regulamento Oficial de Hospedagem Pet (Edifício Soho)</span>
                    </div>
                    <div className="whitespace-pre-line text-[10.5px] leading-relaxed text-amber-900/90 dark:text-amber-200/90 max-h-48 overflow-y-auto pr-1">
                      {siteConfig?.petPolicy?.rules || `• Permissão: Permitida a hospedagem exclusivamente de cães de pequeno porte (até 10 kg e altura de cernelha de até 35–40 cm). Outros animais não são autorizados.
• Circulação no Prédio: Nas áreas comuns do condomínio, o pet deve ser transportado obrigatoriamente no colo ou dentro de caixa/bolsa de transporte (ou com guia curta).
• Uso de Elevadores: É obrigatório utilizar exclusivamente o elevador de serviço ao transitar com animais.
• Convivência e Sossego: É proibido deixar o animal desacompanhado/sozinho no flat por longos períodos. O tutor deve zelar para evitar latidos ou ruídos excessivos.
• Higiene e Cuidados: Proibido dar banho no animal utilizando toalhas ou enxoval do flat, bem como permitir que o pet suba em camas e sofás sem proteção própria.
• Responsabilidade e Avarias: O titular da reserva responde integralmente por quaisquer danos a móveis, colchões, enxoval de cama/banho, odores ou sujeiras causadas pelo pet, arcando com os custos de reposição ou higienização extraordinária.`}
                    </div>
                    <div className="pt-2 border-t border-amber-200/70 dark:border-amber-900/50 flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-300">
                      <span>Taxa de Higienização Pet:</span>
                      <span>+ R$ {petFee} ({flatsCount > 1 ? `${petCount} pet(s) • R$ ${petFeePerUnit} unit.` : `${petCount} pet(s)`})</span>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={petRulesAccepted}
                      onChange={e => setPetRulesAccepted(e.target.checked)}
                      className="rounded text-sky-600 mt-0.5"
                    />
                    <span>
                      Li e concordo integralmente com as regras de convivência pet, transporte no colo nas áreas comuns, elevador de serviço e a taxa de higienização.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                className="text-xs font-bold rounded-xl h-10 px-4"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Voltar ao site
              </Button>

              <Button
                onClick={handleNextStep}
                className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-10 px-6 rounded-xl shadow-md gap-1.5"
              >
                <span>Avançar para Seus Dados</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 2: IDENTIFICAÇÃO & CAPTURA DE LEAD ────────────────────── */}
        {currentStep === 2 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Identificação / Login */}
            {guestAccount || guestEmail ? (
              <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Conectado como {guestAccount?.name || guestName || "Hóspede"}</span>
                      <Badge className="bg-emerald-600 text-white text-[9px] py-0 px-1.5 font-bold">
                        ✓ Verificado
                      </Badge>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {guestAccount?.email || guestEmail} — Seus dados foram preenchidos automaticamente.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Preenchimento Rápido</span>
                    <span className="text-[11px] text-slate-500">Conecte sua conta para preencher tudo em 1 clique.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleGoogleLoginInFunnel}
                    className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs h-7 px-2.5 rounded-xl border-slate-300 shadow-xs flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
                    </svg>
                    <span>Google</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onOpenAuthModal}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-7 px-3 rounded-xl shrink-0"
                  >
                    Entrar
                  </Button>
                </div>
              </div>
            )}

            {/* Formulário Principal de Contato */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome Completo *
                </Label>
                <Input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo Silveira"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  WhatsApp / Celular com DDD *
                </Label>
                <Input
                  value={guestPhone}
                  onChange={e => setGuestPhone(maskPhone(e.target.value))}
                  placeholder="(22) 99999-9999"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  E-mail para Envio do Voucher *
                </Label>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  CPF ou Passaporte *
                </Label>
                <Input
                  value={guestDocument}
                  onChange={e => setGuestDocument(maskCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            {/* Veículo & Portaria */}
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-sky-600" />
                  <span>Vai utilizar a Garagem Coberta? (Inclusa Grátis)</span>
                </span>
                <input
                  type="checkbox"
                  checked={hasVehicle}
                  onChange={e => setHasVehicle(e.target.checked)}
                  className="rounded text-sky-600"
                />
              </div>

              {hasVehicle && (
                <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                  <Input
                    value={vehiclePlate}
                    onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="Placa do Carro"
                    className="text-xs h-8 rounded-xl uppercase font-mono"
                  />
                  <Input
                    value={vehicleModel}
                    onChange={e => setVehicleModel(e.target.value)}
                    placeholder="Modelo (Ex: Corolla)"
                    className="text-xs h-8 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Viagem a Trabalho / Faturamento PJ */}
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Viagem Corporativa / Emissão de Nota Fiscal PJ</span>
                </span>
                <input
                  type="checkbox"
                  checked={isWorkTrip}
                  onChange={e => setIsWorkTrip(e.target.checked)}
                  className="rounded text-indigo-600"
                />
              </div>

              {isWorkTrip && (
                <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                  <Input
                    value={companyCnpj}
                    onChange={e => setCompanyCnpj(e.target.value)}
                    placeholder="CNPJ da Empresa"
                    className="text-xs h-8 rounded-xl font-mono"
                  />
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Razão Social"
                    className="text-xs h-8 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="text-xs font-bold rounded-xl h-10 px-4"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Voltar
              </Button>

              <Button
                onClick={handleNextStep}
                className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-10 px-6 rounded-xl shadow-md gap-1.5"
              >
                <span>Avançar para Pagamento</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 3: CHECKOUT & PAGAMENTO TRANSPARENTE ───────────────────── */}
        {currentStep === 3 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Comparador de Formas de Pagamento */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Forma de Pagamento:
                </Label>
                <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  ⚡ Ganhe {pixDiscountPercent}% OFF no PIX
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opção 1: PIX Instantâneo com Desconto Extra */}
                <div
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3.5 rounded-2xl border-2 text-left relative cursor-pointer transition-all ${
                    paymentMethod === "pix"
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="absolute -top-2.5 right-3 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase">
                    ⚡ {pixDiscountPercent}% OFF no PIX
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-black text-xs block text-slate-900 dark:text-slate-100">PIX Instantâneo</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-black text-base">
                        R$ {pixTotalAmount.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold mt-1.5">
                    Economia de R$ {pixDiscountAmount.toLocaleString("pt-BR")} • Liberação na hora
                  </p>
                </div>

                {/* Opção 2: Cartão de Crédito Mercado Pago */}
                <div
                  onClick={() => setPaymentMethod("card")}
                  className={`p-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                    paymentMethod === "card"
                      ? "border-sky-600 bg-sky-50 dark:bg-sky-950/40 ring-2 ring-sky-500/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-black text-xs block text-slate-900 dark:text-slate-100">Cartão de Crédito</span>
                      <span className="text-slate-800 dark:text-slate-200 font-black text-base">
                        R$ {baseTotalAmount.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                    À vista ou em até 12x no Mercado Pago
                  </p>
                </div>
              </div>
            </div>

            {/* Resumo Financeiro Consolidado */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Diárias ({nights} noites • {flatsCount} {flatsCount === 1 ? "flat" : "flats"} • {ratePlan === "with_breakfast" ? "Com Café" : "Sem Café"}):</span>
                <span>R$ {subtotal.toLocaleString("pt-BR")}</span>
              </div>

              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Desconto Reserva Direta ({discountPercent}%):</span>
                <span>- R$ {discountAmount.toLocaleString("pt-BR")}</span>
              </div>

              {cleaningFee > 0 ? (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Taxa de Higienização Completa:</span>
                  <span>+ R$ {cleaningFee.toLocaleString("pt-BR")}</span>
                </div>
              ) : (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Taxa de Limpeza:</span>
                  <span>✓ Isenta (Inclusa no plano)</span>
                </div>
              )}

              {lateCheckout && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Late Check-out no Domingo (saída às {lateCheckoutTime}):</span>
                  {lateCheckoutFee === 0 ? (
                    <span className="text-emerald-600 font-bold">✓ Cortesia (R$ 0)</span>
                  ) : (
                    <span>
                      + R$ {lateCheckoutFee.toLocaleString("pt-BR")}
                      {lateCheckoutTier.isDailyRate && (
                        <span className="text-[10px] text-slate-400 font-normal ml-1">(+1 diária)</span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {petFee > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Taxa de Higienização Pet:</span>
                  <span>+ R$ {petFee}</span>
                </div>
              )}

              {twinFee > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Configuração 2 Camas Solteiro:</span>
                  <span>+ R$ {twinFee}</span>
                </div>
              )}

              {paymentMethod === "pix" && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-black pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>⚡ Desconto Especial PIX ({pixDiscountPercent}%):</span>
                  <span>- R$ {pixDiscountAmount.toLocaleString("pt-BR")}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black text-slate-900 dark:text-white">
                <span>Valor Final a Pagar:</span>
                <span className={paymentMethod === "pix" ? "text-emerald-600 text-xl" : "text-sky-600 text-xl"}>
                  R$ {totalAmount.toLocaleString("pt-BR")}
                </span>
              </div>
            </div>

            {/* Política de Cancelamento */}
            <div className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Política de Cancelamento: {cancellationPolicy.policyType === "flexivel" ? "Cancelamento Flexível" : "Rigorosa"}
                </span>
                <Badge className={cancellationPolicy.policyType === "flexivel" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                  {cancellationPolicy.isEligibleForRefund ? "Reembolso Elegível" : "Sem Reembolso"}
                </Badge>
              </div>
              <p>{cancellationPolicy.explanation}</p>
            </div>

            {/* Navegação & Botão de Confirmação */}
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="text-xs font-bold rounded-xl h-10 px-4"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Voltar
              </Button>

              <Button
                onClick={handleConfirmReservation}
                disabled={isProcessing}
                className={paymentMethod === "pix"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-11 px-6 rounded-xl shadow-lg shadow-emerald-600/20 gap-2"
                  : "bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-11 px-6 rounded-xl shadow-lg shadow-sky-600/20 gap-2"
                }
              >
                <Lock className="w-4 h-4" />
                <span>
                  {isProcessing ? "Confirmando..." : (paymentMethod === "pix" ? `Pagar com PIX: R$ ${totalAmount.toLocaleString("pt-BR")}` : `Pagar com Cartão: R$ ${totalAmount.toLocaleString("pt-BR")}`)}
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 4: VOUCHER DIGITAL & PÓS-VENDA ─────────────────────────── */}
        {currentStep === 4 && confirmedReservation && (
          <div className="space-y-4 py-2 text-center animate-in zoom-in-95">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-xs ${
              paymentMethod === "pix" && !isPixPaid 
                ? "bg-amber-100 text-amber-700" 
                : "bg-emerald-100 text-emerald-700"
            }`}>
              {paymentMethod === "pix" && !isPixPaid ? (
                <Clock className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                {paymentMethod === "pix" && !isPixPaid 
                  ? "Quase lá! Conclua o Pagamento PIX" 
                  : "Reserva Confirmada com Sucesso!"}
              </h3>
              <p className="text-xs text-slate-500">
                {paymentMethod === "pix" && !isPixPaid ? (
                  <>Sua pré-reserva foi registrada. Realize o pagamento abaixo em até 24h para liberação automática do seu voucher definitivo em <strong>{guestEmail}</strong>.</>
                ) : (
                  <>Seu voucher oficial foi emitido e encaminhado para <strong>{guestEmail}</strong>.</>
                )}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Código da Reserva:</span>
                <span className="font-mono font-black text-sky-700 text-sm">
                  {confirmedReservation.code || confirmedReservation.reservationCode}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Hóspede Principal:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{guestName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Período:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{formatDisplayDate(checkin)} até {formatDisplayDate(checkout)} ({nights} noites)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Acomodação:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">Flat Studio ({confirmedReservation.flatNumber})</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">Status da Reserva:</span>
                {paymentMethod === "pix" && !isPixPaid ? (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 font-bold text-[10px]">
                    ⏳ Aguardando Pagamento PIX
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 font-bold text-[10px]">
                    ✓ Confirmada & Paga
                  </Badge>
                )}
              </div>
            </div>

            {/* Se Pagamento foi PIX */}
            {paymentMethod === "pix" && (
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-3">
                {isPixPaid ? (
                  <div className="py-4 text-center space-y-2">
                    <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                      <Check className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                      ✓ Pagamento PIX Confirmado!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Recebemos o seu pagamento via Banco Inter. Sua reserva está 100% quitada e garantida!
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Pagamento PIX Banco Inter (5% de Desconto Incluso)</span>
                    </div>

                    {pixData?.pixCopiaECola && (
                      <>
                        <div className="bg-white p-3 rounded-xl inline-block shadow-inner mx-auto">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pixData.pixCopiaECola)}`}
                            alt="QR Code PIX"
                            className="w-36 h-36 mx-auto rounded-lg"
                          />
                        </div>

                        <div className="space-y-1 text-left">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center">
                            Código PIX Copia e Cola (Aprovação Automática)
                          </span>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={pixData.pixCopiaECola}
                              className="text-[11px] font-mono bg-white dark:bg-slate-900 h-9"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(pixData.pixCopiaECola)
                                setPixCopied(true)
                                setTimeout(() => setPixCopied(false), 3000)
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3 rounded-xl shrink-0"
                            >
                              {pixCopied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                              <span>{pixCopied ? "Copiado!" : "Copiar"}</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Chave Pix Direta CNPJ como alternativa */}
                    <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between text-xs bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-xl">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-500 font-semibold block">Chave PIX Oficial (CNPJ Banco Inter):</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs">47.964.813/0001-65</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText("47964813000165")
                          setPixKeyCopied(true)
                          setTimeout(() => setPixKeyCopied(false), 3000)
                        }}
                        className="h-8 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl px-3 shrink-0"
                      >
                        {pixKeyCopied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                        <span>{pixKeyCopied ? "Copiado!" : "Copiar CNPJ"}</span>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Se Pagamento foi Cartão */}
            {paymentMethod === "card" && mpInitPoint && (
              <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl space-y-2">
                <p className="text-xs text-sky-950 dark:text-sky-200 font-bold">
                  Clique abaixo para efetuar o pagamento seguro no Mercado Pago:
                </p>
                <Button
                  onClick={() => window.open(mpInitPoint, "_blank")}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-10 rounded-xl shadow-md gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pagar com Cartão no Mercado Pago</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Ações Pós-Venda: Calendário & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <AddToCalendar
                variant="compact"
                reservation={{
                  id: confirmedReservation.id,
                  reservationCode: confirmedReservation.code || confirmedReservation.reservationCode,
                  guestName,
                  flatNumber: confirmedReservation.flatNumber,
                  checkinDate: checkin,
                  checkoutDate: checkout,
                  numGuests: rooms.reduce((acc, r) => acc + (Number(r.adults) || 2), 0)
                }}
              />

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="h-9 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Concierge no WhatsApp</span>
              </a>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleResetAndNewBooking}
                className="w-full text-xs font-bold rounded-xl h-9 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Fazer Outra Reserva
              </Button>

              <Button
                onClick={handleCloseModal}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl h-9"
              >
                Concluir e Fechar
              </Button>
            </div>
          </div>
        )}

        {/* ── Modal Suave de Retenção de Saída (Exit-Intent) ──────────────── */}
        {showExitIntent && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-3 shadow-2xl animate-in zoom-in-95">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>

              <h4 className="font-black text-slate-900 dark:text-slate-100 text-base">
                Ficou com alguma dúvida sobre a estadia?
              </h4>

              <p className="text-xs text-slate-500 leading-relaxed">
                Nossa equipe de atendimento está online no WhatsApp para tirar dúvidas sobre o flat ou aplicar condições especiais para seu período.
              </p>

              <div className="space-y-2 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExitIntent(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-10 rounded-xl flex items-center justify-center gap-2 shadow-md"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar com Atendente no WhatsApp</span>
                </a>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExitIntent(false)}
                  className="w-full text-xs text-slate-500 font-bold"
                >
                  Continuar no Funil de Reservas
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
