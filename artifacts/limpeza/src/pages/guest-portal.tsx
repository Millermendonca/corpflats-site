import { useState, useEffect, useMemo } from "react"
import { useRoute, useLocation } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { 
  Building2, Star, RotateCcw, Calendar, Users, User, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Wifi, HelpCircle, Check, Copy, Phone, UserCheck, ShieldAlert,
  MapPin, Navigation, ExternalLink, Car, ArrowLeft, Search,
  CreditCard, QrCode, RefreshCw, AlertCircle, DoorOpen, MoreVertical,
  Download, Printer, PenTool, Refrigerator
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

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
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
  const [searchCode, setSearchCode] = useState(rawCode)
  const [searchQuery, setSearchQuery] = useState(rawCode)
  const [code, setCode] = useState(rawCode)

  const getInitialGuestIndex = () => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      const g = sp.get("guest") || sp.get("guestIndex") || sp.get("hospede")
      if (g && !isNaN(Number(g))) return Number(g)
      const targetCode = rawCode || ""
      const saved = sessionStorage.getItem(`cf_active_guest_${targetCode}`) || localStorage.getItem(`cf_active_guest_${targetCode}`)
      if (saved && !isNaN(Number(saved))) return Number(saved)
    }
    return 1
  }

  const [activeGuestIndex, setActiveGuestIndex] = useState<number>(getInitialGuestIndex)
  
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(Boolean(rawCode))
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedWifi, setCopiedWifi] = useState(false)
  const [copiedSsid, setCopiedSsid] = useState(false)
  const [copiedPix, setCopiedPix] = useState(false)
  const [copiedCafeLink, setCopiedCafeLink] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [paymentMethodTab, setPaymentMethodTab] = useState<"pix" | "card">("pix")
  const [changingMethod, setChangingMethod] = useState(false)
  const [paymentSuccessNotice, setPaymentSuccessNotice] = useState(false)
  const [paymentPendingFeedback, setPaymentPendingFeedback] = useState(false)
  const [sendingWaVoucher, setSendingWaVoucher] = useState(false)
  const [waVoucherSent, setWaVoucherSent] = useState(false)
  
  // Modals & Action States
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [copiedReceipt, setCopiedReceipt] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsModalTab, setTermsModalTab] = useState<"rules" | "contract">("rules")
  const [claimingEarly, setClaimingEarly] = useState(false)
  const [reminderSaved, setReminderSaved] = useState(false)

  // ── Modificar Reserva Multi-Step States (M3) ────────────────────────
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modStep, setModStep] = useState<"preview" | "checkout" | "success">("preview")
  const [modCheckinDate, setModCheckinDate] = useState("")
  const [modCheckoutDate, setModCheckoutDate] = useState("")
  const [modGuestCount, setModGuestCount] = useState(1)
  const [modReason, setModReason] = useState("")

  // Etapa 1: Simulação & Preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<any | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Etapa 2: Checkout & Hold
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutData, setCheckoutData] = useState<any | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [modPaymentMethod, setModPaymentMethod] = useState<"pix" | "card">("pix")
  const [modCopiedPix, setModCopiedPix] = useState(false)
  const [modTimeRemaining, setModTimeRemaining] = useState("30:00")
  const [modPollingActive, setModPollingActive] = useState(false)
  const [cancellingHold, setCancellingHold] = useState(false)

  // Etapa 3: Sucesso & Re-assinatura
  const [modifySuccessInfo, setModifySuccessInfo] = useState<{
    message: string
    newCheckinDate: string
    newCheckoutDate: string
    newFlatNumber: string
    needsReSignature: boolean
    reSignatureUrl: string
  } | null>(null)

  // Contagem regressiva do Hold Provisório de 30 minutos
  useEffect(() => {
    if (modStep !== "checkout" || !checkoutData?.expiresAt || !modifyModalOpen) return

    const updateTimer = () => {
      const diff = new Date(checkoutData.expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setModTimeRemaining("00:00")
        setCheckoutError("O prazo de 30 minutos para pagamento desta alteração expirou. Por favor, reinicie a simulação.")
        setModPollingActive(false)
      } else {
        const totalSecs = Math.floor(diff / 1000)
        const mins = Math.floor(totalSecs / 60)
        const secs = totalSecs % 60
        setModTimeRemaining(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [modStep, checkoutData?.expiresAt, modifyModalOpen])

  // Polling em segundo plano para detecção automática de pagamento (/modify-status)
  useEffect(() => {
    if (!modPollingActive || !checkoutData?.pendingId || !modifyModalOpen) return

    const pendingId = checkoutData.pendingId
    const currentCode = data?.reservation?.code || code

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-status?pendingId=${encodeURIComponent(pendingId)}`)
        if (!res.ok) return
        const json = await res.json()

        if (json.paid || json.status === "paid" || json.committed) {
          clearInterval(pollInterval)
          setModPollingActive(false)
          setModifySuccessInfo({
            message: json.message || "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
            newCheckinDate: json.newCheckinDate || checkoutData.newDates?.checkinDate,
            newCheckoutDate: json.newCheckoutDate || checkoutData.newDates?.checkoutDate,
            newFlatNumber: json.flatNumber || checkoutData.newFlatNumber || data?.reservation?.flatNumber,
            needsReSignature: Boolean(json.needsReSignature),
            reSignatureUrl: json.reSignatureUrl || `/pre-checkin/${encodeURIComponent(currentCode)}?resign=1`
          })
          setModStep("success")
          fetchPortalData(currentCode)
        } else if (json.status === "expired") {
          clearInterval(pollInterval)
          setModPollingActive(false)
          setCheckoutError("O prazo de 30 minutos para pagamento expirou. Por favor, reinicie a alteração.")
        }
      } catch (err) {
        console.warn("[Modify Status Polling] Erro:", err)
      }
    }, 2500)

    return () => clearInterval(pollInterval)
  }, [modPollingActive, checkoutData?.pendingId, modifyModalOpen, data?.reservation?.code, code])


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

  // Previsão de Chegada no Dia do Check-in
  const [selectedArrivalTime, setSelectedArrivalTime] = useState("")
  const [customArrivalTime, setCustomArrivalTime] = useState("")
  const [savingArrival, setSavingArrival] = useState(false)
  const [editingArrival, setEditingArrival] = useState(false)
  const [arrivalSuccessNotice, setArrivalSuccessNotice] = useState(false)
  const [selfCheckinNotice, setSelfCheckinNotice] = useState(false)
  const [confirmingSelfCheckin, setConfirmingSelfCheckin] = useState(false)
  const [copiedGuestLinkIndex, setCopiedGuestLinkIndex] = useState<number | null>(null)

  const handleSaveEstimatedArrival = async () => {
    const timeVal = selectedArrivalTime || customArrivalTime.trim()
    if (!timeVal || !code) return
    setSavingArrival(true)
    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code)}/estimated-arrival`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedArrivalTime: timeVal })
      })
      if (res.ok) {
        setArrivalSuccessNotice(true)
        setEditingArrival(false)
        fetchPortalData()
        setTimeout(() => setArrivalSuccessNotice(false), 5000)
      }
    } catch {}
    finally {
      setSavingArrival(false)
    }
  }

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
      } catch {}
      setError(null)
    } catch (e: any) {
      setError(e.message || "Erro ao carregar dados da reserva.")
    } finally {
      setLoading(false)
    }
  }

  // Sincronização inteligente de hóspede ativo (URL query, storage ou correspondência de nome)
  useEffect(() => {
    if (!data?.reservation) return
    const res = data.reservation
    const guests = res.guests
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      const gParam = sp.get("guest") || sp.get("guestIndex") || sp.get("hospede")
      if (gParam && !isNaN(Number(gParam))) {
        setActiveGuestIndex(Number(gParam))
        return
      }
      const targetCode = res.code || code || ""
      const savedIndex = sessionStorage.getItem(`cf_active_guest_${targetCode}`) || 
                         localStorage.getItem(`cf_active_guest_${targetCode}`)
      if (savedIndex && !isNaN(Number(savedIndex))) {
        setActiveGuestIndex(Number(savedIndex))
        return
      }
      if (Array.isArray(guests) && guests.length > 1) {
        const savedName = (localStorage.getItem("corpflats_guest_name") || "").toLowerCase().trim()
        if (savedName) {
          const matched = guests.find((g: any) => {
            const n = (g.name || "").toLowerCase().trim()
            return n && (n === savedName || n.includes(savedName) || savedName.includes(n))
          })
          if (matched && matched.index) {
            setActiveGuestIndex(Number(matched.index))
          }
        }
      }
    }
  }, [data, code])

  useEffect(() => {
    if (rawCode) {
      setCode(rawCode)
      setSearchQuery(rawCode)
      fetchPortalData(rawCode)

      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search)
        if (sp.get("self_checkin") === "success" || sp.get("action") === "self_checkin") {
          setSelfCheckinNotice(true)
          if (sp.get("action") === "self_checkin") {
            fetch(`/api/pms/guest-portal/${encodeURIComponent(rawCode)}/self-checkin`, { method: "POST" })
              .then(res => res.json())
              .then(() => fetchPortalData(rawCode))
              .catch(() => {})
          }
          setTimeout(() => setSelfCheckinNotice(false), 10000)
        }
      }
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

  // Abertura do Modal e Inicialização
  const handleOpenModifyModal = () => {
    if (!data?.reservation) return
    const r = data.reservation
    setModStep("preview")
    setModCheckinDate(r.checkinDate || "")
    setModCheckoutDate(r.checkoutDate || "")
    setModGuestCount(r.guestCount || 1)
    setModReason("")
    setPreviewData(null)
    setPreviewError(null)
    setCheckoutData(null)
    setCheckoutError(null)
    setModPollingActive(false)
    setModifySuccessInfo(null)
    setModifyModalOpen(true)

    // Dispara a primeira simulação com os dados atuais
    if (r.checkinDate && r.checkoutDate) {
      handleRunPreview(r.checkinDate, r.checkoutDate, r.guestCount || 1)
    }
  }

  // Executa Simulação no /modify-preview
  const handleRunPreview = async (checkin = modCheckinDate, checkout = modCheckoutDate, guests = modGuestCount) => {
    if (!data?.reservation || !checkin || !checkout) return
    const currentCode = data.reservation.code || code

    if (checkout <= checkin) {
      setPreviewError("A data de check-out deve ser posterior à data de check-in.")
      setPreviewData(null)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: checkin,
          newCheckoutDate: checkout,
          newGuestCount: guests,
          reason: modReason
        })
      })

      const json = await res.json()

      if (res.status === 409) {
        setPreviewData({ available: false, conflictMessage: json.conflictMessage || json.message })
        setPreviewError(json.conflictMessage || json.message)
      } else if (!res.ok) {
        setPreviewError(json.message || json.error || "Erro ao consultar disponibilidade.")
        setPreviewData(null)
      } else {
        setPreviewData(json)
        setPreviewError(null)
      }
    } catch (err: any) {
      setPreviewError(err.message || "Erro de conexão com o servidor.")
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Avançar para Etapa 2 (Checkout com Hold de 30 Minutos)
  const handleProceedToCheckout = async () => {
    if (!data?.reservation || !previewData?.available) return
    const currentCode = data.reservation.code || code

    setCheckoutLoading(true)
    setCheckoutError(null)

    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          paymentMethod: modPaymentMethod === "card" ? "credit_card" : "pix",
          reason: modReason
        })
      })

      const json = await res.json()

      if (!res.ok) {
        setCheckoutError(json.message || json.error || "Erro ao gerar cobrança de alteração.")
      } else {
        setCheckoutData(json)
        setModStep("checkout")
        setModPollingActive(true)
      }
    } catch (err: any) {
      setCheckoutError(err.message || "Erro ao conectar com o servidor.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Cancelar Hold Provisório e Restaurar Datas Originais
  const handleCancelHold = async () => {
    if (!data?.reservation || !checkoutData?.pendingId) return
    const currentCode = data.reservation.code || code

    setCancellingHold(true)
    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: checkoutData.pendingId })
      })
      if (res.ok) {
        setModPollingActive(false)
        setCheckoutData(null)
        setModifyModalOpen(false)
        fetchPortalData(currentCode)
      }
    } catch (err) {
      console.error("Erro ao cancelar hold:", err)
    } finally {
      setCancellingHold(false)
    }
  }

  // Confirmar Alteração com Custo Zero (Sem Pagamento)
  const handleConfirmZeroCostModify = async () => {
    if (!data?.reservation) return
    const currentCode = data.reservation.code || code

    setCheckoutLoading(true)
    setPreviewError(null)

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
        setModifySuccessInfo({
          message: json.message || "Reserva modificada com sucesso!",
          newCheckinDate: json.newCheckinDate || modCheckinDate,
          newCheckoutDate: json.newCheckoutDate || modCheckoutDate,
          newFlatNumber: json.reservation?.flatNumber || data.reservation.flatNumber,
          needsReSignature: Boolean(json.needsReSignature),
          reSignatureUrl: json.reSignatureUrl || `/pre-checkin/${encodeURIComponent(currentCode)}?resign=1`
        })
        setModStep("success")
        fetchPortalData(currentCode)
      } else {
        setPreviewError(json.error || json.message || "Não foi possível confirmar a alteração.")
      }
    } catch (err: any) {
      setPreviewError(err.message || "Erro de conexão com o servidor.")
    } finally {
      setCheckoutLoading(false)
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
  const rawPayMethod = String(reservation?.paymentMethod || "").toLowerCase()
  const isCardPayment = Boolean(
    rawPayMethod.includes("cartao") ||
    rawPayMethod.includes("cartão") ||
    rawPayMethod.includes("card") ||
    rawPayMethod.includes("credito") ||
    rawPayMethod.includes("crédito") ||
    rawPayMethod.includes("debito") ||
    rawPayMethod.includes("débito") ||
    rawPayMethod.includes("mercadopago") ||
    rawPayMethod.includes("infinite") ||
    (reservation?.mpPaymentId && !reservation?.pixEndToEndId)
  )
  const isDebitCard = rawPayMethod.includes("debito") || rawPayMethod.includes("débito") || rawPayMethod.includes("debit")
  const isCancelled = Boolean(
    reservation?.status === "cancelada" || 
    reservation?.status === "cancelled" || 
    reservation?.status === "CANCELLED" || 
    reservation?.isCancelled
  )
  const isPaid = !isCancelled && Boolean(
    isOta || 
    reservation?.isPaid ||
    reservation?.paymentStatus === "pago_total" || 
    reservation?.paymentStatus === "pago" || 
    (Number(reservation?.paidAmount) >= Number(reservation?.totalAmount) && Number(reservation?.totalAmount) > 0)
  )

  const hasEnteredFlat = Boolean(
    reservation?.guestSelfCheckin ||
    reservation?.actualCheckinAt ||
    reservation?.status === "in_house" ||
    (reservation?.status === "checkin" && reservation?.guestSelfCheckin)
  )

  const guestsList: any[] = useMemo(() => {
    if (Array.isArray(reservation?.guests) && reservation.guests.length > 0) {
      return reservation.guests
    }
    if (reservation?.guestName) {
      return [
        {
          index: 1,
          name: reservation.guestName,
          phone: reservation.guestPhone || "",
          email: reservation.guestEmail || "",
          hasCompletedCheckin: Boolean(reservation.fnhrCompleted || reservation.preCheckinCompleted)
        }
      ]
    }
    return []
  }, [reservation])

  const currentGuest = useMemo(() => {
    return guestsList.find((g: any) => Number(g.index) === Number(activeGuestIndex)) 
      || guestsList[activeGuestIndex - 1] 
      || guestsList[0] 
      || {}
  }, [guestsList, activeGuestIndex])

  const isCurrentGuestTitular = Number(currentGuest?.index || activeGuestIndex) === 1

  // Avaliação estritamente individual e coletiva da re-assinatura
  const reservationNeedsReSignature = Boolean(
    reservation?.needsReSignature ||
    (Array.isArray(guestsList) && guestsList.some((g: any) => Boolean(g.needsReSignature)))
  )

  const currentGuestNeedsReSignature = Boolean(
    currentGuest?.needsReSignature !== undefined
      ? currentGuest.needsReSignature
      : (reservationNeedsReSignature && !currentGuest?.hasCompletedCheckin)
  )

  // Status de re-assinatura por grupo de ocupantes
  const pendingReSignGuests = useMemo(() => {
    return guestsList.filter((g: any) => Boolean(g.needsReSignature))
  }, [guestsList])

  const completedReSignGuests = useMemo(() => {
    return guestsList.filter((g: any) => Boolean(g.hasCompletedCheckin && !g.needsReSignature))
  }, [guestsList])

  const otherPendingReSignGuests = useMemo(() => {
    return guestsList.filter((g: any) => Number(g.index) !== Number(activeGuestIndex) && Boolean(g.needsReSignature))
  }, [guestsList, activeGuestIndex])

  // Preserva needsReSignature apontando para a obrigação do hóspede atual
  const needsReSignature = currentGuestNeedsReSignature

  const reSignatureReason = reservation?.reSignatureReason || 
    "Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio."

  const isCurrentGuestPreCheckinDone = !currentGuestNeedsReSignature && Boolean(
    currentGuest?.hasCompletedCheckin ||
    currentGuest?.status === "CHECKED_IN" ||
    currentGuest?.fnrhSignedAt ||
    currentGuest?.signatureUrl ||
    (guestsList.length === 1 && (
      reservation?.fnhrCompleted ||
      reservation?.preCheckinCompleted ||
      reservation?.hasPreCheckin
    ))
  )

  const isPreCheckinDone = guestsList.length > 1
    ? isCurrentGuestPreCheckinDone
    : (!currentGuestNeedsReSignature && Boolean(
        data?.preCheckinStatus?.completed ||
        data?.preCheckinStatus?.isFullyCompleted ||
        reservation?.fnhrCompleted ||
        reservation?.preCheckinCompleted ||
        reservation?.hasPreCheckin ||
        (Array.isArray(reservation?.guests) && reservation.guests.length > 0 && reservation.guests.some((g: any) => g.hasCompletedCheckin))
      ))

  const getCheckinPath = (readonly = false, targetIdx?: number) => {
    const c = code || reservation?.code || ""
    const idx = targetIdx ?? activeGuestIndex
    const targetG = guestsList.find((g: any) => Number(g.index) === Number(idx)) || (idx === 1 ? currentGuest : null)
    const targetNeedsResign = targetG?.needsReSignature !== undefined
      ? Boolean(targetG.needsReSignature)
      : (Boolean(reservationNeedsReSignature) && !targetG?.hasCompletedCheckin)
    const gParam = idx > 1 ? `guest=${idx}` : ""
    const roParam = readonly ? "readonly=true" : ""
    const resignParam = targetNeedsResign ? "resign=1" : ""
    const parts = [gParam, roParam, resignParam].filter(Boolean).join("&")
    return `/pre-checkin/${c}${parts ? `?${parts}` : ""}`
  }

  // Polling automático de status de pagamento a cada 6 segundos quando pendente
  useEffect(() => {
    if (!reservation?.code || isPaid || isCancelled) return
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
                paymentMethod: json.paymentMethod || (json.mpPaymentId ? "cartao_credito" : prev.reservation.paymentMethod),
                paidAmount: json.paidAmount,
                paidAt: json.paidAt || prev.reservation.paidAt || new Date().toISOString(),
                pixTxId: (json.paymentMethod === "cartao_credito" || json.mpPaymentId) ? null : (json.pixTxId || prev.reservation.pixTxId),
                pixEndToEndId: json.pixEndToEndId || prev.reservation.pixEndToEndId,
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
    if (isCardPayment) {
      setPaymentMethodTab("card")
    } else {
      setPaymentMethodTab("pix")
    }
  }, [isCardPayment])

  useEffect(() => {
    if (reservation?.pixCopiaECola && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get("action") === "copiar_pix" || sp.get("action") === "pix" || sp.get("pix") === "1" || window.location.hash === "#pix") {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(reservation.pixCopiaECola)
            .then(() => {
              setCopiedPix(true)
              setTimeout(() => setCopiedPix(false), 4000)
            })
            .catch(() => {})
        }
        setTimeout(() => {
          const pixEl = document.getElementById("secao-pix-pagamento")
          if (pixEl) {
            pixEl.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }, 300)
      }
    }
  }, [reservation?.pixCopiaECola])

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
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-8 py-2.5 sm:py-3 shadow-2xs w-full max-w-full">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            <div 
              onClick={() => setLocation("/reservar")}
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs sm:text-base shadow-sm">
                CF
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900">CorpFlats</span>
            </div>

            <a
              href="https://wa.me/5522997124021?text=Ol%C3%A1!%20Gostaria%20de%20ajuda%20para%20localizar%20minha%20reserva."
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-800 text-xs font-bold transition-all shadow-2xs shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp<span className="hidden sm:inline"> Administração</span></span>
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
                Acesse as informações da sua hospedagem, Wi-Fi e Room Service com facilidade e rapidez.
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
                <span>Falar com a Administração</span>
              </a>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const { isFlatClean, flatCleaningStatus, canDoEarlyCheckin, hasEarlyCheckinBenefit, canClaimFreeEarlyCheckin, breakfastOrder, preCheckinStatus, termsAndRules, adminWhatsApp } = data
  const isActivelyCleaning = flatCleaningStatus === "cleaning_now"

  const currentHour = data?.currentHour ?? data?.brasilia?.hour ?? (typeof window !== "undefined" ? new Date().getHours() : 14)
  const isPastOrExact14h = Boolean(data?.isPastOrExact14h ?? (currentHour >= 14))

  const checkinFormatted = reservation.checkinDate ? format(parseISO(reservation.checkinDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const checkoutFormatted = reservation.checkoutDate ? format(parseISO(reservation.checkoutDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const nights = reservation.checkinDate && reservation.checkoutDate ? Math.max(1, differenceInDays(parseISO(reservation.checkoutDate), parseISO(reservation.checkinDate))) : 1

  const guestName = (currentGuest?.name && !currentGuest.name.startsWith("Hóspede ") 
    ? currentGuest.name 
    : (isCurrentGuestTitular ? (reservation.guestName || currentGuest?.name || "Hóspede") : (currentGuest?.name || `Hóspede ${activeGuestIndex}`)))
  const rawAdminPhone = (adminWhatsApp || "5522997124021").replace(/\D/g, "")
  const finalWaNumber = rawAdminPhone.length === 10 || rawAdminPhone.length === 11 ? `55${rawAdminPhone}` : rawAdminPhone
  const whatsappUrl = `https://wa.me/${finalWaNumber}?text=${encodeURIComponent(`Olá! Tenho uma reserva (${reservation.code}) no Flat ${reservation.flatNumber} e gostaria de tirar uma dúvida.`)}`
  const accessCode = isCancelled ? "" : (reservation.doorPassword || reservation.accessCode || "")
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
  const hasAmount = totalAmount > 0 || (!isOta && rawPaidAmount > 0)
  const paidAmount = isPaid ? (totalAmount > 0 ? totalAmount : (isOta ? 0 : rawPaidAmount)) : rawPaidAmount
  const pendingAmount = Math.max(0, totalAmount - paidAmount)

  const handleCopyPix = () => {
    if (!reservation.pixCopiaECola) return
    navigator.clipboard.writeText(reservation.pixCopiaECola)
    setCopiedPix(true)
    setTimeout(() => setCopiedPix(false), 3500)
  }

  const handleCopyCafeLink = () => {
    const url = `${window.location.origin}/minha-reserva/${reservation.code || code}/cafe`
    navigator.clipboard.writeText(url)
    setCopiedCafeLink(true)
    setTimeout(() => setCopiedCafeLink(false), 2500)
  }

  const handleCopyReceipt = () => {
    const methodLabel = isOta
      ? (channelLower.includes("booking") ? "Booking.com (Canal Parceiro)" : "Airbnb (Canal Parceiro)")
      : (isCardPayment
          ? (isDebitCard ? "Cartão de Débito" : (reservation.mpPaymentId ? "Cartão de Crédito (Mercado Pago)" : "Cartão de Crédito"))
          : "PIX Instantâneo (Banco Inter)")
    const txLine = isCardPayment
      ? (reservation.mpPaymentId ? `ID da Transação (Cartão): ${reservation.mpPaymentId}` : "")
      : (reservation.pixEndToEndId ? `EndToEnd ID: ${reservation.pixEndToEndId}` : (reservation.pixTxId ? `TxID: ${reservation.pixTxId}` : ""))
    const text = [
      `📄 RECIBO DE PAGAMENTO • CORPFLATS HOSPEDAGEM`,
      `Localizador: ${reservation.code}`,
      `Hóspede: ${guestName}`,
      `Acomodação: Flat ${reservation.flatNumber}`,
      `Período: ${checkinFormatted} até ${checkoutFormatted} (${nights} diária${nights > 1 ? "s" : ""})`,
      `Forma de Liquidação: ${methodLabel}`,
      `Valor Liquidado: R$ ${paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `Status: PAGO & QUITADO ✓`,
      reservation.paidAt ? `Data do Pagamento: ${format(parseISO(reservation.paidAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : "",
      txLine,
      `CorpFlats • CNPJ 47.964.813/0001-65 • Campos dos Goytacazes - RJ`
    ].filter(Boolean).join("\n")
    navigator.clipboard.writeText(text)
    setCopiedReceipt(true)
    setTimeout(() => setCopiedReceipt(false), 2500)
  }

  const handlePrintReceipt = () => {
    const emissionDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    const paidAtFormatted = reservation?.paidAt 
      ? format(parseISO(reservation.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
      : (isPaid ? format(new Date(), "dd/MM/yyyy", { locale: ptBR }) : "")

    const paymentMethodText = isOta 
      ? (channelLower.includes("booking") ? "Booking.com (Canal Parceiro)" : "Airbnb (Canal Parceiro)")
      : (isCardPayment
          ? (isDebitCard ? "Cartão de Débito" : (reservation?.mpPaymentId ? "Cartão de Crédito (Mercado Pago)" : "Cartão de Crédito"))
          : (reservation?.pixEndToEndId || reservation?.pixTxId 
              ? "PIX Instantâneo Oficial (Banco Inter)" 
              : (channelLower.includes("whatsapp") ? "WhatsApp / CorpFlats" : "PIX Oficial Banco Inter")))

    const receiptHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Comprovante de Quitação - CorpFlats - ${reservation?.code || ""}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background-color: #f1f5f9;
      padding: 24px;
      line-height: 1.4;
      font-size: 13px;
    }
    .print-actions {
      max-width: 720px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-print {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-print:hover {
      background: #1e293b;
    }
    .btn-close {
      background: #e2e8f0;
      color: #334155;
    }
    .btn-close:hover {
      background: #cbd5e1;
    }
    .receipt-container {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 32px 36px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
    }
    .receipt-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #0369a1;
      text-transform: uppercase;
    }
    .brand-subtitle {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: #64748b;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .brand-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 6px;
      line-height: 1.4;
    }
    .receipt-info {
      text-align: right;
    }
    .status-badge {
      display: inline-block;
      background: #ecfdf5;
      color: #047857;
      border: 1.5px solid #10b981;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      padding: 5px 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .receipt-code-label {
      font-size: 10.5px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }
    .receipt-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
    }
    .receipt-date {
      font-size: 10.5px;
      color: #94a3b8;
      margin-top: 3px;
    }
    .section-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .section-heading {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0369a1;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .info-item {
      font-size: 12px;
    }
    .info-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
      margin-bottom: 1px;
      display: block;
    }
    .info-value {
      color: #0f172a;
      font-weight: 700;
    }
    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      font-size: 12px;
    }
    .items-table th {
      background: #f1f5f9;
      color: #475569;
      font-weight: 800;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 14px;
      border-bottom: 1px solid #cbd5e1;
      text-align: left;
    }
    .items-table td {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
    }
    .items-table tr:last-child td {
      border-bottom: none;
    }
    .text-right {
      text-align: right;
    }
    .total-card {
      background: #ecfdf5;
      border: 1.5px solid #6ee7b7;
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .total-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #065f46;
    }
    .total-sub {
      font-size: 11.5px;
      font-weight: 600;
      color: #047857;
      margin-top: 2px;
    }
    .total-amount {
      font-size: 24px;
      font-weight: 900;
      color: #047857;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .audit-box {
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .audit-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 4px;
      display: block;
    }
    .audit-hash {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      color: #047857;
      word-break: break-all;
      margin-top: 3px;
    }
    .declaration {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      line-height: 1.45;
      margin-bottom: 18px;
    }
    .receipt-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 10.5px;
      color: #94a3b8;
    }
    .footer-signer {
      text-align: right;
    }
    .signer-name {
      font-weight: 800;
      color: #334155;
      font-size: 11px;
    }
    .signer-role {
      color: #64748b;
      font-size: 10px;
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .receipt-container {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-actions no-print">
    <button type="button" class="btn-action btn-print" onclick="window.print()">
      🖨️ Imprimir / Salvar em PDF
    </button>
    <button type="button" class="btn-action btn-close" onclick="window.close()">
      ✕ Fechar Janela
    </button>
  </div>

  <div class="receipt-container">
    <div class="receipt-header">
      <div class="brand-left">
        <div class="brand-title">CorpFlats</div>
        <div class="brand-subtitle">Hospedagem & Gestão Imobiliária</div>
        <div class="brand-meta">
          <strong>CorpFlats Hospedagens Ltda</strong><br>
          CNPJ: 47.964.813/0001-65<br>
          Campos dos Goytacazes - RJ
        </div>
      </div>
      <div class="receipt-info">
        <div class="status-badge">✓ PAGO & QUITADO</div>
        <div class="receipt-code-label">Recibo Oficial</div>
        <div class="receipt-code">REC-${reservation?.code || ""}</div>
        <div class="receipt-date">Emissão: ${emissionDate}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">1. Identificação do Hóspede & Reserva</div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Hóspede Titular</span>
          <span class="info-value">${guestName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Localizador da Reserva</span>
          <span class="info-value font-mono" style="color: #0369a1;">${reservation?.code || ""}</span>
        </div>
        ${reservation?.guestDocument ? `
        <div class="info-item">
          <span class="info-label">CPF / Documento</span>
          <span class="info-value font-mono">${reservation.guestDocument}</span>
        </div>
        ` : ""}
        ${reservation?.guestPhone ? `
        <div class="info-item">
          <span class="info-label">Telefone / WhatsApp</span>
          <span class="info-value">${formatPhoneDisplay(reservation.guestPhone)}</span>
        </div>
        ` : ""}
        <div class="info-item">
          <span class="info-label">Canal da Reserva</span>
          <span class="info-value">${reservation?.channel || (isOta ? (channelLower.includes("booking") ? "Booking.com" : "Airbnb") : "CorpFlats Direto")}</span>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">2. Acomodação & Detalhes da Estadia</div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Unidade / Apartamento</span>
          <span class="info-value">Apartamento ${reservation?.flatNumber || ""} (${reservation?.roomCategory || "Studio Executivo"})</span>
        </div>
        <div class="info-item">
          <span class="info-label">Período Contratado</span>
          <span class="info-value">${nights} diária${nights > 1 ? "s" : ""} • ${reservation?.guestCount || 1} hóspede${(reservation?.guestCount || 1) > 1 ? "s" : ""}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Check-in</span>
          <span class="info-value">${checkinFormatted} (a partir das 14:00)</span>
        </div>
        <div class="info-item">
          <span class="info-label">Check-out</span>
          <span class="info-value">${checkoutFormatted} (até as 12:00)</span>
        </div>
      </div>
    </div>

    <div class="section-card" style="padding: 0; background: transparent; border: none;">
      <div class="section-heading" style="margin-bottom: 8px;">3. Demonstrativo dos Serviços Contratados</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width: 110px; text-align: center;">Período / Qtd</th>
            <th style="width: 130px;" class="text-right">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Diárias de Hospedagem - Flat ${reservation?.flatNumber || ""}</strong><br>
              <span style="font-size: 11px; color: #64748b;">${checkinFormatted} até ${checkoutFormatted}</span>
            </td>
            <td style="text-align: center;">${nights} diária${nights > 1 ? "s" : ""}</td>
            <td class="text-right font-mono">
              <strong>R$ ${paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </td>
          </tr>
          ${hasBreakfast ? `
          <tr>
            <td>
              <strong>Room Service & Café da Manhã Corporativo</strong><br>
              <span style="font-size: 11px; color: #64748b;">Itens inclusos no plano de hospedagem</span>
            </td>
            <td style="text-align: center;">${nights} dia${nights > 1 ? "s" : ""}</td>
            <td class="text-right font-mono" style="color: #047857; font-weight: 700;">Incluso</td>
          </tr>
          ` : ""}
        </tbody>
      </table>
    </div>

    <div class="total-card">
      <div>
        <div class="total-title">Total Liquidado & Quitado</div>
        <div class="total-sub">✓ Saldo Residual a Pagar: R$ 0,00 (Quitação Integral)</div>
      </div>
      <div class="total-amount">
        R$ ${paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">4. Dados da Liquidação & Conciliação Bancária</div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Forma de Liquidação</span>
          <span class="info-value">${paymentMethodText}</span>
        </div>
        ${paidAtFormatted ? `
        <div class="info-item">
          <span class="info-label">Data e Hora da Liquidação</span>
          <span class="info-value">${paidAtFormatted}</span>
        </div>
        ` : ""}
      </div>
      ${isCardPayment && reservation?.mpPaymentId ? `
      <div style="margin-top: 10px;">
        <span class="audit-label">Identificador de Transação (Cartão / Mercado Pago):</span>
        <div class="audit-hash">${reservation.mpPaymentId}</div>
      </div>
      ` : ""}
      ${!isCardPayment && reservation?.pixEndToEndId ? `
      <div style="margin-top: 10px;">
        <span class="audit-label">End-to-End ID (Banco Central do Brasil - SPI):</span>
        <div class="audit-hash">${reservation.pixEndToEndId}</div>
      </div>
      ` : ""}
      ${!isCardPayment && reservation?.pixTxId && !reservation?.pixEndToEndId ? `
      <div style="margin-top: 10px;">
        <span class="audit-label">Identificador de Transação (TxID Banco Inter):</span>
        <div class="audit-hash">${reservation.pixTxId}</div>
      </div>
      ` : ""}
    </div>

    <div class="declaration">
      Declaramos para os devidos fins de direito que os valores referentes à estadia especificada foram devidamente quitados, inexistindo quaisquer pendências financeiras relativas à reserva descrita. Este documento possui validade para comprovação de despesa e prestação de contas.
    </div>

    <div class="receipt-footer">
      <div>
        <strong>CorpFlats Hospedagens Ltda</strong> • CNPJ 47.964.813/0001-65<br>
        Sistema Guest Flow Manager • Autenticação Eletrônica
      </div>
      <div class="footer-signer">
        <div class="signer-name">Departamento Financeiro</div>
        <div class="signer-role">CorpFlats Hospedagens</div>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`

    const printWindow = window.open("", "_blank", "width=850,height=950")
    if (printWindow) {
      printWindow.document.open()
      printWindow.document.write(receiptHtml)
      printWindow.document.close()
    } else {
      const iframe = document.createElement("iframe")
      iframe.style.position = "fixed"
      iframe.style.right = "0"
      iframe.style.bottom = "0"
      iframe.style.width = "0"
      iframe.style.height = "0"
      iframe.style.border = "0"
      document.body.appendChild(iframe)
      const iframeDoc = iframe.contentWindow?.document
      if (iframeDoc) {
        iframeDoc.open()
        iframeDoc.write(receiptHtml)
        iframeDoc.close()
        iframe.contentWindow?.focus()
        setTimeout(() => {
          iframe.contentWindow?.print()
          setTimeout(() => {
            try { document.body.removeChild(iframe) } catch {}
          }, 1500)
        }, 400)
      }
    }
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
    setPaymentPendingFeedback(false)
    try {
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(reservation.code)}/payment-status`)
      if (res.ok) {
        const json = await res.json()
        if (json.paid) {
          setPaymentSuccessNotice(true)
          setPaymentPendingFeedback(false)
          setData((prev: any) => prev ? ({
            ...prev,
            reservation: {
              ...prev.reservation,
              paymentStatus: "pago_total",
              paymentMethod: json.paymentMethod || (json.mpPaymentId ? "cartao_credito" : prev.reservation.paymentMethod),
              paidAmount: json.paidAmount || reservation.totalAmount,
              paidAt: json.paidAt || prev.reservation.paidAt || new Date().toISOString(),
              pixTxId: (json.paymentMethod === "cartao_credito" || json.mpPaymentId) ? null : (json.pixTxId || prev.reservation.pixTxId),
              pixEndToEndId: json.pixEndToEndId || prev.reservation.pixEndToEndId,
              mpPaymentId: json.mpPaymentId || prev.reservation.mpPaymentId
            }
          }) : null)
          // Atualiza dados completos da reserva imediatamente
          setTimeout(() => fetchPortalData(reservation.code), 400)
        } else {
          setPaymentPendingFeedback(true)
          setTimeout(() => setPaymentPendingFeedback(false), 8000)
        }
      } else {
        setPaymentPendingFeedback(true)
      }
    } catch (e) {
      console.error("Erro ao verificar status de pagamento:", e)
      setPaymentPendingFeedback(true)
    } finally {
      setCheckingPayment(false)
    }
  }

  const handleSendWhatsAppVoucher = async () => {
    if (!reservation?.code) return
    setSendingWaVoucher(true)
    try {
      const res = await fetch("/api/whatsapp/dispatch-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "tpl_payment_confirmed",
          reservationCode: reservation.code
        })
      })
      const json = await res.json()
      if (json.success) {
        setWaVoucherSent(true)
        setTimeout(() => setWaVoucherSent(false), 6000)
      } else {
        alert(json.error || "Não foi possível enviar a mensagem no WhatsApp. Verifique se o telefone informado possui WhatsApp cadastrado.")
      }
    } catch (e) {
      console.error("Erro ao enviar confirmação por WhatsApp:", e)
      alert("Erro ao conectar com o serviço de WhatsApp.")
    } finally {
      setSendingWaVoucher(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white pb-20 w-full max-w-full overflow-x-hidden">
      {/* ── Top Navigation Bar (Header Clean, Sofisticado & 100% Responsivo) ──────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-8 py-2.5 sm:py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs sm:text-base shadow-sm shrink-0">
              CF
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-slate-900 leading-none shrink-0">
                  CorpFlats
                </span>
                {isCancelled ? (
                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[9.5px] sm:text-[10px] font-bold py-0.5 px-1.5 sm:px-2 shrink-0 whitespace-nowrap">
                    ✕ <span className="hidden sm:inline">Reserva Cancelada</span>
                    <span className="sm:hidden">Cancelada</span>
                  </Badge>
                ) : isPaid ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/90 text-[9.5px] sm:text-[10px] font-bold py-0.5 px-1.5 sm:px-2 shrink-0 whitespace-nowrap">
                    ✓ <span className="hidden sm:inline">{isOta ? (channelLower.includes("booking") ? "Pago via Booking" : "Pago via Airbnb") : "Reserva Confirmada & Paga"}</span>
                    <span className="sm:hidden">Pago</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[9.5px] sm:text-[10px] font-bold py-0.5 px-1.5 sm:px-2 animate-pulse shrink-0 whitespace-nowrap">
                    ⏳ <span className="hidden sm:inline">Aguardando Pagamento</span>
                    <span className="sm:hidden">Pendente</span>
                  </Badge>
                )}
              </div>
              <span className="text-[10.5px] sm:text-[11px] text-slate-500 font-mono font-medium block mt-0.5 truncate">
                <span className="hidden sm:inline">Localizador: </span>
                <span className="sm:hidden">Loc: </span>
                <strong className="text-slate-800 font-bold">{reservation.code}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Atalhos para Tablet e Desktop (>= md) */}
            {!hasEnteredFlat && currentGuestNeedsReSignature && (
              <Button
                type="button"
                size="sm"
                onClick={() => setLocation(getCheckinPath(false))}
                className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs items-center gap-2 shadow-sm animate-pulse"
              >
                <PenTool className="w-4 h-4 shrink-0" />
                <span>Assinar Termo Atualizado</span>
              </Button>
            )}
            {!hasEnteredFlat && !currentGuestNeedsReSignature && otherPendingReSignGuests.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const targetG = otherPendingReSignGuests[0]
                  setActiveGuestIndex(targetG.index)
                  setLocation(getCheckinPath(false, targetG.index))
                }}
                className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-bold text-xs items-center gap-2 shadow-2xs"
              >
                <PenTool className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Assinar por {otherPendingReSignGuests[0].name?.split(" ")[0] || "Acompanhante"}</span>
              </Button>
            )}
            {!hasEnteredFlat && !currentGuestNeedsReSignature && otherPendingReSignGuests.length === 0 && !isPreCheckinDone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocation(getCheckinPath(false))}
                className="hidden md:inline-flex h-9 px-3 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs items-center gap-2 shadow-2xs"
              >
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Pré-Check-in</span>
              </Button>
            )}
            {!hasEnteredFlat && isPreCheckinDone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={confirmingSelfCheckin}
                onClick={async () => {
                  try {
                    setConfirmingSelfCheckin(true)
                    const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code || reservation.code)}/self-checkin`, { method: "POST" })
                    if (res.ok) {
                      setSelfCheckinNotice(true)
                      await fetchPortalData(code || reservation.code)
                    }
                  } catch {}
                  finally {
                    setConfirmingSelfCheckin(false)
                  }
                }}
                className="hidden md:inline-flex h-9 px-3 rounded-xl border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs items-center gap-2 shadow-2xs"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{confirmingSelfCheckin ? "Confirmando..." : "📍 Já Cheguei"}</span>
              </Button>
            )}
            {hasEnteredFlat && (
              <div className="hidden md:inline-flex h-9 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>✓ Entrada Confirmada</span>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/checkout/${code || reservation.code}`)}
              className="hidden md:inline-flex h-9 px-3 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs items-center gap-2 shadow-2xs"
            >
              <DoorOpen className="w-4 h-4 text-slate-600 shrink-0" />
              <span>Check-out</span>
            </Button>

            {/* Ação Direta WhatsApp (Sempre visível e acessível em qualquer tela) */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs hover:shadow-sm active:scale-95 transition-all shrink-0"
            >
              <WhatsAppIcon className="w-4 h-4 shrink-0" />
              <span>WhatsApp</span>
            </a>

            {/* Menu Dropdown Mobile (< md) para Atalhos Rápidos */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs flex items-center justify-center shrink-0"
                    aria-label="Atalhos e Opções da Reserva"
                  >
                    <MoreVertical className="w-4 h-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-white border-slate-200 rounded-2xl shadow-xl p-1.5 text-slate-800">
                  {!hasEnteredFlat && currentGuestNeedsReSignature && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(false))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-50 text-amber-900"
                    >
                      <PenTool className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Assinar Termo Atualizado</span>
                    </DropdownMenuItem>
                  )}
                  {!hasEnteredFlat && !currentGuestNeedsReSignature && otherPendingReSignGuests.length > 0 && (
                    <DropdownMenuItem
                      onClick={() => {
                        const targetG = otherPendingReSignGuests[0]
                        setActiveGuestIndex(targetG.index)
                        setLocation(getCheckinPath(false, targetG.index))
                      }}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-50 text-amber-900"
                    >
                      <PenTool className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Assinar por {otherPendingReSignGuests[0].name?.split(" ")[0] || "Acompanhante"}</span>
                    </DropdownMenuItem>
                  )}
                  {!hasEnteredFlat && !currentGuestNeedsReSignature && otherPendingReSignGuests.length === 0 && !isPreCheckinDone && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(false))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100 text-indigo-700"
                    >
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Pré-Check-in Digital</span>
                    </DropdownMenuItem>
                  )}
                  {!hasEnteredFlat && isPreCheckinDone && (
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          setConfirmingSelfCheckin(true)
                          const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code || reservation.code)}/self-checkin`, { method: "POST" })
                          if (res.ok) {
                            setSelfCheckinNotice(true)
                            await fetchPortalData(code || reservation.code)
                          }
                        } catch {}
                        finally {
                          setConfirmingSelfCheckin(false)
                        }
                      }}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-emerald-50 text-emerald-800"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>📍 Já Cheguei no Flat</span>
                    </DropdownMenuItem>
                  )}
                  {isPreCheckinDone && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(true))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-xl cursor-pointer hover:bg-slate-100 text-slate-600"
                    >
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Ver Ficha do Check-in</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setLocation(`/checkout/${code || reservation.code}`)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100"
                  >
                    <DoorOpen className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Check-out Expresso</span>
                  </DropdownMenuItem>
                  {hasBreakfast && (
                    <DropdownMenuItem
                      onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/cafe`)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100"
                    >
                      <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Cardápio do Café</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/frigobar`)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100"
                  >
                    <Refrigerator className="w-4 h-4 text-cyan-600 shrink-0" />
                    <span>Frigobar & Bebidas</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setTermsModalTab("rules")
                      setTermsModalOpen(true)
                    }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100"
                  >
                    <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>Regras & Contrato</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main Container ──────────────────────────────────────────────── */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* ── Banner de Alerta: Re-assinatura Obrigatória para o Hóspede Atual ── */}
        {!isCancelled && currentGuestNeedsReSignature && (
          <div className="rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50 p-5 sm:p-6 shadow-md space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                  <PenTool className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-amber-600 text-white text-[10.5px] font-bold px-2 py-0.5">
                      ⚠️ ASSINATURA PENDENTE • ATUALIZAÇÃO OBRIGATÓRIA
                    </Badge>
                    <span className="text-[11px] text-amber-800 font-semibold font-mono">
                      Flat {reservation.flatNumber} • {reservation.code}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-amber-950 mt-1">
                    Declaração de Check-in Requer Sua Assinatura
                  </h2>
                  <p className="text-xs sm:text-sm text-amber-900/90 mt-0.5 leading-relaxed max-w-2xl">
                    Olá, <strong>{currentGuest?.name || reservation.guestName}</strong>! Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio.
                  </p>
                </div>
              </div>

              <div className="shrink-0 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={() => setLocation(getCheckinPath(false))}
                  className="w-full sm:w-auto h-auto min-h-11 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-normal leading-tight text-center shadow-md transition-all cursor-pointer"
                >
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span>Assinar Termo Atualizado</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Seus dados e documentos estão salvos:</strong> você só precisará conferir as novas informações da estadia e assinar digitalmente.
              </span>
            </div>

            {guestsList.length > 1 && (
              <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-amber-900">Status dos Ocupantes:</span>
                {guestsList.map((g: any) => {
                  const gNeedsReSign = Boolean(g.needsReSignature)
                  const gDone = !gNeedsReSign && Boolean(g.hasCompletedCheckin)
                  return (
                    <span
                      key={g.index}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        gNeedsReSign
                          ? "bg-amber-200/90 text-amber-950 border border-amber-300"
                          : gDone
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : "bg-white/80 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {gDone ? "✓" : "⏳"} {g.name || `Hóspede ${g.index}`}:{" "}
                      <strong>{gNeedsReSign ? "Re-assinatura Pendente" : gDone ? "Assinatura Ok" : "Pendente"}</strong>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Banner Informativo: Assinatura do Hóspede Atual Concluída, Aguardando Acompanhante ── */}
        {!isCancelled && !currentGuestNeedsReSignature && reservationNeedsReSignature && otherPendingReSignGuests.length > 0 && (
          <div className="rounded-3xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-amber-50/70 p-5 sm:p-6 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-emerald-600 text-white text-[10.5px] font-bold px-2 py-0.5">
                      ✓ SUA ASSINATURA ESTÁ ATUALIZADA
                    </Badge>
                    <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-bold px-2 py-0.5 animate-pulse">
                      ⏳ FALTA ACOMPANHANTE ({otherPendingReSignGuests.length})
                    </Badge>
                    <span className="text-[11px] text-slate-600 font-semibold font-mono">
                      Flat {reservation.flatNumber} • {reservation.code}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                    Sua Assinatura foi Atualizada com Sucesso!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-700 mt-0.5 leading-relaxed max-w-2xl">
                    Olá, <strong>{currentGuest?.name || reservation.guestName}</strong>! Sua declaração de check-in para o <strong>Flat {reservation.flatNumber}</strong> já está assinada e registrada. Para a liberação completa do grupo na portaria, falta apenas o preenchimento de:{" "}
                    <strong>{otherPendingReSignGuests.map((g: any) => g.name || `Hóspede ${g.index}`).join(", ")}</strong>.
                  </p>
                </div>
              </div>

              <div className="shrink-0 w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    const firstPending = otherPendingReSignGuests[0]
                    setActiveGuestIndex(firstPending.index)
                    setLocation(getCheckinPath(false, firstPending.index))
                  }}
                  className="h-auto min-h-11 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-normal leading-tight text-center shadow-md transition-all cursor-pointer"
                >
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span>Preencher por {otherPendingReSignGuests[0].name?.split(" ")[0] || "Acompanhante"}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation(getCheckinPath(true, activeGuestIndex))}
                  className="h-auto min-h-11 py-2.5 px-4 rounded-xl border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 whitespace-normal leading-tight text-center cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Ver Minha Ficha</span>
                </Button>
              </div>
            </div>

            {/* Lista detalhada dos ocupantes com status visual isolado */}
            <div className="bg-white/80 rounded-2xl border border-emerald-200/80 p-3.5 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Status Individual dos Hóspedes:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {guestsList.map((g: any) => {
                  const gNeedsReSign = Boolean(g.needsReSignature)
                  const gDone = !gNeedsReSign && Boolean(g.hasCompletedCheckin)
                  const isCur = Number(g.index) === Number(activeGuestIndex)
                  const isCopied = copiedGuestLinkIndex === g.index

                  return (
                    <div
                      key={g.index}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                        gDone
                          ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                          : "bg-amber-50/80 border-amber-200 text-amber-950"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs truncate">
                            {g.name || `Hóspede ${g.index}`}
                          </span>
                          {Number(g.index) === 1 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                              Titular
                            </span>
                          )}
                          {isCur && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-200 text-sky-800 font-semibold">
                              Você
                            </span>
                          )}
                        </div>
                        <span className="text-[10.5px] flex items-center gap-1 mt-0.5 font-medium">
                          {gDone ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-emerald-700 font-semibold">Assinatura Atualizada ✓</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="text-amber-800 font-semibold">Re-assinatura Pendente</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {gNeedsReSign ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                setActiveGuestIndex(g.index)
                                setLocation(getCheckinPath(false, g.index))
                              }}
                              className="h-8 px-2.5 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer"
                            >
                              Assinar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const origin = typeof window !== "undefined" ? window.location.origin : ""
                                const url = `${origin}/pre-checkin/${encodeURIComponent(reservation.code)}?guest=${g.index}&resign=1`
                                if (navigator.clipboard?.writeText) {
                                  navigator.clipboard.writeText(url)
                                  setCopiedGuestLinkIndex(g.index)
                                  setTimeout(() => setCopiedGuestLinkIndex(null), 2500)
                                }
                              }}
                              className="h-8 px-2 text-[11px] font-medium rounded-lg border-amber-300 text-amber-900 hover:bg-amber-100 cursor-pointer"
                              title="Copiar link para enviar ao acompanhante"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline ml-1">{isCopied ? "Copiado!" : "Copiar"}</span>
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(getCheckinPath(true, g.index))}
                            className="h-8 px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100/70 cursor-pointer"
                          >
                            Ver Ficha
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Banner de Confirmação: Re-assinatura Concluída com Sucesso ─────────── */}
        {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("resign_success") === "1" && !reservationNeedsReSignature && (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  ✓ Ficha de Check-in Re-assinada com Sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-emerald-50 leading-relaxed mt-0.5">
                  Todas as declarações atualizadas com as novas datas e acomodação foram autenticadas e enviadas para a portaria. O acesso ao condomínio está 100% liberado!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Banner de Alerta: Reserva Cancelada ───────────────────────── */}
        {isCancelled && (
          <div className="rounded-3xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-rose-50/90 to-red-50 p-5 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-rose-600 text-white text-[10.5px] font-bold px-2 py-0.5">
                      ✕ Reserva Cancelada
                    </Badge>
                    {reservation.cancelledAt && (
                      <span className="text-[11px] text-rose-700 font-medium">
                        Cancelada em {format(parseISO(reservation.cancelledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-rose-950 mt-1">
                    Esta reserva foi cancelada
                  </h2>
                  <p className="text-xs sm:text-sm text-rose-800/90 mt-0.5">
                    Localizador: <strong className="font-mono font-bold text-rose-950">{reservation.code}</strong> • Flat {reservation.flatNumber}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors w-full sm:w-auto"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Falar no WhatsApp</span>
                </a>
                <a
                  href="https://corpflats.onrender.com/reservar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-rose-300 hover:bg-rose-50 text-rose-900 text-xs font-bold shadow-2xs transition-colors w-full sm:w-auto"
                >
                  <span>Reservar Novas Datas</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3.5 rounded-2xl bg-white/90 border border-rose-100 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                  Motivo do Cancelamento
                </span>
                <p className="font-semibold text-slate-800">
                  {reservation.cancellationReason || "Cancelamento solicitado pelo hóspede via autoatendimento"}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/90 border border-rose-100 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                  Reembolso & Estorno
                </span>
                <p className="font-semibold text-slate-800">
                  {Number(reservation.refundAmount) > 0 
                    ? `Estorno integral de R$ ${Number(reservation.refundAmount).toFixed(2)} processado`
                    : (reservation.refundStatus === "estorno_100%_solicitado"
                        ? "Solicitação de estorno em processamento financeiro"
                        : "Cancelamento efetuado sem estorno conforme as políticas contratadas")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Banner de Boas-vindas / Entrada Confirmada */}
        {selfCheckinNotice && (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  🎉 Entrada no Flat Confirmada com Sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-emerald-50 leading-relaxed mt-0.5">
                  Seja muito bem-vindo(a) ao Flat {reservation?.flatNumber}! A portaria e nossa equipe de atendimento já foram notificadas da sua chegada.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelfCheckinNotice(false)}
              className="text-white/80 hover:text-white text-xs font-bold px-2 py-1 rounded-lg bg-black/10 hover:bg-black/20 shrink-0"
            >
              ✕
            </button>
          </div>
        )}

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
              {isCancelled && (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs font-bold py-1 px-2.5">
                  ✕ Cancelada
                </Badge>
              )}
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                Flat {reservation.flatNumber}
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                {nights} {nights === 1 ? "diária" : "diárias"}
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold py-1 px-2.5">
                {reservation.guestCount || 1} {reservation.guestCount === 1 ? "hóspede" : "hóspedes"}
              </Badge>
              {!isCancelled && hasBreakfast && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-2.5">
                  ☕ Café Incluso
                </Badge>
              )}
            </div>
          </div>

          {/* Alternância de Hóspede para reservas com múltiplos ocupantes */}
          {guestsList.length > 1 && (
            <div className="pt-1 pb-1">
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-2xl bg-slate-50/90 border border-slate-200/80">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 shrink-0 px-1">
                  <User className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  Visualizando como:
                </span>
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                  {guestsList.map((g: any, idx: number) => {
                    const gIdx = Number(g.index) || (idx + 1)
                    const isSelected = gIdx === activeGuestIndex
                    const isTitular = gIdx === 1
                    const gDisplayName = g.name && !g.name.startsWith("Hóspede ") 
                      ? g.name 
                      : (isTitular ? (reservation.guestName || `Hóspede ${gIdx}`) : `Hóspede ${gIdx}`)
                    const gNeedsReSign = Boolean(g.needsReSignature)
                    const gCheckinDone = !gNeedsReSign && Boolean(
                      g.hasCompletedCheckin || 
                      g.status === "CHECKED_IN" || 
                      g.fnrhSignedAt || 
                      g.signatureUrl || 
                      (isTitular && guestsList.length === 1 && (reservation.fnhrCompleted || reservation.preCheckinCompleted))
                    )

                    return (
                      <button
                        key={gIdx}
                        type="button"
                        onClick={() => {
                          setActiveGuestIndex(gIdx)
                          try {
                            sessionStorage.setItem(`cf_active_guest_${reservation.code || code}`, String(gIdx))
                            localStorage.setItem(`cf_active_guest_${reservation.code || code}`, String(gIdx))
                            localStorage.setItem("corpflats_guest_name", gDisplayName)
                            const url = new URL(window.location.href)
                            url.searchParams.set("guest", String(gIdx))
                            window.history.replaceState({}, "", url.toString())
                          } catch {}
                        }}
                        className={`inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer max-w-full ${
                          isSelected
                            ? "bg-sky-600 text-white shadow-xs"
                            : gNeedsReSign
                            ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300"
                            : gCheckinDone
                            ? "bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border border-emerald-200"
                            : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        <span className="truncate max-w-[160px] sm:max-w-[220px]">👤 {gDisplayName}</span>
                        {isTitular && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${
                            isSelected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            Titular
                          </span>
                        )}
                        {gNeedsReSign ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 ${
                            isSelected ? "bg-amber-400 text-amber-950 font-black" : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}>
                            ⚠️ Re-assinar
                          </span>
                        ) : gCheckinDone ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 ${
                            isSelected ? "bg-emerald-500/30 text-emerald-100" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}>
                            ✓ Assinado
                          </span>
                        ) : (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${
                            isSelected ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            Pendente Check-in
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Grid de Entrada e Saída */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                    Check-in (Entrada)
                  </span>
                  {hasEnteredFlat ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold text-[10px]">
                      ✓ Entrada Confirmada
                    </Badge>
                  ) : currentGuestNeedsReSignature ? (
                    <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px] animate-pulse">
                      ⚠️ Re-assinatura Obrigatória
                    </Badge>
                  ) : otherPendingReSignGuests.length > 0 ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-bold text-[10px] whitespace-normal text-left">
                      ✓ Seu Check-in Ok • Acompanhante Pendente
                    </Badge>
                  ) : isCurrentGuestPreCheckinDone ? (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 font-bold text-[10px]">
                      ✓ Dados Enviados
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Autoatendimento
                    </span>
                  )}
                </div>
                <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                  {checkinFormatted}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>A partir das {data?.checkinTime || "14:00"} (antecipado assim que limpo)</span>
                </span>
              </div>

              {currentGuestNeedsReSignature ? (
                <div className="space-y-2 mt-2">
                  <div className="p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 text-xs font-medium leading-snug">
                    <span className="font-bold block text-amber-900 mb-0.5">⚠️ Assinatura Atualizada Obrigatória</span>
                    Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio.
                  </div>
                  <Button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(false))}
                    className="w-full h-auto min-h-10 py-2 px-3 whitespace-normal leading-tight text-xs sm:text-sm font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PenTool className="w-4 h-4 shrink-0" />
                    <span>Assinar Termo Atualizado</span>
                  </Button>
                </div>
              ) : otherPendingReSignGuests.length > 0 ? (
                <div className="space-y-2 mt-2">
                  <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs font-medium leading-snug">
                    <span className="font-bold block text-emerald-900 mb-0.5">✓ Sua Assinatura está Atualizada</span>
                    Aguardando preenchimento de <strong>{otherPendingReSignGuests.map((g: any) => g.name || `Hóspede ${g.index}`).join(", ")}</strong> para liberação na portaria.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        const targetG = otherPendingReSignGuests[0]
                        setActiveGuestIndex(targetG.index)
                        setLocation(getCheckinPath(false, targetG.index))
                      }}
                      className="flex-1 min-w-[140px] h-auto min-h-9 py-2 px-3 whitespace-normal leading-tight text-center text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <PenTool className="w-3.5 h-3.5 shrink-0" />
                      <span>Preencher por {otherPendingReSignGuests[0].name?.split(" ")[0] || "Acompanhante"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation(getCheckinPath(true))}
                      className="flex-1 sm:flex-initial h-auto min-h-9 py-2 px-3 whitespace-normal leading-tight text-center text-xs font-bold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Ver Minha Ficha</span>
                    </Button>
                  </div>
                </div>
              ) : hasEnteredFlat ? (
                <div className="space-y-1.5 mt-2">
                  <div className="w-full h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    <span>Entrada Realizada no Flat</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : isPreCheckinDone ? (
                <div className="space-y-1.5 mt-2">
                  <Button
                    type="button"
                    disabled={confirmingSelfCheckin}
                    onClick={async () => {
                      try {
                        setConfirmingSelfCheckin(true)
                        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code || reservation.code)}/self-checkin`, { method: "POST" })
                        if (res.ok) {
                          setSelfCheckinNotice(true)
                          await fetchPortalData(code || reservation.code)
                        }
                      } catch {}
                      finally {
                        setConfirmingSelfCheckin(false)
                      }
                    }}
                    className="w-full h-auto min-h-10 py-2 px-3 whitespace-normal leading-tight text-center text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{confirmingSelfCheckin ? "Confirmando..." : "📍 Já Cheguei no Flat (Confirmar Entrada)"}</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : (!isPaid && (reservation.status === "pre_reserva" || reservation.status === "pendente" || data?.preCheckinBlocked)) ? (
                <div className="space-y-2 mt-2">
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-snug">
                    <strong className="block font-bold text-amber-950 mb-0.5">🔒 Check-in Digital Aguardando Pagamento</strong>
                    Apenas após a confirmação do pagamento sua reserva estará confirmada para liberar o check-in digital e o envio para a recepção/portaria.
                  </div>
                  <Button
                    type="button"
                    disabled
                    className="w-full h-auto min-h-10 py-2 px-3 whitespace-normal leading-tight text-xs sm:text-sm font-bold rounded-xl bg-slate-200 text-slate-500 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Pré-Check-in Digital (Aguardando Pagamento)</span>
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setLocation(getCheckinPath(false))}
                  className="w-full h-auto min-h-10 py-2 px-3 whitespace-normal leading-tight text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Pré-Check-in Digital</span>
                </Button>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                    Check-out (Saída)
                  </span>
                  {reservation.status === "completed" || reservation.actualCheckoutAt ? (
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-bold text-[10px]">
                      ✓ Saída Realizada
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Autoatendimento
                    </span>
                  )}
                </div>
                <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                  {checkoutFormatted}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Até as {data?.checkoutTime || "12:00"}</span>
                </span>
              </div>

              <Button
                type="button"
                onClick={() => setLocation(`/checkout/${code || reservation.code}`)}
                className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
              >
                <DoorOpen className="w-4.5 h-4.5 shrink-0" />
                <span>{reservation.status === "completed" || reservation.actualCheckoutAt ? "Ver Confirmação de Saída" : "Check-out Expresso"}</span>
              </Button>
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
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span>
                    Reserva confirmada via <strong>{reservation.channel === "whatsapp" ? "WhatsApp" : "Site CorpFlats"}</strong> • Precisa ajustar sua estadia?
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenModifyModal}
                  className="h-10 px-4 rounded-xl border border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xs transition-all active:scale-95 shrink-0"
                >
                  <Calendar className="w-4.5 h-4.5 text-sky-600 shrink-0" />
                  <span>Modificar Reserva</span>
                </Button>
              </div>
            )
          })()}
        </Card>

        {/* ── 1.5 Card de Pagamento & Confirmação Financeira ───────────────── */}
        {isCancelled ? (
          <Card className="bg-white rounded-3xl border border-rose-200/90 shadow-md p-5 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-black text-sm shadow-2xs shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Encerramento Financeiro
                  </h2>
                  <span className="text-xs text-slate-500">
                    Reserva cancelada • Cobranças e serviços suspensos
                  </span>
                </div>
              </div>
              <Badge className="bg-rose-600 text-white font-bold text-xs py-1 px-3">
                ✕ Cancelada
              </Badge>
            </div>
            <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1">
              <p className="font-bold">
                {Number(reservation.refundAmount) > 0
                  ? `Estorno integral de R$ ${Number(reservation.refundAmount).toFixed(2)} processado com sucesso.`
                  : (reservation.refundStatus === "estorno_100%_solicitado"
                      ? "Solicitação de estorno em processamento financeiro."
                      : "Cancelamento efetuado sem estorno conforme as políticas da tarifa contratada.")}
              </p>
              {reservation.cancellationReason && (
                <p className="text-rose-700 text-[11px]">
                  Motivo registrado: {reservation.cancellationReason}
                </p>
              )}
            </div>
          </Card>
        ) : (
        <Card className={`rounded-3xl border shadow-md p-5 sm:p-7 space-y-4 transition-all ${
          isPaid 
            ? "bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 border-emerald-200/90" 
            : "bg-white border-amber-300 shadow-lg ring-1 ring-amber-300/60"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-2xs shrink-0 ${
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
                    : "Escolha como deseja pagar para confirmar e garantir a sua estadia."}
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
                        : (isCardPayment 
                            ? (isDebitCard ? "Liquidado via Cartão de Débito." : (reservation.mpPaymentId ? "Liquidado via Cartão de Crédito (Mercado Pago)." : "Liquidado via Cartão de Crédito."))
                            : (channelLower.includes("whatsapp") && !reservation.pixEndToEndId && !reservation.pixTxId
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

          {/* Botão de Ver e Baixar Recibo de Pagamento e Receber no WhatsApp */}
          {isPaid && (
            <div className="pt-2 border-t border-slate-100/80 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => setReceiptModalOpen(true)}
                className="w-full h-auto min-h-11 py-2.5 px-4 rounded-2xl bg-white hover:bg-emerald-50/70 active:scale-[0.99] border border-emerald-300 text-emerald-950 font-bold text-xs sm:text-sm whitespace-normal leading-tight text-center shadow-2xs inline-flex items-center justify-center gap-2 transition-all"
              >
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Ver / Baixar Recibo</span>
              </Button>

              <Button
                type="button"
                onClick={handleSendWhatsAppVoucher}
                disabled={sendingWaVoucher}
                className="w-full h-auto min-h-11 py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm whitespace-normal leading-tight text-center shadow-sm inline-flex items-center justify-center gap-2 transition-all disabled:opacity-75"
              >
                <WhatsAppIcon className={`w-4 h-4 shrink-0 ${sendingWaVoucher ? "animate-spin" : ""}`} />
                <span>{waVoucherSent ? "✓ Enviado pro seu WhatsApp!" : (sendingWaVoucher ? "Enviando..." : "Receber no WhatsApp")}</span>
              </Button>
            </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                <div id="secao-pix-pagamento" className="p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-center">
                  {copiedPix && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1 shadow-sm">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Código PIX copiado com sucesso! Abra o app do seu banco e cole para pagar.</span>
                    </div>
                  )}

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
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white rounded-xl border border-slate-200 text-left">
                        <span className="font-mono text-[11px] text-slate-600 truncate flex-1 min-w-[140px] px-1 select-all">
                          {reservation.pixCopiaECola}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCopyPix}
                          className={`w-full sm:w-auto h-8 px-3 rounded-lg text-xs font-bold gap-1.5 shrink-0 transition-all ${
                            copiedPix ? "bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                          }`}
                        >
                          {copiedPix ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
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
                      className="w-full sm:w-auto h-auto min-h-10 py-2 px-4 rounded-xl text-xs font-bold border-slate-300 hover:bg-white text-slate-700 gap-2 whitespace-normal leading-tight text-center shadow-sm active:scale-95 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${checkingPayment ? "animate-spin text-sky-600" : ""}`} />
                      <span>{checkingPayment ? "Consultando Banco Inter..." : "Já fiz o PIX • Verificar Pagamento"}</span>
                    </Button>
                  </div>

                  {paymentPendingFeedback && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 text-left max-w-md mx-auto animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-bold block">Aguardando registro no Banco Inter</span>
                        <p className="text-[11.5px] text-amber-800 leading-relaxed">
                          Se você acabou de pagar no app do seu banco, pode levar de 15 a 30 segundos para o sistema bancário registrar a compensação. Aguarde alguns instantes e clique novamente em <strong>Verificar Pagamento</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {paymentSuccessNotice && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5 text-left max-w-md mx-auto animate-in fade-in shadow-xs">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold block text-sm">Pagamento Confirmado!</span>
                        <span className="text-[11.5px] text-emerald-800">Seu PIX foi identificado com sucesso no Banco Inter. Sua reserva está confirmada!</span>
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-emerald-700 flex items-center justify-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
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
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs border-b border-slate-100 pb-2">
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
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm whitespace-normal leading-tight text-center shadow-md hover:shadow-lg active:scale-95 transition-all"
                      >
                        <CreditCard className="w-4 h-4 shrink-0" />
                        <span>Pagar no Cartão (Mercado Pago)</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
                      </a>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => handleChangePaymentMethod("card")}
                        disabled={changingMethod}
                        className="w-full h-auto min-h-11 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm whitespace-normal leading-tight text-center shadow-md gap-2"
                      >
                        <CreditCard className="w-4 h-4 shrink-0" />
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
                        className="w-full h-auto py-1.5 px-2 text-xs text-slate-600 hover:text-slate-900 font-semibold gap-1.5 whitespace-normal leading-tight text-center"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${checkingPayment ? "animate-spin text-sky-600" : ""}`} />
                        <span>Já realizei o pagamento no cartão (Verificar)</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
        )}

        {/* ── 2. Card: Acomodação & Chave de Acesso / Portaria ───────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center font-black text-sm shrink-0">
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
              isCancelled
                ? "bg-rose-50 text-rose-700 border-rose-200 font-bold text-xs"
                : data.isCheckinToday 
                  ? (isFlatClean ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs" : (isActivelyCleaning || !isPastOrExact14h ? "bg-amber-50 text-amber-700 border-amber-200 font-bold text-xs" : "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs"))
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs"
            }>
              {isCancelled
                ? "✕ Reserva Cancelada"
                : data.isCheckinToday 
                  ? (isFlatClean ? "✨ Flat Pronto e Limpo" : (isActivelyCleaning ? "🧹 Em Higienização" : (isPastOrExact14h ? "🔑 Check-in Liberado" : "🧹 Em Higienização")))
                  : "✨ Flat Confirmado & Preparado"
              }
            </Badge>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
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

              {Boolean(accessCode && isPaid && ((data.isCheckinToday && (isPastOrExact14h || isFlatClean)) || reservation.status === "in_house" || reservation.status === "checkin")) && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
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
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    <span>{copiedKey ? "Copiada!" : "Copiar"}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Status de Check-in e Governança no Dia da Chegada */}
            {data.isCheckinToday && !isCancelled && (
              <>
                {!isFlatClean && (isActivelyCleaning || !isPastOrExact14h) ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold block text-amber-950">Apartamento em Preparação & Higienização 🧹</span>
                        <p className="leading-relaxed">
                          Nossa equipe de governança está higienizando e preparando o flat para a sua estada. O horário oficial de check-in é a partir das <strong>14:00</strong>.
                        </p>
                        <p className="text-[11px] text-amber-800/90 pt-1 border-t border-amber-200/70 font-medium leading-relaxed">
                          ℹ️ O check-in antecipado (para reservas com benefício) é <strong>estritamente mediante disponibilidade</strong> após a conclusão da limpeza e inspeção. Assim que finalizado, a entrada é liberada na portaria 24h.
                        </p>
                      </div>
                    </div>

                    {/* Bloco de Previsão de Chegada: Prioriza a Limpeza */}
                    {reservation.estimatedArrivalTime && !editingArrival ? (
                      <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-900">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold block text-emerald-950">
                              Previsão de Chegada: {reservation.estimatedArrivalTime}
                            </span>
                            <span className="text-[11px] text-emerald-700">
                              ✓ Sua acomodação foi sinalizada como prioridade para a equipe de governança!
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCustomArrivalTime(reservation.estimatedArrivalTime || "")
                            setEditingArrival(true)
                          }}
                          className="h-7 px-3 text-xs font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg shrink-0 self-start sm:self-auto"
                        >
                          Alterar Horário
                        </Button>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-amber-50/90 border border-amber-300/80 rounded-xl space-y-2.5 text-xs text-amber-950">
                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block font-bold">Que horas você pretende chegar hoje? ⏰</strong>
                            <p className="text-[11px] text-amber-850 leading-relaxed mt-0.5">
                              Se você já souber o seu horário, nos avise para priorizarmos a finalização do seu flat ou verificarmos a liberação de uma acomodação pronta para entrada imediata!
                            </p>
                          </div>
                        </div>

                        {arrivalSuccessNotice && (
                          <div className="p-2 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span>Previsão salva com sucesso! Priorizamos seu apartamento na governança.</span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {["14:30", "15:00", "16:00", "17:00", "18:00", "19:00+"].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setSelectedArrivalTime(t)
                                setCustomArrivalTime("")
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                selectedArrivalTime === t 
                                  ? "bg-amber-700 text-white shadow-xs scale-105" 
                                  : "bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Input
                            value={customArrivalTime}
                            onChange={e => {
                              setCustomArrivalTime(e.target.value)
                              setSelectedArrivalTime("")
                            }}
                            placeholder="Ou digite o horário (ex: 16:30)"
                            className="h-8 text-xs bg-white border-amber-200 min-w-[160px] flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingArrival || (!selectedArrivalTime && !customArrivalTime.trim())}
                            onClick={handleSaveEstimatedArrival}
                            className="h-8 px-3 text-xs bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg shrink-0 gap-1.5"
                          >
                            {savingArrival ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>Salvar Previsão</span>
                          </Button>
                          {editingArrival && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingArrival(false)}
                              className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700 shrink-0"
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  (data.canDoEarlyCheckin && !isPastOrExact14h) ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold block text-emerald-950">Check-in Antecipado Liberado! 🎉</span>
                        <p className="leading-relaxed">
                          Seu apartamento já foi limpo e inspecionado com sucesso. O benefício de <strong>Early Check-in de cortesia</strong> (concedido mediante disponibilidade) está disponível! Você já pode se dirigir à portaria 24h e retirar seu acesso.
                        </p>
                        <p className="text-[11px] text-emerald-700/90 pt-1 border-t border-emerald-200/70 font-medium leading-relaxed">
                          ✨ Para garantir esse benefício em suas próximas viagens (sempre mediante disponibilidade), reserve diretamente pelo site:{" "}
                          <a
                            href="/reservar"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-bold text-emerald-900 hover:text-emerald-950 transition-colors"
                          >
                            corpflats.com.br
                          </a>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold block text-emerald-950">
                          {isFlatClean ? "Apartamento Limpo & Liberado! 🔑✨" : "Check-in Liberado na Portaria 24h! 🔑✨"}
                        </span>
                        <p className="leading-relaxed">
                          {isFlatClean
                            ? "A governança já concluiu a higienização da unidade. Seu apartamento já está 100% preparado e liberado na portaria 24h."
                            : "O horário oficial de check-in (a partir das 14:00) foi iniciado. Seu acesso à portaria 24h e ao flat está liberado."}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </Card>

        {/* ── 3. Card: Room Service & Café da Manhã (Exibido apenas quando contratado) ── */}
        {hasBreakfast && (
          <Card className="bg-gradient-to-b from-amber-50/50 via-white to-amber-50/20 border border-amber-200/70 rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/50 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100/70 text-amber-700 border border-amber-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                    Room Service & Café da Manhã
                  </h2>
                  <span className="text-xs text-amber-900/80 font-medium block mt-0.5">
                    Entregas diárias das 05h às 09h30 servidas pontualmente no flat
                  </span>
                </div>
              </div>

              <div className="flex items-center self-start sm:self-auto">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/60 border border-amber-200/50 text-amber-800 text-xs font-semibold shrink-0">
                  ☕ Incluso na Diária
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Monte o seu pedido selecionando frutas frescas, opções de pães, bebidas quentes e geladas de sua preferência, além do horário exato de entrega no flat.
            </p>

            {/* Se houver pedido já agendado para a data */}
            {breakfastOrder && (
              <div className="p-4 bg-white/95 rounded-2xl border border-amber-200 space-y-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-bold text-amber-900 text-xs sm:text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleFavorite(breakfastOrder.id)}
                    disabled={favoriteTogglingId === breakfastOrder.id}
                    className="flex-1 sm:flex-initial text-xs h-auto min-h-8 py-1.5 px-3 whitespace-normal leading-tight bg-white border-amber-200 text-amber-800 hover:bg-amber-50 flex items-center justify-center gap-1.5 rounded-xl font-semibold"
                  >
                    <Star className={`w-3.5 h-3.5 shrink-0 ${breakfastOrder.isFavorite ? "fill-amber-500 text-amber-500" : ""}`} />
                    <span>{breakfastOrder.isFavorite ? "Favoritado ⭐" : "Favoritar este Pedido"}</span>
                  </Button>

                  {(reservation.lastBreakfastOrder || breakfastOrder) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenRepeatModal(reservation.lastBreakfastOrder || breakfastOrder)}
                      className="flex-1 sm:flex-initial text-xs h-auto min-h-8 py-1.5 px-3 whitespace-normal leading-tight bg-white border-amber-200 text-amber-800 hover:bg-amber-50 flex items-center justify-center gap-1.5 rounded-xl font-semibold sm:ml-auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Repetir para Amanhã</span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Botões de Ação do Café */}
            <div className="flex flex-col gap-2.5 pt-1 w-full">
              <Button
                onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/cafe`)}
                className="w-full h-auto min-h-12 py-2.5 px-4 whitespace-normal leading-tight text-center bg-amber-700 hover:bg-amber-800 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm rounded-2xl shadow-sm shadow-amber-900/10 inline-flex items-center justify-center gap-2.5 transition-all"
              >
                <Coffee className="w-5 h-5 shrink-0" />
                <span>{breakfastOrder ? "Alterar ou Agendar Outros Dias" : "Personalizar Cardápio & Horário do Café"}</span>
                <ArrowRight className="w-5 h-5 shrink-0" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopyCafeLink}
                className="w-full h-auto min-h-12 py-2.5 px-4 whitespace-normal leading-tight text-center rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/90 text-stone-700 font-semibold text-xs sm:text-sm shadow-2xs transition-all inline-flex items-center justify-center gap-2"
              >
                {copiedCafeLink ? (
                  <>
                    <Check className="w-5 h-5 shrink-0 text-emerald-600" />
                    <span>Link do Café Copiado para a Área de Transferência!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 shrink-0 text-stone-500" />
                    <span>Copiar Link do Café</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Card: Frigobar & Autoatendimento no Flat ── */}
        <Card className="bg-gradient-to-b from-cyan-50/60 via-white to-cyan-50/30 border border-cyan-200/80 rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-200/60 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-cyan-100/80 text-cyan-700 border border-cyan-300/70 flex items-center justify-center shrink-0 shadow-xs">
                <Refrigerator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                  Frigobar & Bebidas
                </h2>
                <span className="text-xs text-cyan-950/80 font-medium block mt-0.5">
                  Água, refrigerantes, cervejas, snacks e café disponíveis no flat
                </span>
              </div>
            </div>
            <div className="flex items-center self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-100/70 border border-cyan-200/70 text-cyan-900 text-xs font-bold shrink-0">
                🧊 Autoatendimento 24h
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed space-y-2.5">
            <p>
              Consuma livremente durante sua estadia. Selecione os itens consumidos para registrar e efetuar o pagamento instantâneo via PIX ou Cartão de Crédito.
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Aviso importante:</strong> O consumo de frigobar é um serviço independente e não pode ser faturado junto com a diária de hospedagem. A nota fiscal é emitida separadamente pela distribuidora.
              </span>
            </div>
          </div>

          <div className="pt-1 w-full">
            <Button
              onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/frigobar`)}
              className="w-full h-auto min-h-12 py-3 px-5 bg-cyan-700 hover:bg-cyan-800 active:scale-[0.99] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-sm inline-flex items-center justify-center gap-2.5 transition-all"
            >
              <Refrigerator className="w-5 h-5 shrink-0" />
              <span>Acessar Frigobar do Flat {reservation.flatNumber}</span>
              <ArrowRight className="w-5 h-5 shrink-0" />
            </Button>
          </div>
        </Card>

        {/* ── 4. Card: Rede Wi-Fi ──────────────────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-black text-sm shrink-0">
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
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Rede Wi-Fi (SSID)</span>
                <span className="font-bold text-slate-900 text-sm block truncate">{wifiNetwork}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopySsid}
                className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 hover:bg-white text-slate-700 flex items-center gap-1.5 shrink-0"
              >
                {copiedSsid ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span>{copiedSsid ? "Copiada!" : "Copiar"}</span>
              </Button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Senha de Acesso</span>
                <span className="font-mono font-bold text-slate-900 text-sm block truncate">{wifiPassword}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyWifi}
                className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 hover:bg-white text-slate-700 flex items-center gap-1.5 shrink-0"
              >
                {copiedWifi ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span>{copiedWifi ? "Copiada!" : "Copiar"}</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* ── 5. Card: Estacionamento & Garagem Rotativa Gratuita ────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/70 flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">Estacionamento Rotativo Gratuito</h2>
                <span className="text-xs text-slate-500">Ampla garagem sem vaga demarcada, com segurança 24h e portão eletrônico</span>
              </div>
            </div>
            <div className="flex items-center self-start sm:self-auto">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                reservation.vehicle?.plate 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                  : "bg-sky-50 text-sky-700 border border-sky-200"
              }`}>
                {reservation.vehicle?.plate ? "✓ Veículo Liberado" : "Gratuito para Hóspedes"}
              </span>
            </div>
          </div>

          {portalCarSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>✓ Veículo salvo e liberado para acesso ao estacionamento na portaria 24h!</span>
            </div>
          )}

          {reservation.vehicle?.plate && !portalCarEditing ? (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Veículo Liberado na Portaria</span>
                <span className="text-base font-black font-mono text-slate-900 tracking-wider">
                  {reservation.vehicle.plate}
                </span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  {reservation.vehicle.brand} {reservation.vehicle.model} {reservation.vehicle.color ? `• ${reservation.vehicle.color}` : ""}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Estacionamento rotativo: você pode estacionar em qualquer vaga livre disponível.
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
                className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-white rounded-xl self-start sm:self-auto"
              >
                Alterar Carro
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveVehicle} className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Cadastre a placa do seu veículo para que a portaria 24h do Edifício Soho libere a sua entrada no estacionamento rotativo gratuito (estacione em qualquer vaga livre):
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
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl h-auto min-h-10 py-2 whitespace-normal leading-tight"
                >
                  {savingCar ? "Salvando..." : "Salvar e Liberar Estacionamento"}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-black text-sm shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900">Localização & Como Chegar</h2>
                <span className="text-xs text-slate-500 block">Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ</span>
              </div>
            </div>
            <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-bold">
              Soho Residence Service
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={data?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2"}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span>Abrir no Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </a>

            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(data?.hotelAddress || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ")}`}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Navigation className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Abrir no Waze</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </a>
          </div>
        </Card>

        {/* ── 8. Card: Regras de Convivência & Contrato ───────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">Regras dos Flats & Contrato</h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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


        {/* ── 10. Card: Política de Cancelamento & Estorno ────────────────── */}
        {(() => {
          const cancelPol = calculateCancellationPolicy(
            reservation.createdAt || reservation.checkinDate,
            reservation.checkinDate,
            Number(reservation.paidAmount || reservation.totalAmount || 0)
          )
          const isCancelledRes = isCancelled || reservation.status === "cancelada" || reservation.status === "CANCELLED" || reservation.isCancelled

          return (
            <Card className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-sky-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-900">Política de Cancelamento & Estorno</h2>
                </div>
                <Badge variant="outline" className={isCancelledRes ? "bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold" : cancelPol.policyType === "flexivel" ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold" : "bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold"}>
                  {isCancelledRes ? "✕ Reserva Cancelada" : cancelPol.badgeText}
                </Badge>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 text-xs">
                {isCancelledRes ? (
                  <div className="space-y-2">
                    <p className="text-rose-600 font-bold">Esta reserva foi cancelada.</p>
                    <p className="text-slate-500 text-[11px]">
                      {Number(reservation.refundAmount) > 0 
                        ? `Estorno de R$ ${Number(reservation.refundAmount).toFixed(2)} processado com sucesso.`
                        : (reservation.refundStatus === "estorno_100%_solicitado"
                            ? "Solicitação de estorno em processamento financeiro."
                            : "Cancelamento efetuado sem estorno conforme as políticas contratadas.")}
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

                    <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                      {["whatsapp", "site", "site_direto", "direto", "balcao"].includes((reservation.channel || "").toLowerCase()) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleOpenModifyModal}
                          className="w-full sm:w-auto justify-center text-xs sm:text-sm font-bold rounded-xl h-10 px-4 border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-800 flex items-center gap-2 shadow-2xs"
                        >
                          <Calendar className="w-4.5 h-4.5 text-sky-600 shrink-0" />
                          <span>Modificar Reserva</span>
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setCancelModalOpen(true)}
                        className="w-full sm:w-auto justify-center text-xs sm:text-sm font-bold rounded-xl h-10 px-4 flex items-center gap-1.5"
                      >
                        <Ban className="w-4 h-4 shrink-0" />
                        <span>Cancelar Reserva</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )
        })()}

        {/* ── Card: Central de Atendimento & Suporte ao Hóspede ───────────── */}
        <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-4 overflow-hidden relative">
          {/* Brilhos decorativos de fundo */}
          <div className="absolute -right-12 -top-12 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-44 h-44 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                <WhatsAppIcon className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Atendimento & Concierge 24h
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Dúvidas ou solicitações na estadia?
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                  Fale diretamente com nossa equipe de hospitalidade pelo WhatsApp para qualquer suporte ou comodidade no Flat {reservation.flatNumber}.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto">
              <a 
                href={whatsappUrl} 
                target="_blank" 
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all hover:shadow-emerald-500/40 shrink-0"
              >
                <WhatsAppIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <span>Conversar no WhatsApp</span>
              </a>
              <span className="text-[11px] text-slate-400 font-mono font-medium">
                {formatPhoneDisplay(adminWhatsApp)}
              </span>
            </div>
          </div>
        </Card>

        {/* Rodapé institucional discreto */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <p className="text-[11px] text-slate-400 font-medium">
            CorpFlats Hospedagem • Edifício Soho Residence Service
          </p>
          <p className="text-[10px] text-slate-400/80">
            Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ • Portaria 24 horas
          </p>
        </div>

      </main>

      {/* ── Modal Multi-Etapas: Modificar Reserva (Milestone 3) ──────────── */}
      <Dialog 
        open={modifyModalOpen} 
        onOpenChange={(open) => {
          if (!open && modStep === "checkout" && checkoutData?.pendingId) {
            if (confirm("Você possui um hold provisório ativo para estas datas. Deseja cancelar o bloqueio e manter suas datas originais?")) {
              handleCancelHold()
            }
            return
          }
          setModifyModalOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 sm:p-7 shadow-2xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center font-bold shadow-2xs shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                    {modStep === "preview" && "Modificar Estadia & Hóspedes"}
                    {modStep === "checkout" && "Pagamento da Alteração"}
                    {modStep === "success" && "Alteração Confirmada!"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Flat {reservation?.flatNumber} • Localizador: <strong className="font-mono text-slate-700">{reservation?.code}</strong>
                  </DialogDescription>
                </div>
              </div>

              {/* Indicador de Etapa */}
              <div className="flex items-center gap-1 shrink-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "preview" ? "bg-sky-600 text-white" : "bg-emerald-100 text-emerald-700"
                }`}>
                  1
                </span>
                <span className="w-3 h-0.5 bg-slate-200" />
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "checkout" ? "bg-sky-600 text-white" : (modStep === "success" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")
                }`}>
                  2
                </span>
                <span className="w-3 h-0.5 bg-slate-200" />
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "success" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                }`}>
                  3
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 1: SIMULAÇÃO & PREVIEW
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "preview" && (
            <div className="space-y-4 py-2 text-xs">
              {previewError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <strong className="block font-bold">Aviso de Disponibilidade</strong>
                    <span>{previewError}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Check-in (Entrada)</Label>
                  <Input
                    type="date"
                    value={modCheckinDate}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckinDate(val)
                      if (val && modCheckoutDate) handleRunPreview(val, modCheckoutDate, modGuestCount)
                    }}
                    required
                    className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Check-out (Saída)</Label>
                  <Input
                    type="date"
                    value={modCheckoutDate}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckoutDate(val)
                      if (modCheckinDate && val) handleRunPreview(modCheckinDate, val, modGuestCount)
                    }}
                    required
                    min={modCheckinDate || undefined}
                    className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-700 font-bold text-[11px]">Quantidade de Hóspedes</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(num => (
                    <Button
                      key={num}
                      type="button"
                      variant={modGuestCount === num ? "default" : "outline"}
                      onClick={() => {
                        setModGuestCount(num)
                        if (modCheckinDate && modCheckoutDate) handleRunPreview(modCheckinDate, modCheckoutDate, num)
                      }}
                      className={`h-9 rounded-xl text-xs font-bold ${
                        modGuestCount === num 
                          ? "bg-slate-900 text-white shadow-xs" 
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1 shrink-0" />
                      <span>{num} {num === 1 ? "Pessoa" : "Pessoas"}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-700 text-[11px]">Motivo da alteração (opcional):</Label>
                <Input
                  value={modReason}
                  onChange={e => setModReason(e.target.value)}
                  placeholder="Ex: Extensão a trabalho, reagendamento..."
                  className="bg-white border-slate-200 text-xs h-9 rounded-xl text-slate-900"
                />
              </div>

              {/* Status de Disponibilidade & Feedback */}
              {previewLoading && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center gap-2 text-slate-600 font-semibold">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                  <span>Consultando disponibilidade e calculando valores...</span>
                </div>
              )}

              {previewData && !previewLoading && (
                <div className="space-y-3 pt-1">
                  {/* Badge de Disponibilidade */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Status do Calendário
                    </span>
                    {previewData.available ? (
                      <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Disponível para o Período</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-600 text-white font-bold text-xs py-1 px-3 flex items-center gap-1.5">
                        <Ban className="w-3.5 h-3.5 shrink-0" />
                        <span>Indisponível / Conflito</span>
                      </Badge>
                    )}
                  </div>

                  {/* Detalhamento de Custos */}
                  <div className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-2.5">
                    <div className="flex flex-wrap justify-between items-center gap-1 text-slate-600">
                      <span>Duração da Estadia:</span>
                      <span className="font-bold text-slate-900">
                        {previewData.originalDates?.nights} diárias → {previewData.newDates?.nights} diárias
                        {previewData.extraNights > 0 && (
                          <span className="text-sky-600 font-bold ml-1">(+{previewData.extraNights})</span>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-between items-center gap-1 text-slate-600">
                      <span>Valor da Diária Base:</span>
                      <span className="font-bold text-slate-900">
                        R$ {Number(previewData.dailyRate).toFixed(2)}
                      </span>
                    </div>

                    {previewData.extraNights > 0 && (
                      <div className="flex flex-wrap justify-between items-center gap-1 pt-2 border-t border-slate-200/60 font-bold text-sky-950">
                        <span>Acréscimo a Pagar:</span>
                        <span className="text-base text-sky-600 font-mono">
                          + R$ {Number(previewData.additionalAmountToPay).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {previewData.refundAmount > 0 && (
                      <div className="flex flex-wrap justify-between items-center gap-1 pt-2 border-t border-slate-200/60 font-bold text-emerald-950">
                        <span>Estorno / Crédito Elegível:</span>
                        <span className="text-base text-emerald-600 font-mono">
                          - R$ {Number(previewData.refundAmount).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {!previewData.requiresPayment && previewData.refundAmount <= 0 && (
                      <div className="flex flex-wrap justify-between items-center gap-1 pt-2 border-t border-slate-200/60 font-bold text-slate-800">
                        <span>Acréscimo Financeiro:</span>
                        <span className="text-emerald-600 font-bold">R$ 0,00 (Sem custo adicional)</span>
                      </div>
                    )}
                  </div>

                  {/* Aviso da Regra de 24h */}
                  {previewData.isUnder24h && previewData.nonRefundableReduction && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <strong className="block font-bold">Regra de Cancelamento / Redução (Menos de 24h)</strong>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          A redução de diárias ou hóspedes com menos de 24h do início da estadia não confere direito a estorno ou reembolso conforme as condições contratuais.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModifyModalOpen(false)}
                  className="rounded-xl border-slate-200 text-slate-700"
                >
                  Cancelar
                </Button>

                {previewData?.available && previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleProceedToCheckout}
                    className="h-auto min-h-10 py-2 px-4 font-bold text-xs rounded-xl bg-sky-600 hover:bg-sky-700 text-white whitespace-normal leading-tight text-center shadow-xs gap-1.5"
                  >
                    <span>{checkoutLoading ? "Gerando Cobrança..." : `Continuar para Pagamento (R$ ${Number(previewData.additionalAmountToPay).toFixed(2)})`}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Button>
                )}

                {previewData?.available && !previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleConfirmZeroCostModify}
                    className="h-auto min-h-10 py-2 px-4 font-bold text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white whitespace-normal leading-tight text-center shadow-xs gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{checkoutLoading ? "Confirmando..." : "Confirmar Alteração de Datas"}</span>
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 2: CHECKOUT COM HOLD DE 30 MINUTOS
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "checkout" && checkoutData && (
            <div className="space-y-4 py-2 text-xs">
              {checkoutError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Banner de Hold Provisório com Cronômetro */}
              <div className="p-3.5 bg-sky-50 rounded-2xl border border-sky-200 flex flex-wrap items-center justify-between gap-3 text-sky-950">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Clock className="w-5 h-5 text-sky-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold block text-xs">Bloqueio Provisório de 30 Minutos</span>
                    <span className="text-[11px] text-sky-800">Suas datas estão reservadas enquanto conclui o pagamento.</span>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white border-sky-300 font-mono font-bold text-sm px-2.5 py-1 text-sky-700 shrink-0">
                  ⏳ {modTimeRemaining}
                </Badge>
              </div>

              {/* Caixa de Valor Adicional */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    Valor Adicional a Liquidar
                  </span>
                  <span className="text-xs text-slate-600">
                    Novas datas: {checkoutData.newDates?.checkinDate} até {checkoutData.newDates?.checkoutDate}
                  </span>
                </div>
                <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                  R$ {Number(checkoutData.additionalAmountToPay).toFixed(2)}
                </span>
              </div>

              {/* Seletor de Método de Pagamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModPaymentMethod("pix")}
                  className={`p-3 rounded-2xl border text-center font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    modPaymentMethod === "pix"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>PIX Instantâneo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModPaymentMethod("card")}
                  className={`p-3 rounded-2xl border text-center font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    modPaymentMethod === "card"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>Cartão de Crédito</span>
                </button>
              </div>

              {/* ABA PIX */}
              {modPaymentMethod === "pix" && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                  {checkoutData.pixQrCodeUrl && (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                        <img
                          src={checkoutData.pixQrCodeUrl}
                          alt="QR Code PIX para Alteração"
                          className="w-44 h-44 rounded-xl"
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium text-center">
                        Abra o app do seu banco e aponte a câmera para o QR Code.
                      </span>
                    </div>
                  )}

                  {checkoutData.pixCopiaECola && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap justify-between items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-700">PIX Copia e Cola:</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(checkoutData.pixCopiaECola)
                            setModCopiedPix(true)
                            setTimeout(() => setModCopiedPix(false), 3000)
                          }}
                          className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1"
                        >
                          {modCopiedPix ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                          <span>{modCopiedPix ? "Código Copiado!" : "Copiar Código PIX"}</span>
                        </button>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 break-all select-all max-h-16 overflow-y-auto">
                        {checkoutData.pixCopiaECola}
                      </div>

                      <Button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(checkoutData.pixCopiaECola)
                          setModCopiedPix(true)
                          setTimeout(() => setModCopiedPix(false), 3000)
                        }}
                        className="w-full h-auto min-h-10 py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 whitespace-normal leading-tight text-center mt-2 shadow-xs"
                      >
                        {modCopiedPix ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                        <span>{modCopiedPix ? "Código PIX Copiado com Sucesso!" : "Copiar Código PIX"}</span>
                      </Button>
                    </div>
                  )}

                  {/* Feedback de Polling Ativo */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-center gap-2 text-emerald-800 font-semibold text-xs text-center">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                    <span>Aguardando confirmação bancária em tempo real...</span>
                  </div>
                </div>
              )}

              {/* ABA CARTÃO DE CRÉDITO */}
              {modPaymentMethod === "card" && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                  <div className="text-center space-y-2 py-2">
                    <CreditCard className="w-10 h-10 text-sky-600 mx-auto" />
                    <h4 className="font-bold text-slate-900 text-sm">Checkout Seguro Mercado Pago</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Você será redirecionado para o ambiente protegido do Mercado Pago para efetuar o pagamento com cartão de crédito.
                    </p>
                  </div>

                  {checkoutData.mpCheckoutUrl && (
                    <a
                      href={checkoutData.mpCheckoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-auto min-h-11 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 whitespace-normal leading-tight text-center shadow-xs transition-colors"
                    >
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>Pagar no Mercado Pago ↗</span>
                    </a>
                  )}

                  {/* Feedback de Polling Ativo */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-600 font-semibold text-xs text-center">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600 shrink-0" />
                    <span>Após concluir o pagamento, esta tela atualizará automaticamente.</span>
                  </div>
                </div>
              )}

              <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancellingHold}
                  onClick={handleCancelHold}
                  className="h-auto min-h-10 py-2 px-4 rounded-xl border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-800 text-xs font-bold whitespace-normal leading-tight text-center"
                >
                  {cancellingHold ? "Cancelando Bloqueio..." : "Cancelar e Manter Datas Originais"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModStep("preview")}
                  className="h-auto min-h-10 py-2 px-4 rounded-xl text-slate-600 text-xs font-semibold whitespace-normal leading-tight text-center"
                >
                  ← Voltar à Simulação
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 3: SUCESSO & PROMPT DE RE-ASSINATURA OBRIGATÓRIA (R3)
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "success" && modifySuccessInfo && (
            <div className="space-y-4 py-3 text-xs">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-emerald-950">
                    Estadia Alterada com Sucesso!
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {modifySuccessInfo.message}
                  </p>
                </div>
              </div>

              {/* Demonstrativo das Novas Datas */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-200 pb-1">
                  Resumo da Hospedagem Atualizada
                </span>
                <div className="flex flex-wrap justify-between gap-1">
                  <span>Novo Período:</span>
                  <strong className="text-slate-900 font-bold">
                    {modifySuccessInfo.newCheckinDate} até {modifySuccessInfo.newCheckoutDate}
                  </strong>
                </div>
                <div className="flex flex-wrap justify-between gap-1">
                  <span>Acomodação:</span>
                  <strong className="text-slate-900 font-bold">
                    Flat {modifySuccessInfo.newFlatNumber}
                  </strong>
                </div>
              </div>

              {/* ALERTA CRÍTICO: RE-ASSINATURA OBRIGATÓRIA DA FICHA DE CHECK-IN */}
              {modifySuccessInfo.needsReSignature && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <strong className="block text-amber-950 font-bold text-sm">
                        Assinatura da Ficha de Check-in Necessária
                      </strong>
                      <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                        Como as datas ou a acomodação da sua reserva foram alteradas, sua assinatura digital anterior foi invalidada. É obrigatório assinar a nova Ficha Nacional de Registro de Hóspedes (FNRH) com as informações atualizadas.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      setModifyModalOpen(false)
                      setLocation(modifySuccessInfo.reSignatureUrl || `/pre-checkin/${encodeURIComponent(reservation?.code || code)}?resign=1`)
                    }}
                    className="w-full h-auto min-h-11 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm whitespace-normal leading-tight text-center shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <FileText className="w-4.5 h-4.5 shrink-0" />
                    <span>Assinar Nova Ficha de Check-in Agora →</span>
                  </Button>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModifyModalOpen(false)}
                  className="w-full h-auto min-h-10 py-2 px-4 rounded-xl border-slate-200 text-slate-700 font-bold text-xs whitespace-normal leading-tight text-center"
                >
                  Concluir e Voltar ao Painel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmação de Cancelamento ──────────────────────────── */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
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
                  <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-sm">
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
                          setData((prev: any) => prev ? ({
                            ...prev,
                            reservation: {
                              ...prev.reservation,
                              status: "cancelada",
                              isCancelled: true,
                              cancelledAt: json.reservation?.cancelledAt || new Date().toISOString(),
                              cancellationReason: cancelReason || "Cancelamento pelo hóspede via autoatendimento",
                              refundStatus: json.refundStatus || "sem_reembolso",
                              refundAmount: json.refundAmount || 0,
                              doorPassword: null,
                              accessCode: null
                            }
                          }) : null)
                          await fetchPortalData(reservation?.code || code)
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

      {/* ── Modal: Recibo Oficial de Pagamento & Quitação ─────────────── */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 sm:p-7 shadow-2xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center font-bold shadow-2xs shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                    Recibo Oficial de Pagamento
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Comprovante de quitação e confirmação de reserva
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3 shrink-0">
                ✓ PAGO & QUITADO
              </Badge>
            </div>
          </DialogHeader>

          {/* Área Formatada para Impressão e Visualização */}
          <div id="corpflats-receipt-content" className="space-y-3.5 pt-2">
            {/* Cabeçalho do Recibo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <div>
                <span className="text-xs font-black text-slate-900 tracking-tight block">
                  CORPFLATS HOSPEDAGENS LTDA
                </span>
                <span className="text-[11px] text-slate-500 block">
                  CNPJ: 47.964.813/0001-65 • Campos dos Goytacazes - RJ
                </span>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Recibo Nº</span>
                <span className="font-mono text-xs font-black text-slate-800">
                  REC-{reservation.code}
                </span>
              </div>
            </div>

            {/* Dados do Hóspede e Reserva */}
            <div className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-200/60 pb-1">
                Identificação da Reserva
              </span>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Hóspede Titular:</span>
                <span className="font-bold text-slate-900">{guestName}</span>
              </div>
              {reservation.guestDocument && (
                <div className="flex flex-wrap justify-between gap-1">
                  <span className="text-slate-500">CPF / Documento:</span>
                  <span className="font-mono font-semibold text-slate-800">{reservation.guestDocument}</span>
                </div>
              )}
              {reservation.guestPhone && (
                <div className="flex flex-wrap justify-between gap-1">
                  <span className="text-slate-500">Telefone / WhatsApp:</span>
                  <span className="font-semibold text-slate-800">{formatPhoneDisplay(reservation.guestPhone)}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Código Localizador:</span>
                <span className="font-mono font-bold text-sky-700">{reservation.code}</span>
              </div>
            </div>

            {/* Detalhes da Acomodação */}
            <div className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-200/60 pb-1">
                Acomodação & Estadia
              </span>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Unidade:</span>
                <span className="font-bold text-slate-900">Apartamento {reservation.flatNumber} ({reservation.roomCategory || "Studio Executivo"})</span>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Check-in:</span>
                <span className="font-semibold text-slate-800">{checkinFormatted} (a partir das 14:00)</span>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Check-out:</span>
                <span className="font-semibold text-slate-800">{checkoutFormatted} (até as 12:00)</span>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Período Contratado:</span>
                <span className="font-semibold text-slate-800">{nights} diária{nights > 1 ? "s" : ""} • {reservation.guestCount || 1} hóspede{(reservation.guestCount || 1) > 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Dados da Transação e Quitação */}
            <div className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-200/60 pb-1">
                Detalhamento Financeiro & Liquidação
              </span>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">Forma de Liquidação:</span>
                <span className="font-bold text-slate-900">
                  {isOta 
                    ? (channelLower.includes("booking") ? "🌐 Booking.com (Canal Parceiro)" : "🔴 Airbnb (Canal Parceiro)")
                    : (isCardPayment
                        ? (isDebitCard ? "💳 Cartão de Débito" : (reservation.mpPaymentId ? "💳 Cartão de Crédito (Mercado Pago)" : "💳 Cartão de Crédito"))
                        : (reservation.pixEndToEndId || reservation.pixTxId 
                            ? "⚡ PIX Instantâneo (Banco Inter)" 
                            : (channelLower.includes("whatsapp") ? "💬 WhatsApp / CorpFlats" : "PIX Oficial Banco Inter")))}
                </span>
              </div>
              {reservation.paidAt && (
                <div className="flex flex-wrap justify-between gap-1">
                  <span className="text-slate-500">Data e Hora do Pagamento:</span>
                  <span className="font-semibold text-slate-800">
                    {format(parseISO(reservation.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                  </span>
                </div>
              )}
              {isCardPayment && reservation.mpPaymentId && (
                <div className="space-y-0.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium block">Identificador da Transação (Cartão / Mercado Pago):</span>
                  <span className="font-mono text-[10.5px] text-sky-800 font-bold break-all block bg-white p-1.5 rounded-lg border border-slate-200/70 select-all">
                    {reservation.mpPaymentId}
                  </span>
                </div>
              )}
              {!isCardPayment && reservation.pixEndToEndId && (
                <div className="space-y-0.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium block">End-to-End ID (Banco Central):</span>
                  <span className="font-mono text-[10.5px] text-emerald-800 font-bold break-all block bg-white p-1.5 rounded-lg border border-slate-200/70 select-all">
                    {reservation.pixEndToEndId}
                  </span>
                </div>
              )}
              {!isCardPayment && reservation.pixTxId && !reservation.pixEndToEndId && (
                <div className="space-y-0.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium block">Identificador TxID:</span>
                  <span className="font-mono text-[10.5px] text-slate-700 font-bold break-all block bg-white p-1.5 rounded-lg border border-slate-200/70 select-all">
                    {reservation.pixTxId}
                  </span>
                </div>
              )}
            </div>

            {/* Caixa de Valor Total Quitado */}
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                  Total Liquidado
                </span>
                <span className="text-xs text-emerald-700 font-medium">
                  Saldo Restante: R$ 0,00
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-black text-emerald-800 font-mono">
                R$ {paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-[10.5px] text-slate-500 leading-relaxed">
              Este documento comprova a quitação integral dos valores descritos e garante o acesso à unidade nas datas e horários estipulados.
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyReceipt}
              className="h-auto min-h-11 py-2.5 px-4 rounded-2xl text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 whitespace-normal leading-tight text-center flex-1"
            >
              {copiedReceipt ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Copy className="w-4 h-4 text-slate-500 shrink-0" />}
              <span>{copiedReceipt ? "Comprovante Copiado!" : "Copiar Dados"}</span>
            </Button>

            <Button
              type="button"
              onClick={handlePrintReceipt}
              className="h-auto min-h-11 py-2.5 px-4 rounded-2xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 whitespace-normal leading-tight text-center shadow-sm flex-1"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Imprimir / Salvar em PDF</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Regras da Casa & Contrato ────────────────────────────── */}
      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0" />
              Regras dos Flats & Contrato de Hospedagem
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Termos aceitos no momento da reserva para a garantia de uma excelente estadia.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors leading-snug ${
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
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors leading-snug ${
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
