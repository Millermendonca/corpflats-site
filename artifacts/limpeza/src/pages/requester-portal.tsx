import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useRoute } from "wouter"
import { format, parseISO, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Layers,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  Users,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CorpFlatsIcon, CorpFlatsSplashScreen, CorpFlatsWordmark } from "@/components/brand-logo"
import { FinancialDocumentsSection } from "@/components/financial-documents-section"
import { useToast } from "@/hooks/use-toast"
import { formatPassport, formatPhoneForWhatsAppCheck, formatSmartPhone } from "@/lib/phone-mask"
import { getPrimaryEmail, parseEmailList, validateEmailList } from "@/lib/email-utils"
import { isValidBrazilianCpf, phonesMatchBr } from "@/pages/agency-guest-credential"

const HoldCountdownBadge = memo(function HoldCountdownBadge({
  expiresAt,
  onExpire,
}: {
  expiresAt: string
  onExpire: () => void
}) {
  const computeLabel = () => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return "00:00"
    const totalSecs = Math.floor(diff / 1000)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const [timeStr, setTimeStr] = useState<string>(computeLabel)
  const expiredNotifiedRef = useRef(false)

  useEffect(() => {
    expiredNotifiedRef.current = false
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeStr("00:00")
        if (!expiredNotifiedRef.current) {
          expiredNotifiedRef.current = true
          onExpire()
        }
      } else {
        const totalSecs = Math.floor(diff / 1000)
        const mins = Math.floor(totalSecs / 60)
        const secs = totalSecs % 60
        setTimeStr(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, onExpire])

  return (
    <Badge
      variant="outline"
      className="bg-white border-amber-300 font-mono font-bold text-sm px-2.5 py-1 text-amber-800 shrink-0"
    >
      ⏳ {timeStr}
    </Badge>
  )
})

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

function formatDateBr(dateStr?: string): string {
  if (!dateStr) return "—"
  const parts = String(dateStr).slice(0, 10).split("-")
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return String(dateStr)
}

function formatMoney(val?: number | string | null): string {
  return Number(val || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCpfMask(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

function formatPhoneDisplay(phone?: string): string {
  if (!phone) return ""
  const digits = String(phone).replace(/\D/g, "")
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return phone
}

function formatDateTimeBr(dateStr?: string): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    }
  } catch {}
  return String(dateStr)
}

function computeCardAmount(pixAmt: number): number {
  return Math.round((Number(pixAmt) || 0) * 1.05 * 100) / 100
}

function normalizeRelativeOrFullUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ""
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`
}

function getOperationalBadgeMeta(item: any): {
  label: string
  className: string
} {
  const op = String(item?.operationalStatus || "").toLowerCase()
  const st = String(item?.status || "").toLowerCase()
  if (item?.isCancelled || st === "cancelada" || st === "cancelled" || op === "cancelado") {
    return {
      label: item?.operationalStatusLabel || "Cancelado",
      className: "bg-rose-50 text-rose-700 border-rose-200",
    }
  }
  if (item?.isExpired || st === "expirada" || op === "expirado") {
    return {
      label: item?.operationalStatusLabel || "Expirado",
      className: "bg-amber-50 text-amber-800 border-amber-300",
    }
  }
  if (op === "aguardando_pagamento" || st === "pre_reserva" || st === "pendente") {
    return {
      label: item?.operationalStatusLabel || "Aguardando Pagamento",
      className: "bg-amber-50 text-amber-800 border-amber-300",
    }
  }
  if (op === "checkout_realizado" || item?.checkedOutAt || st === "completed" || st === "checked_out") {
    return {
      label: item?.operationalStatusLabel || "Check-out Realizado",
      className: "bg-slate-100 text-slate-700 border-slate-300",
    }
  }
  if (op === "hospedado" || op === "hospedado_in_house" || item?.checkedInAt || st === "in_house") {
    return {
      label: item?.operationalStatusLabel || "Hospedado",
      className: "bg-emerald-600 text-white border-emerald-600",
    }
  }
  if (op === "pronto_para_checkin" || item?.preCheckinCompleted) {
    return {
      label: item?.operationalStatusLabel || "Pronto para Check-in",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    }
  }
  if (op === "pre_checkin_pendente") {
    return {
      label: item?.operationalStatusLabel || "Pré-Check-in Pendente",
      className: "bg-sky-50 text-sky-700 border-sky-200",
    }
  }
  return {
    label: item?.operationalStatusLabel || "Confirmada",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }
}

function getNormalizedFlatGuests(item: any): Array<{
  index: number
  name: string
  phone: string
  email: string
  document: string
  hasCompletedCheckin: boolean
  informLater: boolean
}> {
  const gCount = Math.min(3, Math.max(1, Number(item?.guestCount) || 1))
  const rawArr = Array.isArray(item?.guests) ? item.guests : []
  const result: Array<{
    index: number
    name: string
    phone: string
    email: string
    document: string
    hasCompletedCheckin: boolean
    informLater: boolean
  }> = []

  for (let i = 1; i <= gCount; i++) {
    const fromArr = rawArr.find((g: any) => Number(g?.index) === i) || rawArr[i - 1] || {}
    if (i === 1) {
      const name = String(fromArr?.name || item?.guestName || "").trim()
      const cleanName = /^(a definir|informar depois|pendente)/i.test(name) ? "" : name
      result.push({
        index: 1,
        name: cleanName,
        phone: String(fromArr?.phone || item?.guestPhone || "").trim(),
        email: String(fromArr?.email || item?.guestEmail || "").trim(),
        document: String(fromArr?.cpf || fromArr?.document || item?.guestCpf || item?.guestDocument || "").trim(),
        hasCompletedCheckin: Boolean(fromArr?.hasCompletedCheckin || item?.preCheckinCompleted),
        informLater: Boolean(item?.informGuestsLater && !cleanName),
      })
    } else if (i === 2) {
      const name = String(fromArr?.name || item?.guest2Name || "").trim()
      result.push({
        index: 2,
        name,
        phone: String(fromArr?.phone || item?.guest2Phone || "").trim(),
        email: String(fromArr?.email || item?.guest2Email || "").trim(),
        document: String(fromArr?.cpf || fromArr?.document || item?.guest2Document || "").trim(),
        hasCompletedCheckin: Boolean(fromArr?.hasCompletedCheckin),
        informLater: Boolean((item?.guest2InformLater || fromArr?.informLater) && !name),
      })
    } else {
      const name = String(fromArr?.name || item?.guest3Name || "").trim()
      result.push({
        index: 3,
        name,
        phone: String(fromArr?.phone || item?.guest3Phone || "").trim(),
        email: String(fromArr?.email || item?.guest3Email || "").trim(),
        document: String(fromArr?.cpf || fromArr?.document || item?.guest3Document || "").trim(),
        hasCompletedCheckin: Boolean(fromArr?.hasCompletedCheckin),
        informLater: Boolean((item?.guest3InformLater || fromArr?.informLater) && !name),
      })
    }
  }

  return result
}

function getMissingFieldsList(item: any): string[] {
  if (Array.isArray(item?.missingFields) && item.missingFields.length > 0) {
    return item.missingFields.map((x: any) => String(x)).filter(Boolean)
  }
  const missing: string[] = []
  const guests = getNormalizedFlatGuests(item)
  for (const g of guests) {
    if (!g.name) {
      missing.push(`Nome do Hóspede ${g.index}`)
    }
    if (!g.phone || g.phone.replace(/\D/g, "").length < 8) {
      missing.push(`WhatsApp do Hóspede ${g.index}`)
    }
  }
  if (item?.informGuestsLater && missing.length === 0) {
    missing.push("Dados dos hóspedes marcados para informar depois")
  }
  return missing
}

interface GuestModalDraft {
  item: any
  guestCount: number
  requesterIsGuest1: boolean
  guestName: string
  docType: "cpf" | "passport"
  guestDocument: string
  guestPhone: string
  guestEmail: string
  guest1WaStatus: "idle" | "checking" | "valid" | "invalid"
  guest2InformLater: boolean
  guest2Name: string
  guest2Document: string
  guest2Phone: string
  guest2Email: string
  guest2WaStatus: "idle" | "checking" | "valid" | "invalid"
  guest3InformLater: boolean
  guest3Name: string
  guest3Document: string
  guest3Phone: string
  guest3Email: string
  guest3WaStatus: "idle" | "checking" | "valid" | "invalid"
}

export default function RequesterPortal() {
  const [, setLocation] = useLocation()
  const [, paramsSol] = useRoute("/solicitante/:code")
  const [, paramsMin] = useRoute("/minha-reserva/:code")
  const [, paramsAlt] = useRoute("/portal-hospede/:code")
  const [, paramsGuest] = useRoute("/guest-portal/:code")
  const [, paramsPix] = useRoute("/copiar-pix/:code")
  const [, paramsPixShort] = useRoute("/pix/:code")
  const { toast } = useToast()

  const getInitialCode = () => {
    const routeCode =
      paramsSol?.code ||
      paramsMin?.code ||
      paramsAlt?.code ||
      paramsGuest?.code ||
      paramsPix?.code ||
      paramsPixShort?.code
    if (routeCode) return routeCode
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("code") || sp.get("q") || sp.get("reserva") || ""
    }
    return ""
  }

  const getUrlToken = () => {
    if (typeof window === "undefined") return ""
    const sp = new URLSearchParams(window.location.search)
    return (sp.get("t") || sp.get("token") || "").trim()
  }

  const rawCode = getInitialCode()
  const [code, setCode] = useState(rawCode)
  const [searchQuery, setSearchQuery] = useState(rawCode)
  const [urlToken] = useState<string>(getUrlToken)

  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(rawCode))
  const [error, setError] = useState<string | null>(null)
  const [accessRestricted, setAccessRestricted] = useState<boolean>(false)

  // Copy states
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)
  const [copiedReceipt, setCopiedReceipt] = useState(false)

  // Financial states
  const [paymentMethodTab, setPaymentMethodTab] = useState<"pix" | "card">("pix")
  const [changingMethod, setChangingMethod] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [paymentPendingFeedback, setPaymentPendingFeedback] = useState(false)
  const [paymentSuccessNotice, setPaymentSuccessNotice] = useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)

  // Consolidated NFS-e states
  const [nfseOpen, setNfseOpen] = useState(false)
  const [nfseDoc, setNfseDoc] = useState("")
  const [nfseName, setNfseName] = useState("")
  const [nfseEmail, setNfseEmail] = useState("")
  const [emittingNfse, setEmittingNfse] = useState(false)
  const [nfseMessage, setNfseMessage] = useState<string | null>(null)

  // Vehicle modal state
  const [vehicleModalItem, setVehicleModalItem] = useState<any | null>(null)
  const [vehPlate, setVehPlate] = useState("")
  const [vehBrand, setVehBrand] = useState("")
  const [vehModel, setVehModel] = useState("")
  const [vehColor, setVehColor] = useState("")
  const [savingVehicle, setSavingVehicle] = useState(false)

  // Guest 1/2/3 edit modal state
  const [guestDraft, setGuestDraft] = useState<GuestModalDraft | null>(null)
  const [savingGuests, setSavingGuests] = useState(false)

  // Modify dates modal state (inside collapsed accordion)
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modTargetFlat, setModTargetFlat] = useState<any | null>(null)
  const [modStep, setModStep] = useState<"preview" | "checkout" | "success">("preview")
  const [modCheckinDate, setModCheckinDate] = useState("")
  const [modCheckoutDate, setModCheckoutDate] = useState("")
  const [modGuestCount, setModGuestCount] = useState(1)
  const [modReason, setModReason] = useState("")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<any | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutData, setCheckoutData] = useState<any | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [modPaymentMethod, setModPaymentMethod] = useState<"pix" | "card">("pix")
  const [modCopiedPix, setModCopiedPix] = useState(false)
  const [modPollingActive, setModPollingActive] = useState(false)
  const [cancellingHold, setCancellingHold] = useState(false)
  const [confirmCancelHoldInline, setConfirmCancelHoldInline] = useState(false)
  const [modifySuccessInfo, setModifySuccessInfo] = useState<any | null>(null)

  // Cancel flat / whole package dialog state (NO window.confirm)
  const [cancelDialogTarget, setCancelDialogTarget] = useState<{
    mode: "single" | "whole"
    item?: any
  } | null>(null)
  const [cancelQuote, setCancelQuote] = useState<any | null>(null)
  const [loadingCancelQuote, setLoadingCancelQuote] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelWholeConfirmChecked, setCancelWholeConfirmChecked] = useState(false)
  const [cancellingReservation, setCancellingReservation] = useState(false)

  const effectiveToken = useMemo(() => {
    return (urlToken || data?.requesterPortalToken || "").trim()
  }, [urlToken, data?.requesterPortalToken])

  const buildAuthQueryString = (extra?: Record<string, string>) => {
    const sp = new URLSearchParams()
    if (effectiveToken) sp.set("t", effectiveToken)
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") sp.set(k, v)
      })
    }
    const str = sp.toString()
    return str ? `?${str}` : ""
  }

  const fetchPortalData = async (targetCode = code, silent = false) => {
    const q = String(targetCode || "").trim()
    if (!q) {
      setLoading(false)
      return
    }
    try {
      if (!silent) setLoading(true)
      setError(null)
      setAccessRestricted(false)
      const tok = urlToken || data?.requesterPortalToken || ""
      const qs = tok ? `?t=${encodeURIComponent(tok)}` : ""
      const res = await fetch(`/api/pms/requester-portal/${encodeURIComponent(q)}${qs}`)
      const json = await res.json().catch(() => ({}))
      if (res.status === 401 || res.status === 403) {
        setAccessRestricted(true)
        setError(json.error || "Link exclusivo do solicitante sem token válido de autorização.")
        setData(null)
        return
      }
      if (!res.ok || json.success === false) {
        setError(json.error || "Não foi possível localizar o pacote ou reserva.")
        return
      }
      setData(json)
      const resolvedMethod = String(json?.packageSummary?.paymentMethod || "").toLowerCase()
      if (resolvedMethod.includes("card") || resolvedMethod.includes("cartao")) {
        setPaymentMethodTab("card")
      }
    } catch (err: any) {
      if (!silent) {
        setError(err?.message || "Erro de conexão ao carregar o Portal do Solicitante.")
      }
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
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCode])

  const requester = data?.requester || {}
  const summary = useMemo(() => {
    if (data?.packageSummary) return data.packageSummary
    const r = data?.reservation
    if (!r) return null
    const stLower = String(r.status || "").toLowerCase()
    return {
      packageCode: r.code,
      requesterName: data?.requester?.name || "",
      requesterEmail: data?.requester?.email || "",
      requesterPhone: data?.requester?.phone || "",
      requesterDocument: data?.requester?.document || "",
      totalAmount: r.totalAmount || 0,
      paidAmount: r.paidAmount || 0,
      pendingAmount: r.pendingAmount ?? Math.max(0, (Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0)),
      cardTotalAmount: r.cardTotalAmount || computeCardAmount(r.totalAmount || 0),
      cardPendingAmount: r.cardPendingAmount || computeCardAmount(r.pendingAmount || 0),
      isPaid: Boolean(r.isPaid),
      isFaturadoBoleto: Boolean(r.isFaturadoBoleto),
      isAllCancelled: stLower === "cancelada" || stLower === "cancelled",
      isAllExpired: stLower === "expirada",
      paymentMethod: r.paymentMethod || "pix",
      pixCopiaECola: r.pixCopiaECola || null,
      pixTxId: r.pixTxId || null,
      mpInitPoint: r.mpInitPoint || null,
      expiresAt: r.expiresAt || null,
      items: [r],
    }
  }, [data?.packageSummary, data?.reservation, data?.requester])
  const isPackage = Boolean(data?.isPackage ?? (Array.isArray(summary?.items) && summary.items.length > 1))
  const locatorCode = String(data?.locatorCode || summary?.packageCode || code || "").trim()
  const requesterName = String(requester?.name || summary?.requesterName || "Solicitante").trim()
  const items: any[] = useMemo(() => (Array.isArray(summary?.items) ? summary.items : []), [summary?.items])
  const activeItems = useMemo(
    () =>
      items.filter((it) => {
        const st = String(it?.status || "").toLowerCase()
        return it && !it.isCancelled && !it.isExpired && st !== "cancelada" && st !== "cancelled" && st !== "expirada"
      }),
    [items]
  )

  const totalAmount = Number(summary?.totalAmount || 0)
  const paidAmount = Number(summary?.paidAmount || 0)
  const pendingAmount = Math.max(0, Number(summary?.pendingAmount ?? totalAmount - paidAmount))
  const cardTotalAmount = Number(summary?.cardTotalAmount || computeCardAmount(totalAmount))
  const cardPendingAmount = Number(summary?.cardPendingAmount || computeCardAmount(pendingAmount))
  const isAllCancelled = Boolean(
    summary?.isAllCancelled || (items.length > 0 && items.every((it) => it.isCancelled || it.status === "cancelada"))
  )
  const isAllExpired = Boolean(
    summary?.isAllExpired || (items.length > 0 && items.every((it) => it.isExpired || it.status === "expirada"))
  )
  const isFaturadoBoleto = Boolean(summary?.isFaturadoBoleto)
  const isPaid = Boolean(!isAllCancelled && !isAllExpired && (summary?.isPaid || (totalAmount > 0 && pendingAmount <= 0.01)))
  const hasUnpaidPreReservation = Boolean(
    !isPaid &&
      !isFaturadoBoleto &&
      !isAllCancelled &&
      !isAllExpired &&
      activeItems.some((it) => String(it.status || "").toLowerCase() === "pre_reserva" || it.operationalStatus === "aguardando_pagamento")
  )
  const holdExpiresAt = summary?.expiresAt || activeItems.find((it) => it.expiresAt)?.expiresAt || null
  const myGuestFlats = useMemo(() => activeItems.filter((it) => Boolean(it?.requesterIsGuest1)), [activeItems])

  const adminWhatsApp = String(data?.adminWhatsApp || "5522997124021")
  const rawAdminDigits = adminWhatsApp.replace(/\D/g, "")
  const finalWaNumber =
    rawAdminDigits.length === 10 || rawAdminDigits.length === 11 ? `55${rawAdminDigits}` : rawAdminDigits
  const whatsappUrl = `https://wa.me/${finalWaNumber}?text=${encodeURIComponent(
    `Olá! Sou ${requesterName} (Solicitante) e preciso de apoio com o localizador ${locatorCode}.`
  )}`

  // Auto polling for pending payment
  useEffect(() => {
    if (!locatorCode || isPaid || isFaturadoBoleto || isAllCancelled || isAllExpired) return
    const timer = setInterval(async () => {
      try {
        const qs = buildAuthQueryString()
        const res = await fetch(`/api/pms/reservations/${encodeURIComponent(locatorCode)}/payment-status${qs}`)
        if (!res.ok) return
        const json = await res.json()
        if (json.paid || json.isExpiredPreReservation || json.status === "expirada") {
          if (json.paid) setPaymentSuccessNotice(true)
          await fetchPortalData(locatorCode, true)
        } else if (json.packageSummary) {
          setData((prev: any) => (prev ? { ...prev, packageSummary: json.packageSummary } : prev))
        }
      } catch {}
    }, 6000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatorCode, effectiveToken, isPaid, isFaturadoBoleto, isAllCancelled, isAllExpired])

  // Modify Checkout Status Polling
  useEffect(() => {
    if (!modPollingActive || !checkoutData?.pendingId || !modifyModalOpen || !modTargetFlat?.code) return
    const pendingId = checkoutData.pendingId
    const targetModCode = modTargetFlat.code
    const qs = buildAuthQueryString({
      pendingId: String(pendingId),
      ...(isPackage ? { packageCode: locatorCode } : {}),
    })
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(targetModCode)}/modify-status${qs}`)
        if (!res.ok) return
        const json = await res.json()
        if (json.paid || json.status === "paid" || json.committed) {
          clearInterval(interval)
          setModPollingActive(false)
          setModifySuccessInfo({
            message: json.message || "Pagamento confirmado! As datas da acomodação foram atualizadas.",
            newCheckinDate: json.newCheckinDate || checkoutData.newDates?.checkinDate,
            newCheckoutDate: json.newCheckoutDate || checkoutData.newDates?.checkoutDate,
            newFlatNumber: json.flatNumber || checkoutData.newFlatNumber || modTargetFlat.flatNumber,
          })
          setModStep("success")
          fetchPortalData(locatorCode, true)
        } else if (json.status === "expired") {
          clearInterval(interval)
          setModPollingActive(false)
          setCheckoutError("O prazo de 30 minutos para pagamento expirou. Reinicie a alteração.")
        }
      } catch {}
    }, 2500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPollingActive, checkoutData?.pendingId, modifyModalOpen, modTargetFlat?.code])

  const handleCopyText = (text: string, id: string, title: string, description?: string) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2500)
    toast({ title, description })
  }

  const handleCopyPix = () => {
    if (!summary?.pixCopiaECola) return
    navigator.clipboard?.writeText(summary.pixCopiaECola)
    setCopiedPix(true)
    setTimeout(() => setCopiedPix(false), 3000)
    toast({ title: "Código PIX copiado!", description: "Cole no aplicativo do seu banco para finalizar." })
  }

  const handleChangePaymentMethod = async (method: "pix" | "card") => {
    setPaymentMethodTab(method)
    if (!locatorCode) return
    setChangingMethod(true)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(locatorCode)}/change-payment-method${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          ...(isPackage ? { packageCode: locatorCode } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.packageSummary) {
        setData((prev: any) => (prev ? { ...prev, packageSummary: json.packageSummary } : prev))
      } else if (!res.ok) {
        toast({
          title: "Não foi possível alterar a forma de pagamento",
          description: json.error || "Tente novamente em instantes.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" })
    } finally {
      setChangingMethod(false)
    }
  }

  const handleCheckPaymentStatus = async () => {
    if (!locatorCode) return
    setCheckingPayment(true)
    setPaymentPendingFeedback(false)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(locatorCode)}/payment-status${qs}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.paid) {
        setPaymentSuccessNotice(true)
        await fetchPortalData(locatorCode, true)
      } else {
        if (json.packageSummary) {
          setData((prev: any) => (prev ? { ...prev, packageSummary: json.packageSummary } : prev))
        }
        setPaymentPendingFeedback(true)
        setTimeout(() => setPaymentPendingFeedback(false), 7000)
      }
    } catch {
      setPaymentPendingFeedback(true)
    } finally {
      setCheckingPayment(false)
    }
  }

  const handleEmitConsolidatedNfse = async () => {
    const cleanDoc = nfseDoc.replace(/\D/g, "")
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      setNfseMessage("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para emitir a NFS-e.")
      return
    }
    const emailValidation = validateEmailList(nfseEmail)
    if (!emailValidation.valid) {
      setNfseMessage(
        `E-mail inválido (${emailValidation.invalidTokens.join(", ")}). Separe múltiplos endereços com ";".`
      )
      return
    }
    const primaryEmail = getPrimaryEmail(nfseEmail)
    const deliveryEmails = parseEmailList(nfseEmail)
    setEmittingNfse(true)
    setNfseMessage(null)
    try {
      const res = await fetch("/api/nfse/emit-consolidated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isPackage ? { packageId: locatorCode } : { reservationIds: activeItems.map((it) => it.id) }),
          tomadorCpfCnpj: cleanDoc,
          tomadorNome: nfseName.trim() || undefined,
          tomadorEmail: primaryEmail || undefined,
          nfDeliveryEmails: deliveryEmails.length > 0 ? deliveryEmails : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNfseMessage(json.error || "Não foi possível emitir a NFS-e consolidada.")
      } else {
        setNfseMessage(`✓ NFS-e Nº ${json.numeroNfse} emitida com sucesso!`)
        setNfseOpen(false)
        await fetchPortalData(locatorCode, true)
      }
    } catch {
      setNfseMessage("Erro de conexão ao emitir a NFS-e.")
    } finally {
      setEmittingNfse(false)
    }
  }

  // Vehicle handlers
  const openVehicleModal = (item: any) => {
    setVehicleModalItem(item)
    setVehPlate(String(item?.vehicle?.plate || ""))
    setVehBrand(String(item?.vehicle?.brand || ""))
    setVehModel(String(item?.vehicle?.model || ""))
    setVehColor(String(item?.vehicle?.color || ""))
  }

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicleModalItem?.code || !vehPlate.trim()) {
      toast({
        title: "Placa obrigatória",
        description: "Informe a placa do veículo para liberar na garagem.",
        variant: "destructive",
      })
      return
    }
    setSavingVehicle(true)
    try {
      const res = await fetch(`/api/pms/reservations/${encodeURIComponent(vehicleModalItem.code)}/vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: vehPlate.trim().toUpperCase(),
          brand: vehBrand.trim(),
          model: vehModel.trim(),
          color: vehColor.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "Erro ao salvar veículo",
          description: json.error || "Não foi possível salvar os dados do veículo.",
          variant: "destructive",
        })
      } else {
        toast({
          title: `Veículo salvo (Flat ${vehicleModalItem.flatNumber})`,
          description: json.message || "Placa registrada com sucesso para liberação na portaria/garagem.",
        })
        setVehicleModalItem(null)
        await fetchPortalData(locatorCode, true)
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" })
    } finally {
      setSavingVehicle(false)
    }
  }

  // Guest 1/2/3 modal handlers
  const openGuestModal = (item: any) => {
    const guests = getNormalizedFlatGuests(item)
    const g1 = guests[0] || { name: "", phone: "", email: "", document: "", informLater: false }
    const g2 = guests[1] || { name: "", phone: "", email: "", document: "", informLater: false }
    const g3 = guests[2] || { name: "", phone: "", email: "", document: "", informLater: false }
    const isPassport = /[a-zA-Z]/.test(g1.document)
    setGuestDraft({
      item,
      guestCount: Math.min(3, Math.max(1, Number(item.guestCount) || 1)),
      requesterIsGuest1: Boolean(item.requesterIsGuest1),
      guestName: g1.name,
      docType: isPassport ? "passport" : "cpf",
      guestDocument: g1.document ? (isPassport ? formatPassport(g1.document) : formatCpfMask(g1.document)) : "",
      guestPhone: g1.phone ? formatSmartPhone(g1.phone) : "",
      guestEmail: g1.email,
      guest1WaStatus: "idle",
      guest2InformLater: Boolean(item.guest2InformLater && !g2.name),
      guest2Name: g2.name,
      guest2Document: g2.document ? formatCpfMask(g2.document) : "",
      guest2Phone: g2.phone ? formatSmartPhone(g2.phone) : "",
      guest2Email: g2.email,
      guest2WaStatus: "idle",
      guest3InformLater: Boolean(item.guest3InformLater && !g3.name),
      guest3Name: g3.name,
      guest3Document: g3.document ? formatCpfMask(g3.document) : "",
      guest3Phone: g3.phone ? formatSmartPhone(g3.phone) : "",
      guest3Email: g3.email,
      guest3WaStatus: "idle",
    })
  }

  const checkWhatsAppForGuest = async (
    slot: 1 | 2 | 3,
    rawPhone: string
  ): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone)
    const statusKey = slot === 1 ? "guest1WaStatus" : slot === 2 ? "guest2WaStatus" : "guest3WaStatus"
    if (!queryPhone) {
      setGuestDraft((prev) => (prev ? { ...prev, [statusKey]: "idle" } : prev))
      return false
    }
    setGuestDraft((prev) => (prev ? { ...prev, [statusKey]: "checking" } : prev))
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`)
      const json = await res.json().catch(() => ({}))
      if (json && json.checked && json.exists === false) {
        setGuestDraft((prev) => (prev ? { ...prev, [statusKey]: "invalid" } : prev))
        return false
      }
      setGuestDraft((prev) => (prev ? { ...prev, [statusKey]: "valid" } : prev))
      return true
    } catch {
      setGuestDraft((prev) => (prev ? { ...prev, [statusKey]: "valid" } : prev))
      return true
    }
  }

  const normalizePhoneForPost = (raw: string) => {
    const trimmed = raw.trim()
    const digits = trimmed.replace(/\D/g, "")
    const isIntl = trimmed.startsWith("+") && !digits.startsWith("55")
    return {
      isIntl,
      digits,
      payload: isIntl ? `+${digits}` : digits,
    }
  }

  const handleSaveGuestDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestDraft) return
    const { item, guestCount } = guestDraft
    if (guestDraft.guestName.trim().split(/\s+/).filter(Boolean).length < 2) {
      toast({
        title: "Nome do Hóspede 1 incompleto",
        description: "Informe nome e sobrenome do Hóspede 1.",
        variant: "destructive",
      })
      return
    }
    const p1 = normalizePhoneForPost(guestDraft.guestPhone)
    if (p1.digits.length < (p1.isIntl ? 8 : 10)) {
      toast({
        title: "WhatsApp do Hóspede 1 inválido",
        description: "Informe o telefone / WhatsApp com DDD do Hóspede 1.",
        variant: "destructive",
      })
      return
    }
    const hasDoc1 = guestDraft.guestDocument.trim().length > 0
    const cleanDoc1 = guestDraft.guestDocument.replace(/\D/g, "")
    const normPass1 = formatPassport(guestDraft.guestDocument)
    if (hasDoc1) {
      if (guestDraft.docType === "passport" && normPass1.replace(/[^A-Z0-9]/g, "").length < 5) {
        toast({ title: "Passaporte do Hóspede 1 inválido", variant: "destructive" })
        return
      }
      if (guestDraft.docType === "cpf" && !isValidBrazilianCpf(cleanDoc1)) {
        toast({ title: "CPF do Hóspede 1 inválido", variant: "destructive" })
        return
      }
    }
    if (guestDraft.guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDraft.guestEmail.trim())) {
      toast({ title: "E-mail do Hóspede 1 inválido", variant: "destructive" })
      return
    }

    let p2Payload = ""
    if (guestCount >= 2 && !guestDraft.guest2InformLater) {
      if (guestDraft.guest2Name.trim().split(/\s+/).filter(Boolean).length < 2) {
        toast({
          title: "Nome do Hóspede 2 obrigatório",
          description: "Informe nome e sobrenome do Hóspede 2 ou marque 'Informar depois'.",
          variant: "destructive",
        })
        return
      }
      const p2 = normalizePhoneForPost(guestDraft.guest2Phone)
      if (p2.digits.length < (p2.isIntl ? 8 : 10)) {
        toast({
          title: "WhatsApp do Hóspede 2 obrigatório",
          description: "Informe o WhatsApp com DDD do Hóspede 2 ou marque 'Informar depois'.",
          variant: "destructive",
        })
        return
      }
      p2Payload = p2.payload
      const d2 = guestDraft.guest2Document.replace(/\D/g, "")
      if (d2.length > 0 && !isValidBrazilianCpf(d2)) {
        toast({ title: "CPF do Hóspede 2 inválido", variant: "destructive" })
        return
      }
    }

    let p3Payload = ""
    if (guestCount >= 3 && !guestDraft.guest3InformLater) {
      if (guestDraft.guest3Name.trim().split(/\s+/).filter(Boolean).length < 2) {
        toast({
          title: "Nome do Hóspede 3 obrigatório",
          description: "Informe nome e sobrenome do Hóspede 3 ou marque 'Informar depois'.",
          variant: "destructive",
        })
        return
      }
      const p3 = normalizePhoneForPost(guestDraft.guest3Phone)
      if (p3.digits.length < (p3.isIntl ? 8 : 10)) {
        toast({
          title: "WhatsApp do Hóspede 3 obrigatório",
          description: "Informe o WhatsApp com DDD do Hóspede 3 ou marque 'Informar depois'.",
          variant: "destructive",
        })
        return
      }
      p3Payload = p3.payload
      const d3 = guestDraft.guest3Document.replace(/\D/g, "")
      if (d3.length > 0 && !isValidBrazilianCpf(d3)) {
        toast({ title: "CPF do Hóspede 3 inválido", variant: "destructive" })
        return
      }
    }

    const reqPhoneCands = [
      requester?.whatsapp,
      requester?.phone,
      summary?.requesterPhone,
      item?.requesterInfo?.whatsapp,
      item?.requesterInfo?.phone,
      item?.requesterPhone,
      item?.agencyAgentPhone,
    ].filter(Boolean) as string[]
    const activeIdx = activeItems.findIndex(
      (it) => String(it?.id || it?.code) === String(item?.id || item?.code)
    )
    const allowRequesterAsG1Draft = Boolean(
      guestDraft.requesterIsGuest1 &&
      activeIdx <= 0 &&
      (!item?.packageIndex || Number(item.packageIndex) === 1)
    )

    if (!allowRequesterAsG1Draft && reqPhoneCands.some((rp) => phonesMatchBr(p1.payload, rp))) {
      toast({
        title: "WhatsApp do solicitante não permitido",
        description:
          "Você informou o número do solicitante para o Hóspede 1 deste flat. Informe o WhatsApp real do hóspede (ou marque que você ficará no 1º flat).",
        variant: "destructive",
      })
      return
    }

    if (p2Payload) {
      if (phonesMatchBr(p2Payload, p1.payload)) {
        toast({
          title: "WhatsApp repetido no Hóspede 2",
          description: "O WhatsApp do Hóspede 2 não pode ser igual ao do Hóspede 1.",
          variant: "destructive",
        })
        return
      }
      if (reqPhoneCands.some((rp) => phonesMatchBr(p2Payload, rp))) {
        toast({
          title: "WhatsApp do solicitante no Hóspede 2",
          description: "O WhatsApp do Hóspede 2 não pode ser o número do solicitante.",
          variant: "destructive",
        })
        return
      }
    }

    if (p3Payload) {
      if (phonesMatchBr(p3Payload, p1.payload) || (p2Payload && phonesMatchBr(p3Payload, p2Payload))) {
        toast({
          title: "WhatsApp repetido no Hóspede 3",
          description: "O WhatsApp do Hóspede 3 deve ser diferente do Hóspede 1 e 2.",
          variant: "destructive",
        })
        return
      }
      if (reqPhoneCands.some((rp) => phonesMatchBr(p3Payload, rp))) {
        toast({
          title: "WhatsApp do solicitante no Hóspede 3",
          description: "O WhatsApp do Hóspede 3 não pode ser o número do solicitante.",
          variant: "destructive",
        })
        return
      }
    }

    const conflictingOtherItem = activeItems.find((other) => {
      if (!other || String(other.id || other.code) === String(item?.id || item?.code)) return false
      if (other.guestPending || other.informGuestsLater) return false
      const otherGuestName = String(other.guestName || other.guests?.[0]?.name || "").trim()
      if (!otherGuestName || /a definir|informar depois|pendente|^h[óo]spede\s*\d*$/i.test(otherGuestName)) {
        return false
      }
      const otherPhones = [
        other.guestPhone,
        ...(Array.isArray(other.guests) ? other.guests.map((g: any) => g?.phone || g?.whatsapp) : []),
      ].filter((p) => String(p || "").replace(/\D/g, "").length >= 8)
      return (
        otherPhones.some((op) => phonesMatchBr(p1.payload, op)) ||
        (p2Payload && otherPhones.some((op) => phonesMatchBr(p2Payload, op))) ||
        (p3Payload && otherPhones.some((op) => phonesMatchBr(p3Payload, op)))
      )
    })
    if (conflictingOtherItem) {
      toast({
        title: "WhatsApp já utilizado em outro flat",
        description: `Este número já está cadastrado no Flat ${conflictingOtherItem.flatNumber || conflictingOtherItem.code}. Informe o WhatsApp individual de cada hóspede.`,
        variant: "destructive",
      })
      return
    }

    setSavingGuests(true)
    try {
      const ok1 = await checkWhatsAppForGuest(1, p1.payload)
      if (!ok1) {
        toast({
          title: "Hóspede 1 sem WhatsApp ativo",
          description: "Informe um número com conta ativa no WhatsApp.",
          variant: "destructive",
        })
        setSavingGuests(false)
        return
      }
      if (guestCount >= 2 && !guestDraft.guest2InformLater && p2Payload) {
        const ok2 = await checkWhatsAppForGuest(2, p2Payload)
        if (!ok2) {
          toast({
            title: "Hóspede 2 sem WhatsApp ativo",
            description: "Informe um número com conta ativa no WhatsApp para o Hóspede 2.",
            variant: "destructive",
          })
          setSavingGuests(false)
          return
        }
      }
      if (guestCount >= 3 && !guestDraft.guest3InformLater && p3Payload) {
        const ok3 = await checkWhatsAppForGuest(3, p3Payload)
        if (!ok3) {
          toast({
            title: "Hóspede 3 sem WhatsApp ativo",
            description: "Informe um número com conta ativa no WhatsApp para o Hóspede 3.",
            variant: "destructive",
          })
          setSavingGuests(false)
          return
        }
      }

      const isFlat1Eligible = !item.packageIndex || Number(item.packageIndex) === 1
      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(item.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestCount,
          ...(isFlat1Eligible ? { requesterIsGuest1: Boolean(guestDraft.requesterIsGuest1) } : {}),
          guestName: guestDraft.guestName.trim(),
          guestDocument: hasDoc1 ? (guestDraft.docType === "passport" ? normPass1 : cleanDoc1) : "",
          docType: hasDoc1 ? (guestDraft.docType === "passport" ? "Passaporte" : "CPF") : "",
          guestPhone: p1.payload,
          guestEmail: guestDraft.guestEmail.trim(),
          guest2InformLater: guestCount >= 2 ? guestDraft.guest2InformLater : false,
          guest2:
            guestCount >= 2 && !guestDraft.guest2InformLater && guestDraft.guest2Name.trim()
              ? {
                  name: guestDraft.guest2Name.trim(),
                  document: guestDraft.guest2Document.replace(/\D/g, ""),
                  phone: p2Payload,
                  email: guestDraft.guest2Email.trim(),
                }
              : null,
          guest3InformLater: guestCount >= 3 ? guestDraft.guest3InformLater : false,
          guest3:
            guestCount >= 3 && !guestDraft.guest3InformLater && guestDraft.guest3Name.trim()
              ? {
                  name: guestDraft.guest3Name.trim(),
                  document: guestDraft.guest3Document.replace(/\D/g, ""),
                  phone: p3Payload,
                  email: guestDraft.guest3Email.trim(),
                }
              : null,
          guest3Name: guestCount >= 3 && !guestDraft.guest3InformLater ? guestDraft.guest3Name.trim() : "",
          guest3Document:
            guestCount >= 3 && !guestDraft.guest3InformLater ? guestDraft.guest3Document.replace(/\D/g, "") : "",
          guest3Phone: guestCount >= 3 && !guestDraft.guest3InformLater ? p3Payload : "",
          guest3Email: guestCount >= 3 && !guestDraft.guest3InformLater ? guestDraft.guest3Email.trim() : "",
          sourceMode: "agency",
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "Não foi possível salvar hóspedes",
          description: json.error || "Verifique os dados informados.",
          variant: "destructive",
        })
      } else {
        toast({
          title: `Hóspedes atualizados (Flat ${item.flatNumber})`,
          description: "Os dados foram salvos e as instruções atualizadas enviadas aos hóspedes.",
        })
        setGuestDraft(null)
        await fetchPortalData(locatorCode, true)
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" })
    } finally {
      setSavingGuests(false)
    }
  }

  // Modify dates handlers
  const handleRunPreview = async (
    checkin = modCheckinDate,
    checkout = modCheckoutDate,
    guests = modGuestCount,
    overrideCode?: string
  ) => {
    const targetCode = overrideCode || modTargetFlat?.code
    if (!targetCode || !checkin || !checkout) return
    if (checkout <= checkin) {
      setPreviewError("A data de check-out deve ser posterior à data de check-in.")
      setPreviewData(null)
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(targetCode)}/modify-preview${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: checkin,
          newCheckoutDate: checkout,
          newGuestCount: guests,
          reason: modReason,
          ...(isPackage ? { packageCode: locatorCode } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
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
      setPreviewError(err?.message || "Erro de conexão.")
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const openModifyModalForFlat = (item: any) => {
    setModTargetFlat(item)
    setModStep("preview")
    setModCheckinDate(String(item.checkinDate || ""))
    setModCheckoutDate(String(item.checkoutDate || ""))
    setModGuestCount(Math.max(1, Number(item.guestCount) || 1))
    setModReason("")
    setPreviewData(null)
    setPreviewError(null)
    setCheckoutData(null)
    setCheckoutError(null)
    setModPollingActive(false)
    setConfirmCancelHoldInline(false)
    setModifySuccessInfo(null)
    setModifyModalOpen(true)
    if (item.checkinDate && item.checkoutDate) {
      handleRunPreview(item.checkinDate, item.checkoutDate, Math.max(1, Number(item.guestCount) || 1), item.code)
    }
  }

  const handleProceedToCheckout = async () => {
    if (!modTargetFlat?.code || !previewData?.available) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(modTargetFlat.code)}/modify-checkout${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          paymentMethod: modPaymentMethod === "card" ? "credit_card" : "pix",
          reason: modReason,
          ...(isPackage ? { packageCode: locatorCode } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCheckoutError(json.message || json.error || "Erro ao gerar cobrança de alteração.")
      } else {
        setCheckoutData(json)
        setModStep("checkout")
        setModPollingActive(true)
      }
    } catch (err: any) {
      setCheckoutError(err?.message || "Erro de conexão.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleCancelHold = async () => {
    if (!modTargetFlat?.code || !checkoutData?.pendingId) return
    setCancellingHold(true)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(modTargetFlat.code)}/modify-cancel-pending${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingId: checkoutData.pendingId,
          ...(isPackage ? { packageCode: locatorCode } : {}),
        }),
      })
      if (res.ok) {
        setModPollingActive(false)
        setCheckoutData(null)
        setConfirmCancelHoldInline(false)
        setModifyModalOpen(false)
        await fetchPortalData(locatorCode, true)
      }
    } catch {} finally {
      setCancellingHold(false)
    }
  }

  const handleConfirmZeroCostModify = async () => {
    if (!modTargetFlat?.code) return
    setCheckoutLoading(true)
    setPreviewError(null)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(modTargetFlat.code)}/modify${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          reason: modReason,
          ...(isPackage ? { packageCode: locatorCode } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setModifySuccessInfo({
          message: json.message || "Datas da acomodação alteradas com sucesso!",
          newCheckinDate: json.newCheckinDate || modCheckinDate,
          newCheckoutDate: json.newCheckoutDate || modCheckoutDate,
          newFlatNumber: json.reservation?.flatNumber || modTargetFlat.flatNumber,
        })
        setModStep("success")
        await fetchPortalData(locatorCode, true)
      } else {
        setPreviewError(json.error || json.message || "Não foi possível confirmar a alteração.")
      }
    } catch (err: any) {
      setPreviewError(err?.message || "Erro de conexão.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Cancellation modal handlers (NO window.confirm)
  const openCancelDialog = async (mode: "single" | "whole", item?: any) => {
    setCancelDialogTarget({ mode, item })
    setCancelReason("")
    setCancelWholeConfirmChecked(false)
    setCancelQuote(null)
    const quoteCode = item?.code || activeItems[0]?.code || locatorCode
    if (!quoteCode) return
    setLoadingCancelQuote(true)
    try {
      const qs = buildAuthQueryString()
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(quoteCode)}/cancellation-quote${qs}`)
      if (res.ok) {
        const json = await res.json().catch(() => null)
        setCancelQuote(json)
      }
    } catch {} finally {
      setLoadingCancelQuote(false)
    }
  }

  const handleConfirmCancelDialog = async () => {
    if (!cancelDialogTarget) return
    const isWhole = cancelDialogTarget.mode === "whole"
    if (isWhole && isPackage && activeItems.length > 1 && !cancelWholeConfirmChecked) {
      toast({
        title: "Confirmação obrigatória",
        description: "Marque a caixa de ciência para confirmar o cancelamento do pacote inteiro.",
        variant: "destructive",
      })
      return
    }
    setCancellingReservation(true)
    try {
      const qs = buildAuthQueryString()
      const targetLocator = locatorCode || cancelDialogTarget.item?.code
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(targetLocator)}/cancel${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancelWholePackage: isWhole,
          ...(isPackage ? { packageCode: locatorCode } : {}),
          ...(!isWhole && cancelDialogTarget.item?.id ? { reservationId: cancelDialogTarget.item.id } : {}),
          reason:
            cancelReason.trim() ||
            (isWhole
              ? "Cancelamento integral solicitado pelo responsável no Portal do Solicitante"
              : `Cancelamento do Flat ${cancelDialogTarget.item?.flatNumber || ""} solicitado pelo responsável`),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "Não foi possível cancelar",
          description: json.error || "Tente novamente ou fale com a administração.",
          variant: "destructive",
        })
      } else {
        toast({
          title: isWhole ? "Pacote cancelado" : `Flat ${cancelDialogTarget.item?.flatNumber} cancelado`,
          description: json.message || "Cancelamento registrado com sucesso.",
        })
        setCancelDialogTarget(null)
        await fetchPortalData(locatorCode, true)
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" })
    } finally {
      setCancellingReservation(false)
    }
  }

  // Receipt Copy & Print
  const handleCopyUnifiedReceipt = () => {
    const lines = [
      `📄 RECIBO UNIFICADO • PORTAL DO SOLICITANTE • CORPFLATS`,
      `Localizador: ${locatorCode}`,
      `Solicitante / Responsável: ${requesterName}`,
      requester?.document ? `CPF / CNPJ: ${requester.document}` : "",
      requester?.companyName ? `Empresa: ${requester.companyName}` : "",
      `Unidades Ativas: ${activeItems.map((it) => `Flat ${it.flatNumber} (${it.code})`).join(", ")}`,
      "",
      `📋 DETALHAMENTO POR ACOMODAÇÃO:`,
      ...activeItems.map((it) => {
        const n = it.nights || (it.checkinDate && it.checkoutDate ? Math.max(1, differenceInDays(parseISO(it.checkoutDate), parseISO(it.checkinDate))) : 1)
        return `• Flat ${it.flatNumber} (${it.code}): ${formatDateBr(it.checkinDate)} a ${formatDateBr(it.checkoutDate)} (${n} diária${n > 1 ? "s" : ""}) • Hóspede: ${it.guestName || "A informar"} • R$ ${formatMoney(it.totalAmount)}`
      }),
      "",
      `💰 TOTAL DO PACOTE: R$ ${formatMoney(totalAmount)}`,
      `✅ TOTAL PAGO / LIQUIDADO: R$ ${formatMoney(paidAmount)}`,
      pendingAmount > 0.01 ? `⏳ SALDO PENDENTE: R$ ${formatMoney(pendingAmount)}` : `✓ QUITADO INTEGRALMENTE`,
      `CorpFlats Hospedagens Ltda • CNPJ 47.964.813/0001-65 • Campos dos Goytacazes - RJ`,
    ]
    handleCopyText(
      lines.filter(Boolean).join("\n"),
      "receipt_copy",
      "Recibo copiado!",
      "O demonstrativo unificado foi copiado para a área de transferência."
    )
    setCopiedReceipt(true)
    setTimeout(() => setCopiedReceipt(false), 2500)
  }

  const handlePrintUnifiedReceipt = () => {
    const emissionDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo Unificado - CorpFlats - ${locatorCode}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px; font-size: 13px; }
    .container { max-width: 740px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 28px 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F3D4C; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { font-size: 22px; font-weight: 900; color: #0F3D4C; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: #ecfdf5; color: #047857; border: 1px solid #10b981; font-weight: 800; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #475569; }
    .right { text-align: right; font-family: monospace; }
    .total-box { background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
    @media print { .no-print { display: none !important; } body { background: #fff; padding: 0; } .container { border: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="max-width:740px;margin:0 auto 12px;text-align:right;">
    <button onclick="window.print()" style="padding:8px 16px;background:#0F3D4C;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨️ Imprimir / PDF</button>
  </div>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">CorpFlats</div>
        <div style="font-size:11px;color:#64748b;">CorpFlats Hospedagens Ltda • CNPJ 47.964.813/0001-65<br/>Campos dos Goytacazes - RJ</div>
      </div>
      <div style="text-align:right;">
        <div class="badge">${isPaid ? "✓ PAGO & QUITADO" : "COMPROVANTE"}</div>
        <div style="font-family:monospace;font-weight:900;font-size:14px;margin-top:6px;">${locatorCode}</div>
        <div style="font-size:11px;color:#64748b;">Emissão: ${emissionDate}</div>
      </div>
    </div>
    <p><strong>Solicitante:</strong> ${requesterName}${requester?.companyName ? ` • ${requester.companyName}` : ""}${requester?.document ? ` • Doc: ${requester.document}` : ""}</p>
    <table>
      <thead>
        <tr>
          <th>Flat</th>
          <th>Período</th>
          <th>Hóspede Titular</th>
          <th class="right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${activeItems
          .map(
            (it) => `<tr>
          <td><strong>Flat ${it.flatNumber}</strong><br/><span style="font-size:11px;color:#64748b;">${it.code}</span></td>
          <td>${formatDateBr(it.checkinDate)} a ${formatDateBr(it.checkoutDate)}</td>
          <td>${it.guestName || "A informar"}</td>
          <td class="right">R$ ${formatMoney(it.totalAmount)}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div class="total-box">
      <div>
        <div style="font-size:11px;font-weight:800;color:#065f46;text-transform:uppercase;">Total Liquidado</div>
        <div style="font-size:12px;color:#047857;">Total contratado: R$ ${formatMoney(totalAmount)}</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:#047857;font-family:monospace;">R$ ${formatMoney(paidAmount)}</div>
    </div>
  </div>
</body>
</html>`
    const w = window.open("", "_blank", "width=850,height=900")
    if (w) {
      w.document.open()
      w.document.write(html)
      w.document.close()
    }
  }

  if (loading) {
    return <CorpFlatsSplashScreen label="Carregando Portal do Solicitante..." />
  }

  if (!data || error) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans pb-16">
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-8 py-3 shadow-2xs">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div onClick={() => setLocation("/reservar")} className="flex items-center gap-2.5 cursor-pointer">
              <CorpFlatsIcon className="w-8 h-8" />
              <CorpFlatsWordmark className="text-base text-[#0F3D4C]" />
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
          </div>
        </nav>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#0F3D4C]/10 text-[#0F3D4C] border border-[#C5A059]/40 flex items-center justify-center mx-auto">
                {accessRestricted ? <ShieldAlert className="w-7 h-7 text-amber-600" /> : <KeyRound className="w-7 h-7" />}
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#0F3D4C] block">
                Portal do Solicitante • Gestor de Viagem
              </span>
              <h1 className="text-xl font-black text-slate-900">
                {accessRestricted ? "Acesso Restrito ao Solicitante" : "Localizar Pacote ou Reserva"}
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                {accessRestricted
                  ? "Este painel financeiro e gerencial é exclusivo do solicitante da reserva mediante link autenticado."
                  : "Informe o código localizador do pacote (ex: PKG-...) para gerenciar pagamentos, hóspedes e veículos."}
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const q = searchQuery.trim()
                if (!q) return
                setLocation(`/solicitante/${encodeURIComponent(q)}${urlToken ? `?t=${encodeURIComponent(urlToken)}` : ""}`)
                fetchPortalData(q)
              }}
              className="space-y-3"
            >
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Ex: PKG-1234 ou RES-512-0001"
                className="h-11 rounded-xl font-mono text-sm uppercase"
              />
              <Button
                type="submit"
                disabled={!searchQuery.trim()}
                className="w-full h-11 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Abrir Portal do Solicitante</span>
              </Button>
            </form>

            {code && !code.toUpperCase().startsWith("PKG-") && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation(`/minha-reserva/${encodeURIComponent(code)}`)}
                className="w-full rounded-xl text-xs font-bold"
              >
                Ir para Área do Hóspede ({code})
              </Button>
            )}
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans pb-20 w-full max-w-full overflow-x-hidden">
      {/* ── Top Navbar ── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-8 py-2.5 sm:py-3 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CorpFlatsIcon className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CorpFlatsWordmark className="text-sm sm:text-base text-[#0F3D4C] leading-none" />
                <Badge className="bg-[#0F3D4C] text-[#E5C98B] border border-[#C5A059]/40 text-[10px] font-bold px-2 py-0.5">
                  Gestor de Viagem
                </Badge>
                {isAllCancelled ? (
                  <Badge className="bg-rose-600 text-white text-[10px] font-bold">✕ Cancelado</Badge>
                ) : isAllExpired ? (
                  <Badge className="bg-amber-600 text-white text-[10px] font-bold">⏳ Expirado</Badge>
                ) : isPaid ? (
                  <Badge className="bg-emerald-600 text-white text-[10px] font-bold">✓ Quitado</Badge>
                ) : isFaturadoBoleto ? (
                  <Badge className="bg-indigo-600 text-white text-[10px] font-bold">🏦 Faturado</Badge>
                ) : (
                  <Badge className="bg-amber-600 text-white text-[10px] font-bold">⏳ Pagamento Pendente</Badge>
                )}
              </div>
              <span className="text-[11px] text-slate-500 font-mono block truncate mt-0.5">
                Localizador: <strong className="text-slate-800">{locatorCode}</strong>
              </span>
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs shrink-0"
          >
            <WhatsAppIcon className="w-4 h-4 shrink-0" />
            <span>WhatsApp</span>
          </a>
        </div>
      </nav>

      <main className="max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* ── 1. Cabeçalho Exclusivo do Solicitante ── */}
        <Card className="bg-gradient-to-br from-[#091E26] via-[#0F3D4C] to-[#091E26] text-white border border-[#C5A059]/45 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#E5C98B] bg-[#C5A059]/15 border border-[#C5A059]/35 px-3 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                Portal do Solicitante • Gestor de Viagem
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Olá, {requesterName}!
              </h1>
              <p className="text-xs sm:text-sm text-slate-200/90">
                {requester?.companyName ? (
                  <>
                    Empresa / Agência: <strong className="text-white">{requester.companyName}</strong> •{" "}
                  </>
                ) : null}
                Gerencie em um só lugar pagamentos, notas fiscais, dados dos hóspedes, veículos e links individuais sem valores.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="px-3.5 py-2 rounded-2xl bg-white/10 border border-white/15 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-[#E5C98B] block font-bold">
                  Localizador
                </span>
                <span className="font-mono font-black text-sm text-white">{locatorCode}</span>
              </div>
              <div className="px-3.5 py-2 rounded-2xl bg-white/10 border border-white/15 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-[#E5C98B] block font-bold">
                  Flats Ativos
                </span>
                <span className="font-black text-sm text-white">
                  {activeItems.length} {activeItems.length === 1 ? "Flat" : "Flats"}
                  {items.length > activeItems.length ? ` (de ${items.length})` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Cronômetro de Pré-Reserva se pendente */}
          {hasUnpaidPreReservation && holdExpiresAt && (
            <div className="p-4 rounded-2xl bg-amber-50/95 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <span className="font-black block text-sm">
                    ⏳ Pré-reserva garantida até {formatDateTimeBr(holdExpiresAt)}
                  </span>
                  <span className="text-amber-900 block">
                    Conclua o pagamento dentro do prazo abaixo para confirmar os apartamentos e liberar os links de check-in dos hóspedes.
                  </span>
                </div>
              </div>
              <HoldCountdownBadge expiresAt={holdExpiresAt} onExpire={() => fetchPortalData(locatorCode, true)} />
            </div>
          )}

          {isAllExpired && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <strong className="font-black block text-sm">⏳ Pré-Reserva Expirada</strong>
                <span>O prazo de pagamento encerrou. Fale com nossa equipe no WhatsApp para verificar disponibilidade e reativar.</span>
              </div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Reativar no WhatsApp</span>
              </a>
            </div>
          )}

          {isAllCancelled && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <strong className="font-black block text-sm">✕ Reservas Canceladas</strong>
              <span>Todas as acomodações deste localizador foram canceladas e as cobranças suspensas.</span>
            </div>
          )}

          {/* Atalho direto para o Painel Completo do Solicitante (Todas as Reservas + Aba Financeiro) */}
          {data?.financialHubUrl && (
            <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/90">
                <span className="font-bold text-[#E5C98B] block">Central do Solicitante • Boletos, Notas e Histórico</span>
                <span className="text-[11px] text-white/75">
                  Consulte todas as suas reservas, boletos (Pago, Pendente, Em Atraso) e NFS-e em um só lugar.
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setLocation(data.financialHubUrl)}
                className="bg-white hover:bg-slate-100 text-[#091E26] font-black text-xs rounded-xl h-9 px-4 gap-1.5 shadow-md shrink-0"
              >
                <Receipt className="w-3.5 h-3.5 text-[#0F3D4C]" />
                <span>Ver Todas as Reservas &amp; Financeiro</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Atalho direto caso o próprio solicitante seja Hóspede 1 em algum flat */}
          {myGuestFlats.length > 0 && (
            <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#E5C98B] font-medium">
                Você também está hospedado como titular nesta viagem:
              </span>
              <div className="flex flex-wrap gap-2">
                {myGuestFlats.map((it) => (
                  <Button
                    key={it.code}
                    type="button"
                    onClick={() => setLocation(`/minha-reserva/${encodeURIComponent(it.code)}`)}
                    className="bg-[#C5A059] hover:bg-[#b58e45] text-[#091E26] font-black text-xs rounded-xl h-9 px-4 gap-1.5 shadow-md"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Acessar minha hospedagem (Flat {it.flatNumber})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ── 2. Card Financeiro Unificado (Exclusivo do Solicitante) ── */}
        {!isAllCancelled && !isAllExpired && (
          <Card className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-5 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Financeiro Unificado • Pagamento, Recibo & NFS-e
                  </h2>
                  <span className="text-xs text-slate-500">
                    Visível exclusivamente para o Solicitante (nunca exibido nos portais individuais dos hóspedes)
                  </span>
                </div>
              </div>

              <Badge
                className={
                  isPaid
                    ? "bg-emerald-600 text-white font-bold text-xs px-3 py-1"
                    : isFaturadoBoleto
                      ? "bg-indigo-600 text-white font-bold text-xs px-3 py-1"
                      : "bg-amber-600 text-white font-bold text-xs px-3 py-1"
                }
              >
                {isPaid
                  ? "✓ Pago Integralmente"
                  : isFaturadoBoleto
                    ? "🏦 Faturado Corporativo"
                    : `⏳ Pendente PIX: R$ ${formatMoney(pendingAmount)}`}
              </Badge>
            </div>

            {/* Resumo de valores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Valor Total {isPackage ? "do Pacote" : "da Reserva"} (PIX -5%)
                </span>
                <span className="text-lg font-black text-slate-900 font-mono block mt-0.5">
                  R$ {formatMoney(totalAmount)}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800 block">Valor Pago</span>
                <span className="text-lg font-black text-emerald-700 font-mono block mt-0.5">
                  R$ {formatMoney(paidAmount)}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  {pendingAmount > 0.01 ? "Saldo Pendente (Cartão)" : "Saldo Restante"}
                </span>
                <span className="text-lg font-black text-slate-900 font-mono block mt-0.5">
                  {pendingAmount > 0.01
                    ? `R$ ${formatMoney(pendingAmount)} (Cartão R$ ${formatMoney(cardPendingAmount)})`
                    : "R$ 0,00"}
                </span>
              </div>
            </div>

            {paymentSuccessNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-sm">Pagamento Confirmado!</strong>
                  <span>A compensação foi identificada e todas as acomodações ativas estão confirmadas.</span>
                </div>
              </div>
            )}

            {/* Status Faturado */}
            {!isPaid && isFaturadoBoleto && (
              <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 space-y-1">
                <div className="font-bold text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-700" />
                  <span>Reserva Confirmada • Faturamento Corporativo (Boleto a Prazo)</span>
                </div>
                <p className="text-indigo-800 leading-relaxed">
                  Valor total programado para faturamento: <strong>R$ {formatMoney(totalAmount)}</strong> conforme condições comerciais acordadas. Os hóspedes já estão confirmados e liberados.
                </p>
              </div>
            )}

            {/* Painel de Pagamento Pendente (PIX + Cartão) */}
            {!isPaid && !isFaturadoBoleto && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={changingMethod}
                    onClick={() => handleChangePaymentMethod("pix")}
                    className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                      paymentMethodTab === "pix"
                        ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/25"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                        paymentMethodTab === "pix" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm block text-slate-900">
                        PIX Instantâneo (-5%)
                      </span>
                      <span className="text-[11px] text-slate-600 font-mono">
                        R$ {formatMoney(pendingAmount)} • Baixa Automática
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={changingMethod}
                    onClick={() => handleChangePaymentMethod("card")}
                    className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                      paymentMethodTab === "card"
                        ? "border-sky-600 bg-sky-50/70 ring-2 ring-sky-500/25"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                        paymentMethodTab === "card" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm block text-slate-900">
                        Cartão de Crédito (Mercado Pago)
                      </span>
                      <span className="text-[11px] text-slate-600 font-mono">
                        R$ {formatMoney(cardPendingAmount)} • Parcelamento
                      </span>
                    </div>
                  </button>
                </div>

                {paymentMethodTab === "pix" && (
                  <div className="p-4 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
                    {summary?.pixCopiaECola ? (
                      <>
                        <div className="inline-block p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                              summary.pixCopiaECola
                            )}`}
                            alt="QR Code PIX Banco Inter"
                            className="w-44 h-44 mx-auto"
                          />
                        </div>
                        <div className="max-w-xl mx-auto space-y-2">
                          <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-left">
                            <span className="font-mono text-[11px] text-slate-600 truncate flex-1 min-w-[160px] px-1 select-all">
                              {summary.pixCopiaECola}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleCopyPix}
                              className={`h-8 px-3 rounded-lg text-xs font-bold gap-1.5 ${
                                copiedPix ? "bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                              }`}
                            >
                              {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedPix ? "Copiado!" : "Copiar Código PIX"}</span>
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <a
                              href={`/copiar-pix/${encodeURIComponent(locatorCode)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Abrir Página PIX (/copiar-pix/{locatorCode})</span>
                            </a>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleCheckPaymentStatus}
                              disabled={checkingPayment}
                              className="h-9 px-4 rounded-xl text-xs font-bold border-slate-300 gap-1.5"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? "animate-spin text-sky-600" : ""}`} />
                              <span>{checkingPayment ? "Consultando..." : "Já fiz o PIX • Verificar"}</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="p-4 text-xs text-slate-600">
                        Gerando cobrança PIX unificada...{" "}
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => handleChangePaymentMethod("pix")}
                          className="text-xs font-bold p-0 h-auto"
                        >
                          Gerar agora
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethodTab === "card" && (
                  <div className="p-4 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <div className="text-xs text-slate-600">
                      Valor no Cartão de Crédito:{" "}
                      <strong className="text-slate-900 font-mono text-sm">
                        R$ {formatMoney(cardPendingAmount)}
                      </strong>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {summary?.mpInitPoint ? (
                        <a
                          href={summary.mpInitPoint}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Pagar no Cartão (Mercado Pago)</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => handleChangePaymentMethod("card")}
                          disabled={changingMethod}
                          className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs gap-2"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>{changingMethod ? "Gerando link..." : "Gerar Link Mercado Pago"}</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCheckPaymentStatus}
                        disabled={checkingPayment}
                        className="rounded-xl text-xs font-bold gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? "animate-spin" : ""}`} />
                        <span>Verificar Pagamento</span>
                      </Button>
                    </div>
                  </div>
                )}

                {paymentPendingFeedback && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Pagamento ainda não compensado pelo banco. Se acabou de pagar, aguarde alguns segundos e clique em verificar novamente.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Boletos Faturados, Pré-Boletos & NFS-e Emitidas */}
            <FinancialDocumentsSection
              boletos={Array.isArray(data?.boletos) ? data.boletos : []}
              preBoletos={Array.isArray(data?.preBoletos) ? data.preBoletos : []}
              nfseInvoices={Array.isArray(data?.nfseInvoices) ? data.nfseInvoices : []}
              title="Boletos & Notas Fiscais (NFS-e) desta Contratação"
            />

            {/* Ações Pós-Confirmação: Recibo Unificado & NFS-e Consolidada */}
            {(isPaid || paidAmount > 0 || isFaturadoBoleto) && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    onClick={() => setReceiptModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-10 px-4 gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver / Baixar Recibo Unificado</span>
                  </Button>

                  {summary?.consolidatedNfseNumber && summary?.consolidatedInvoiceId ? (
                    <a
                      href={`/api/nfse/danfse/${encodeURIComponent(summary.consolidatedInvoiceId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 h-10 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar NFS-e Consolidada Nº {summary.consolidatedNfseNumber}</span>
                    </a>
                  ) : !hasUnpaidPreReservation ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setNfseDoc(String(requester?.document || summary?.requesterDocument || ""))
                        setNfseName(String(requester?.companyName || requesterName || ""))
                        setNfseEmail(String(requester?.email || summary?.requesterEmail || ""))
                        setNfseMessage(null)
                        setNfseOpen((prev) => !prev)
                      }}
                      className="border-emerald-300 text-emerald-900 hover:bg-emerald-50 font-bold text-xs rounded-xl h-10 px-4 gap-2"
                    >
                      <Receipt className="w-4 h-4 text-emerald-700" />
                      <span>Emitir NFS-e Consolidada (CPF ou CNPJ)</span>
                    </Button>
                  ) : null}
                </div>

                {nfseMessage && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800">
                    {nfseMessage}
                  </div>
                )}

                {nfseOpen && (
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                    <div className="text-xs font-bold text-emerald-950">
                      Emitir 1 NFS-e Consolidada (CPF 11 dígitos ou CNPJ 14 dígitos) para todas as diárias ativas:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <Input
                        value={nfseDoc}
                        onChange={(e) => {
                          setNfseDoc(e.target.value)
                          setNfseMessage(null)
                        }}
                        placeholder="CPF (11 díg.) ou CNPJ (14 díg.)"
                        className="bg-white text-xs h-9 font-mono"
                      />
                      <Input
                        value={nfseName}
                        onChange={(e) => setNfseName(e.target.value)}
                        placeholder="Nome Completo ou Razão Social"
                        className="bg-white text-xs h-9"
                      />
                      <Input
                        value={nfseEmail}
                        onChange={(e) => {
                          setNfseEmail(e.target.value)
                          setNfseMessage(null)
                        }}
                        placeholder="E-mail(s) para envio (separe com ;)"
                        className="bg-white text-xs h-9"
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={emittingNfse}
                      onClick={handleEmitConsolidatedNfse}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 rounded-xl gap-1.5"
                    >
                      {emittingNfse && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{emittingNfse ? "Emitindo NFS-e..." : "Confirmar e Emitir NFS-e Consolidada"}</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── 3. Lista Completa de Flats & Hóspedes ── */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0F3D4C]" />
                <span>Acomodações & Hóspedes ({items.length})</span>
              </h2>
              <p className="text-xs text-slate-500">
                Preencha hóspedes, cadastre veículos e copie os links sem valores para enviar diretamente a cada ocupante.
              </p>
            </div>

            {isPackage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setLocation(`/credenciamento/${encodeURIComponent(locatorCode)}`)}
                  className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs rounded-xl h-9 px-4 gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-[#E5C98B]" />
                  <span>Credenciamento em Lote</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    handleCopyText(
                      normalizeRelativeOrFullUrl(`/credenciamento/${encodeURIComponent(locatorCode)}`),
                      "batch_cred",
                      "Link de credenciamento em lote copiado!"
                    )
                  }
                  className="rounded-xl h-9 px-3 text-xs font-bold gap-1.5"
                >
                  {copiedId === "batch_cred" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === "batch_cred" ? "Copiado!" : "Copiar Link Lote"}</span>
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {items.map((it, idx) => {
              const opBadge = getOperationalBadgeMeta(it)
              const guests = getNormalizedFlatGuests(it)
              const missingFields = getMissingFieldsList(it)
              const isInactive =
                Boolean(it.isCancelled || it.isExpired) ||
                ["cancelada", "cancelled", "expirada"].includes(String(it.status || "").toLowerCase())
              const isBreakfastLinkAllowed = Boolean(
                it.includeBreakfast &&
                  !isInactive &&
                  String(it.status || "").toLowerCase() === "confirmada"
              )
              const guestPortalUrlFull = normalizeRelativeOrFullUrl(
                it.guestPortalUrl || `/minha-reserva/${encodeURIComponent(it.code)}`
              )
              const preCheckinUrlFull = normalizeRelativeOrFullUrl(
                it.preCheckinUrl || `/pre-checkin/${encodeURIComponent(it.code)}`
              )
              const breakfastUrlFull = normalizeRelativeOrFullUrl(
                it.breakfastUrl || `/cafe/${encodeURIComponent(it.code)}`
              )
              const nightsCount =
                Number(it.nights) ||
                (it.checkinDate && it.checkoutDate
                  ? Math.max(1, differenceInDays(parseISO(it.checkoutDate), parseISO(it.checkinDate)))
                  : 1)

              return (
                <Card
                  key={it.id || it.code || idx}
                  className={`rounded-3xl border p-5 sm:p-6 space-y-4 shadow-sm ${
                    isInactive ? "bg-slate-100/70 border-slate-200 opacity-80" : "bg-white border-slate-200/90"
                  }`}
                >
                  {/* Cabeçalho do Flat */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base sm:text-lg font-black text-slate-900">
                          Flat {it.flatNumber}
                        </span>
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {it.code}
                        </span>
                        <Badge variant="outline" className={`text-[11px] font-bold ${opBadge.className}`}>
                          {opBadge.label}
                        </Badge>
                        {it.requesterIsGuest1 && !isInactive && (
                          <Badge className="bg-[#0F3D4C]/10 text-[#0F3D4C] border border-[#0F3D4C]/25 text-[10px] font-bold">
                            Sua Hospedagem
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <strong>{formatDateBr(it.checkinDate)}</strong> ({it.checkinTime || "14:00"}) até{" "}
                          <strong>{formatDateBr(it.checkoutDate)}</strong> ({it.checkoutTime || "12:00"}) •{" "}
                          {nightsCount} {nightsCount === 1 ? "diária" : "diárias"}
                        </span>
                        <span>•</span>
                        <span>{it.guestCount || 1} {(it.guestCount || 1) === 1 ? "hóspede" : "hóspedes"}</span>
                        <span>•</span>
                        <span>{it.includeBreakfast ? "☕ Café Incluso" : "Sem Café"}</span>
                        <span>•</span>
                        <span>{it.twinBeds ? "2 Camas Solteiro" : "Cama Casal"}</span>
                        {it.extraMattress && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-indigo-700">+ Colchão Extra</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor do Flat</span>
                      <span className="font-mono text-base font-black text-slate-900">
                        R$ {formatMoney(it.totalAmount)}
                      </span>
                      {Number(it.paidAmount) > 0 && Number(it.paidAmount) < Number(it.totalAmount) - 0.01 && (
                        <span className="block text-[11px] text-emerald-700 font-semibold">
                          Pago: R$ {formatMoney(it.paidAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Alertas de Dados Faltantes ou WhatsApp Inválido */}
                  {!isInactive && (it.guestPhoneInvalid || missingFields.length > 0) && (
                    <div className="space-y-2">
                      {it.guestPhoneInvalid && (
                        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-bold block">WhatsApp inválido / sem conta ativa</strong>
                              <span>Atualize o número do hóspede para enviarmos as instruções de check-in e acesso.</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openGuestModal(it)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl h-8 shrink-0"
                          >
                            Corrigir WhatsApp
                          </Button>
                        </div>
                      )}

                      {missingFields.length > 0 && (
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-bold block">Dados pendentes para o check-in</strong>
                              <span>Pendências: {missingFields.join(", ")}.</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openGuestModal(it)}
                            className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-xl h-8 shrink-0"
                          >
                            Preencher Agora
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hóspedes 1 / 2 / 3 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {guests.map((g) => (
                      <div
                        key={g.index}
                        className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                            Hóspede {g.index}
                          </span>
                          {g.hasCompletedCheckin ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                              ✓ Pré-Check-in
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                              {g.informLater ? "Informar depois" : "Pendente"}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 truncate">
                          {g.name || <span className="text-amber-700 italic">A informar</span>}
                        </div>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 truncate">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{g.phone ? formatPhoneDisplay(g.phone) : "WhatsApp pendente"}</span>
                        </div>
                        {g.document && (
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            Doc: {g.document}
                          </div>
                        )}
                        {g.email && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{g.email}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Veículo do Flat */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-sky-700 shrink-0" />
                      {it.vehicle?.plate ? (
                        <span>
                          <strong>Veículo:</strong>{" "}
                          <span className="font-mono font-bold text-slate-900">{it.vehicle.plate}</span>
                          {[it.vehicle.brand, it.vehicle.model, it.vehicle.color].filter(Boolean).length > 0
                            ? ` • ${[it.vehicle.brand, it.vehicle.model, it.vehicle.color].filter(Boolean).join(" ")}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-slate-500">Nenhum veículo cadastrado para este flat</span>
                      )}
                    </div>
                    {!isInactive && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openVehicleModal(it)}
                          className="h-8 rounded-xl text-xs font-bold gap-1.5 bg-white"
                        >
                          <Car className="w-3.5 h-3.5 text-sky-600" />
                          <span>{it.vehicle?.plate ? "Editar Veículo" : "Cadastrar Veículo"}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openGuestModal(it)}
                          className="h-8 rounded-xl text-xs font-bold gap-1.5 bg-white"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-[#0F3D4C]" />
                          <span>Preencher / Editar Hóspedes</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Links Rápidos s/ Valores para Copiar e Enviar ao Hóspede */}
                  {!isInactive && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 mr-1">
                        Links para o Hóspede (sem valores):
                      </span>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCopyText(
                            guestPortalUrlFull,
                            `guest_${it.code}`,
                            `Link Área do Hóspede copiado (Flat ${it.flatNumber})`,
                            "Este link não exibe valores financeiros para o hóspede."
                          )
                        }
                        className="h-8 rounded-xl text-[11px] font-bold gap-1.5 bg-white"
                      >
                        {copiedId === `guest_${it.code}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{copiedId === `guest_${it.code}` ? "Copiado!" : "Área do Hóspede"}</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCopyText(
                            preCheckinUrlFull,
                            `pre_${it.code}`,
                            `Link Pré-Check-in copiado (Flat ${it.flatNumber})`
                          )
                        }
                        className="h-8 rounded-xl text-[11px] font-bold gap-1.5 bg-white"
                      >
                        {copiedId === `pre_${it.code}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        <span>{copiedId === `pre_${it.code}` ? "Copiado!" : "Pré-Check-in"}</span>
                      </Button>

                      {isBreakfastLinkAllowed && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleCopyText(
                              breakfastUrlFull,
                              `cafe_${it.code}`,
                              `Link do Café da Manhã copiado (Flat ${it.flatNumber})`
                            )
                          }
                          className="h-8 rounded-xl text-[11px] font-bold gap-1.5 bg-white border-amber-200 text-amber-900 hover:bg-amber-50"
                        >
                          {copiedId === `cafe_${it.code}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Coffee className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          <span>{copiedId === `cafe_${it.code}` ? "Copiado!" : "Café"}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>

        {/* ── 4. Seção Discreta / Recolhida por Padrão: Alterações & Cancelamento ── */}
        {activeItems.length > 0 && (
          <Accordion
            type="single"
            collapsible
            className="bg-white rounded-3xl border border-slate-200/90 shadow-sm px-5 sm:px-7"
          >
            <AccordionItem value="manage-stays" className="border-b-0">
              <AccordionTrigger className="py-5 text-sm font-black text-slate-800 hover:no-underline">
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-500" />
                  <span>⚙️ Alterar Datas ou Cancelar Acomodação</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-6">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Altere as datas de um apartamento específico (sujeito à disponibilidade e recálculo tarifário) ou cancele uma acomodação individual ou todo o pacote.
                </p>

                <div className="space-y-2.5">
                  {activeItems.map((it) => (
                    <div
                      key={it.code}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 font-bold text-sm">
                          Flat {it.flatNumber} ({it.code})
                        </strong>
                        <div className="text-slate-600">
                          {formatDateBr(it.checkinDate)} a {formatDateBr(it.checkoutDate)} • {it.guestName || "Hóspede a definir"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openModifyModalForFlat(it)}
                          className="h-9 px-3 rounded-xl border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-900 font-bold text-xs gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5 text-sky-700" />
                          <span>Alterar Datas</span>
                        </Button>
                        {activeItems.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openCancelDialog("single", it)}
                            className="h-9 px-3 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs gap-1.5"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancelar Flat {it.flatNumber}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    <strong className="block text-rose-800">
                      {isPackage && activeItems.length > 1
                        ? "Cancelamento Integral do Pacote"
                        : "Cancelar Reserva"}
                    </strong>
                    <span>
                      {isPackage && activeItems.length > 1
                        ? `Cancela todos os ${activeItems.length} flats ativos do pacote ${locatorCode} de uma só vez.`
                        : "Cancela a reserva ativa conforme a política de cancelamento."}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() =>
                      openCancelDialog(
                        isPackage && activeItems.length > 1 ? "whole" : "single",
                        activeItems[0]
                      )
                    }
                    className="rounded-xl font-bold text-xs h-10 px-4 gap-1.5 shrink-0"
                  >
                    <Ban className="w-4 h-4" />
                    <span>
                      {isPackage && activeItems.length > 1
                        ? "Cancelar Pacote Inteiro"
                        : "Cancelar Acomodação"}
                    </span>
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="text-center pt-2 pb-4 text-[11px] text-slate-400">
          CorpFlats Hospedagem • Edifício Soho Residence Service • Centro, Campos dos Goytacazes - RJ
        </div>
      </main>

      {/* ── Modal: Veículo por Flat ── */}
      <Dialog open={Boolean(vehicleModalItem)} onOpenChange={(open) => !open && setVehicleModalItem(null)}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Car className="w-5 h-5 text-sky-600" />
              <span>Veículo • Flat {vehicleModalItem?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe os dados do veículo para liberação automática na garagem do Edifício Soho.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveVehicle} className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Placa do Veículo *</Label>
              <Input
                value={vehPlate}
                onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                required
                className="font-mono uppercase h-10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Marca</Label>
                <Input
                  value={vehBrand}
                  onChange={(e) => setVehBrand(e.target.value)}
                  placeholder="Ex: Toyota"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Modelo</Label>
                <Input
                  value={vehModel}
                  onChange={(e) => setVehModel(e.target.value)}
                  placeholder="Ex: Corolla"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">Cor</Label>
              <Input
                value={vehColor}
                onChange={(e) => setVehColor(e.target.value)}
                placeholder="Ex: Prata"
                className="h-10 rounded-xl"
              />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setVehicleModalItem(null)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingVehicle}
                className="rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold gap-1.5"
              >
                {savingVehicle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{savingVehicle ? "Salvando..." : "Salvar Veículo"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Hóspedes 1, 2 & 3 por Flat ── */}
      <Dialog open={Boolean(guestDraft)} onOpenChange={(open) => !open && setGuestDraft(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0F3D4C]" />
              <span>
                Hóspedes do Flat {guestDraft?.item?.flatNumber} ({guestDraft?.item?.code})
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preencha ou atualize os ocupantes (Hóspede 1{guestDraft && guestDraft.guestCount >= 2 ? ", 2" : ""}{guestDraft && guestDraft.guestCount >= 3 ? " e 3" : ""}). Os links enviados a eles não exibem valores.
            </DialogDescription>
          </DialogHeader>

          {guestDraft && (
            <form onSubmit={handleSaveGuestDraft} className="space-y-4 pt-1">
              {(!guestDraft.item?.packageIndex || Number(guestDraft.item?.packageIndex) === 1) && (
                <label className="flex items-center justify-between gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5 cursor-pointer text-xs">
                  <span className="flex items-center gap-2 font-bold text-teal-900">
                    <input
                      type="checkbox"
                      checked={guestDraft.requesterIsGuest1}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setGuestDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                requesterIsGuest1: checked,
                                ...(checked && requesterName && !prev.guestName
                                  ? {
                                      guestName: requesterName,
                                      guestPhone: requester?.phone ? formatSmartPhone(requester.phone) : prev.guestPhone,
                                      guestEmail: requester?.email || prev.guestEmail,
                                    }
                                  : {}),
                              }
                            : prev
                        )
                      }}
                      className="w-4 h-4 accent-teal-600"
                    />
                    <span>O próprio Solicitante ficará neste flat como Hóspede 1</span>
                  </span>
                </label>
              )}

              {/* Hóspede 1 */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-black text-slate-800 uppercase tracking-wider">Hóspede 1 (Titular)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome Completo *</Label>
                    <Input
                      value={guestDraft.guestName}
                      onChange={(e) => setGuestDraft((p) => (p ? { ...p, guestName: e.target.value } : p))}
                      placeholder="Nome e sobrenome"
                      required
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">WhatsApp (com DDD) *</Label>
                      {guestDraft.guest1WaStatus === "checking" && (
                        <span className="text-[10px] text-sky-600">Verificando...</span>
                      )}
                      {guestDraft.guest1WaStatus === "valid" && (
                        <span className="text-[10px] font-bold text-emerald-600">✓ Ativo</span>
                      )}
                      {guestDraft.guest1WaStatus === "invalid" && (
                        <span className="text-[10px] font-bold text-rose-600">✕ Sem WhatsApp</span>
                      )}
                    </div>
                    <Input
                      type="tel"
                      value={guestDraft.guestPhone}
                      onChange={(e) =>
                        setGuestDraft((p) =>
                          p ? { ...p, guestPhone: formatSmartPhone(e.target.value), guest1WaStatus: "idle" } : p
                        )
                      }
                      onBlur={() => {
                        if (guestDraft.guestPhone.replace(/\D/g, "").length >= 8) {
                          checkWhatsAppForGuest(1, guestDraft.guestPhone)
                        }
                      }}
                      placeholder="(22) 99999-9999"
                      required
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CPF ou Passaporte (Opcional)</Label>
                    <Input
                      value={guestDraft.guestDocument}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (/[a-zA-Z]/.test(raw)) {
                          setGuestDraft((p) =>
                            p ? { ...p, docType: "passport", guestDocument: formatPassport(raw) } : p
                          )
                        } else {
                          setGuestDraft((p) =>
                            p ? { ...p, docType: "cpf", guestDocument: formatCpfMask(raw) } : p
                          )
                        }
                      }}
                      placeholder="000.000.000-00"
                      className="bg-white h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">E-mail (Opcional)</Label>
                    <Input
                      type="email"
                      value={guestDraft.guestEmail}
                      onChange={(e) => setGuestDraft((p) => (p ? { ...p, guestEmail: e.target.value } : p))}
                      placeholder="hospede@empresa.com.br"
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Hóspede 2 */}
              {guestDraft.guestCount >= 2 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Hóspede 2</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGuestDraft((p) => (p ? { ...p, guest2InformLater: !p.guest2InformLater } : p))
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        guestDraft.guest2InformLater
                          ? "bg-amber-100 border-amber-300 text-amber-900"
                          : "bg-white border-slate-300 text-slate-700"
                      }`}
                    >
                      {guestDraft.guest2InformLater ? "⏳ Informar Hóspede 2 depois" : "Informar depois"}
                    </button>
                  </div>
                  {!guestDraft.guest2InformLater && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Completo *</Label>
                        <Input
                          value={guestDraft.guest2Name}
                          onChange={(e) => setGuestDraft((p) => (p ? { ...p, guest2Name: e.target.value } : p))}
                          placeholder="Nome e sobrenome"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">WhatsApp (com DDD) *</Label>
                          {guestDraft.guest2WaStatus === "checking" && (
                            <span className="text-[10px] text-sky-600">Verificando...</span>
                          )}
                          {guestDraft.guest2WaStatus === "valid" && (
                            <span className="text-[10px] font-bold text-emerald-600">✓ Ativo</span>
                          )}
                          {guestDraft.guest2WaStatus === "invalid" && (
                            <span className="text-[10px] font-bold text-rose-600">✕ Sem WhatsApp</span>
                          )}
                        </div>
                        <Input
                          type="tel"
                          value={guestDraft.guest2Phone}
                          onChange={(e) =>
                            setGuestDraft((p) =>
                              p ? { ...p, guest2Phone: formatSmartPhone(e.target.value), guest2WaStatus: "idle" } : p
                            )
                          }
                          onBlur={() => {
                            if (guestDraft.guest2Phone.replace(/\D/g, "").length >= 8) {
                              checkWhatsAppForGuest(2, guestDraft.guest2Phone)
                            }
                          }}
                          placeholder="(22) 99999-9999"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CPF (Opcional)</Label>
                        <Input
                          value={guestDraft.guest2Document}
                          onChange={(e) =>
                            setGuestDraft((p) => (p ? { ...p, guest2Document: formatCpfMask(e.target.value) } : p))
                          }
                          placeholder="000.000.000-00"
                          className="bg-white h-9 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">E-mail (Opcional)</Label>
                        <Input
                          type="email"
                          value={guestDraft.guest2Email}
                          onChange={(e) => setGuestDraft((p) => (p ? { ...p, guest2Email: e.target.value } : p))}
                          placeholder="hospede2@empresa.com.br"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Hóspede 3 */}
              {guestDraft.guestCount >= 3 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Hóspede 3</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGuestDraft((p) => (p ? { ...p, guest3InformLater: !p.guest3InformLater } : p))
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        guestDraft.guest3InformLater
                          ? "bg-amber-100 border-amber-300 text-amber-900"
                          : "bg-white border-slate-300 text-slate-700"
                      }`}
                    >
                      {guestDraft.guest3InformLater ? "⏳ Informar Hóspede 3 depois" : "Informar depois"}
                    </button>
                  </div>
                  {!guestDraft.guest3InformLater && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Completo *</Label>
                        <Input
                          value={guestDraft.guest3Name}
                          onChange={(e) => setGuestDraft((p) => (p ? { ...p, guest3Name: e.target.value } : p))}
                          placeholder="Nome e sobrenome"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">WhatsApp (com DDD) *</Label>
                          {guestDraft.guest3WaStatus === "checking" && (
                            <span className="text-[10px] text-sky-600">Verificando...</span>
                          )}
                          {guestDraft.guest3WaStatus === "valid" && (
                            <span className="text-[10px] font-bold text-emerald-600">✓ Ativo</span>
                          )}
                          {guestDraft.guest3WaStatus === "invalid" && (
                            <span className="text-[10px] font-bold text-rose-600">✕ Sem WhatsApp</span>
                          )}
                        </div>
                        <Input
                          type="tel"
                          value={guestDraft.guest3Phone}
                          onChange={(e) =>
                            setGuestDraft((p) =>
                              p ? { ...p, guest3Phone: formatSmartPhone(e.target.value), guest3WaStatus: "idle" } : p
                            )
                          }
                          onBlur={() => {
                            if (guestDraft.guest3Phone.replace(/\D/g, "").length >= 8) {
                              checkWhatsAppForGuest(3, guestDraft.guest3Phone)
                            }
                          }}
                          placeholder="(22) 99999-9999"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CPF (Opcional)</Label>
                        <Input
                          value={guestDraft.guest3Document}
                          onChange={(e) =>
                            setGuestDraft((p) => (p ? { ...p, guest3Document: formatCpfMask(e.target.value) } : p))
                          }
                          placeholder="000.000.000-00"
                          className="bg-white h-9 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">E-mail (Opcional)</Label>
                        <Input
                          type="email"
                          value={guestDraft.guest3Email}
                          onChange={(e) => setGuestDraft((p) => (p ? { ...p, guest3Email: e.target.value } : p))}
                          placeholder="hospede3@empresa.com.br"
                          className="bg-white h-9 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setGuestDraft(null)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingGuests}
                  className="rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold gap-1.5"
                >
                  {savingGuests && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingGuests ? "Salvando..." : "Salvar Hóspedes"}</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Alterar Datas do Flat ── */}
      <Dialog
        open={modifyModalOpen}
        onOpenChange={(open) => {
          if (!open && modStep === "checkout" && checkoutData?.pendingId) {
            setConfirmCancelHoldInline(true)
            return
          }
          setModifyModalOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900">
              {modStep === "preview" && `Alterar Datas • Flat ${modTargetFlat?.flatNumber}`}
              {modStep === "checkout" && "Pagamento da Alteração"}
              {modStep === "success" && "Alteração Confirmada!"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Localizador do Flat: <strong className="font-mono">{modTargetFlat?.code}</strong>
            </DialogDescription>
          </DialogHeader>

          {confirmCancelHoldInline && modStep === "checkout" && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
              <strong className="block">Você possui um bloqueio provisório ativo para estas datas.</strong>
              <p>Deseja cancelar o bloqueio provisório e manter as datas originais?</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={cancellingHold}
                  onClick={handleCancelHold}
                  className="rounded-xl text-xs font-bold"
                >
                  {cancellingHold ? "Cancelando..." : "Sim, cancelar bloqueio"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmCancelHoldInline(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Continuar no pagamento
                </Button>
              </div>
            </div>
          )}

          {modStep === "preview" && (
            <div className="space-y-4 text-xs">
              {previewError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{previewError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Novo Check-in</Label>
                  <Input
                    type="date"
                    value={modCheckinDate}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckinDate(val)
                      if (val && modCheckoutDate) handleRunPreview(val, modCheckoutDate, modGuestCount)
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Novo Check-out</Label>
                  <Input
                    type="date"
                    value={modCheckoutDate}
                    min={modCheckinDate || undefined}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckoutDate(val)
                      if (modCheckinDate && val) handleRunPreview(modCheckinDate, val, modGuestCount)
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Hóspedes no Flat</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={modGuestCount === n ? "default" : "outline"}
                      onClick={() => {
                        setModGuestCount(n)
                        if (modCheckinDate && modCheckoutDate) handleRunPreview(modCheckinDate, modCheckoutDate, n)
                      }}
                      className="h-9 rounded-xl text-xs font-bold"
                    >
                      {n} {n === 1 ? "Hóspede" : "Hóspedes"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Motivo (opcional)</Label>
                <Input
                  value={modReason}
                  onChange={(e) => setModReason(e.target.value)}
                  placeholder="Ex: Reagendamento corporativo"
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              {previewLoading && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-600 font-semibold flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                  <span>Calculando disponibilidade e valores...</span>
                </div>
              )}

              {previewData && !previewLoading && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600">Disponibilidade:</span>
                    <Badge className={previewData.available ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                      {previewData.available ? "Disponível" : "Indisponível"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Noites:</span>
                    <span className="font-bold">
                      {previewData.originalDates?.nights} → {previewData.newDates?.nights} diárias
                    </span>
                  </div>
                  {previewData.requiresPayment && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 font-bold text-emerald-800">
                      <span>Diferença (PIX -5%):</span>
                      <span className="font-mono">+ R$ {formatMoney(previewData.additionalAmountToPay)}</span>
                    </div>
                  )}
                  {previewData.recalculatesPackagePix && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 font-bold text-indigo-900">
                      <span>Novo Total PIX do Pacote:</span>
                      <span className="font-mono">
                        R$ {formatMoney(previewData.projectedPackagePixTotal ?? pendingAmount)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setModifyModalOpen(false)} className="rounded-xl">
                  Fechar
                </Button>
                {previewData?.available && previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleProceedToCheckout}
                    className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs gap-1.5"
                  >
                    <span>
                      {checkoutLoading
                        ? "Gerando cobrança..."
                        : `Pagar Diferença (R$ ${formatMoney(previewData.additionalAmountToPay)})`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                {previewData?.available && !previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleConfirmZeroCostModify}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{checkoutLoading ? "Confirmando..." : "Confirmar Alteração"}</span>
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}

          {modStep === "checkout" && checkoutData && (
            <div className="space-y-4 text-xs">
              {checkoutError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{checkoutError}</div>
              )}
              <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between gap-2">
                <span className="font-bold text-sky-900">Bloqueio provisório de 30 minutos</span>
                {checkoutData.expiresAt && (
                  <HoldCountdownBadge
                    expiresAt={checkoutData.expiresAt}
                    onExpire={() => setCheckoutError("Tempo expirado.")}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModPaymentMethod("pix")}
                  className={`p-2.5 rounded-xl border font-bold ${
                    modPaymentMethod === "pix" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"
                  }`}
                >
                  PIX (R$ {formatMoney(checkoutData.additionalAmountToPay)})
                </button>
                <button
                  type="button"
                  onClick={() => setModPaymentMethod("card")}
                  className={`p-2.5 rounded-xl border font-bold ${
                    modPaymentMethod === "card" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"
                  }`}
                >
                  Cartão (R$ {formatMoney(checkoutData.additionalCardAmountToPay || computeCardAmount(checkoutData.additionalAmountToPay))})
                </button>
              </div>

              {modPaymentMethod === "pix" && checkoutData.pixCopiaECola && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                  {checkoutData.pixQrCodeUrl && (
                    <img src={checkoutData.pixQrCodeUrl} alt="QR Code Alteração" className="w-40 h-40 mx-auto rounded-xl" />
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(checkoutData.pixCopiaECola)
                      setModCopiedPix(true)
                      setTimeout(() => setModCopiedPix(false), 3000)
                    }}
                    className="w-full rounded-xl bg-slate-900 text-white font-bold gap-1.5"
                  >
                    {modCopiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{modCopiedPix ? "PIX Copiado!" : "Copiar Código PIX"}</span>
                  </Button>
                </div>
              )}

              {modPaymentMethod === "card" && checkoutData.mpCheckoutUrl && (
                <a
                  href={checkoutData.mpCheckoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center py-3 px-4 rounded-xl bg-sky-600 text-white font-bold gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pagar no Mercado Pago ↗</span>
                </a>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancellingHold}
                  onClick={handleCancelHold}
                  className="rounded-xl border-rose-200 text-rose-700 font-bold"
                >
                  {cancellingHold ? "Cancelando..." : "Cancelar Alteração"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {modStep === "success" && (
            <div className="space-y-4 text-center py-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div className="text-sm font-bold text-slate-900">
                {modifySuccessInfo?.message || "Alteração concluída com sucesso!"}
              </div>
              <Button
                type="button"
                onClick={() => setModifyModalOpen(false)}
                className="w-full rounded-xl bg-[#0F3D4C] text-white font-bold"
              >
                Concluir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmação de Cancelamento (Flat Individual ou Pacote Inteiro) ── */}
      <Dialog open={Boolean(cancelDialogTarget)} onOpenChange={(open) => !open && setCancelDialogTarget(null)}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>
                {cancelDialogTarget?.mode === "whole"
                  ? "Confirmar Cancelamento do Pacote Inteiro"
                  : `Confirmar Cancelamento • Flat ${cancelDialogTarget?.item?.flatNumber || ""}`}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {cancelDialogTarget?.mode === "whole"
                ? `Esta ação cancelará todas as ${activeItems.length} acomodações ativas do pacote ${locatorCode}.`
                : `Esta ação cancelará apenas o Flat ${cancelDialogTarget?.item?.flatNumber} (${cancelDialogTarget?.item?.code}), mantendo os demais ativos.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs pt-1">
            {cancelDialogTarget?.mode === "whole" && activeItems.length > 1 && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-1 text-rose-900">
                <strong className="block">Acomodações incluídas no cancelamento:</strong>
                <ul className="list-disc pl-4 space-y-0.5">
                  {activeItems.map((it) => (
                    <li key={it.code}>
                      Flat {it.flatNumber} ({it.code}) — {it.guestName || "A informar"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {loadingCancelQuote ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Consultando política de cancelamento...</span>
              </div>
            ) : cancelQuote ? (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-800">Política Aplicável</div>
                <p className="text-slate-600 leading-relaxed">{cancelQuote.explanation}</p>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label className="text-xs font-bold">Motivo do cancelamento (opcional)</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Alteração na agenda da equipe"
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {cancelDialogTarget?.mode === "whole" && isPackage && activeItems.length > 1 && (
              <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelWholeConfirmChecked}
                  onChange={(e) => setCancelWholeConfirmChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-rose-600 shrink-0"
                />
                <span className="text-amber-950 font-semibold leading-snug">
                  Confirmo que desejo cancelar TODOS os {activeItems.length} flats do pacote {locatorCode}.
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelDialogTarget(null)}
              className="rounded-xl"
            >
              Manter Acomodação
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                cancellingReservation ||
                (cancelDialogTarget?.mode === "whole" &&
                  isPackage &&
                  activeItems.length > 1 &&
                  !cancelWholeConfirmChecked)
              }
              onClick={handleConfirmCancelDialog}
              className="rounded-xl font-bold text-xs gap-1.5"
            >
              {cancellingReservation && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {cancellingReservation
                  ? "Cancelando..."
                  : cancelDialogTarget?.mode === "whole"
                    ? "Sim, Cancelar Pacote Inteiro"
                    : "Sim, Cancelar Flat"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Recibo Unificado do Pacote ── */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900">
              Recibo Unificado • {locatorCode}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Demonstrativo financeiro exclusivo do Solicitante ({requesterName})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div>
                <strong>Solicitante:</strong> {requesterName}
              </div>
              {requester?.companyName && (
                <div>
                  <strong>Empresa:</strong> {requester.companyName}
                </div>
              )}
              {requester?.document && (
                <div>
                  <strong>CPF / CNPJ:</strong> <span className="font-mono">{requester.document}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {activeItems.map((it) => (
                <div
                  key={it.code}
                  className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <strong className="text-slate-900">
                      Flat {it.flatNumber} ({it.code})
                    </strong>
                    <div className="text-slate-500">
                      {formatDateBr(it.checkinDate)} a {formatDateBr(it.checkoutDate)} • {it.guestName || "Hóspede a informar"}
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-900">R$ {formatMoney(it.totalAmount)}</span>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-800 block">Total Liquidado</span>
                <span className="text-emerald-700 font-semibold">
                  Contratado: R$ {formatMoney(totalAmount)}
                </span>
              </div>
              <span className="font-mono text-xl font-black text-emerald-800">R$ {formatMoney(paidAmount)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCopyUnifiedReceipt} className="rounded-xl gap-1.5">
              {copiedReceipt ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copiedReceipt ? "Copiado!" : "Copiar Dados"}</span>
            </Button>
            <Button
              type="button"
              onClick={handlePrintUnifiedReceipt}
              className="rounded-xl bg-[#0F3D4C] text-white font-bold gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
