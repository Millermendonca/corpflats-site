import { memo, useState, useEffect, useRef, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { PdfPreview, openPdfInNewTab } from "@/components/pdf-preview"
import {
  Building2, User, CheckCircle2, AlertTriangle, Lock, Unlock,
  LogOut, Clock, RefreshCw, FileText, ShieldCheck, Undo2,
  Sparkles, BedDouble, UserCheck, KeyRound, AlertCircle,
  ZoomIn, Eye, ExternalLink, MessageCircle, Download, QrCode, Send, Loader2,
  Copy, Check, Car, X
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { getCheckinUrl } from "@/lib/checkin-url"
import { useToast } from "@/hooks/use-toast"
import { useBackTabState } from "@/lib/back-navigation"
import { formatSmartPhone } from "@/lib/phone-mask"
import { FrozenSlot } from "@/lib/render-freeze"

const ReceptionHeaderDate = memo(function ReceptionHeaderDate() {
  const [dateLabel, setDateLabel] = useState(() =>
    format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })
  )
  useEffect(() => {
    const timer = setInterval(() => {
      const next = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })
      setDateLabel(prev => (prev === next ? prev : next))
    }, 30_000)
    return () => clearInterval(timer)
  }, [])
  return <p className="text-xs text-slate-400 font-medium">{dateLabel}</p>
})

const ReceptionLiveClock = memo(function ReceptionLiveClock() {
  const [timeStr, setTimeStr] = useState(() => format(new Date(), "HH:mm:ss"))
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(format(new Date(), "HH:mm:ss"))
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="text-xl sm:text-2xl font-black text-primary font-mono tracking-wider">
      {timeStr}
    </div>
  )
})

function buildWhatsAppWebUrl(rawPhone: string | undefined | null, text: string): string {
  const digits = String(rawPhone || "").replace(/\D/g, "")
  if (!digits) return "#"
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}

function isPdfAssetUrl(url: string | undefined | null, failedAsPdf?: Record<string, boolean>): boolean {
  if (!url || typeof url !== "string") return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (failedAsPdf && failedAsPdf[trimmed]) return true
  if (/^data:application\/pdf/i.test(trimmed)) return true
  const withoutQuery = trimmed.split("?")[0].split("#")[0].toLowerCase()
  if (withoutQuery.endsWith(".pdf")) return true
  if (/[?&]mime=application%2Fpdf/i.test(trimmed) || /[?&]mime=application\/pdf/i.test(trimmed)) return true
  return false
}

interface CheckinLinkSlot {
  index: number
  name: string
  phone: string
  hasCompletedCheckin: boolean
  checkinUrl: string
  qrCodeDataUrl: string | null
}

