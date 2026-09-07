import { useState, useEffect } from "react"
import { useRoute, useLocation } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, Star, RotateCcw, Calendar, Users, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Wifi, HelpCircle, Check, Copy, Phone, UserCheck, ShieldAlert,
  MapPin, Navigation, ExternalLink, Car, ArrowLeft, Search,
  CreditCard, QrCode, RefreshCw, AlertCircle
} from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AddToCalendar } from "@/components/add-to-calendar"
import { generateLodgingJsonLd } from "@/lib/calendar-helper"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"

function formatPhoneDisplay(phone: string): string {
  if (!phone) return "(22) 99712-4021"
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return phone
}

export default function GuestPortal() {
  const [, params] = useRoute("/minha-reserva/:code")
  const [, paramsAlt] = useRoute("/portal-hospede/:code")
  const [, paramsGuest] = useRoute("/guest-portal/:code")
  const [, setLocation] = useLocation()
  
  const getInitialQuery = () => {
    if (params?.code) return params.code
    if (paramsAlt?.code) return paramsAlt.code
    if (paramsGuest?.code) return paramsGuest.code
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("whatsapp") || sp.get("phone") || sp.get("tel") || sp.get("code") || sp.get("q") || sp.get("reserva") || ""
    }
    return ""
  }

  const rawCode = getInitialQuery()
  const [searchQuery, setSearchQuery] = useState(rawCode)
  const [code, setCode] = useState(rawCode)
  
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(Boolean(rawCode))
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedWifi, setCopiedWifi] = useState(false)
  const [copiedSsid, setCopiedSsid] = useState(false)
  const [copiedPix, setCopiedPix] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [paymentMethodTab, setPaymentMethodTab] = useState<"pix" | "card">("pix")
  const [changingMethod, setChangingMethod] = useState(false)
  const [paymentSuccessNotice, setPaymentSuccessNotice] = useState(false)
  
  // Modals & Action States
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsModalTab, setTermsModalTab] = useState<"rules" | "contract">("rules")
  const [claimingEarly, setClaimingEarly] = useState(false)
  const [reminderSaved, setReminderSaved] = useState(false)

  // Modificar Reserva States
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modCheckinDate, setModCheckinDate] = useState("")
  const [modCheckoutDate, setModCheckoutDate] = useState("")
  const [modGuestCount, setModGuestCount] = useState(1)
  const [modReason, setModReason] = useState("")
  const [modifying, setModifying] = useState(false)
  const [modifyError, setModifyError] = useState<string | null>(null)
  const [modifySuccess, setModifySuccess] = useState<string | null>(null)

  // Cancelamento Self-Service States
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  // Breakfast Repeat & Favorite States
  const [repeatModalOpen, setRepeatModalOpen] = useState(false)
  const [selectedOrderToRepeat, setSelectedOrderToRepeat] = useState<any | null>(null)
  const [repeatDeliveryDate, setRepeatDeliveryDate] = useState("")
  const [repeatDeliveryTime, setRepeatDeliveryTime] = useState("08:00")
  const [isRepeatingOrder, setIsRepeatingOrder] = useState(false)
  const [favoriteTogglingId, setFavoriteTogglingId] = useState<number | null>(null)

  const handleToggleFavorite = async (orderId: number) => {
    try {
      setFavoriteTogglingId(orderId)
      const res = await fetch(`/api/breakfast/orders/${orderId}/favorite`, { method: "POST" })
      if (res.ok) {
        fetchPortalData()
      }
    } catch {}
    finally {
      setFavoriteTogglingId(null)
    }
  }

  const handleOpenRepeatModal = (order: any) => {
    setSelectedOrderToRepeat(order)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setRepeatDeliveryDate(tomorrow.toISOString().substring(0, 10))
    setRepeatDeliveryTime(order.deliveryTime || "08:00")
    setRepeatModalOpen(true)
  }

  const handleConfirmRepeatOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderToRepeat) return
    setIsRepeatingOrder(true)
    try {
      const res = await fetch("/api/breakfast/orders/repeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderToRepeat.id,
          targetDate: repeatDeliveryDate,
          deliveryTime: repeatDeliveryTime
        })
      })
      if (res.ok) {
        setRepeatModalOpen(false)
        fetchPortalData()
      }
    } catch {}
    finally {
      setIsRepeatingOrder(false)
    }
  }

  const fetchPortalData = async (targetCode = code) => {
    const q = (targetCode || "").trim()
    if (!q) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(q)}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || "Reserva não encontrada.")
        return
      }
      const json = await res.json()
      setData(json)
      const effectiveCode = json.reservation?.code || q
      try {
        localStorage.setItem("corpflats_guest_session", effectiveCode)
        localStorage.setItem("corpflats_guest_name", json.reservation?.guestName || "")
      } catch {}
      setError(null)
    } catch (e: any) {
      setError(e.message || "Erro ao carregar dados da reserva.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (rawCode) {
      setCode(rawCode)
      setSearchQuery(rawCode)
      fetchPortalData(rawCode)
    } else {
      const savedCode = localStorage.getItem("corpflats_guest_session")
      if (savedCode) {
        setLocation(`/minha-reserva/${savedCode}`)
      } else {
        setLoading(false)
      }
    }
  }, [rawCode])

  const handleClaimEarlyCheckin = async () => {
    try {
      setClaimingEarly(true)
      const res = await fetch(`/api/pms/guest-portal/${code}/claim-early-checkin`, {
        method: "POST"
      })
      if (res.ok) {
        fetchPortalData()
      }
    } catch {}
    finally {
      setClaimingEarly(false)
    }
  }

  const handleOpenModifyModal = () => {
    if (!data?.reservation) return
    const r = data.reservation
    setModCheckinDate(r.checkinDate || "")
    setModCheckoutDate(r.checkoutDate || "")
    setModGuestCount(r.guestCount || 1)
    setModReason("")
    setModifyError(null)
    setModifySuccess(null)
    setModifyModalOpen(true)
  }

  const handleConfirmModify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.reservation) return
    const currentCode = data.reservation.code || code
    setModifying(true)
    setModifyError(null)
    setModifySuccess(null)
    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          reason: modReason
        })
      })
      const json = await res.json()
      if (res.ok) {
        setModifySuccess(json.message || "Reserva modificada com sucesso!")
        fetchPortalData(currentCode)
        setTimeout(() => {
          setModifyModalOpen(false)
          setModifySuccess(null)
        }, 3000)
      } else {
        setModifyError(json.error || "Não foi possível alterar a reserva.")
      }
    } catch (err: any) {
      setModifyError(err.message || "Erro ao conectar com o servidor.")
    } finally {
      setModifying(false)
    }
  }

  // Vehicle & Garage States
  const [portalPlate, setPortalPlate] = useState("")
  const [portalBrand, setPortalBrand] = useState("")
  const [portalModel, setPortalModel] = useState("")
  const [portalColor, setPortalColor] = useState("")
  const [portalCarEditing, setPortalCarEditing] = useState(false)
  const [savingCar, setSavingCar] = useState(false)
  const [portalCarSuccess, setPortalCarSuccess] = useState(false)

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!portalPlate.trim() || !code) return

    setSavingCar(true)
    try {
      const res = await fetch(`/api/pms/reservations/${code}/vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: portalPlate.trim().toUpperCase(),
          brand: portalBrand.trim(),
          model: portalModel.trim(),
          color: portalColor.trim()
        })
      })
      if (res.ok) {
        setPortalCarSuccess(true)
        setPortalCarEditing(false)
        fetchPortalData()
        setTimeout(() => setPortalCarSuccess(false), 5000)
      }
    } catch {}
    finally {
      setSavingCar(false)
    }
  }

  const reservation = data?.reservation
  const channelLower = String(reservation?.channel || "").toLowerCase()
  const isOta = channelLower.includes("booking") || channelLower.includes("airbnb")
  const isPaid = Boolean(
    isOta || 
    reservation?.isPaid ||
    reservation?.paymentStatus === "pago_total" || 
    reservation?.paymentStatus === "pago" || 
    (Number(reservation?.paidAmount) >= Number(reservation?.totalAmount) && Number(reservation?.totalAmount) > 0)
  )

  // Polling automático de status de pagamento a cada 6 segundos quando pendente
  useEffect(() => {
    if (!reservation?.code || isPaid) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/reservations/${encodeURIComponent(reservation.code)}/payment-status`)
        if (res.ok) {
          const json = await res.json()
          if (json.paid) {
            setPaymentSuccessNotice(true)
            setData((prev: any) => prev ? ({
              ...prev,
              reservation: {
                ...prev.reservation,
                paymentStatus: "pago_total",
                paidAmount: json.paidAmount,
                paidAt: json.paidAt || new Date().toISOString(),
                pixTxId: json.pixTxId || prev.reservation.pixTxId,
                mpPaymentId: json.mpPaymentId || prev.reservation.mpPaymentId
              }
            }) : null)
          }
        }
      } catch {}
    }, 6000)
    return () => clearInterval(interval)
  }, [reservation?.code, isPaid])

  useEffect(() => {
    if (reservation?.paymentMethod === "cartao_credito" || reservation?.paymentMethod === "card") {
      setPaymentMethodTab("card")
    } else {
      setPaymentMethodTab("pix")
    }
  }, [reservation?.paymentMethod])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col items-center justify-center p-4">
        <div className="animate-spin w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full mb-4" />
        <p className="text-sm font-semibold text-slate-600">Carregando detalhes da sua reserva...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans pb-16">
        {/* Header Clean */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => setLocation("/reservar")}
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm">
                CF
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900">CorpFlats</span>
            </div>

            <a
              href="https://wa.me/5522997124021?text=Ol%C3%A1!%20Gostaria%20de%20ajuda%20para%20localizar%20minha%20reserva."
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-800 text-xs font-bold transition-all shadow-2xs"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp Recepção</span>
            </a>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-lg mx-auto w-full">
          <Card className="w-full bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-2xs">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Consultar Minha Reserva
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Acesse sua fechadura digital, Wi-Fi e Room Service sem necessidade de senha ou cadastro.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200/90 text-rose-800 flex items-start gap-3 text-xs leading-relaxed text-left">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-rose-900">Reserva não localizada</strong>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const q = searchQuery.trim()
                if (!q) return
                setLocation(`/minha-reserva/${encodeURIComponent(q)}`)
                fetchPortalData(q)
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5 text-left">
                <Label htmlFor="searchQuery" className="text-xs font-bold text-slate-700">
                  Localizador da Reserva, CPF ou WhatsApp:
                </Label>
                <div className="relative">
                  <Input
                    id="searchQuery"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ex: RES-211-0045, CPF ou 22997124021"
                    className="pl-10 h-11 text-xs sm:text-sm rounded-xl border-slate-200 focus-visible:ring-sky-500"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <Button
                type="submit"
                disabled={!searchQuery.trim()}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Localizar Minha Reserva</span>
              </Button>
            </form>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/reservar")}
                className="text-slate-500 hover:text-slate-800 text-xs font-semibold p-0 h-auto"
              >
                ← Fazer uma nova reserva
              </Button>

              <a
                href="https://wa.me/5522997124021?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20para%20encontrar%20minha%20reserva%20na%20CorpFlats."
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 text-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Falar com a Recepção</span>
              </a>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const { isFlatClean, canClaimFreeEarlyCheckin, breakfastOrder, preCheckinStatus, termsAndRules, adminWhatsApp } = data

  const checkinFormatted = reservation.checkinDate ? format(parseISO(reservation.checkinDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const checkoutFormatted = reservation.checkoutDate ? format(parseISO(reservation.checkoutDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const nights = reservation.checkinDate && reservation.checkoutDate ? Math.max(1, differenceInDays(parseISO(reservation.checkoutDate), parseISO(reservation.checkinDate))) : 1

  const guestName = reservation.guestName || reservation.guests?.[0]?.name || "Hóspede"
  const rawAdminPhone = (adminWhatsApp || "5522997124021").replace(/\D/g, "")
  const finalWaNumber = rawAdminPhone.length === 10 || rawAdminPhone.length === 11 ? `55${rawAdminPhone}` : rawAdminPhone
  const whatsappUrl = `https://wa.me/${finalWaNumber}?text=${encodeURIComponent(`Olá! Tenho uma reserva (${reservation.code}) no Flat ${reservation.flatNumber} e gostaria de tirar uma dúvida.`)}`
  const accessCode = reservation.doorPassword || reservation.accessCode || ""
  const hasBreakfast = Boolean(data.hasBreakfast || reservation.includeBreakfast || reservation.hasBreakfast)

  const handleCopyKey = () => {
    if (!accessCode) return
    navigator.clipboard.writeText(accessCode)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2500)
  }

  const wifiNetwork = `apto${reservation.flatNumber || ""}`
  const wifiPassword = "1234567890123"

  const handleCopyWifi = () => {
    navigator.clipboard.writeText(wifiPassword)
    setCopiedWifi(true)
    setTimeout(() => setCopiedWifi(false), 2500)
  }

  const handleCopySsid = () => {
    navigator.clipboard.writeText(wifiNetwork)
    setCopiedSsid(true)
    setTimeout(() => setCopiedSsid(false), 2500)
  }

  const totalAmount = Number(reservation.totalAmount) || 0
  const rawPaidAmount = Number(reservation.paidAmount) || 0
  const hasAmount = totalAmount > 0 || rawPaidAmount > 0
  const paidAmount = isPaid ? (rawPaidAmount > 0 ? rawPaidAmount : totalAmount) : rawPaidAmount
  const pendingAmount = Math.max(0, totalAmount - paidAmount)

  const handleCopyPix = () => {
    if (!reservation.pixCopiaECola) return
    navigator.clipboard.writeText(reservation.pixCopiaECola)
    setCopiedPix(true)
    setTimeout(() => setCopiedPix(false), 2500)
  }

  const handleChangePaymentMethod = async (newMethod: "pix" | "card") => {
    setPaymentMethodTab(newMethod)
    setChangingMethod(true)
    try {
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(reservation.code)}/change-payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: newMethod })
      })
      const json = await res.json()
      if (json.success && json.reservation) {
        setData((prev: any) => prev ? ({
          ...prev,
          reservation: {
            ...prev.reservation,
            ...json.reservation
          }
        }) : null)
      }
    } catch (e) {
      console.error("Erro ao alterar forma de pagamento:", e)
    } finally {
      setChangingMethod(false)
    }
  }

  const handleCheckPaymentStatus = async () => {
    setCheckingPayment(true)
    try {
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(reservation.code)}/payment-status`)
      if (res.ok) {
        const json = await res.json()
        if (json.paid) {
          setPaymentSuccessNotice(true)
          setData((prev: any) => prev ? ({
            ...prev,
            reservation: {
              ...prev.reservation,
              paymentStatus: "pago_total",
              paidAmount: json.paidAmount,
              paidAt: json.paidAt || new Date().toISOString(),
              pixTxId: json.pixTxId || prev.reservation.pixTxId,
              mpPaymentId: json.mpPaymentId || prev.reservation.mpPaymentId
            }
          }) : null)
        }
      }
    } catch (e) {
      console.error("Erro ao verificar status de pagamento:", e)
    } finally {
      setCheckingPayment(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white pb-20 w-full max-w-full overflow-x-hidden">
      {/* ── Top Navigation Bar (Header Clean & Sofisticado) ──────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm">
              CF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 leading-none">
                  CorpFlats
                </span>
                {isPaid ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/90 text-[10px] font-bold py-0.5 px-2">
                    ✓ {isOta ? (channelLower.includes("booking") ? "Pago via Booking" : "Pago via Airbnb") : "Reserva Confirmada & Paga"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-bold py-0.5 px-2 animate-pulse">
                    ⏳ Aguardando Pagamento
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-slate-500 font-mono font-medium block mt-0.5">
                Localizador: <strong className="text-slate-800 font-bold">{reservation.code}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-white/20" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Main Container ──────────────────────────────────────────────── */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* ── 1. Hero / Saudação e Resumo da Estadia ─────────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider block">
                Área do Hóspede • Minha Reserva
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-0.5">
                Olá, {guestName}! 👋
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Sua estadia no <strong>Edifício Soho Residence Service</strong> • Centro, Campos dos Goytacazes - RJ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                Flat {reservation.flatNumber}
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                {nights} {nights === 1 ? "diária" : "diárias"}
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                {reservation.guestCount || 1} {reservation.guestCount === 1 ? "hóspede" : "hóspedes"}
              </Badge>
              {hasBreakfast && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-2.5">
                  ☕ Café Incluso
                </Badge>
              )}
            </div>
          </div>

          {/* Grid de Entrada e Saída */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                Check-in (Entrada)
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-900 block">
                {checkinFormatted}
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>A partir das {data?.checkinTime || "14:00"} (antecipado assim que limpo)</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                Check-out (Saída)
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-900 block">
                {checkoutFormatted}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Até as {data?.checkoutTime || "12:00"}</span>
              </span>
            </div>
          </div>

          {/* Ações da Reserva (Modificação de Datas e Hóspedes) */}
          {(() => {
            const directChannels = ["whatsapp", "site", "site_direto", "direto", "balcao"]
            const isDirect = directChannels.includes((reservation.channel || "").toLowerCase())
            const isCancelled = reservation.status === "cancelada" || reservation.status === "CANCELLED"
            const canModify = isDirect && !isCancelled

            if (!canModify) return null

            return (
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    Reserva confirmada via <strong>{reservation.channel === "whatsapp" ? "WhatsApp" : "Site CorpFlats"}</strong> • Precisa ajustar sua estadia?
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenModifyModal}
                  className="h-9 px-4 rounded-xl border border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 shrink-0"
                >
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                  <span>Modificar Reserva</span>
                </Button>
              </div>
            )
          })()}
        </Card>

        {/* ── 1.5 Card de Pagamento & Confirmação Financeira ───────────────── */}
        <Card className={`rounded-3xl border shadow-md p-5 sm:p-7 space-y-4 transition-all ${
          isPaid 
            ? "bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 border-emerald-200/90" 
            : "bg-white border-amber-300 shadow-lg ring-1 ring-amber-300/60"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-2xs ${
                isPaid ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}>
                {isPaid ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Clock className="w-5 h-5 text-amber-600" />}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  {isPaid ? "Pagamento Confirmado & Liquidado" : "Concluir Pagamento da Reserva"}
                </h2>
                <span className="text-xs text-slate-500">
                  {isPaid 
                    ? "Sua hospedagem está 100% garantida e o acesso ao condomínio liberado." 
                    : "Escolha como deseja pagar para confirmar sua estadia e liberar sua fechadura."}
                </span>
              </div>
            </div>

            <Badge className={isPaid ? "bg-emerald-600 text-white font-bold text-xs" : "bg-amber-600 text-white font-bold text-xs"}>
              {isPaid ? "✓ Pago" : "⏳ Aguardando Pagamento"}
            </Badge>
          </div>

          {/* Se PAGO mas SEM VALOR PREENCHIDO: Mostra somente "Pago" */}
          {isPaid && !hasAmount && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-900">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold block text-sm">Status: Pago</span>
                  <span className="text-emerald-800 text-xs">
                    {isOta 
                      ? (channelLower.includes("booking") 
                          ? "Reserva e pagamento confirmados via Booking.com." 
                          : "Reserva e pagamento confirmados via Airbnb.")
                      : "Pagamento registrado e confirmado pela administração CorpFlats."}
                  </span>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3 shrink-0">
                ✓ Pago
              </Badge>
            </div>
          )}

          {/* Se PAGO COM VALOR PREENCHIDO: Exibe os valores normalmente */}
          {isPaid && hasAmount && (
            <>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Valor Total da Estadia</span>
                  <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                    R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Valor Pago</span>
                  <span className="text-sm sm:text-base font-bold block mt-0.5 text-emerald-600">
                    R$ {paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold block text-sm">Reserva 100% Confirmada!</span>
                    <span className="text-emerald-800 text-xs">
                      {isOta 
                        ? (channelLower.includes("booking") 
                            ? "Liquidado diretamente via Booking.com." 
                            : "Liquidado diretamente via Airbnb.")
                        : (reservation.paymentMethod === "cartao_credito" || reservation.mpPaymentId 
                            ? "Liquidado via Cartão de Crédito (Mercado Pago)." 
                            : (channelLower.includes("whatsapp") 
                                ? "Liquidado e confirmado via WhatsApp (CorpFlats)." 
                                : "Liquidado via PIX Banco Inter."))}
                    </span>
                  </div>
                </div>
                {reservation.paidAt && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-white/80 px-2.5 py-1 rounded-xl border border-emerald-200">
                    {format(parseISO(reservation.paidAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Se NÃO PAGO: Permanece com Resumo Financeiro Completo para Pagamento */}
          {!isPaid && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Valor Total da Estadia</span>
                <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                  R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Valor Recebido</span>
                <span className="text-sm sm:text-base font-bold block mt-0.5 text-slate-600">
                  R$ {paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 col-span-2 sm:col-span-1">
                <span className="text-amber-800 font-bold uppercase text-[10px] block">Saldo a Pagar</span>
                <span className="text-sm sm:text-base font-black text-amber-700 block mt-0.5">
                  R$ {pendingAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* Se NÃO PAGO: Seletor de Método e Instruções */}
          {!isPaid && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 block">
                  Selecione ou altere a forma de pagamento:
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChangePaymentMethod("pix")}
                    disabled={changingMethod}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      paymentMethodTab === "pix"
                        ? "border-sky-500 bg-sky-50/70 text-sky-900 ring-2 ring-sky-400/40 shadow-xs"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      paymentMethodTab === "pix" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      ⚡
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm block leading-tight">PIX Instantâneo</span>
                      <span className="text-[10.5px] text-slate-500 hidden sm:block">Banco Inter • Baixa Imediata</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChangePaymentMethod("card")}
                    disabled={changingMethod}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      paymentMethodTab === "card"
                        ? "border-sky-500 bg-sky-50/70 text-sky-900 ring-2 ring-sky-400/40 shadow-xs"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      paymentMethodTab === "card" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm block leading-tight">Cartão de Crédito</span>
                      <span className="text-[10.5px] text-slate-500 hidden sm:block">Mercado Pago • Até 12x</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Aba PIX */}
              {paymentMethodTab === "pix" && (
                <div className="p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-center">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-slate-900 block">
                      Pague via PIX com Baixa Automática
                    </span>
                    <span className="text-xs text-slate-500 block max-w-md mx-auto">
                      Abra o aplicativo do seu banco, escolha <strong>Pagar com PIX</strong> e escaneie o QR Code abaixo ou copie o código:
                    </span>
                  </div>

                  {/* QR Code */}
                  {reservation.pixCopiaECola ? (
                    <div className="inline-block p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reservation.pixCopiaECola)}`}
                        alt="QR Code PIX Banco Inter"
                        className="w-44 h-44 sm:w-48 sm:h-48 mx-auto"
                      />
                    </div>
                  ) : (
                    <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
                      Gerando cobrança PIX oficial...
                    </div>
                  )}

                  {/* Código Copia e Cola */}
                  {reservation.pixCopiaECola && (
                    <div className="space-y-2 max-w-lg mx-auto">
                      <div className="flex items-center gap-1.5 p-2 bg-white rounded-xl border border-slate-200 text-left">
                        <span className="font-mono text-[11px] text-slate-600 truncate flex-1 px-1 select-all">
                          {reservation.pixCopiaECola}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCopyPix}
                          className={`h-8 px-3 rounded-lg text-xs font-bold gap-1.5 shrink-0 transition-all ${
                            copiedPix ? "bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                          }`}
                        >
                          {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedPix ? "Copiado!" : "Copiar Código PIX"}</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Ações e Polling */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCheckPaymentStatus}
                      disabled={checkingPayment}
                      className="h-9 px-4 rounded-xl text-xs font-bold border-slate-300 hover:bg-white text-slate-700 gap-1.5 shadow-2xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? "animate-spin text-sky-600" : ""}`} />
                      <span>{checkingPayment ? "Verificando..." : "Já fiz o PIX • Verificar Pagamento"}</span>
                    </Button>
                  </div>

                  <div className="text-[11px] text-emerald-700 flex items-center justify-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Verificação automática ativa em tempo real. Assim que pagar, sua página será atualizada!</span>
                  </div>
                </div>
              )}

              {/* Aba Cartão de Crédito (Mercado Pago) */}
              {paymentMethodTab === "card" && (
                <div className="p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-center">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-slate-900 block">
                      Pagamento em até 12x no Cartão de Crédito
                    </span>
                    <span className="text-xs text-slate-500 block max-w-md mx-auto">
                      Pagamento 100% seguro processado pelo <strong>Mercado Pago Checkout Pro</strong> com parcelamento e todas as bandeiras.
                    </span>
                  </div>

                  <div className="max-w-md mx-auto p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Valor a parcelar:</span>
                      <strong className="text-slate-900 text-sm">
                        R$ {pendingAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    {reservation.mpInitPoint ? (
                      <a
                        href={reservation.mpInitPoint}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg active:scale-95 transition-all"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Pagar no Cartão (Mercado Pago)</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </a>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => handleChangePaymentMethod("card")}
                        disabled={changingMethod}
                        className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm shadow-md gap-2"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>{changingMethod ? "Gerando link de pagamento..." : "Gerar Link de Pagamento no Cartão"}</span>
                      </Button>
                    )}

                    <div className="pt-2 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCheckPaymentStatus}
                        disabled={checkingPayment}
                        className="text-xs text-slate-600 hover:text-slate-900 font-semibold gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? "animate-spin text-sky-600" : ""}`} />
                        <span>Já realizei o pagamento no cartão (Verificar)</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── 2. Card: Acomodação & Chave de Acesso / Portaria ───────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center font-black text-sm">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  {reservation.roomCategory || "Flat Studio Executivo Soho"}
                </h2>
                <span className="text-xs text-slate-500">
                  Unidade privativa completa, climatizada e com cozinha compacta
                </span>
              </div>
            </div>

            <Badge className={
              data.isCheckinToday 
                ? (isFlatClean ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs" : "bg-amber-50 text-amber-700 border-amber-200 font-bold text-xs")
                : "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs"
            }>
              {data.isCheckinToday 
                ? (isFlatClean ? "✨ Flat Pronto e Limpo" : "🧹 Em Higienização")
                : "✨ Flat Confirmado & Preparado"
              }
            </Badge>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-black text-xl shadow-xs">
                  {reservation.flatNumber}
                </div>
                <div>
                  <span className="text-base font-black text-slate-900 block">
                    Apartamento {reservation.flatNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    Dirija-se à <strong>portaria 24h</strong> e informe seu <strong>nome</strong> e o número do flat.
                  </span>
                </div>
              </div>

              {accessCode && isPaid && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-3 shadow-2xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                      Senha Fechadura / Portaria
                    </span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {accessCode}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyKey}
                    className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <KeyRound className="w-3.5 h-3.5 text-amber-500" />}
                    <span>{copiedKey ? "Copiada!" : "Copiar"}</span>
                  </Button>
                </div>
              )}
            </div>

            {!isPaid && (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>A senha da fechadura eletrônica e a autorização de portaria serão liberadas de imediato assim que o pagamento pendente for liquidado.</span>
              </div>
            )}

            {/* Aviso de Antecipação Liberada */}
            {data.isCheckinToday && isFlatClean && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-emerald-950">Check-in Antecipado Liberado! 🎉</span>
                  <span>Seu apartamento já foi limpo e inspecionado. Você já pode se dirigir à portaria e entrar agora mesmo.</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── 3. Card: Room Service & Café da Manhã (Exibido apenas quando contratado) ── */}
        {hasBreakfast && (
          <Card className="bg-gradient-to-br from-amber-50/90 via-white to-amber-50/30 border border-amber-200/80 rounded-3xl p-5 sm:p-7 shadow-md space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xl border border-amber-300 shadow-2xs">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Room Service & Café da Manhã
                  </h2>
                  <span className="text-xs text-amber-800/90 font-medium">
                    Entregas diárias das 05h às 09h30 servidas pontualmente no flat
                  </span>
                </div>
              </div>

              <Badge variant="outline" className="text-xs font-black px-2.5 py-0.5 bg-amber-100 text-amber-900 border-amber-300">
                ☕ Incluso na Diária
              </Badge>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Monte o seu pedido selecionando frutas frescas, pães artesanais, bebidas quentes e geladas de sua preferência, além do horário exato de sua entrega.
            </p>

            {/* Se houver pedido já agendado para a data */}
            {breakfastOrder && (
              <div className="p-4 bg-white/95 rounded-2xl border border-amber-200 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-amber-900 text-xs sm:text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Pedido Agendado ({breakfastOrder.deliveryDate === format(new Date(), "yyyy-MM-dd") ? "Hoje" : "Próxima Entrega"})</span>
                  </span>
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-bold">
                    ⏰ Entrega às {breakfastOrder.deliveryTime || "08:00"}
                  </Badge>
                </div>

                {breakfastOrder.items && Array.isArray(breakfastOrder.items) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {breakfastOrder.items.map((it: any, idx: number) => (
                      <span key={idx} className="inline-block bg-amber-50/80 border border-amber-200/80 text-amber-900 px-2.5 py-0.5 rounded-lg text-[10.5px] font-medium">
                        {it.quantity > 1 ? `${it.quantity}x ` : ""}{it.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-amber-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleFavorite(breakfastOrder.id)}
                    disabled={favoriteTogglingId === breakfastOrder.id}
                    className="text-xs h-8 bg-white border-amber-200 text-amber-800 hover:bg-amber-50 flex items-center gap-1.5 rounded-xl font-semibold"
                  >
                    <Star className={`w-3.5 h-3.5 ${breakfastOrder.isFavorite ? "fill-amber-500 text-amber-500" : ""}`} />
                    <span>{breakfastOrder.isFavorite ? "Favoritado ⭐" : "Favoritar este Pedido"}</span>
                  </Button>

                  {(reservation.lastBreakfastOrder || breakfastOrder) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenRepeatModal(reservation.lastBreakfastOrder || breakfastOrder)}
                      className="text-xs h-8 bg-white border-amber-200 text-amber-800 hover:bg-amber-50 flex items-center gap-1.5 rounded-xl font-semibold ml-auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                      <span>Repetir para Amanhã</span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Botões de Ação do Café */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 pt-1">
              <Button
                onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/cafe`)}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-black text-xs h-11 px-6 rounded-2xl shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 flex-1 transition-all"
              >
                <Coffee className="w-4 h-4" />
                <span>{breakfastOrder ? "Alterar ou Agendar Outros Dias" : "Personalizar Cardápio & Horário do Café"}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}/minha-reserva/${reservation.code || code}/cafe`
                  navigator.clipboard.writeText(url)
                  alert("Link exclusivo do café da manhã copiado para a área de transferência!")
                }}
                className="h-11 px-4 rounded-2xl border-amber-200 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs shrink-0"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                <span>Copiar Link do Café</span>
              </Button>
            </div>
          </Card>
        )}

        {/* ── 4. Card: Rede Wi-Fi ──────────────────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-black text-sm">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">Rede Wi-Fi</h2>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
              ✓ Liberado
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Rede Wi-Fi (SSID)</span>
                <span className="font-bold text-slate-900 text-sm">{wifiNetwork}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopySsid}
                className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 hover:bg-white text-slate-700 flex items-center gap-1.5"
              >
                {copiedSsid ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                <span>{copiedSsid ? "Copiada!" : "Copiar"}</span>
              </Button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Senha de Acesso</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{wifiPassword}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyWifi}
                className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 hover:bg-white text-slate-700 flex items-center gap-1.5"
              >
                {copiedWifi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                <span>{copiedWifi ? "Copiada!" : "Copiar"}</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* ── 5. Card: Estacionamento & Garagem Privativa ────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-black text-sm">
                <Car className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">Garagem Coberta Privativa</h2>
                <span className="text-xs text-slate-500">Vaga demarcada e portão eletrônico com segurança 24h</span>
              </div>
            </div>
            <Badge variant="outline" className={reservation.vehicle?.plate ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold" : "bg-slate-50 text-slate-500 border-slate-200 text-[10px]"}>
              {reservation.vehicle?.plate ? "✓ Vaga Autorizada" : "1 Vaga Inclusa"}
            </Badge>
          </div>

          {portalCarSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>✓ Veículo salvo e autorizado na portaria do condomínio com sucesso!</span>
            </div>
          )}

          {reservation.vehicle?.plate && !portalCarEditing ? (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Veículo Liberado na Portaria</span>
                <span className="text-base font-black font-mono text-slate-900 tracking-wider">
                  {reservation.vehicle.plate}
                </span>
                <span className="text-xs text-slate-500 block">
                  {reservation.vehicle.brand} {reservation.vehicle.model} {reservation.vehicle.color ? `• ${reservation.vehicle.color}` : ""}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPortalPlate(reservation.vehicle?.plate || "")
                  setPortalBrand(reservation.vehicle?.brand || "")
                  setPortalModel(reservation.vehicle?.model || "")
                  setPortalColor(reservation.vehicle?.color || "")
                  setPortalCarEditing(true)
                }}
                className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-white rounded-xl"
              >
                Alterar Carro
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveVehicle} className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe a placa do seu veículo para que a portaria do Edifício Soho libere a sua entrada na garagem:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Placa do Veículo *</Label>
                  <Input
                    value={portalPlate}
                    onChange={e => setPortalPlate(e.target.value.toUpperCase())}
                    required
                    placeholder="ABC1D23"
                    className="bg-white border-slate-200 text-slate-900 font-mono font-bold uppercase text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-700 text-[11px]">Modelo do Carro</Label>
                  <Input
                    value={portalModel}
                    onChange={e => setPortalModel(e.target.value)}
                    placeholder="Ex: Corolla, Civic"
                    className="bg-white border-slate-200 text-slate-900 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-700 text-[11px]">Marca</Label>
                  <Input
                    value={portalBrand}
                    onChange={e => setPortalBrand(e.target.value)}
                    placeholder="Ex: Toyota"
                    className="bg-white border-slate-200 text-slate-900 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-700 text-[11px]">Cor</Label>
                  <Input
                    value={portalColor}
                    onChange={e => setPortalColor(e.target.value)}
                    placeholder="Ex: Prata"
                    className="bg-white border-slate-200 text-slate-900 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {portalCarEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPortalCarEditing(false)}
                    className="border-slate-200 text-slate-600 text-xs rounded-xl"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={savingCar}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl h-10"
                >
                  {savingCar ? "Salvando..." : "Salvar e Autorizar Garagem"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* ── 6. Card: Adicionar ao Calendário ────────────────────────────── */}
        <AddToCalendar
          reservation={{
            id: reservation.id || reservation.code,
            reservationCode: reservation.code,
            guestName: guestName,
            guestEmail: reservation.guestEmail,
            guestPhone: reservation.guestPhone,
            flatNumber: reservation.flatNumber,
            flatName: reservation.roomCategory,
            checkinDate: reservation.checkinDate,
            checkoutDate: reservation.checkoutDate,
            numGuests: reservation.guestCount || 2,
            accessCode: accessCode,
            manageUrl: `https://corpflats.onrender.com/minha-reserva/${reservation.code}`
          }}
        />

        {/* Script JSON-LD Schema.org LodgingReservation para Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateLodgingJsonLd({
              id: reservation.id || reservation.code,
              reservationCode: reservation.code,
              guestName: guestName,
              guestEmail: reservation.guestEmail,
              guestPhone: reservation.guestPhone,
              flatNumber: reservation.flatNumber,
              checkinDate: reservation.checkinDate,
              checkoutDate: reservation.checkoutDate,
              numGuests: reservation.guestCount || 2,
              manageUrl: `https://corpflats.onrender.com/minha-reserva/${reservation.code}`
            }))
          }}
        />

        {/* ── 7. Card: Localização & Como Chegar ──────────────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-black text-sm">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">Localização & Como Chegar</h2>
                <span className="text-xs text-slate-500">Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ</span>
              </div>
            </div>
            <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-bold">
              Soho Residence Service
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={data?.googleMapsUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <MapPin className="w-4 h-4" />
              <span>Abrir no Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>

            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(data?.hotelAddress || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ")}`}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Navigation className="w-4 h-4 text-sky-400" />
              <span>Abrir no Waze</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </Card>

        {/* ── 8. Card: Regras de Convivência & Contrato ───────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Regras dos Flats & Contrato</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setTermsModalTab("rules"); setTermsModalOpen(true); }}
                className="text-xs bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                🏡 Regras da Casa
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setTermsModalTab("contract"); setTermsModalOpen(true); }}
                className="text-xs bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                📜 Contrato Completo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-600">
            <div className="p-3 bg-rose-50/70 border border-rose-200/70 rounded-2xl">
              <span className="font-bold text-rose-900 block mb-1">🚭 100% Não Fumante</span>
              <span className="text-rose-800">Proibido fumar nos quartos e sacadas. Sujeito a taxa de higienização.</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="font-bold text-slate-900 block mb-1">🐾 Pet de Pequeno Porte</span>
              <span>Até 10 kg, taxa fixa, transporte pelo elevador de serviço e no colo.</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="font-bold text-slate-900 block mb-1">👥 Capacidade Máxima</span>
              <span>
                {reservation.guestCount || 1} {reservation.guestCount === 1 ? "pessoa autorizada (conforme contratado)" : "pessoas autorizadas (conforme contratado)"}.
              </span>
            </div>
          </div>
        </Card>

        {/* ── 9. Card: Comprovante & Detalhes do Pagamento ────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 font-bold text-lg">💰</span>
              <h2 className="text-base font-bold text-slate-900">Comprovante de Pagamento</h2>
            </div>
            <Badge variant="outline" className={isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold" : "bg-amber-50 text-amber-700 border-amber-200 text-xs font-bold"}>
              {isPaid ? "✓ Pago" : "Aguardando Confirmação"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-slate-400 text-[11px] block font-medium">Forma de Liquidação</span>
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                {isOta 
                  ? (channelLower.includes("booking") ? "🌐 Booking.com" : "🔴 Airbnb")
                  : (reservation.pixTxId 
                      ? "⚡ PIX Instantâneo (Banco Inter)" 
                      : (reservation.mpPaymentId 
                          ? "💳 Cartão de Crédito" 
                          : (channelLower.includes("whatsapp") ? "💬 WhatsApp / CorpFlats" : "PIX Oficial")))}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-slate-400 text-[11px] block font-medium">{hasAmount ? "Valor Total" : "Status"}</span>
              <span className="text-base font-black text-emerald-600">
                {hasAmount 
                  ? `R$ ${paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                  : (isPaid ? "Pago ✓" : "Pendente")}
              </span>
            </div>
          </div>
        </Card>

        {/* ── 10. Card: Política de Cancelamento & Estorno ────────────────── */}
        {(() => {
          const cancelPol = calculateCancellationPolicy(
            reservation.createdAt || reservation.checkinDate,
            reservation.checkinDate,
            Number(reservation.paidAmount || reservation.totalAmount || 0)
          )
          const isCancelled = reservation.status === "cancelada" || reservation.status === "CANCELLED"

          return (
            <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-sky-600" />
                  <h2 className="text-base font-bold text-slate-900">Política de Cancelamento & Estorno</h2>
                </div>
                <Badge variant="outline" className={isCancelled ? "bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold" : cancelPol.policyType === "flexivel" ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold" : "bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold"}>
                  {isCancelled ? "✕ Reserva Cancelada" : cancelPol.badgeText}
                </Badge>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 text-xs">
                {isCancelled ? (
                  <div className="space-y-2">
                    <p className="text-rose-600 font-bold">Esta reserva foi cancelada.</p>
                    <p className="text-slate-500 text-[11px]">
                      {reservation.refundAmount > 0 
                        ? `Estorno de R$ ${Number(reservation.refundAmount).toFixed(2)} processado com sucesso.`
                        : "Cancelamento efetuado sem estorno conforme as políticas contratadas."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-slate-600 font-medium leading-relaxed">
                        {cancelPol.explanation}
                      </p>
                      {cancelPol.isEligibleForRefund && (
                        <p className="text-emerald-600 font-bold text-[11px]">
                          ✓ Elegível a 100% de estorno integral (R$ {Number(reservation.paidAmount || reservation.totalAmount || 0).toFixed(2)})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {["whatsapp", "site", "site_direto", "direto", "balcao"].includes((reservation.channel || "").toLowerCase()) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleOpenModifyModal}
                          className="text-xs font-bold rounded-xl h-9 px-3.5 border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-800 flex items-center gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5 text-sky-600" />
                          <span>Modificar Reserva</span>
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setCancelModalOpen(true)}
                        className="text-xs font-bold rounded-xl h-9 px-4"
                      >
                        Cancelar Reserva
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )
        })()}

        {/* ── Footer WhatsApp Support ─────────────────────────────────────── */}
        <div className="text-center pt-4 pb-8 space-y-2">
          <p className="text-xs text-slate-500">Dúvidas ou solicitações especiais durante sua estadia?</p>
          <a 
            href={whatsappUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Falar com o Atendimento CorpFlats no WhatsApp • {formatPhoneDisplay(adminWhatsApp)}</span>
          </a>
        </div>

      </main>

      {/* ── Modal: Modificar Reserva ────────────────────────────────────── */}
      <Dialog open={modifyModalOpen} onOpenChange={setModifyModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white border border-slate-200 text-slate-900 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-600" />
              Modificar Estadia ou Hóspedes
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Altere o período da estadia ou a quantidade de pessoas para o Flat {reservation?.flatNumber}.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            if (!reservation) return null

            const origNights = reservation.checkinDate && reservation.checkoutDate 
              ? Math.max(1, differenceInDays(parseISO(reservation.checkoutDate), parseISO(reservation.checkinDate))) 
              : 1
            const newNights = modCheckinDate && modCheckoutDate 
              ? differenceInDays(parseISO(modCheckoutDate), parseISO(modCheckinDate)) 
              : origNights
            const origGuests = reservation.guestCount || 1
            const dailyRate = Number(reservation.dailyRate) || (origNights > 0 ? (Number(reservation.totalAmount || 0) / origNights) : 160)

            // Limite de 24h antes do check-in original (14:00 do dia anterior ao check-in)
            const checkinDateObj = reservation.checkinDate ? parseISO(reservation.checkinDate) : new Date()
            const officialCheckinTime = new Date(checkinDateObj)
            officialCheckinTime.setHours(14, 0, 0, 0)
            const cutoff24h = new Date(officialCheckinTime.getTime() - 24 * 3600 * 1000)
            const isUnder24h = new Date().getTime() >= cutoff24h.getTime()

            const isReducingNights = newNights < origNights
            const isReducingGuests = modGuestCount < origGuests
            const isIncreasingNights = newNights > origNights
            const isIncreasingGuests = modGuestCount > origGuests
            const nightsDiff = newNights - origNights
            const addAmount = isIncreasingNights ? nightsDiff * dailyRate : 0
            const refundAmountEstimate = isReducingNights && !isUnder24h ? (origNights - newNights) * dailyRate : 0

            return (
              <form onSubmit={handleConfirmModify} className="space-y-4 py-2 text-xs">
                {modifyError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{modifyError}</span>
                  </div>
                )}

                {modifySuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{modifySuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Entrada (Check-in)</Label>
                    <Input
                      type="date"
                      value={modCheckinDate}
                      onChange={e => setModCheckinDate(e.target.value)}
                      required
                      className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Saída (Check-out)</Label>
                    <Input
                      type="date"
                      value={modCheckoutDate}
                      onChange={e => setModCheckoutDate(e.target.value)}
                      required
                      min={modCheckinDate || undefined}
                      className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Quantidade de Hóspedes</Label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map(num => (
                      <Button
                        key={num}
                        type="button"
                        variant={modGuestCount === num ? "default" : "outline"}
                        onClick={() => setModGuestCount(num)}
                        className={`flex-1 h-9 rounded-xl text-xs font-bold ${
                          modGuestCount === num 
                            ? "bg-slate-900 text-white shadow-xs" 
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 mr-1" />
                        {num} {num === 1 ? "Pessoa" : "Pessoas"}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Resumo Dinâmico das Alterações */}
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Diárias:</span>
                    <span className="font-bold text-slate-900">
                      {origNights} {origNights === 1 ? "diária" : "diárias"} → {newNights} {newNights === 1 ? "diária" : "diárias"}
                      {nightsDiff !== 0 && (
                        <span className={`ml-1 font-bold ${nightsDiff > 0 ? "text-sky-600" : "text-amber-600"}`}>
                          ({nightsDiff > 0 ? `+${nightsDiff}` : nightsDiff})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Hóspedes:</span>
                    <span className="font-bold text-slate-900">
                      {origGuests} {origGuests === 1 ? "pessoa" : "pessoas"} → {modGuestCount} {modGuestCount === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </div>
                </div>

                {/* ALERTA DE MENOS DE 24H CONFORME REGRA E CONTRATO */}
                {(isReducingNights || isReducingGuests) && isUnder24h && (
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <strong className="block text-amber-950 font-bold text-xs">
                          Aviso de Política de Alteração (Menos de 24h para o início)
                        </strong>
                        <p className="text-[11.5px] leading-relaxed text-amber-900">
                          Atenção: como faltam menos de 24 horas para o início da sua reserva (limite: 14:00 do dia anterior ao check-in), a diminuição na quantidade de diárias ou de hóspedes <strong>não gerará estorno ou reembolso</strong> de valores, conforme as condições do{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setTermsModalTab("contract")
                              setTermsModalOpen(true)
                            }}
                            className="font-bold underline text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-0.5 cursor-pointer bg-amber-100/80 hover:bg-amber-100 px-1 py-0.5 rounded transition-colors"
                          >
                            Contrato de Hospedagem (Cláusula 5)
                          </button>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Informativo de acréscimo de noites */}
                {isIncreasingNights && (
                  <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>Acréscimo de {nightsDiff} {nightsDiff === 1 ? "diária" : "diárias"}:</span>
                      <span className="text-sm font-black text-sky-950">+ R$ {addAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[11px] text-sky-700">
                      O valor adicional poderá ser liquidado via PIX ou diretamente na recepção.
                    </p>
                  </div>
                )}

                {/* Informativo de redução com mais de 24h */}
                {isReducingNights && !isUnder24h && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>Redução com mais de 24h de antecedência:</span>
                      <span className="text-sm font-black text-emerald-950">Estorno elegível: R$ {refundAmountEstimate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      O estorno proporcional será creditado na mesma modalidade de liquidação original.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-slate-700 text-[11px]">Motivo da alteração (opcional):</Label>
                  <Input
                    value={modReason}
                    onChange={e => setModReason(e.target.value)}
                    placeholder="Ex: Ajuste de compromisso de trabalho..."
                    className="bg-white border-slate-200 text-xs h-9 rounded-xl text-slate-900"
                  />
                </div>

                <DialogFooter className="gap-2 sm:gap-0 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModifyModalOpen(false)}
                    className="rounded-xl border-slate-200 text-slate-700"
                  >
                    Fechar
                  </Button>
                  <Button
                    type="submit"
                    disabled={modifying || newNights <= 0}
                    className="font-bold text-xs rounded-xl bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {modifying ? "Processando Alteração..." : "Confirmar Modificação"}
                  </Button>
                </DialogFooter>
              </form>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmação de Cancelamento ──────────────────────────── */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 text-slate-900 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Cancelamento da Reserva
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Revise o valor do estorno calculado pelo sistema de acordo com a política vigente.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const cancelPol = calculateCancellationPolicy(
              reservation.createdAt || reservation.checkinDate,
              reservation.checkinDate,
              Number(reservation.paidAmount || reservation.totalAmount || 0)
            )

            return (
              <div className="space-y-4 py-2">
                <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                  cancelPol.isEligibleForRefund 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}>
                  <div className="flex items-center justify-between font-bold text-sm">
                    <span>Reembolso Estimado:</span>
                    <span className="text-base font-black">
                      {cancelPol.isEligibleForRefund 
                        ? `R$ ${Number(reservation.paidAmount || reservation.totalAmount || 0).toFixed(2)} (100%)` 
                        : "R$ 0,00 (Sem Reembolso)"}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    {cancelPol.explanation}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Motivo do cancelamento (opcional):</Label>
                  <Input
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="Ex: Imprevisto de trabalho, remarcação..."
                    className="bg-white border-slate-200 text-xs h-9 rounded-xl text-slate-900"
                  />
                </div>

                <DialogFooter className="gap-2 sm:gap-0 pt-2">
                  <Button variant="outline" onClick={() => setCancelModalOpen(false)} className="rounded-xl border-slate-200 text-slate-700">
                    Manter Reserva
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={cancelling}
                    onClick={async () => {
                      setCancelling(true)
                      try {
                        const res = await fetch(`/api/pms/guest-portal/${code}/cancel`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reason: cancelReason })
                        })
                        const json = await res.json()
                        if (res.ok) {
                          setCancelModalOpen(false)
                          fetchPortalData()
                        } else {
                          alert(json.error || "Erro ao cancelar")
                        }
                      } catch {
                        alert("Erro de conexão com o servidor")
                      } finally {
                        setCancelling(false)
                      }
                    }}
                    className="font-bold text-xs rounded-xl"
                  >
                    {cancelling ? "Cancelando..." : "Sim, Cancelar Agora"}
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Regras da Casa & Contrato ────────────────────────────── */}
      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="w-5 h-5 text-sky-600" />
              Regras dos Flats & Contrato de Hospedagem
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Termos aceitos no momento da reserva para a garantia de uma excelente estadia.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                termsModalTab === "rules"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900"
              }`}
            >
              🏡 1. Regras do Imóvel e Convivência
            </button>
            <button
              type="button"
              onClick={() => setTermsModalTab("contract")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                termsModalTab === "contract"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900"
              }`}
            >
              📜 2. Termos e Condições Contratuais
            </button>
          </div>

          <div className="py-3 text-xs leading-relaxed text-slate-600 whitespace-pre-line bg-slate-50 p-4 rounded-2xl border border-slate-100 font-sans max-h-96 overflow-y-auto">
            {termsModalTab === "rules" ? (
              data?.houseRules || termsAndRules
            ) : (
              data?.contractTerms || termsAndRules
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setTermsModalOpen(false)} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl h-10">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
