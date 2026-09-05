import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, Coffee, Building2, Sparkles, User, ShieldCheck, Check, ArrowRight, ArrowLeft,
  QrCode, CreditCard, Copy, ExternalLink, Clock, Car, Heart, AlertTriangle, MessageCircle,
  Lock, CheckCircle2, Shield, Flame, Zap, HelpCircle, PhoneCall
} from "lucide-react"
import { AddToCalendar } from "@/components/add-to-calendar"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { RoomConfig } from "@/pages/booking-engine"

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
  onSuccessBooking
}: BookingFunnelModalProps) {
  // Funnel Stepper (1 to 5)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1)

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

  // Guest Details
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [guestDocument, setGuestDocument] = useState("")

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
  const [earlyCheckin, setEarlyCheckin] = useState(false)
  const [lateCheckout, setLateCheckout] = useState(false)
  const [bringingPet, setBringingPet] = useState(false)
  const [petCount, setPetCount] = useState(1)
  const [petRulesAccepted, setPetRulesAccepted] = useState(false)

  // Payment Selection
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState<any | null>(null)
  const [pixData, setPixData] = useState<any | null>(null)
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null)
  const [pixCopied, setPixCopied] = useState(false)

  // Exit-Intent Modal
  const [showExitIntent, setShowExitIntent] = useState(false)
  const exitIntentTriggeredRef = useRef(false)

  // Auto-fill from guestAccount if logged in
  useEffect(() => {
    if (guestAccount) {
      if (guestAccount.name && !guestName) setGuestName(guestAccount.name)
      if (guestAccount.phone && !guestPhone) setGuestPhone(guestAccount.phone)
      if (guestAccount.email && !guestEmail) setGuestEmail(guestAccount.email)
      if (guestAccount.document && !guestDocument) setGuestDocument(guestAccount.document)
      if (guestAccount.vehicle?.plate) {
        setHasVehicle(true)
        setVehiclePlate(guestAccount.vehicle.plate)
        setVehicleModel(guestAccount.vehicle.model || "")
      }
      if (guestAccount.companyData?.cnpj) {
        setIsWorkTrip(true)
        setCompanyCnpj(guestAccount.companyData.cnpj)
        setCompanyName(guestAccount.companyData.companyName || "")
      }
    }
  }, [guestAccount])

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

  // Upsells: Early Check-in (R$ 50) e Late Check-out (R$ 50)
  const earlyCheckinFee = earlyCheckin ? 50 * flatsCount : 0
  const lateCheckoutFee = lateCheckout ? 50 * flatsCount : 0

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
            earlyCheckin,
            lateCheckout,
            earlyCheckinFee,
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

  // Dispara telemetria ao abrir ou avançar etapas
  useEffect(() => {
    if (open) {
      const stepNames = ["", "busca_datas", "personalizacao_extras", "identificacao_lead", "checkout_pagamento", "reserva_confirmada"]
      sendFunnelTelemetry(currentStep, stepNames[currentStep])
    }
  }, [open, currentStep])

  // Exit-Intent Listener (apenas se já estiver em etapa de dados ou checkout)
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (open && currentStep >= 2 && currentStep <= 4 && !exitIntentTriggeredRef.current && e.clientY <= 10) {
        exitIntentTriggeredRef.current = true
        setShowExitIntent(true)
      }
    }
    window.addEventListener("mouseleave", handleMouseLeave)
    return () => window.removeEventListener("mouseleave", handleMouseLeave)
  }, [open, currentStep])

  // Avançar Etapa com Validações
  const handleNextStep = () => {
    if (currentStep === 2) {
      if (bringingPet && !petRulesAccepted) {
        alert("Por favor, aceite as regras para animais de estimação para prosseguir.")
        return
      }
      setCurrentStep(3)
    } else if (currentStep === 3) {
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
      // Registra o lead imediatamente no backend como carrinho ativo
      sendFunnelTelemetry(3, "identificacao_lead", "em_andamento")
      setCurrentStep(4)
    } else if (currentStep === 1) {
      setCurrentStep(2)
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
        earlyCheckin,
        lateCheckout,
        earlyCheckinFee,
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
        setCurrentStep(5)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[96vw] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                CF
              </span>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                  {currentStep === 5 ? "🎉 Reserva Confirmada!" : "Motor de Reservas Diretas"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {currentStep === 5 
                    ? "Sua estadia nos flats CorpFlats está garantida." 
                    : "Melhor tarifa garantida sem taxas de intermediação de OTAs."}
                </DialogDescription>
              </div>
            </div>

            {currentStep < 5 && (
              <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-[11px] font-bold">
                Etapa {currentStep} de 4
              </Badge>
            )}
          </div>

          {/* ── Stepper Visual do Funil de Conversão ───────────────────────── */}
          {currentStep < 5 && (
            <div className="pt-3">
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { step: 1, label: "1. Tarifa", icon: Calendar },
                  { step: 2, label: "2. Extras", icon: Sparkles },
                  { step: 3, label: "3. Seus Dados", icon: User },
                  { step: 4, label: "4. Pagamento", icon: ShieldCheck }
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

        {/* ── ETAPA 1: DATAS & REGIME DE HOSPEDAGEM ────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Urgência & Prova Social */}
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center justify-between text-xs shadow-2xs">
              <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-semibold">
                <Flame className="w-4 h-4 text-orange-500 animate-pulse shrink-0" />
                <span>Alta procura para essas datas! Restam poucas unidades no Soho Residence.</span>
              </div>
              <Badge className="bg-orange-500 text-white font-black text-[10px] shrink-0">
                15% OFF
              </Badge>
            </div>

            {/* Resumo do Período */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Período Selecionado</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{checkin} até {checkout}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Duração</span>
                <span className="font-bold text-sky-600 text-sm">{nights} {nights === 1 ? "diária" : "diárias"}</span>
              </div>
            </div>

            {/* Seleção de Regime de Hospedagem */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Escolha o seu Regime de Hospedagem:
              </Label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Com Café Incluso */}
                <div
                  onClick={() => setRatePlan("with_breakfast")}
                  className={`cursor-pointer p-3.5 rounded-2xl border-2 transition-all relative ${
                    ratePlan === "with_breakfast"
                      ? "border-sky-600 bg-sky-50/70 dark:bg-sky-950/40 text-slate-900 dark:text-white ring-2 ring-sky-500/20 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0">
                        <Coffee className="w-4 h-4" />
                      </div>
                      <span className="font-black text-xs sm:text-sm">Com Café da Manhã</span>
                    </div>
                    <Badge className="bg-amber-600 text-white font-bold text-[10px]">
                      R$ {withBreakfastConfig.dailyRate}/dia
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    Café da manhã gourmet artesanal servido exclusivamente no seu flat. <strong>Taxa de limpeza 100% isenta!</strong>
                  </p>
                </div>

                {/* Sem Café (Apenas Hospedagem) */}
                <div
                  onClick={() => setRatePlan("room_only")}
                  className={`cursor-pointer p-3.5 rounded-2xl border-2 transition-all relative ${
                    ratePlan === "room_only"
                      ? "border-sky-600 bg-sky-50/70 dark:bg-sky-950/40 text-slate-900 dark:text-white ring-2 ring-sky-500/20 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="font-black text-xs sm:text-sm">Sem Café (Econômica)</span>
                    </div>
                    <Badge className="bg-slate-800 text-white font-bold text-[10px]">
                      R$ {roomOnlyConfig.dailyRate}/dia
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    Tarifa econômica sem café da manhã. Acesso completo à estrutura do flat com ar split, Wi-Fi 500MB e garagem.
                  </p>
                </div>
              </div>
            </div>

            {/* Total Parcial */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Subtotal das Diárias ({nights} noites • {flatsCount} {flatsCount === 1 ? "flat" : "flats"}):
              </span>
              <span className="font-black text-sky-700 dark:text-sky-300 text-sm">
                R$ {(subtotal - discountAmount).toLocaleString("pt-BR")}
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleNextStep}
                className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-10 px-6 rounded-xl shadow-md gap-1.5"
              >
                <span>Avançar para Conforto & Extras</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 2: PERSONALIZAÇÃO & UP-SELLS ESTRATÉGICOS ──────────────── */}
        {currentStep === 2 && (
          <div className="space-y-4 py-2 animate-in fade-in">
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

            {/* Up-sells de Alto Valor (Maximização de Ticket Médio) */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Adicionais Exclusivos para sua Estadia:</span>
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Up-sell 1: Early Check-in */}
                <div
                  onClick={() => setEarlyCheckin(!earlyCheckin)}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-2.5 ${
                    earlyCheckin
                      ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={earlyCheckin}
                    onChange={() => {}}
                    className="mt-1 rounded text-amber-600"
                  />
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs">🕐 Early Check-in (11:00)</span>
                      <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0">
                        + R$ 50
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      Entre 3 horas antes no apartamento (padrão é 14h) para relaxar ou trabalhar mais cedo.
                    </p>
                  </div>
                </div>

                {/* Up-sell 2: Late Check-out */}
                <div
                  onClick={() => setLateCheckout(!lateCheckout)}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-2.5 ${
                    lateCheckout
                      ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={lateCheckout}
                    onChange={() => {}}
                    className="mt-1 rounded text-amber-600"
                  />
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs">🕒 Late Check-out (15:00)</span>
                      <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0">
                        + R$ 50
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      Estenda sua saída até as 15h (padrão é 12h) e aproveite seu dia sem pressa.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Módulo Pet Friendly */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Vai viajar com animal de estimação?</span>
                    <span className="text-[10px] text-slate-500">Taxa de higienização: R$ {petFeePerUnit}/pet</span>
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
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300 font-bold">Quantidade de Cães (até 15kg):</span>
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

                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[10px] text-amber-900 dark:text-amber-200 leading-snug">
                    ⚠️ <strong>Regra da Casa:</strong> Apenas cachorros dóceis de até 15kg com guia nas áreas comuns.
                  </div>

                  <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={petRulesAccepted}
                      onChange={e => setPetRulesAccepted(e.target.checked)}
                      className="rounded text-sky-600"
                    />
                    <span>Concordo com as normas de convivência pet e a taxa de higienização.</span>
                  </label>
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
                <span>Avançar para Seus Dados</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 3: IDENTIFICAÇÃO & CAPTURA DE LEAD ────────────────────── */}
        {currentStep === 3 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Login Rápido se não estiver autenticado */}
            {!guestAccount && (
              <div className="p-3 bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Já tem conta CorpFlats?</span>
                    <span className="text-[11px] text-slate-500">Faça login para preencher em 1 clique.</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={onOpenAuthModal}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-7 px-3 rounded-xl shrink-0"
                >
                  Fazer Login
                </Button>
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
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="(22) 99999-9999"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold"
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
                  CPF ou Passaporte
                </Label>
                <Input
                  value={guestDocument}
                  onChange={e => setGuestDocument(e.target.value)}
                  placeholder="000.000.000-00"
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
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
                onClick={() => setCurrentStep(2)}
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

        {/* ── ETAPA 4: CHECKOUT & PAGAMENTO TRANSPARENTE ───────────────────── */}
        {currentStep === 4 && (
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
                <span>Diárias ({nights} noites • {flatsCount} {flatsCount === 1 ? "flat" : "flats"}):</span>
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

              {earlyCheckin && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Early Check-in às 11:00:</span>
                  <span>+ R$ {earlyCheckinFee}</span>
                </div>
              )}

              {lateCheckout && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Late Check-out até as 15:00:</span>
                  <span>+ R$ {lateCheckoutFee}</span>
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
                onClick={() => setCurrentStep(3)}
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

        {/* ── ETAPA 5: VOUCHER DIGITAL & PÓS-VENDA ─────────────────────────── */}
        {currentStep === 5 && confirmedReservation && (
          <div className="space-y-4 py-2 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                Reserva Realizada com Sucesso!
              </h3>
              <p className="text-xs text-slate-500">
                Seu voucher foi emitido e encaminhado para <strong>{guestEmail}</strong>.
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
                <span className="font-bold text-slate-900 dark:text-slate-100">{checkin} até {checkout} ({nights} noites)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Acomodação:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">Flat Studio ({confirmedReservation.flatNumber})</span>
              </div>
            </div>

            {/* Se Pagamento foi PIX */}
            {paymentMethod === "pix" && pixData?.pixCopiaECola && (
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>Pagamento PIX Banco Inter (5% de Desconto Incluso)</span>
                </div>

                <div className="bg-white p-3 rounded-xl inline-block shadow-inner mx-auto">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pixData.pixCopiaECola)}`}
                    alt="QR Code PIX"
                    className="w-36 h-36 mx-auto rounded-lg"
                  />
                </div>

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

            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full text-xs font-bold rounded-xl h-9"
            >
              Concluir e Fechar
            </Button>
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