export default function ReceptionTablet() {
  const { toast } = useToast()
  const [copiedCheckinKey, setCopiedCheckinKey] = useState<string | null>(null)
  const [failedImgAsPdf, setFailedImgAsPdf] = useState<Record<string, boolean>>({})
  const [focusedResQuery, setFocusedResQuery] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return new URLSearchParams(window.location.search).get("res")?.trim() || ""
  })

  const [data, setData] = useState<{
    today: string
    arrivals: any[]
    inHouse: any[]
    completedToday: any[]
    departures: any[]
    totalFlats: number
    focusedReservation: any | null
  }>({
    today: format(new Date(), "yyyy-MM-dd"),
    arrivals: [],
    inHouse: [],
    completedToday: [],
    departures: [],
    totalFlats: 0,
    focusedReservation: null
  })

  const [activeTab, setActiveTab] = useState<"arrivals" | "inHouse" | "completed">("arrivals")
  const [loading, setLoading] = useState(true)
  const deepLinkHandledRef = useRef(false)

  // Modal Ficha FNRH / Check-in Digital
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [fnhrModalOpen, setFnhrModalOpen] = useState(false)
  const [modalGuestIndex, setModalGuestIndex] = useState(1)
  const [modalViewMode, setModalViewMode] = useState<"pdf" | "data">("pdf")

  // Visualizador Ampliado de Fotos (Zoom / Lightbox) — <Dialog> já registra useBackLayer automaticamente
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; title: string } | null>(null)
  useBackTabState(activeTab, setActiveTab, { id: "reception-main-tabs" })

  // Diálogo de Liberação Forçada de Quarto em Limpeza (apenas janela regular >= 14:00)
  const [forceCheckinItem, setForceCheckinItem] = useState<any | null>(null)

  // Diálogo de Confirmação de Entrada Parcial
  const [partialCheckinItem, setPartialCheckinItem] = useState<{
    item: any
    clearedGuests: any[]
    pendingGuests: any[]
  } | null>(null)

  // Modal 1: Enviar Link para Check-in Digital + QR Code (Balcão e Remoto)
  const [sendLinkModalItem, setSendLinkModalItem] = useState<any | null>(null)
  const [sendLinkSlots, setSendLinkSlots] = useState<CheckinLinkSlot[]>([])
  const [sendLinkLoading, setSendLinkLoading] = useState(false)
  const [sendLinkGuestIndex, setSendLinkGuestIndex] = useState(1)
  const [sendLinkPhone, setSendLinkPhone] = useState("")
  const [sendLinkGuestName, setSendLinkGuestName] = useState("")
  const [sendingLinkKey, setSendingLinkKey] = useState<string | null>(null)
  const [sendLinkFeedback, setSendLinkFeedback] = useState<{
    type: "success" | "error"
    message: string
    waWebUrl?: string | null
  } | null>(null)

  // Modal 2: Verificar Permissão para Early Check-in (Checklist Sofia em Tempo Real)
  const [earlyCheckinModalItem, setEarlyCheckinModalItem] = useState<any | null>(null)
  const [earlyRequestNote, setEarlyRequestNote] = useState("")
  const [earlyRequestLoading, setEarlyRequestLoading] = useState(false)
  const [earlyRequestFeedback, setEarlyRequestFeedback] = useState<{
    type: "success" | "error"
    message: string
    fallbackWaWebUrl?: string | null
  } | null>(null)

  const fetchToday = useCallback(async (overrideResQuery?: string) => {
    setLoading(true)
    try {
      const activeQuery = overrideResQuery !== undefined ? overrideResQuery : focusedResQuery
      const url = activeQuery
        ? `/api/reception/today?res=${encodeURIComponent(activeQuery)}`
        : "/api/reception/today"
      const res = await fetch(url)
      if (!res.ok) {
        console.error("Falha ao buscar dados da recepção: status", res.status)
        return
      }
      const json = await res.json()
      if (json && typeof json === "object") {
        setData({
          today: json.today || format(new Date(), "yyyy-MM-dd"),
          arrivals: Array.isArray(json.arrivals) ? json.arrivals : [],
          inHouse: Array.isArray(json.inHouse) ? json.inHouse : [],
          completedToday: Array.isArray(json.completedToday) ? json.completedToday : [],
          departures: Array.isArray(json.departures) ? json.departures : [],
          totalFlats: typeof json.totalFlats === "number" ? json.totalFlats : 0,
          focusedReservation: json.focusedReservation || null
        })
      }
    } catch (err) {
      console.error("Erro ao carregar dados da recepção:", err)
    } finally {
      setLoading(false)
    }
  }, [focusedResQuery])

  useEffect(() => {
    fetchToday()
    const poll = setInterval(() => fetchToday(), 15000)
    return () => clearInterval(poll)
  }, [fetchToday])

  // Mantém os itens abertos em modais sincronizados com o polling em tempo real
  const resolveLiveItem = useCallback((snapshotItem: any | null) => {
    if (!snapshotItem) return null
    const allItems = [
      ...(data.arrivals || []),
      ...(data.inHouse || []),
      ...(data.completedToday || []),
      ...(data.focusedReservation ? [data.focusedReservation] : [])
    ]
    return allItems.find(
      x => x && (x.id === snapshotItem.id || (x.code && x.code === snapshotItem.code))
    ) || snapshotItem
  }, [data])

  const openSendLinkModal = useCallback(async (item: any, preferredGuestIndex?: number) => {
    if (!item) return
    const guestsList = Array.isArray(item.guests) && item.guests.length > 0
      ? item.guests
      : [{ index: 1, name: item.guestName, phone: item.guestPhone, hasCompletedCheckin: item.hasPreCheckin }]
    const firstPending = guestsList.find((g: any) => !g.hasCompletedCheckin)
    const initialIdx = preferredGuestIndex || firstPending?.index || 1
    const initialGuest = guestsList.find((g: any) => Number(g.index) === Number(initialIdx)) || guestsList[0]

    setSendLinkModalItem(item)
    setSendLinkGuestIndex(initialIdx)
    setSendLinkPhone(initialGuest?.phone || (initialIdx === 1 ? item.guestPhone || "" : ""))
    setSendLinkGuestName(initialGuest?.name || (initialIdx === 1 ? item.guestName || "" : `Hóspede ${initialIdx}`))
    setSendLinkFeedback(null)

    const fallbackSlots: CheckinLinkSlot[] = guestsList.map((g: any, idx: number) => {
      const slotIndex = Number(g.index) || idx + 1
      return {
        index: slotIndex,
        name: g.name || (slotIndex === 1 ? item.guestName : `Hóspede ${slotIndex}`),
        phone: g.phone || (slotIndex === 1 ? item.guestPhone || "" : ""),
        hasCompletedCheckin: Boolean(g.hasCompletedCheckin),
        checkinUrl: getCheckinUrl(item, slotIndex),
        qrCodeDataUrl: null
      }
    })
    setSendLinkSlots(fallbackSlots)

    const resId = item.id || item.code
    if (!resId) return
    setSendLinkLoading(true)
    try {
      const res = await fetch(`/api/reception/reservations/${encodeURIComponent(String(resId))}/checkin-link-info`)
      if (res.ok) {
        const info = await res.json()
        if (Array.isArray(info.guests) && info.guests.length > 0) {
          setSendLinkSlots(info.guests)
          const matchedSlot = info.guests.find((s: CheckinLinkSlot) => Number(s.index) === Number(initialIdx)) || info.guests[0]
          if (matchedSlot) {
            setSendLinkGuestIndex(matchedSlot.index)
            setSendLinkPhone(matchedSlot.phone || "")
            setSendLinkGuestName(matchedSlot.name || "")
          }
        }
      }
    } catch (err) {
      console.warn("Falha ao buscar QR Code de check-in:", err)
    } finally {
      setSendLinkLoading(false)
    }
  }, [])

  const openEarlyCheckinModal = useCallback((item: any) => {
    if (!item) return
    setEarlyCheckinModalItem(item)
    setEarlyRequestNote("")
    setEarlyRequestFeedback(null)
  }, [])

  // Tratamento de Deep-Link vindo dos botões dos e-mails da recepção (?res=CODE&action=...)
  useEffect(() => {
    if (loading || deepLinkHandledRef.current || typeof window === "undefined") return
    deepLinkHandledRef.current = true
    const params = new URLSearchParams(window.location.search)
    const resParam = (params.get("res") || "").trim()
    const actionParam = (params.get("action") || "").trim()
    if (!resParam && !actionParam) {
      return
    }

    const upper = resParam.toUpperCase()
    const matchFn = (x: any) =>
      x &&
      (String(x.code || "").toUpperCase() === upper ||
        String(x.reservationCode || "").toUpperCase() === upper ||
        String(x.id || "").toUpperCase() === upper)

    const inArrivals = (data.arrivals || []).find(matchFn)
    const inHotel = (data.inHouse || []).find(matchFn)
    const inCompleted = (data.completedToday || []).find(matchFn)
    const targetItem = inArrivals || inHotel || inCompleted || data.focusedReservation

    if (inHotel && !inArrivals) {
      setActiveTab("inHouse")
    } else if (inCompleted && !inArrivals && !inHotel) {
      setActiveTab("completed")
    } else if (targetItem) {
      setActiveTab("arrivals")
    }

    if (actionParam) {
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete("action")
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}`)
    }

    if (targetItem) {
      if (actionParam === "send-checkin-link") {
        openSendLinkModal(targetItem)
      } else if (actionParam === "verify-early-checkin") {
        openEarlyCheckinModal(targetItem)
      }

      setTimeout(() => {
        const el = document.getElementById(`portaria-res-${targetItem.id}`)
        el?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 150)
    }
  }, [loading, data, openSendLinkModal, openEarlyCheckinModal])

  const handleSelectSendLinkGuest = (slotIdx: number) => {
    setSendLinkGuestIndex(slotIdx)
    setSendLinkFeedback(null)
    const slot = sendLinkSlots.find(s => Number(s.index) === Number(slotIdx))
    if (slot) {
      setSendLinkPhone(slot.phone || "")
      setSendLinkGuestName(slot.name || `Hóspede ${slotIdx}`)
    }
  }

  const handleDispatchCheckinLink = async () => {
    const liveItem = resolveLiveItem(sendLinkModalItem)
    if (!liveItem) return
    const resId = liveItem.id || liveItem.code
    const cleanPhone = sendLinkPhone.replace(/\D/g, "")
    if (cleanPhone.length < 10) {
      setSendLinkFeedback({
        type: "error",
        message: "Digite um número de WhatsApp válido com DDD (ex: 22999999999) ou peça ao hóspede para escanear o QR Code ao lado."
      })
      return
    }

    const key = `${resId}-${sendLinkGuestIndex}`
    setSendingLinkKey(key)
    setSendLinkFeedback(null)
    try {
      const res = await fetch(`/api/reception/reservations/${encodeURIComponent(String(resId))}/resend-checkin-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestIndex: sendLinkGuestIndex,
          phone: sendLinkPhone.trim(),
          guestName: sendLinkGuestName.trim()
        })
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setSendLinkFeedback({
          type: "success",
          message: `Link de Check-in Digital enviado com sucesso no WhatsApp para ${result.guestName || sendLinkGuestName} (${result.phone})!`,
          waWebUrl: result.waWebUrl || null
        })
        if (result.checkinUrl || result.qrCodeDataUrl) {
          setSendLinkSlots(prev =>
            prev.map(s =>
              s.index === sendLinkGuestIndex
                ? {
                    ...s,
                    phone: sendLinkPhone.trim(),
                    name: sendLinkGuestName.trim() || s.name,
                    checkinUrl: result.checkinUrl || s.checkinUrl,
                    qrCodeDataUrl: result.qrCodeDataUrl || s.qrCodeDataUrl
                  }
                : s
            )
          )
        }
        fetchToday()
      } else {
        setSendLinkFeedback({
          type: "error",
          message: result.error || "Não foi possível disparar automaticamente pelo WhatsApp.",
          waWebUrl: result.waWebUrl || null
        })
      }
    } catch (err: any) {
      setSendLinkFeedback({
        type: "error",
        message: `Falha de conexão ao enviar link: ${err?.message || "Verifique a rede."}`
      })
    } finally {
      setSendingLinkKey(null)
    }
  }

  const handleRequestEarlyCheckinAnalysis = async () => {
    const liveItem = resolveLiveItem(earlyCheckinModalItem)
    if (!liveItem) return
    const resId = liveItem.id || liveItem.code
    setEarlyRequestLoading(true)
    setEarlyRequestFeedback(null)
    try {
      const res = await fetch(`/api/reception/reservations/${encodeURIComponent(String(resId))}/request-early-checkin-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: earlyRequestNote.trim()
        })
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setEarlyRequestFeedback({
          type: "success",
          message: result.message || "Solicitação enviada para o WhatsApp da Administração! Assim que autorizarem no sistema, o status mudará automaticamente para Liberado.",
          fallbackWaWebUrl: result.fallbackWaWebUrl || null
        })
      } else {
        setEarlyRequestFeedback({
          type: "error",
          message: result.error || "Não foi possível enviar a solicitação para a Administração."
        })
      }
    } catch (err: any) {
      setEarlyRequestFeedback({
        type: "error",
        message: `Erro de conexão com o servidor: ${err?.message || "Tente novamente."}`
      })
    } finally {
      setEarlyRequestLoading(false)
    }
  }

  const handleCheckin = async (resItem: any, force = false, guestIndices?: number[], isPartial = false) => {
    const rawGuests = resItem.guests || [{ index: 1, name: resItem.guestName, hasCompletedCheckin: resItem.hasPreCheckin, entryAuthorized: false }]
    const completedGuests = rawGuests.filter((g: any) => g.hasCompletedCheckin && !g.needsReSignature)
    const pendingGuests = rawGuests.filter((g: any) => !g.hasCompletedCheckin || g.needsReSignature)
    const checklist = resItem.earlyCheckinChecklist

    if (resItem.needsReSignature || completedGuests.length === 0) {
      openSendLinkModal(resItem, 1)
      toast({
        title: "Check-in Digital Pendente",
        description: "O hóspede precisa concluir o Check-in Digital antes da liberação da entrada. Envie o link no WhatsApp ou mostre o QR Code na tela.",
        variant: "destructive"
      })
      return
    }

    if (checklist?.isCheckinDateFuture || checklist?.isTimeAllowed === false) {
      openEarlyCheckinModal(resItem)
      return
    }

    if (!resItem.isRoomReady && !checklist?.isRegularCheckinWindow) {
      openEarlyCheckinModal(resItem)
      return
    }

    // Se houver hóspedes pendentes e ainda não foi confirmado modal parcial nem especificado hóspedes
    if (pendingGuests.length > 0 && !isPartial && (!guestIndices || guestIndices.length === 0)) {
      const clearedNotEntered = rawGuests.filter((g: any) => g.hasCompletedCheckin && !g.needsReSignature && !g.entryAuthorized)
      setPartialCheckinItem({
        item: resItem,
        clearedGuests: clearedNotEntered.length > 0 ? clearedNotEntered : completedGuests,
        pendingGuests
      })
      return
    }

    if (!resItem.isRoomReady && !force) {
      setForceCheckinItem(resItem)
      return
    }

    try {
      const payload: any = { force: Boolean(force) }
      if (isPartial) {
        payload.partial = true
      }
      if (guestIndices && guestIndices.length > 0) {
        payload.guestIndices = guestIndices
      }

      const res = await fetch(`/api/reception/checkin/${encodeURIComponent(String(resItem.id))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.earlyCheckinBlocked || err.roomNotReady) {
          openEarlyCheckinModal(resItem)
        }
        toast({
          title: "Entrada não liberada",
          description: err.error || "Erro ao registrar check-in.",
          variant: "destructive"
        })
        return
      }
      setForceCheckinItem(null)
      setPartialCheckinItem(null)
      setEarlyCheckinModalItem(null)
      toast({
        title: `Entrada liberada • Apt ${resItem.flatNumber}`,
        description: `${resItem.guestName} registrado(a) com sucesso na portaria.`
      })
      fetchToday()
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível comunicar com o servidor ao registrar check-in.",
        variant: "destructive"
      })
    }
  }

  const executePartialCheckin = async (info: { item: any; clearedGuests: any[]; pendingGuests: any[] }) => {
    await handleCheckin(
      info.item,
      true,
      info.clearedGuests.map((g: any) => g.index),
      true
    )
  }

  const handleCheckout = async (resItem: any) => {
    try {
      const res = await fetch(`/api/reception/checkout/${encodeURIComponent(String(resItem.id))}`, {
        method: "POST"
      })
      if (res.ok) {
        toast({
          title: `Check-out concluído • Apt ${resItem.flatNumber}`,
          description: "Saída registrada e apartamento sinalizado para a governança."
        })
      }
      fetchToday()
    } catch {}
  }

  const handleUndoCheckout = async (resItem: any) => {
    try {
      await fetch(`/api/reception/undo-checkout/${encodeURIComponent(String(resItem.id))}`, {
        method: "POST"
      })
      fetchToday()
    } catch {}
  }

  const isFocusedOnlyOutsideTabs = Boolean(
    data.focusedReservation &&
      !(data.arrivals || []).some(x => x.id === data.focusedReservation.id) &&
      !(data.inHouse || []).some(x => x.id === data.focusedReservation.id) &&
      !(data.completedToday || []).some(x => x.id === data.focusedReservation.id)
  )

  const renderArrivalStyleCard = (item: any, isHighlightedBanner = false) => {
    const isClean = Boolean(item.isRoomReady)
    const checklist = item.earlyCheckinChecklist || {}
    const isFocusedMatch = Boolean(
      focusedResQuery &&
        (String(item.code || "").toUpperCase() === focusedResQuery.toUpperCase() ||
          String(item.id || "").toUpperCase() === focusedResQuery.toUpperCase())
    )

    const guestsList = item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: item.hasPreCheckin, entryAuthorized: false }]
    const totalGuests = guestsList.length
    const completedGuests = guestsList.filter((g: any) => g.hasCompletedCheckin && !g.needsReSignature).length
    const pendingGuests = guestsList.filter((g: any) => !g.hasCompletedCheckin || g.needsReSignature)
    const enteredGuests = guestsList.filter((g: any) => g.entryAuthorized)
    const clearedNotEntered = guestsList.filter((g: any) => g.hasCompletedCheckin && !g.needsReSignature && !g.entryAuthorized)

    return (
      <div
        id={`portaria-res-${item.id}`}
        key={item.id}
        className={`bg-slate-800/80 border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all shadow-lg ${
          isFocusedMatch || isHighlightedBanner
            ? "border-primary ring-2 ring-primary/30"
            : "border-slate-700/80 hover:border-slate-600"
        }`}
      >
        {/* Top: Flat number, Guest Info and Channel */}
        <div className="border-b border-slate-700/60 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Apt {item.flatNumber}
              </span>
              {item.code && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">
                  #{item.code}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold capitalize px-2.5 py-0.5 rounded-full bg-slate-700/80 text-sky-400 border border-slate-600/60">
              {item.channelLabel || item.channel}
            </span>
          </div>
          <div className="font-bold text-base text-slate-100 mt-1 truncate">
            {item.guestName}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
            {item.guestPhone ? (
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <a
                  href={buildWhatsAppWebUrl(
                    item.guestPhone,
                    `Olá, ${item.guestName}! Falamos da portaria/recepção referente à sua reserva no Flat ${item.flatNumber}.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400 inline shrink-0" />
                  <span>{item.guestPhone}</span>
                </a>
              </div>
            ) : (
              <span className="text-[11px] text-slate-500">Sem telefone titular</span>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              {item.checkinDate} → {item.checkoutDate}
            </span>
          </div>
          {item.vehicle && item.vehicle.plate && (
            <div className="mt-2 p-2 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-300 truncate">
                <Car className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-700">{item.vehicle.plate}</span>
                <span className="text-slate-300 truncate font-semibold">{item.vehicle.brand} {item.vehicle.model}</span>
              </div>
              {item.vehicle.color && (
                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700 ml-1 shrink-0">
                  {item.vehicle.color}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Status de Governança do Flat & Regra de Early Check-in */}
        <div className="space-y-1.5 p-2.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400 font-medium">Status do flat:</span>
            {item.cleaningStatus === "cleaning_now" ? (
              <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold animate-pulse">
                🧹 Limpando (há {item.cleaningMinutes || 0} min)
              </Badge>
            ) : item.cleaningStatus === "dirty" ? (
              <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold">
                ⚠️ Aguardando Limpeza (Sujo)
              </Badge>
            ) : (
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                ✨ Limpo
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
            <span className="text-slate-400 font-medium">Early Check-in:</span>
            {item.earlyCheckinStatus === "Liberado" ? (
              <button
                type="button"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-emerald-400 bg-emerald-950/80 hover:bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-800 text-[10px] transition-colors"
              >
                ✓ Liberado ({checklist.isEarlyAuthorizedByAdmin ? "Admin" : `desde ${checklist.freeEarlyTime || "10:00"}`})
              </button>
            ) : item.earlyCheckinStatus === "Aguardando limpeza" ? (
              <button
                type="button"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900/80 px-2 py-0.5 rounded-md border border-amber-800 text-[10px] transition-colors"
              >
                ⏳ Horário OK • Aguarda Limpeza
              </button>
            ) : item.earlyCheckinStatus === "Aguardando data" ? (
              <button
                type="button"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900/80 px-2 py-0.5 rounded-md border border-amber-800 text-[10px] transition-colors"
              >
                📅 Reserva Futura ({item.checkinDate})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-rose-300 bg-rose-950/80 hover:bg-rose-900/80 px-2 py-0.5 rounded-md border border-rose-800 text-[10px] transition-colors"
              >
                🔒 Libera às {checklist.effectiveAllowedTime || checklist.freeEarlyTime || "10:00"}
              </button>
            )}
          </div>
        </div>

        {/* Alerta de Re-assinatura se houver */}
        {item.needsReSignature && (
          <div className="p-2.5 bg-rose-950/70 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-black block uppercase text-[10px] text-rose-300">Re-Assinatura Obrigatória</span>
              <span className="font-medium text-[11px]">{item.reSignatureReason || "Reserva alterada. Solicite novo preenchimento do Check-in Digital."}</span>
            </div>
          </div>
        )}

        {/* Lista de Hóspedes Autorizados a Subir */}
        <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-2.5 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Hóspedes na Reserva ({totalGuests})</span>
            <span className="text-slate-500 font-normal">Check-in Digital</span>
          </div>
          <div className="space-y-1">
            {guestsList.map((g: any, gIdx: number) => {
              const slotIdx = g.index || gIdx + 1
              const isCleared = Boolean(g.hasCompletedCheckin && !g.needsReSignature && !item.needsReSignature)
              const hasEntered = Boolean(g.entryAuthorized)
              return (
                <div
                  key={gIdx}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border ${
                    hasEntered
                      ? "bg-emerald-950/60 border-emerald-700/70 text-emerald-200"
                      : isCleared
                        ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                        : "bg-slate-800 border-slate-700/60 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
                      {slotIdx}
                    </span>
                    <span className="truncate font-semibold">{g.name || `Hóspede ${slotIdx}`}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasEntered ? (
                      <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Entrou
                      </Badge>
                    ) : isCleared ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Check-in OK
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="bg-rose-950/60 text-rose-300 border-rose-800 text-[9px] font-bold px-1.5 py-0">
                          Aguardando
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openSendLinkModal(item, slotIdx)
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/70 text-emerald-300 text-[9px] font-bold transition-all"
                          title={`Enviar link ou mostrar QR Code para ${g.name || `Hóspede ${slotIdx}`}`}
                        >
                          <QrCode className="w-2.5 h-2.5" />
                          <span>Link / QR</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Special Reception Notice / Note */}
        {item.receptionNotes && (
          <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-black block uppercase text-[10px] text-amber-400">Aviso da Portaria</span>
              <span className="font-medium">{item.receptionNotes}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1 border-t border-slate-700/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pendingGuests.length > 0 || item.needsReSignature ? (
              <Button
                type="button"
                size="sm"
                onClick={() => openSendLinkModal(item)}
                className="bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs h-auto min-h-10 py-2 px-2.5 rounded-xl gap-1.5 shadow-sm border border-emerald-500/30"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                <span>Enviar Link / QR Check-in</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openSendLinkModal(item)}
                className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-bold text-xs h-auto min-h-10 py-2 px-2.5 rounded-xl gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Link / QR Check-in</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEarlyCheckinModal(item)}
              className="border-sky-800/70 bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 font-bold text-xs h-auto min-h-10 py-2 px-2.5 rounded-xl gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Verificar Early Check-in</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedItem(item)
                setModalGuestIndex(1)
                setFnhrModalOpen(true)
              }}
              className="border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-200 font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl"
            >
              <FileText className="w-4 h-4 mr-1 text-primary shrink-0" />
              <span>Ver Ficha / Fotos</span>
            </Button>

            {/* Botão Principal de Liberação de Entrada (respeitando Check-in Digital + Regra Sofia + Limpeza) */}
            {item.status === "in_house" && pendingGuests.length === 0 ? (
              <Button
                size="sm"
                disabled
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 bg-emerald-950 text-emerald-300 border border-emerald-800 opacity-90"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Hóspede já no Hotel</span>
              </Button>
            ) : item.needsReSignature || completedGuests === 0 ? (
              <Button
                size="sm"
                onClick={() => openSendLinkModal(item, 1)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-200"
              >
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="leading-snug">Aguardando Check-in (0/{totalGuests})</span>
              </Button>
            ) : checklist.isCheckinDateFuture ? (
              <Button
                size="sm"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="leading-snug">Entrada em {item.checkinDate}</span>
              </Button>
            ) : checklist.isTimeAllowed === false ? (
              <Button
                size="sm"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-200"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="leading-snug">Bloqueado até {checklist.effectiveAllowedTime || checklist.freeEarlyTime || "10:00"}</span>
              </Button>
            ) : !isClean && !checklist.isRegularCheckinWindow ? (
              <Button
                size="sm"
                onClick={() => openEarlyCheckinModal(item)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-rose-950/80 hover:bg-rose-900/90 border border-rose-800/80 text-rose-300"
              >
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="leading-snug">Aguardando Limpeza</span>
              </Button>
            ) : clearedNotEntered.length > 0 && pendingGuests.length > 0 ? (
              <Button
                size="sm"
                onClick={() => handleCheckin(item)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-amber-600 hover:bg-amber-500 text-white"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span className="leading-snug">
                  {enteredGuests.length > 0
                    ? `Liberar Restante (${clearedNotEntered.length})`
                    : `Liberar Parcial (${completedGuests}/${totalGuests})`}
                </span>
              </Button>
            ) : clearedNotEntered.length === 0 && pendingGuests.length > 0 ? (
              <Button
                size="sm"
                onClick={() => openSendLinkModal(item, pendingGuests[0]?.index || 2)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-300"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="leading-snug">
                  {enteredGuests.length > 0
                    ? `Falta Check-in (${enteredGuests.length}/${totalGuests} no apt)`
                    : `Check-in Pendente (0/${totalGuests})`}
                </span>
              </Button>
            ) : !isClean ? (
              <Button
                size="sm"
                onClick={() => handleCheckin(item)}
                className="font-bold text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-rose-950/80 hover:bg-rose-900/90 border border-rose-800/80 text-rose-300"
              >
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="leading-snug">Quarto em Limpeza</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleCheckin(item)}
                className="font-black text-xs h-auto min-h-12 py-2.5 px-3 rounded-xl gap-2 shadow-md transition-all bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span>Liberar Entrada</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const liveSendLinkItem = resolveLiveItem(sendLinkModalItem)
  const activeSendSlot = sendLinkSlots.find(s => Number(s.index) === Number(sendLinkGuestIndex)) || sendLinkSlots[0] || null
  const liveEarlyItem = resolveLiveItem(earlyCheckinModalItem)
  const liveEarlyChecklist = liveEarlyItem?.earlyCheckinChecklist || null
  const isReceptionModalOpen = Boolean(
    sendLinkModalItem ||
    earlyCheckinModalItem ||
    fnhrModalOpen ||
    zoomedPhoto ||
    forceCheckinItem ||
    partialCheckinItem
  )

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none pb-16">
      <FrozenSlot
        freeze={isReceptionModalOpen}
        deps={[data, activeTab, loading, focusedResQuery, copiedCheckinKey, failedImgAsPdf]}
        render={() => (
          <>
      {/* Top Tablet Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-lg shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">CorpFlats • Portaria & Recepção</h1>
              <Badge variant="outline" className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px] font-bold">
                Ao Vivo
              </Badge>
            </div>
            <ReceptionHeaderDate />
          </div>
        </div>

        {/* Big Live Digital Clock */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <ReceptionLiveClock />
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Horário de Brasília</div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchToday()}
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 h-10 px-3 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${loading ? "animate-spin text-primary" : ""}`} />
            <span className="text-xs font-bold">Atualizar</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Reserva aberta via Link do E-mail (caso seja para outra data) */}
        {isFocusedOnlyOutsideTabs && data.focusedReservation && (
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-primary/50 space-y-3 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Reserva Selecionada pelo Link do E-mail</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFocusedResQuery("")
                  if (typeof window !== "undefined") {
                    const cleanUrl = new URL(window.location.href)
                    cleanUrl.searchParams.delete("res")
                    cleanUrl.searchParams.delete("action")
                    window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}`)
                  }
                }}
                className="h-7 px-2 text-xs text-slate-400 hover:text-white gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fechar destaque</span>
              </Button>
            </div>
            <div className="max-w-md">
              {renderArrivalStyleCard(data.focusedReservation, true)}
            </div>
          </div>
        )}

        {/* Navigation Tabs (Big Touch Buttons) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => setActiveTab("arrivals")}
            className={`py-3 sm:py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "arrivals"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <span>Chegadas Hoje ({(data?.arrivals || []).length})</span>
          </button>

          <button
            onClick={() => setActiveTab("inHouse")}
            className={`py-3 sm:py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "inHouse"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <BedDouble className="w-4 h-4 shrink-0" />
            <span>No Hotel ({(data?.inHouse || []).length})</span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`py-3 sm:py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "completed"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <Undo2 className="w-4 h-4 shrink-0" />
            <span>Saídas Realizadas ({(data?.completedToday || []).length})</span>
          </button>
        </div>

        {/* Tab 1: Chegadas de Hoje */}
        {activeTab === "arrivals" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                Check-ins Previstos para Hoje
              </h2>
              <span className="text-xs text-slate-400 font-medium">Conferência operacional de Check-in Digital, Early Check-in e FNRH</span>
            </div>

            {(data?.arrivals || []).length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum check-in pendente para hoje!</div>
                <div className="text-xs">Todos os hóspedes previstos já realizaram a entrada.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.arrivals || []).map((item) => renderArrivalStyleCard(item))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Hóspedes Hospedados (In House) */}
        {activeTab === "inHouse" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-primary shrink-0" />
                Hóspedes Atualmente Hospedados ({(data?.inHouse || []).length})
              </h2>
              <span className="text-xs text-slate-400 font-medium">Toque em Check-out para registrar a saída</span>
            </div>

            {(data?.inHouse || []).length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <BedDouble className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum hóspede hospedado no momento.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.inHouse || []).map((item) => {
                  return (
                    <div
                      id={`portaria-res-${item.id}`}
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-black text-white tracking-tight">Apt {item.flatNumber}</div>
                          <div className="font-bold text-sm text-slate-200">{item.guestName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Estadia: {item.checkinDate} até {item.checkoutDate}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {item.isPartialCheckin ? (
                            <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold animate-pulse">
                              🟡 Entrada Parcial
                            </Badge>
                          ) : item.isCheckoutToday ? (
                            <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-black animate-pulse">
                              Saída Hoje
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-900 text-slate-400 border-slate-700 text-[10px]">
                              Hospedado
                            </Badge>
                          )}
                        </div>
                      </div>

                      {item.vehicle && item.vehicle.plate && (
                        <div className="p-2 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-slate-300 truncate">
                            <Car className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-700">{item.vehicle.plate}</span>
                            <span className="text-slate-300 truncate font-semibold">{item.vehicle.brand} {item.vehicle.model}</span>
                          </div>
                          {item.vehicle.color && (
                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700 ml-1 shrink-0">
                              {item.vehicle.color}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Lista de Hóspedes e Status de Entrada */}
                      <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-2.5 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>Hóspedes ({item.guests?.length || item.guestCount || 1})</span>
                          <span className="text-slate-500 font-normal">Entrada Portaria</span>
                        </div>
                        <div className="space-y-1">
                          {(item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: true, entryAuthorized: true }]).map((g: any, gIdx: number) => {
                            const slotIdx = g.index || gIdx + 1
                            const isCleared = Boolean(g.hasCompletedCheckin && !g.needsReSignature)
                            const hasEntered = Boolean(g.entryAuthorized)
                            return (
                              <div
                                key={gIdx}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border ${
                                  hasEntered
                                    ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-200"
                                    : isCleared
                                      ? "bg-sky-950/40 border-sky-800/50 text-sky-200"
                                      : "bg-amber-950/30 border-amber-800/40 text-amber-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
                                    {slotIdx}
                                  </span>
                                  <span className="truncate font-semibold">{g.name || `Hóspede ${slotIdx}`}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {hasEntered ? (
                                    <Badge className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> No Quarto
                                    </Badge>
                                  ) : isCleared ? (
                                    <Button
                                      size="sm"
                                      onClick={() => handleCheckin(item, true, [slotIdx], true)}
                                      className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1 shadow-xs"
                                    >
                                      <Unlock className="w-2.5 h-2.5" /> Liberar Entrada
                                    </Button>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="bg-amber-950/60 text-amber-400 border-amber-800 text-[9px] font-bold px-1.5 py-0">
                                        Bloqueado
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openSendLinkModal(item, slotIdx)}
                                        className="h-6 px-1.5 text-[9px] bg-slate-800 border-slate-700 hover:bg-slate-700 text-emerald-300 gap-1 font-bold"
                                        title="Enviar link no WhatsApp ou exibir QR Code para check-in digital"
                                      >
                                        <QrCode className="w-3 h-3 text-emerald-400" />
                                        <span>Link / QR</span>
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const preCheckinUrl = getCheckinUrl(item, slotIdx)
                                          navigator.clipboard.writeText(preCheckinUrl)
                                          const key = `${item.code || item.id}-${slotIdx}`
                                          setCopiedCheckinKey(key)
                                          setTimeout(() => setCopiedCheckinKey(null), 2000)
                                        }}
                                        className="h-6 w-6 p-0 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300"
                                        title="Copiar Link de Check-in"
                                      >
                                        {copiedCheckinKey === `${item.code || item.id}-${slotIdx}` ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3 text-sky-400" />
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Notice */}
                      {item.receptionNotes && (
                        <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                          <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span className="font-medium">{item.receptionNotes}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item)
                            setModalGuestIndex(1)
                            setFnhrModalOpen(true)
                          }}
                          className="border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-200 font-bold text-xs h-11 rounded-xl"
                        >
                          <FileText className="w-4 h-4 mr-1 text-primary" />
                          <span>Ficha</span>
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleCheckout(item)}
                          className="col-span-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-md"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Check-out</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Saídas Realizadas Hoje (Desfazer Permanente) */}
        {activeTab === "completed" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-primary shrink-0" />
                Check-outs Realizados Hoje ({(data?.completedToday || []).length})
              </h2>
              <span className="text-xs text-slate-400 font-medium">O botão de desfazer fica disponível o tempo todo</span>
            </div>

            {(data?.completedToday || []).length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum check-out realizado hoje ainda.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.completedToday || []).map((item) => {
                  return (
                    <div
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-black text-white tracking-tight">Apt {item.flatNumber}</div>
                          <div className="font-bold text-sm text-slate-200">{item.guestName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Status: Quarto Desocupado
                          </div>
                        </div>

                        <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px] font-bold">
                          Check-out Concluído
                        </Badge>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleUndoCheckout(item)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-md"
                      >
                        <Undo2 className="w-4 h-4 text-amber-400" />
                        <span>Desfazer Check-out (Reativar Hospedado)</span>
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
          </>
        )}
      />

      {/* Modal 1: Enviar Link para Check-in Digital + QR Code (Balcão & Remoto) */}
      <Dialog open={Boolean(sendLinkModalItem)} onOpenChange={(open) => !open && setSendLinkModalItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <QrCode className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Enviar Link ou QR Code de Check-in Digital • Apt {liveSendLinkItem?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Para hóspede no balcão, peça para apontar a câmera para o QR Code. Para envio remoto, confirme ou digite o WhatsApp abaixo.
            </DialogDescription>
          </DialogHeader>

          {liveSendLinkItem && (
            <div className="py-2 space-y-4 text-xs">
              {/* Seletor de Hóspede (1º Hóspede, 2º Hóspede, etc.) */}
              {sendLinkSlots.length > 1 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Selecione o Hóspede ({sendLinkSlots.length} vagas na reserva)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {sendLinkSlots.map((slot) => {
                      const isSelected = Number(sendLinkGuestIndex) === Number(slot.index)
                      return (
                        <button
                          key={slot.index}
                          type="button"
                          onClick={() => handleSelectSendLinkGuest(slot.index)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "bg-primary/20 border-primary text-white ring-1 ring-primary"
                              : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-black text-[11px]">{slot.index}º Hóspede</span>
                            {slot.hasCompletedCheckin ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                            )}
                          </div>
                          <div className="truncate text-[11px] font-medium text-slate-300 mt-0.5">
                            {slot.name || `Hóspede ${slot.index}`}
                          </div>
                          <div className="text-[10px] mt-0.5">
                            {slot.hasCompletedCheckin ? (
                              <span className="text-emerald-400 font-semibold">✓ Concluído</span>
                            ) : (
                              <span className="text-rose-300 font-semibold">Pendente</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* Coluna Esquerda: QR Code para Balcão */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-between gap-3 text-center">
                  <div>
                    <Badge className="bg-sky-950 text-sky-300 border-sky-800 text-[10px] font-bold mb-1">
                      Atendimento no Balcão
                    </Badge>
                    <div className="font-bold text-sm text-white">
                      Escaneie com a câmera do celular
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Link exclusivo para o {sendLinkGuestIndex}º hóspede ({activeSendSlot?.name || sendLinkGuestName})
                    </div>
                  </div>

                  <div className="w-52 h-52 bg-white rounded-2xl p-2.5 flex items-center justify-center shadow-lg">
                    {sendLinkLoading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
                    ) : activeSendSlot?.qrCodeDataUrl ? (
                      <img
                        src={activeSendSlot.qrCodeDataUrl}
                        alt="QR Code Check-in Digital"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-slate-600 text-xs px-3">QR Code indisponível. Use o botão Copiar Link abaixo.</span>
                    )}
                  </div>

                  <div className="w-full grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const targetUrl = activeSendSlot?.checkinUrl || getCheckinUrl(liveSendLinkItem, sendLinkGuestIndex)
                        navigator.clipboard.writeText(targetUrl)
                        setCopiedCheckinKey(`modal-${sendLinkGuestIndex}`)
                        setTimeout(() => setCopiedCheckinKey(null), 2000)
                      }}
                      className="bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs gap-1.5"
                    >
                      {copiedCheckinKey === `modal-${sendLinkGuestIndex}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-sky-400" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const targetUrl = activeSendSlot?.checkinUrl || getCheckinUrl(liveSendLinkItem, sendLinkGuestIndex)
                        window.open(targetUrl, "_blank")
                      }}
                      className="bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-primary" />
                      <span>Abrir Link</span>
                    </Button>
                  </div>
                </div>

                {/* Coluna Direita: Disparo no WhatsApp com Telefone Editável */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-3">
                    <div>
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold mb-1">
                        Envio Remoto via WhatsApp
                      </Badge>
                      <div className="font-bold text-sm text-white">
                        Disparar link no celular do hóspede
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Você pode ajustar ou digitar o número (ex: celular do 2º hóspede).
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="portariaGuestName" className="text-[11px] font-bold text-slate-300">
                        Nome do {sendLinkGuestIndex}º Hóspede
                      </Label>
                      <Input
                        id="portariaGuestName"
                        value={sendLinkGuestName}
                        onChange={(e) => setSendLinkGuestName(e.target.value)}
                        placeholder={`Nome do ${sendLinkGuestIndex}º hóspede`}
                        className="bg-slate-900 border-slate-700 text-white h-10 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="portariaGuestPhone" className="text-[11px] font-bold text-slate-300">
                        WhatsApp com DDD
                      </Label>
                      <Input
                        id="portariaGuestPhone"
                        type="tel"
                        inputMode="tel"
                        value={sendLinkPhone}
                        onChange={(e) => setSendLinkPhone(formatSmartPhone(e.target.value))}
                        placeholder="Ex: (22) 99999-9999"
                        className="bg-slate-900 border-slate-700 text-white h-11 text-base font-mono"
                      />
                    </div>

                    {sendLinkFeedback && (
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-2 ${
                          sendLinkFeedback.type === "success"
                            ? "bg-emerald-950/70 border-emerald-700 text-emerald-200"
                            : "bg-rose-950/70 border-rose-700 text-rose-200"
                        }`}
                      >
                        <div className="font-semibold leading-relaxed">{sendLinkFeedback.message}</div>
                        {sendLinkFeedback.waWebUrl && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(sendLinkFeedback.waWebUrl!, "_blank")}
                            className="w-full bg-slate-900 border-emerald-700 text-emerald-300 hover:bg-slate-800 text-xs font-bold gap-1.5"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Abrir Conversa Direta no WhatsApp</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <Button
                      type="button"
                      onClick={handleDispatchCheckinLink}
                      disabled={Boolean(sendingLinkKey)}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm rounded-xl gap-2 shadow-lg"
                    >
                      {sendingLinkKey ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          <span>Enviando no WhatsApp...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 shrink-0" />
                          <span>Enviar Link no WhatsApp</span>
                        </>
                      )}
                    </Button>

                    {sendLinkPhone.replace(/\D/g, "").length >= 10 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const targetUrl = activeSendSlot?.checkinUrl || getCheckinUrl(liveSendLinkItem, sendLinkGuestIndex)
                          const msg = `Olá, ${sendLinkGuestName || "Hóspede"}! Segue seu link oficial de Check-in Digital para liberação de entrada no Apt ${liveSendLinkItem.flatNumber}:\n${targetUrl}`
                          const waUrl = buildWhatsAppWebUrl(sendLinkPhone, msg)
                          if (waUrl) window.open(waUrl, "_blank")
                        }}
                        className="w-full bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Abrir no WhatsApp Web / App</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setSendLinkModalItem(null)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Verificar Permissão para Early Check-in (Checklist Sofia em Tempo Real) */}
      <Dialog open={Boolean(earlyCheckinModalItem)} onOpenChange={(open) => !open && setEarlyCheckinModalItem(null)}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Clock className="w-5 h-5 text-sky-400 shrink-0" />
              <span>Verificação de Early Check-in • Apt {liveEarlyItem?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Checklist operacional em tempo real (Limpeza + Check-in Digital + Regra de Horário por Canal).
            </DialogDescription>
          </DialogHeader>

          {liveEarlyItem && liveEarlyChecklist && (
            <div className="py-2 space-y-3.5 text-xs">
              {/* Veredito Principal */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  liveEarlyItem.canAuthorizeEntry && liveEarlyItem.allCheckinDone
                    ? "bg-emerald-950/70 border-emerald-700 text-emerald-200"
                    : liveEarlyItem.canAuthorizeEntry
                      ? "bg-amber-950/70 border-amber-700 text-amber-200"
                      : "bg-rose-950/70 border-rose-700 text-rose-200"
                }`}
              >
                {liveEarlyItem.canAuthorizeEntry ? (
                  <Unlock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Lock className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-black text-sm text-white">
                    {liveEarlyItem.canAuthorizeEntry && liveEarlyItem.allCheckinDone
                      ? "ENTRADA LIBERADA NA PORTARIA"
                      : liveEarlyItem.canAuthorizeEntry
                        ? "ENTRADA PARCIAL LIBERADA (Apenas quem concluiu Check-in Digital)"
                        : "ENTRADA BLOQUEADA NO MOMENTO"}
                  </div>
                  <div className="text-xs leading-relaxed opacity-95">
                    {liveEarlyChecklist.entryMessage || liveEarlyChecklist.earlyCheckinReason}
                  </div>
                </div>
              </div>

              {/* Checklist dos 3 Critérios */}
              <div className="space-y-2">
                {/* Item 1: Limpeza */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-200">1. Limpeza do Apartamento</div>
                    <div className="text-[11px] text-slate-400">
                      {liveEarlyChecklist.isRoomReady
                        ? "Flat limpo e liberado pela governança."
                        : "Early Check-in antes das 14:00 exige que a limpeza já tenha sido concluída."}
                    </div>
                  </div>
                  {liveEarlyChecklist.isRoomReady ? (
                    <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold shrink-0">
                      ✨ Limpo
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold shrink-0">
                      ⏳ {liveEarlyItem.cleaningLabel || "Em limpeza"}
                    </Badge>
                  )}
                </div>

                {/* Item 2: Check-in Digital */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-200">2. Check-in Digital & FNRH</div>
                    <div className="text-[11px] text-slate-400">
                      {liveEarlyChecklist.needsReSignature
                        ? "Re-assinatura pendente devido a alteração na reserva."
                        : liveEarlyChecklist.allCheckinDone
                          ? `Todos os hóspedes preencheram (${liveEarlyChecklist.completedGuestsCount}/${liveEarlyChecklist.totalGuestsCount}).`
                          : liveEarlyChecklist.completedGuestsCount > 0
                            ? `Parcial (${liveEarlyChecklist.completedGuestsCount}/${liveEarlyChecklist.totalGuestsCount}): apenas quem já preencheu está liberado; demais bloqueados até concluírem.`
                            : `Nenhum hóspede preencheu ainda (0/${liveEarlyChecklist.totalGuestsCount}).`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {liveEarlyChecklist.allCheckinDone ? (
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                        ✓ Concluído ({liveEarlyChecklist.completedGuestsCount}/{liveEarlyChecklist.totalGuestsCount})
                      </Badge>
                    ) : (
                      <>
                        {liveEarlyChecklist.completedGuestsCount > 0 && (
                          <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                            Parcial ({liveEarlyChecklist.completedGuestsCount}/{liveEarlyChecklist.totalGuestsCount})
                          </Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const nextPendingSlot =
                              (liveEarlyItem?.guests || []).find((g: any) => !g.hasCompletedCheckin || g.needsReSignature)?.index || 1
                            setEarlyCheckinModalItem(null)
                            openSendLinkModal(liveEarlyItem, nextPendingSlot)
                          }}
                          className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] gap-1"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Enviar Link / QR</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Item 3: Regra de Horário & Canal (Sofia) */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-200">3. Horário & Canal da Reserva</div>
                      <div className="text-[11px] text-slate-400">
                        Canal: <strong className="text-sky-300">{liveEarlyChecklist.channelLabel}</strong> • Cortesia grátis a partir das{" "}
                        <strong className="text-white">{liveEarlyChecklist.freeEarlyTime}</strong> (Check-in padrão {liveEarlyChecklist.standardCheckinTime})
                      </div>
                    </div>
                    {liveEarlyChecklist.isTimeAllowed && !liveEarlyChecklist.isCheckinDateFuture ? (
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold shrink-0">
                        ✓ Horário Permitido
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold shrink-0">
                        🔒 Bloqueado ({liveEarlyChecklist.currentTimeHHMM})
                      </Badge>
                    )}
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Regra Sofia: Site/Direto/WhatsApp grátis <strong>10:00</strong> • Booking/Airbnb/Agência grátis <strong>12:00</strong>
                    </span>
                    {liveEarlyChecklist.isEarlyAuthorizedByAdmin && (
                      <Badge className="bg-emerald-900 text-emerald-200 border-emerald-700 text-[10px] font-bold">
                        ✓ Autorizado pela Administração{liveEarlyChecklist.earlyCheckinTime ? ` (${liveEarlyChecklist.earlyCheckinTime})` : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Bloco para Solicitar Análise da Administração no WhatsApp quando bloqueado pelo horário */}
              {(!liveEarlyChecklist.isTimeAllowed || liveEarlyChecklist.isCheckinDateFuture) && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/80 space-y-2.5">
                  <div className="font-bold text-amber-200 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Hóspede deseja entrar antes das {liveEarlyChecklist.effectiveAllowedTime || liveEarlyChecklist.freeEarlyTime}?</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Antes do horário liberado ({liveEarlyChecklist.effectiveAllowedTime || liveEarlyChecklist.freeEarlyTime}), a entrada só é permitida mediante autorização ou pagamento de taxa junto à Administração. Clique abaixo para avisar a Administração no WhatsApp.
                  </p>
                  <Input
                    value={earlyRequestNote}
                    onChange={(e) => setEarlyRequestNote(e.target.value)}
                    placeholder="Observação opcional (ex: Hóspede já está na portaria com malas)"
                    className="bg-slate-950 border-slate-700 text-white h-9 text-xs"
                  />

                  {earlyRequestFeedback && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs space-y-2 ${
                        earlyRequestFeedback.type === "success"
                          ? "bg-emerald-950/70 border-emerald-700 text-emerald-200"
                          : "bg-rose-950/70 border-rose-700 text-rose-200"
                      }`}
                    >
                      <div className="font-semibold">{earlyRequestFeedback.message}</div>
                      {earlyRequestFeedback.fallbackWaWebUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(earlyRequestFeedback.fallbackWaWebUrl!, "_blank")}
                          className="w-full bg-slate-900 border-emerald-700 text-emerald-300 hover:bg-slate-800 text-xs font-bold gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Enviar pelo WhatsApp Web</span>
                        </Button>
                      )}
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleRequestEarlyCheckinAnalysis}
                    disabled={earlyRequestLoading}
                    className="w-full h-11 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs rounded-xl gap-2 shadow-md"
                  >
                    {earlyRequestLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Avisando Administração...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 shrink-0" />
                        <span>Solicitar Análise da Administração no WhatsApp</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchToday()}
              className="bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar Status</span>
            </Button>

            <div className="flex items-center gap-2">
              {liveEarlyItem?.canAuthorizeEntry && liveEarlyItem?.status !== "in_house" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCheckin(liveEarlyItem)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs gap-1.5"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Liberar Entrada Agora</span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => setEarlyCheckinModalItem(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
              >
                Fechar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Ficha Completa do Hóspede (Check-in Digital, Selfie, Documento, FNRH PDF) */}
      <Dialog open={fnhrModalOpen} onOpenChange={setFnhrModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Ficha de Entrada & Check-in Digital: Apt {selectedItem?.flatNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Conferência operacional de documento, selfie, assinatura e FNRH oficial.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (() => {
            const liveSelected = resolveLiveItem(selectedItem) || selectedItem
            const rawGuests = liveSelected.guests && liveSelected.guests.length > 0
              ? liveSelected.guests
              : [{
                  index: 1,
                  name: liveSelected.guestName,
                  phone: liveSelected.guestPhone,
                  document: liveSelected.guestDocument,
                  hasCompletedCheckin: liveSelected.hasPreCheckin,
                  selfieUrl: liveSelected.guestPhoto,
                  docPhotoUrl: liveSelected.docPhoto,
                  signatureUrl: liveSelected.signatureUrl
                }]

            const currentGuest = rawGuests.find((g: any) => g.index === modalGuestIndex) || rawGuests[0]
            const activeSelfie = currentGuest.selfieUrl || (currentGuest.index === 1 ? liveSelected.guestPhoto : null)
            const activeDoc = currentGuest.docPhotoUrl || (currentGuest.index === 1 ? liveSelected.docPhoto : null)
            const activeSig = currentGuest.signatureUrl || (currentGuest.index === 1 ? liveSelected.signatureUrl : null)

            const resCode = liveSelected.code || liveSelected.id || ""
            const resCodeParam = encodeURIComponent(resCode)
            const targetUuid = currentGuest.fnrhDocumentUuid || (modalGuestIndex === 1 ? liveSelected.fnrhDocumentUuid : null)

            let targetViewUrl = currentGuest.fnrhPdfUrl || (modalGuestIndex === 1 ? liveSelected.fnrhPdfUrl : "")
            if (targetViewUrl) {
              if (!targetViewUrl.includes("code=")) {
                targetViewUrl += (targetViewUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
              }
            } else if (targetUuid) {
              targetViewUrl = `/api/pms/fnrh/${targetUuid}/view?code=${resCodeParam}`
            }

            let targetDownloadUrl = currentGuest.fnrhDownloadUrl || (modalGuestIndex === 1 ? liveSelected.fnrhDownloadUrl : "")
            if (targetDownloadUrl) {
              if (!targetDownloadUrl.includes("code=")) {
                targetDownloadUrl += (targetDownloadUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
              }
            } else if (targetUuid) {
              targetDownloadUrl = `/api/pms/fnrh/${targetUuid}/download?code=${resCodeParam}`
            }

            return (
              <div className="py-3 space-y-4 text-xs">
                {/* Guest Switcher Tabs */}
                {rawGuests.length > 1 && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                    {rawGuests.map((g: any) => {
                      const isSelected = modalGuestIndex === g.index
                      return (
                        <button
                          key={g.index}
                          type="button"
                          onClick={() => setModalGuestIndex(g.index)}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                        >
                          <span className="truncate">{g.name ? g.name.split(" ")[0] : `Hóspede ${g.index}`}</span>
                          {g.hasCompletedCheckin ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 shrink-0">Pendente</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Alternador de Visualização: Ficha em PDF Oficial vs Dados & Fotos */}
                {currentGuest.hasCompletedCheckin && targetViewUrl && (
                  <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setModalViewMode("pdf")}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        modalViewMode === "pdf" ? "bg-primary text-primary-foreground shadow-xs" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ficha Oficial em PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalViewMode("data")}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        modalViewMode === "data" ? "bg-primary text-primary-foreground shadow-xs" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Dados Cadastrais & Fotos</span>
                    </button>
                  </div>
                )}

                {/* Exibição Direta do PDF Oficial Autêntico */}
                {currentGuest.hasCompletedCheckin && targetViewUrl && modalViewMode === "pdf" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-bold text-white block">Documento Oficial Assinado Digitalmente</span>
                          <span className="text-[10px] text-slate-400 block">Autenticidade e Trilha Forense Certificada</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {targetDownloadUrl && (
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => window.open(targetDownloadUrl, "_blank")}
                            className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-white font-bold gap-1 rounded-lg"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar PDF</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => window.open(targetViewUrl, "_blank")}
                          className="h-8 text-xs bg-slate-900 border-slate-700 text-slate-300 hover:text-white font-bold gap-1 rounded-lg"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Nova Aba</span>
                        </Button>
                      </div>
                    </div>

                    <PdfPreview url={targetViewUrl} title="Ficha Oficial de Hospedagem" dark />
                  </div>
                ) : (
                  <>
                    {/* Alerta de Menor de Idade (ECA Art. 82) */}
                    {currentGuest.isMinor && (
                      <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl space-y-1.5 text-rose-300">
                        <div className="flex items-center gap-2 font-bold text-rose-200">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>Hóspede Menor de Idade • ECA (Art. 82)</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-300">
                          Parentesco: <strong>{currentGuest.minorKinship === "filho" ? "Filho(a) dos pais acompanhantes" : currentGuest.minorKinship || "Outro"}</strong>
                          {currentGuest.minorAuthDocUrl ? " • Autorização em Cartório Anexada" : currentGuest.minorKinship === "filho" ? " • Acompanhado pelos pais" : " • ⚠️ Sem documento em cartório"}
                        </p>
                        {currentGuest.minorAuthDocUrl && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setZoomedPhoto({ url: currentGuest.minorAuthDocUrl, title: `Autorização em Cartório - ${currentGuest.name}` })}
                            className="h-7 text-[10px] bg-rose-900/40 border-rose-700 text-rose-200 hover:bg-rose-900 font-bold gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Autorização do Cartório</span>
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Alerta de Atenção da Gestão */}
                    {liveSelected.riskAttentionAlert && (
                      <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl space-y-1 text-amber-300">
                        <div className="flex items-center gap-2 font-bold text-amber-200">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Aviso de Atenção para a Portaria</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {liveSelected.riskAttentionReason || "Recomenda-se conferência atenta de documentos e cumprimento estrito do regulamento."}
                        </p>
                      </div>
                    )}

                    {/* Status IA de Biometria e Documentos */}
                    {currentGuest.aiVerification && (
                      <div className="p-2.5 bg-sky-950/50 border border-sky-800/60 rounded-xl flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-sky-200">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          Auditoria de Identidade por IA
                        </span>
                        <Badge className={currentGuest.aiVerification.facesMatch ? "bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]" : "bg-rose-950 text-rose-300 border-rose-800 text-[10px]"}>
                          {currentGuest.aiVerification.facesMatch ? "✓ Rosto & Documento Conferem" : "⚠️ Divergência Detectada"}
                        </Badge>
                      </div>
                    )}

                    {/* Photos Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-300 block text-[10px] uppercase">Selfie com Documento</span>
                          {activeSelfie && (
                            <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                              <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                            </span>
                          )}
                        </div>
                        <div
                          onClick={() => {
                            if (activeSelfie) {
                              setZoomedPhoto({
                                url: activeSelfie,
                                title: `Selfie - ${currentGuest.name || liveSelected.guestName} (Apt ${liveSelected.flatNumber})`
                              })
                            }
                          }}
                          className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                            activeSelfie ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                          }`}
                        >
                          {activeSelfie ? (
                            <>
                              <img src={activeSelfie} alt="Selfie" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                                <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-600 text-center px-2">Selfie não enviada</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-300 block text-[10px] uppercase">Foto do Documento</span>
                          {activeDoc && (
                            <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                              <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                            </span>
                          )}
                        </div>
                        <div
                          onClick={() => {
                            if (activeDoc) {
                              setZoomedPhoto({
                                url: activeDoc,
                                title: `Documento Oficial - ${currentGuest.name || liveSelected.guestName} (Apt ${liveSelected.flatNumber})`
                              })
                            }
                          }}
                          className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                            activeDoc ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                          }`}
                        >
                          {activeDoc ? (
                            isPdfAssetUrl(activeDoc, failedImgAsPdf) ? (
                              <div className="flex flex-col items-center justify-center gap-1.5 text-sky-300 p-3 text-center">
                                <FileText className="w-9 h-9 text-sky-400" />
                                <span className="text-[11px] font-bold">Documento em PDF</span>
                                <span className="text-[10px] text-slate-400">Toque para abrir e conferir</span>
                              </div>
                            ) : (
                              <>
                                <img
                                  src={activeDoc}
                                  alt="Documento"
                                  onError={() => setFailedImgAsPdf((prev) => ({ ...prev, [activeDoc]: true }))}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                                  <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                                </div>
                              </>
                            )
                          ) : (
                            <span className="text-slate-600 text-center px-2">Doc não enviado</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Data Grid do Hóspede Selecionado */}
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Nome do Hóspede</span>
                          <span className="font-bold text-white text-sm">{currentGuest.name || liveSelected.guestName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Telefone / WhatsApp</span>
                          {(() => {
                            const guestPhoneVal = currentGuest.phone || liveSelected.guestPhone || ""
                            const guestWaUrl = buildWhatsAppWebUrl(
                              guestPhoneVal,
                              `Olá, ${currentGuest.name || liveSelected.guestName}! Falamos da portaria/recepção referente à sua reserva no Flat ${liveSelected.flatNumber}.`
                            )
                            return guestPhoneVal && guestWaUrl ? (
                              <a
                                href={guestWaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-emerald-400 hover:text-emerald-300 hover:underline"
                              >
                                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{guestPhoneVal}</span>
                              </a>
                            ) : guestPhoneVal ? (
                              <span className="font-semibold text-slate-200">{guestPhoneVal}</span>
                            ) : (
                              <span className="font-semibold text-slate-400">Não informado</span>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">CPF / Documento</span>
                          <span className="font-semibold text-slate-200 font-mono">{currentGuest.cpf || currentGuest.document || liveSelected.guestDocument || "Não informado"}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Nascimento / Idade</span>
                          <span className="font-semibold text-slate-200">
                            {currentGuest.birthDate ? `${currentGuest.birthDate} ${currentGuest.age ? `(${currentGuest.age} anos)` : ""}` : "Não informado"}
                          </span>
                        </div>
                      </div>

                      {(currentGuest.address || liveSelected.guestAddress || currentGuest.cep || liveSelected.guestCep) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800">
                          <div className="sm:col-span-2">
                            <span className="text-slate-500 block text-[10px] uppercase font-bold">Endereço Residencial</span>
                            <span className="font-semibold text-slate-200 text-xs">{currentGuest.address || liveSelected.guestAddress || "Não informado"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase font-bold">CEP / Cidade</span>
                            <span className="font-semibold text-slate-200 font-mono text-xs">
                              {(() => {
                                const rawCep = String(currentGuest.cep || liveSelected.guestCep || "").replace(/\D/g, "")
                                const fmtCep = rawCep.length === 8 ? `${rawCep.slice(0, 5)}-${rawCep.slice(5)}` : rawCep
                                const rawCity = String(currentGuest.city || liveSelected.guestCity || "").replace(/\s*\/\s*[A-Za-z]{2}\s*$/, "").trim()
                                const rawUf = String(currentGuest.state || liveSelected.guestState || "").trim().toUpperCase()
                                const cityLabel = rawCity ? `${rawCity}${rawUf ? `/${rawUf}` : ""}` : ""
                                return [fmtCep, cityLabel].filter(Boolean).join(" • ") || "Não informado"
                              })()}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Check-in</span>
                          <span className="font-semibold text-slate-200">{liveSelected.checkinDate}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Check-out</span>
                          <span className="font-semibold text-slate-200">{liveSelected.checkoutDate}</span>
                        </div>
                      </div>

                      {liveSelected.vehicle && liveSelected.vehicle.plate && (
                        <div className="pt-2 border-t border-slate-800 space-y-1">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Veículo Autorizado (Garagem)</span>
                          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                            <div className="flex flex-wrap items-center gap-2">
                              <Car className="w-4 h-4 text-sky-400 shrink-0" />
                              <span className="font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
                                {liveSelected.vehicle.plate}
                              </span>
                              <span className="text-slate-200 font-semibold text-xs">
                                {liveSelected.vehicle.brand} {liveSelected.vehicle.model}
                              </span>
                            </div>
                            {liveSelected.vehicle.color && (
                              <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                                {liveSelected.vehicle.color}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Status dos Hóspedes */}
                    <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                      <span className="font-bold text-[10px] uppercase block text-slate-400">
                        Hóspedes Cadastrados ({rawGuests.length})
                      </span>
                      <div className="space-y-1.5">
                        {rawGuests.map((g: any, i: number) => (
                          <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {g.index || i + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-200 break-words">{g.name || `Hóspede ${g.index || i + 1}`}</div>
                                <div className="text-[10px] text-slate-400">
                                  {g.hasCompletedCheckin ? "✅ Check-in Digital Realizado" : "⏳ Pendente de Preenchimento"}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {g.hasCompletedCheckin ? (
                                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                                  Concluído
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                                  Pendente
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reception Note */}
                    {liveSelected.receptionNotes && (
                      <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300">
                        <span className="font-bold text-[10px] uppercase block text-amber-400">Aviso Especial para a Portaria</span>
                        <span className="font-medium text-xs">{liveSelected.receptionNotes}</span>
                      </div>
                    )}

                    {/* Digital Signature */}
                    {activeSig && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-300 block text-[10px] uppercase">Assinatura Digital</span>
                          <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                            <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                          </span>
                        </div>
                        <div
                          onClick={() => {
                            setZoomedPhoto({
                              url: activeSig,
                              title: `Assinatura Digital - ${currentGuest.name || liveSelected.guestName} (Apt ${liveSelected.flatNumber})`
                            })
                          }}
                          className="h-24 bg-white rounded-xl p-2 flex items-center justify-center border cursor-pointer hover:border-primary transition-all relative group shadow-inner"
                        >
                          <img src={activeSig} alt="Assinatura" className="max-h-full object-contain group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-slate-900 text-xs font-bold gap-1 transition-opacity rounded-xl">
                            <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          <DialogFooter className="flex-wrap gap-2">
            {selectedItem && (() => {
              const liveSelected = resolveLiveItem(selectedItem) || selectedItem
              const rawGuests = liveSelected.guests && liveSelected.guests.length > 0
                ? liveSelected.guests
                : [{ index: 1, hasCompletedCheckin: liveSelected.hasPreCheckin }]
              const currentGuest = rawGuests.find((g: any) => g.index === modalGuestIndex) || rawGuests[0]
              const resCode = liveSelected.code || liveSelected.id || ""
              const resCodeParam = encodeURIComponent(resCode)
              const targetUuid = currentGuest.fnrhDocumentUuid || (modalGuestIndex === 1 ? liveSelected.fnrhDocumentUuid : null)
              let targetDownloadUrl = currentGuest.fnrhDownloadUrl || (modalGuestIndex === 1 ? liveSelected.fnrhDownloadUrl : "")
              if (targetDownloadUrl) {
                if (!targetDownloadUrl.includes("code=")) {
                  targetDownloadUrl += (targetDownloadUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
                }
              } else if (targetUuid) {
                targetDownloadUrl = `/api/pms/fnrh/${targetUuid}/download?code=${resCodeParam}`
              }
              let targetViewUrl = currentGuest.fnrhPdfUrl || (modalGuestIndex === 1 ? liveSelected.fnrhPdfUrl : "")
              if (targetViewUrl && !targetViewUrl.includes("code=")) {
                targetViewUrl += (targetViewUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
              }

              return (
                <>
                  {currentGuest.hasCompletedCheckin && targetDownloadUrl && (
                    <Button
                      type="button"
                      onClick={() => window.open(targetDownloadUrl, "_blank")}
                      className="w-full sm:w-auto h-auto min-h-10 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs gap-1.5"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>Baixar PDF Assinado</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      setFnhrModalOpen(false)
                      openSendLinkModal(liveSelected, modalGuestIndex)
                    }}
                    className="w-full sm:w-auto h-auto min-h-10 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                  >
                    <QrCode className="w-4 h-4 shrink-0" />
                    <span>Enviar Link / QR Code</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const directUrl = targetViewUrl || `/pre-checkin/${liveSelected.code || liveSelected.id}?guest=${modalGuestIndex}&readonly=true&view=document`
                      window.open(directUrl, "_blank")
                    }}
                    className="w-full sm:w-auto h-auto min-h-10 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Abrir Ficha Digital no Tablet</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setFnhrModalOpen(false)}
                    className="w-full sm:w-auto h-auto min-h-10 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                  >
                    Fechar
                  </Button>
                </>
              )
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualizador Ampliado de Fotos e Documentos (Zoom / Lightbox / PDF) */}
      <Dialog open={Boolean(zoomedPhoto)} onOpenChange={(open) => !open && setZoomedPhoto(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] p-4 bg-slate-950/95 border-slate-800 text-white flex flex-col justify-between">
          <DialogHeader className="pb-2 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Eye className="w-4 h-4 text-primary shrink-0" />
                <span>{zoomedPhoto?.title || "Visualização da Foto / Documento"}</span>
              </DialogTitle>
            </div>
          </DialogHeader>

          {zoomedPhoto?.url && (
            isPdfAssetUrl(zoomedPhoto.url, failedImgAsPdf) ? (
              <div className="my-3 overflow-y-auto max-h-[68vh]">
                <PdfPreview url={zoomedPhoto.url} title={zoomedPhoto.title} dark />
              </div>
            ) : (
              <div className="my-3 flex items-center justify-center overflow-hidden max-h-[65vh] bg-black/60 rounded-2xl border border-slate-800/80 p-2">
                <img
                  src={zoomedPhoto.url}
                  alt={zoomedPhoto.title}
                  onError={() => setFailedImgAsPdf((prev) => ({ ...prev, [zoomedPhoto.url]: true }))}
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl"
                />
              </div>
            )
          )}

          <DialogFooter className="gap-2 sm:justify-between pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (zoomedPhoto?.url) {
                  if (isPdfAssetUrl(zoomedPhoto.url, failedImgAsPdf)) {
                    openPdfInNewTab(zoomedPhoto.url)
                  } else {
                    const w = window.open("")
                    w?.document.write(`<img src="${zoomedPhoto.url}" style="max-width:100%;height:auto;display:block;margin:auto;background:#111;padding:20px;" />`)
                  }
                }
              }}
              className="w-full sm:w-auto text-xs bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>Abrir em Nova Aba</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setZoomedPhoto(null)}
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Fechar Visualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de Liberação de Quarto em Limpeza (apenas janela regular >= 14:00) */}
      <Dialog open={Boolean(forceCheckinItem)} onOpenChange={(open) => !open && setForceCheckinItem(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Confirmar Liberação de Entrada</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Apt {forceCheckinItem?.flatNumber} • {forceCheckinItem?.guestName}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-2 text-xs">
            <div className="p-3.5 bg-rose-950/40 border border-rose-900/60 rounded-xl space-y-1 text-rose-300">
              <span className="font-bold block text-rose-200">⚠️ Quarto consta como "Em Higienização"</span>
              <p className="leading-relaxed text-slate-300">
                A governança ainda não marcou a conclusão da limpeza no sistema. Confirme com a equipe se o apartamento já está pronto antes de liberar a subida do hóspede.
              </p>
            </div>
            <p className="text-slate-400 text-[11px]">
              Deseja confirmar o check-in presencial do hóspede e liberar a entrada agora?
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForceCheckinItem(null)}
              className="w-full sm:w-auto text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => forceCheckinItem && handleCheckin(forceCheckinItem, true)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
            >
              <Unlock className="w-4 h-4 shrink-0" />
              <span>Confirmar & Liberar Entrada</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de Entrada Parcial de Hóspede */}
      <Dialog open={Boolean(partialCheckinItem)} onOpenChange={(open) => !open && setPartialCheckinItem(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Confirmar Entrada Parcial</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Apt {partialCheckinItem?.item?.flatNumber} • {partialCheckinItem?.item?.guestName}
            </DialogDescription>
          </DialogHeader>

          {partialCheckinItem && (
            <div className="py-3 space-y-3 text-xs">
              <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl space-y-1.5 text-amber-200">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Hóspede(s) Bloqueado(s) (Sem Check-in Digital):</span>
                </div>
                <div className="space-y-1 pl-5">
                  {partialCheckinItem.pendingGuests.map((g: any) => (
                    <div key={g.index} className="flex flex-wrap items-center justify-between gap-1 font-semibold">
                      <span>• {g.name || `Hóspede ${g.index}`}</span>
                      <span className="text-[10px] text-amber-400/90 font-normal">Ficha digital não preenchida</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl space-y-1.5 text-emerald-200">
                <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Entrada Liberada Apenas Para:</span>
                </div>
                <div className="space-y-1 pl-5">
                  {partialCheckinItem.clearedGuests.map((g: any) => (
                    <div key={g.index} className="flex flex-wrap items-center justify-between gap-1 font-bold text-white">
                      <span>• {g.name || `Hóspede ${g.index}`}</span>
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">Check-in OK</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2">
                <p className="text-sm font-black text-slate-100 leading-snug">
                  Deseja registrar a entrada apenas de{" "}
                  <span className="text-emerald-400">
                    {partialCheckinItem.clearedGuests.map((g: any) => g.name || `Hóspede ${g.index}`).join(" e ")}
                  </span>
                  ?
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  O acompanhante pendente continuará com entrada bloqueada na portaria até concluir o check-in digital.
                </p>
              </div>

              {!partialCheckinItem.item.isRoomReady && (
                <div className="p-2.5 bg-rose-950/50 border border-rose-900/70 rounded-xl text-[11px] text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>Atenção: Quarto consta como em higienização. Ao confirmar, será atualizado como limpo e ocupado.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPartialCheckinItem(null)}
              className="w-full sm:w-auto text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => partialCheckinItem && executePartialCheckin(partialCheckinItem)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
            >
              <Unlock className="w-4 h-4 shrink-0" />
              <span>
                Confirmar Entrada de{" "}
                {partialCheckinItem?.clearedGuests?.length === 1
                  ? (partialCheckinItem.clearedGuests[0].name || "").split(" ")[0] || "Hóspede"
                  : "Hóspedes Liberados"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
