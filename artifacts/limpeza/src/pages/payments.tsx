import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import {
  CreditCard, DollarSign, TrendingDown, Percent, Building2, Calendar,
  ShieldCheck, Sparkles, Sliders, Trash2, CheckCircle2, Clock, Check,
  Copy, FileText, RefreshCw, Send, Wallet, Download, Search, QrCode,
  Eye, Zap, Bell, Edit3, AlertTriangle, ArrowRight
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AccessDenied } from "@/components/access-denied"
import { PaymentMethodsModal } from "@/components/payment-methods-modal"
import { useToast } from "@/hooks/use-toast"
import { useBackTabState } from "@/lib/back-navigation"

function formatBrDateStr(iso?: string | null) {
  if (!iso) return "—"
  const s = String(iso).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-")
    return `${d}/${m}/${y}`
  }
  return s
}

function addDaysPreview(isoBase?: string | null, days = 15) {
  const base = isoBase && /^\d{4}-\d{2}-\d{2}$/.test(String(isoBase).slice(0, 10))
    ? new Date(`${String(isoBase).slice(0, 10)}T12:00:00`)
    : new Date()
  base.setDate(base.getDate() + (Number(days) || 0))
  return base.toISOString().slice(0, 10)
}

export default function Payments() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()

  // Evita sobreposição com o botão flutuante "Menu" quando a sidebar está desfixada
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gfm_sidebar_pinned") === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail && typeof e.detail.isPinned === "boolean") {
        setIsSidebarPinned(e.detail.isPinned)
      }
    }
    window.addEventListener("gfm-sidebar-pin-changed", handler)
    return () => window.removeEventListener("gfm-sidebar-pin-changed", handler)
  }, [])

  // ── 3 Abas Principais Enxutas (com suporte a ?tab=boletos|methods|history) ──
  const [activeTab, setActiveTab] = useState<"history" | "boletos" | "methods">(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const t = p.get("tab")
      if (t === "boletos") return "boletos"
      if (t === "methods" || t === "feeSettings" || t === "taxas") return "methods"
    } catch {}
    return "history"
  })

  // Sincroniza query param ?tab= na URL sem recarregar
  const handleTabChange = (tab: "history" | "boletos" | "methods") => {
    setActiveTab(tab)
    try {
      const url = new URL(window.location.href)
      if (tab === "history") url.searchParams.delete("tab")
      else url.searchParams.set("tab", tab)
      window.history.replaceState(window.history.state, "", url.pathname + url.search)
    } catch {}
  }

  useBackTabState(activeTab, handleTabChange, { id: "payments-main-tabs" })

  // ── Dados Principais ────────────────────────────────────────────────────────
  const [paymentsData, setPaymentsData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Filtros de Recebimentos & Conciliação ───────────────────────────────────
  const [quickViewFilter, setQuickViewFilter] = useState<"all" | "paid" | "pending_pix" | "faturado">("all")
  const [periodFilter, setPeriodFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 280)
    return () => clearTimeout(t)
  }, [searchQuery])

  // ── Modal de Comprovante Detalhado ──────────────────────────────────────────
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null)

  // ── Taxas & Formas de Pagamento ─────────────────────────────────────────────
  const [feePixInter, setFeePixInter] = useState("0")
  const [feeMpSpot, setFeeMpSpot] = useState("3.99")
  const [feeMpInstallments, setFeeMpInstallments] = useState("5.49")
  const [feeBooking, setFeeBooking] = useState("15.0")
  const [feeAirbnb, setFeeAirbnb] = useState("15.0")
  const [savingFees, setSavingFees] = useState(false)
  const [feeSuccessMsg, setFeeSuccessMsg] = useState("")
  const [paymentMethodsModalOpen, setPaymentMethodsModalOpen] = useState(false)

  // ── Conciliação PIX Ativa ───────────────────────────────────────────────────
  const [reconcilingCode, setReconcilingCode] = useState<string | null>(null)
  const [batchReconciling, setBatchReconciling] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<any | null>(null)

  // ── Carteira de Boletos & Pré-Boletos ("Aguardando Emissão") ────────────────
  const [boletoStatusFilter, setBoletoStatusFilter] = useState<"all" | "aguardando_emissao" | "em_aberto" | "vencido" | "pago" | "cancelado">("all")
  const [boletoSearch, setBoletoSearch] = useState("")
  const [processingReminders, setProcessingReminders] = useState(false)

  // Modal 1: Editar Pré-Boleto (Reserva Faturada ainda "Aguardando Emissão")
  const [preBoletoModalOpen, setPreBoletoModalOpen] = useState(false)
  const [activePreBoleto, setActivePreBoleto] = useState<any | null>(null)
  const [savingPreBoleto, setSavingPreBoleto] = useState(false)
  const [pbPayerType, setPbPayerType] = useState<"company" | "agency" | "guest" | "requester" | "financial_responsible" | "custom">("company")
  const [pbCustomPayerName, setPbCustomPayerName] = useState("")
  const [pbCustomPayerDoc, setPbCustomPayerDoc] = useState("")
  const [pbCustomPayerEmail, setPbCustomPayerEmail] = useState("")
  const [pbTermDays, setPbTermDays] = useState("15")
  const [pbCustomDueDate, setPbCustomDueDate] = useState("")
  const [pbConsumptionMode, setPbConsumptionMode] = useState<"single" | "separate">("single")
  const [pbConsumptionSame, setPbConsumptionSame] = useState(true)
  const [pbConsumptionPayerName, setPbConsumptionPayerName] = useState("")
  const [pbConsumptionPayerDoc, setPbConsumptionPayerDoc] = useState("")
  const [pbConsumptionDueDate, setPbConsumptionDueDate] = useState("")
  const [pbMultaPct, setPbMultaPct] = useState("2")
  const [pbJurosPct, setPbJurosPct] = useState("1")
  const [pbAutoEmitOnCheckout, setPbAutoEmitOnCheckout] = useState(true)
  const [pbFinRespName, setPbFinRespName] = useState("")
  const [pbFinRespEmail, setPbFinRespEmail] = useState("")
  const [pbFinRespPhone, setPbFinRespPhone] = useState("")
  const [pbFinRespDoc, setPbFinRespDoc] = useState("")
  const [pbRecGuest, setPbRecGuest] = useState(false)
  const [pbRecRequester, setPbRecRequester] = useState(false)
  const [pbRecCompany, setPbRecCompany] = useState(true)
  const [pbRecFinResp, setPbRecFinResp] = useState(true)
  const [pbRecSendEmail, setPbRecSendEmail] = useState(true)
  const [pbRecSendWhatsApp, setPbRecSendWhatsApp] = useState(true)
  const [pbNotes, setPbNotes] = useState("")
  const [pbSaveToCrm, setPbSaveToCrm] = useState(false)

  // Modal 2: Emitir Agora (Pacote Boleto(s) Inter + NFS-e opcional)
  const [emitBoletoModalOpen, setEmitBoletoModalOpen] = useState(false)
  const [emitTargetPre, setEmitTargetPre] = useState<any | null>(null)
  const [emittingBoletoPackage, setEmittingBoletoPackage] = useState(false)
  const [ebEmitNfseToo, setEbEmitNfseToo] = useState(true)
  const [ebAutoDispatch, setEbAutoDispatch] = useState(true)

  // Modal 3: Editar Boleto Já Emitido (Sincronizado com Banco Inter)
  const [editingBoleto, setEditingBoleto] = useState<any | null>(null)
  const [editBoletoModalOpen, setEditBoletoModalOpen] = useState(false)
  const [savingBoletoEdit, setSavingBoletoEdit] = useState(false)
  const [editBoletoDueDate, setEditBoletoDueDate] = useState("")
  const [editBoletoAmount, setEditBoletoAmount] = useState("")
  const [editBoletoPayerName, setEditBoletoPayerName] = useState("")
  const [editBoletoPayerDoc, setEditBoletoPayerDoc] = useState("")
  const [editBoletoMultaPct, setEditBoletoMultaPct] = useState("2")
  const [editBoletoJurosPct, setEditBoletoJurosPct] = useState("1")
  const [editBoletoFinRespName, setEditBoletoFinRespName] = useState("")
  const [editBoletoFinRespEmail, setEditBoletoFinRespEmail] = useState("")
  const [editBoletoFinRespPhone, setEditBoletoFinRespPhone] = useState("")
  const [editBoletoNotes, setEditBoletoNotes] = useState("")

  // ── Carregamento Unificado (/api/finance/payments já traz boletos + preBoletos) ──
  const fetchPayments = async () => {
    setLoading(true)
    try {
      let url = `/api/finance/payments?method=${encodeURIComponent(methodFilter)}&channel=${encodeURIComponent(channelFilter)}&status=all&flatId=all`

      const now = new Date()
      if (periodFilter === "today") {
        const todayStr = now.toISOString().substring(0, 10)
        url += `&startDate=${todayStr}&endDate=${todayStr}`
      } else if (periodFilter === "7d") {
        const d = new Date(now.getTime() - 7 * 86400000)
        url += `&startDate=${d.toISOString().substring(0, 10)}`
      } else if (periodFilter === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10)
        url += `&startDate=${monthStart}`
      }

      if (debouncedSearch.trim()) {
        url += `&search=${encodeURIComponent(debouncedSearch.trim())}`
      }

      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setPaymentsData(data)
        if (data.feeSettings) {
          setFeePixInter(String(data.feeSettings.pixInterRate ?? 0))
          setFeeMpSpot(String(data.feeSettings.mpCreditSpotRate ?? 3.99))
          setFeeMpInstallments(String(data.feeSettings.mpCreditInstallmentRate ?? 5.49))
          setFeeBooking(String(data.feeSettings.bookingCommissionRate ?? 15))
          setFeeAirbnb(String(data.feeSettings.airbnbCommissionRate ?? 15))
        }
      }
    } catch (e) {
      console.error("Erro ao carregar pagamentos:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments()
  }, [periodFilter, methodFilter, channelFilter, debouncedSearch])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Salvar Taxas e Comissões ────────────────────────────────────────────────
  const handleSaveFees = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingFees(true)
    setFeeSuccessMsg("")
    try {
      const res = await fetch("/api/finance/fee-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixInterRate: Number(feePixInter),
          mpCreditSpotRate: Number(feeMpSpot),
          mpCreditInstallmentRate: Number(feeMpInstallments),
          bookingCommissionRate: Number(feeBooking),
          airbnbCommissionRate: Number(feeAirbnb)
        }),
        credentials: "include"
      })
      if (res.ok) {
        setFeeSuccessMsg("Taxas e comissões salvas! Todos os valores líquidos foram recalculados.")
        fetchPayments()
        setTimeout(() => setFeeSuccessMsg(""), 4000)
      }
    } catch {}
    setSavingFees(false)
  }

  // ── Conciliar Pagamento Individual ou em Lote na API do Banco Inter ─────────
  const handleReconcile = async (code: string) => {
    setReconcilingCode(code)
    try {
      const res = await fetch(`/api/finance/payments/reconcile/${code}`, {
        method: "POST",
        credentials: "include"
      })
      const json = await res.json()
      setReconcileResult({ code, ...json })
      fetchPayments()
    } catch {}
    setReconcilingCode(null)
  }

  const handleBatchReconcilePix = async (items: any[]) => {
    const withTx = items.filter(p => !p.isPaid && p.pixTxId)
    if (withTx.length === 0) {
      toast({ title: "Nenhuma cobrança PIX ativa", description: "Os itens pendentes atuais não possuem TxId PIX gerado." })
      return
    }
    setBatchReconciling(true)
    let settledCount = 0
    for (const item of withTx.slice(0, 15)) {
      try {
        const res = await fetch(`/api/finance/payments/reconcile/${item.code}`, {
          method: "POST",
          credentials: "include"
        })
        const json = await res.json()
        if (json?.reconciled) settledCount++
      } catch {}
    }
    setBatchReconciling(false)
    toast({
      title: settledCount > 0 ? `${settledCount} pagamento(s) compensado(s)!` : "Consulta concluída no Banco Inter",
      description: settledCount > 0
        ? "Os recebimentos localizados foram baixados automaticamente."
        : `Verificados ${Math.min(withTx.length, 15)} TxIds PIX — nenhum novo pagamento compensado ainda.`
    })
    fetchPayments()
  }

  // ── Operações de Pré-Boleto ("Aguardando Emissão") ──────────────────────────
  const handleOpenPreBoletoModal = (pre: any) => {
    setActivePreBoleto(pre)
    const pType = (pre.payerType || (pre.companyId || pre.companyName ? "company" : pre.agencyId || pre.agencyName ? "agency" : "guest")) as any
    setPbPayerType(pType)
    setPbCustomPayerName(pre.payerName || "")
    setPbCustomPayerDoc(pre.payerDoc || "")
    setPbCustomPayerEmail(pre.payerEmail || "")
    setPbTermDays(String(pre.termDays ?? 15))
    setPbCustomDueDate(pre.customDueDate || "")
    setPbConsumptionMode(pre.consumptionMode === "separate" ? "separate" : "single")
    setPbConsumptionSame(pre.consumptionSamePayerAndDue !== false)
    setPbConsumptionPayerName(pre.consumptionCustomPayer?.name || pre.guestName || "")
    setPbConsumptionPayerDoc(pre.consumptionCustomPayer?.document || pre.guestDocument || "")
    setPbConsumptionDueDate(pre.consumptionCustomDueDate || "")
    setPbMultaPct(String(pre.multaPct ?? 2))
    setPbJurosPct(String(pre.jurosMonthlyPct ?? 1))
    setPbAutoEmitOnCheckout(pre.autoEmitBoletoOnCheckout !== false)
    setPbFinRespName(pre.financialResponsible?.name || "")
    setPbFinRespEmail(pre.financialResponsible?.email || "")
    setPbFinRespPhone(pre.financialResponsible?.phone || "")
    setPbFinRespDoc(pre.financialResponsible?.document || "")
    const dr = pre.billingDeliveryRecipients || pre.billingRecipients || {}
    setPbRecGuest(Boolean(dr.guest ?? (!pre.companyName && !pre.agencyName)))
    setPbRecRequester(Boolean(dr.requester ?? false))
    setPbRecCompany(Boolean(dr.company ?? Boolean(pre.companyName || pre.agencyName)))
    setPbRecFinResp(Boolean(dr.financialResponsible ?? Boolean(pre.financialResponsible?.email || pre.financialResponsible?.phone)))
    setPbRecSendEmail(dr.sendEmail !== false)
    setPbRecSendWhatsApp((dr.sendWhatsApp ?? dr.sendWhatsapp) !== false)
    setPbNotes(pre.notes || "")
    setPbSaveToCrm(false)
    setPreBoletoModalOpen(true)
  }

  const handleSavePreBoleto = async (e: React.FormEvent, andOpenEmit = false) => {
    e.preventDefault()
    if (!activePreBoleto) return
    setSavingPreBoleto(true)
    try {
      const payload: any = {
        payerType: pbPayerType,
        termDays: Number(pbTermDays) || 0,
        customDueDate: pbCustomDueDate || null,
        consumptionMode: pbConsumptionMode,
        consumptionSamePayerAndDue: pbConsumptionSame,
        consumptionPayerName: !pbConsumptionSame ? pbConsumptionPayerName.trim() : undefined,
        consumptionPayerDoc: !pbConsumptionSame ? pbConsumptionPayerDoc.trim() : undefined,
        consumptionCustomDueDate: !pbConsumptionSame ? (pbConsumptionDueDate || null) : null,
        multaPct: Number(pbMultaPct ?? 2),
        jurosMonthlyPct: Number(pbJurosPct ?? 1),
        autoEmitBoletoOnCheckout: pbAutoEmitOnCheckout,
        notes: pbNotes.trim(),
        financialResponsible: {
          name: pbFinRespName.trim(),
          email: pbFinRespEmail.trim(),
          phone: pbFinRespPhone.trim(),
          document: pbFinRespDoc.trim()
        },
        billingDeliveryRecipients: {
          guest: pbRecGuest,
          requester: pbRecRequester,
          company: pbRecCompany,
          financialResponsible: pbRecFinResp,
          sendEmail: pbRecSendEmail,
          sendWhatsApp: pbRecSendWhatsApp
        },
        saveToCrm: pbSaveToCrm
      }
      if (pbPayerType === "custom") {
        payload.payerName = pbCustomPayerName.trim()
        payload.payerDoc = pbCustomPayerDoc.trim()
        payload.payerEmail = pbCustomPayerEmail.trim()
      } else {
        payload.customPayer = null
      }

      const resp = await fetch(`/api/boletos/pre/${activePreBoleto.reservationId || activePreBoleto.reservationCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      })
      const data = await resp.json()
      if (!resp.ok || data.error) {
        toast({ title: "Erro ao salvar pré-boleto", description: data.error || "Verifique os campos.", variant: "destructive" })
      } else {
        toast({
          title: "Dados do boleto salvos na reserva!",
          description: `Prazo (${pbCustomDueDate ? formatBrDateStr(pbCustomDueDate) : `${pbTermDays} dias após check-out`}) e destinatários atualizados.`
        })
        setPreBoletoModalOpen(false)
        await fetchPayments()
        if (andOpenEmit && data.preBoleto) {
          handleOpenEmitFromPre(data.preBoleto)
        }
      }
    } catch (err: any) {
      toast({ title: "Erro de comunicação", description: err.message, variant: "destructive" })
    } finally {
      setSavingPreBoleto(false)
    }
  }

  const handleOpenEmitFromPre = (pre: any) => {
    setEmitTargetPre(pre)
    setEbEmitNfseToo(!pre.invoiceIssued)
    setEbAutoDispatch(true)
    setEmitBoletoModalOpen(true)
  }

  const handleConfirmEmitNow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emitTargetPre) return
    setEmittingBoletoPackage(true)
    try {
      const resp = await fetch("/api/boletos/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reservationId: emitTargetPre.reservationId,
          reservationCode: emitTargetPre.reservationCode,
          emitNfseToo: ebEmitNfseToo,
          autoDispatch: ebAutoDispatch,
          consumptionMode: emitTargetPre.consumptionMode,
          termDays: emitTargetPre.termDays,
          customDueDate: emitTargetPre.customDueDate || null,
          boletoPayerType: emitTargetPre.payerType,
          multaPct: emitTargetPre.multaPct,
          jurosMonthlyPct: emitTargetPre.jurosMonthlyPct,
          financialResponsible: emitTargetPre.financialResponsible,
          billingDeliveryRecipients: emitTargetPre.billingDeliveryRecipients
        })
      })
      const data = await resp.json()
      if (!resp.ok || data.error) {
        toast({ title: "Falha ao emitir boleto", description: data.error || "Verifique os dados do pagador.", variant: "destructive" })
      } else {
        const count = Array.isArray(data.boletos) ? data.boletos.length : 1
        toast({
          title: "Boleto(s) Banco Inter emitido(s)!",
          description: `${ebEmitNfseToo ? "NFS-e + " : ""}${count} boleto(s) registrado(s)${ebAutoDispatch ? " e disparado(s) aos destinatários" : ""}.`
        })
        setEmitBoletoModalOpen(false)
        setBoletoStatusFilter("all")
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro de comunicação", description: err.message, variant: "destructive" })
    } finally {
      setEmittingBoletoPackage(false)
    }
  }

  // ── Operações de Boletos Já Emitidos (Banco Inter) ──────────────────────────
  const handleOpenEditBoleto = (b: any) => {
    setEditingBoleto(b)
    setEditBoletoDueDate(b.dueDate || "")
    setEditBoletoAmount(String(b.amount || ""))
    setEditBoletoPayerName(b.payerName || "")
    setEditBoletoPayerDoc(b.payerDoc || "")
    setEditBoletoMultaPct(String(b.multaPct ?? 2))
    setEditBoletoJurosPct(String(b.jurosMonthlyPct ?? 1))
    setEditBoletoFinRespName(b.financialResponsible?.name || "")
    setEditBoletoFinRespEmail(b.financialResponsible?.email || "")
    setEditBoletoFinRespPhone(b.financialResponsible?.phone || "")
    setEditBoletoNotes(b.notes || "")
    setEditBoletoModalOpen(true)
  }

  const handleSaveEditBoleto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBoleto) return
    setSavingBoletoEdit(true)
    try {
      const resp = await fetch(`/api/boletos/${editingBoleto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dueDate: editBoletoDueDate,
          amount: Number(editBoletoAmount) || editingBoleto.amount,
          payerName: editBoletoPayerName.trim(),
          payerDoc: editBoletoPayerDoc.trim(),
          multaPct: Number(editBoletoMultaPct ?? 2),
          jurosMonthlyPct: Number(editBoletoJurosPct ?? 1),
          financialResponsible: {
            name: editBoletoFinRespName.trim(),
            email: editBoletoFinRespEmail.trim(),
            phone: editBoletoFinRespPhone.trim()
          },
          notes: editBoletoNotes.trim()
        })
      })
      const data = await resp.json()
      if (!resp.ok || data.error) {
        toast({ title: "Erro ao atualizar boleto", description: data.error || "Tente novamente.", variant: "destructive" })
      } else {
        toast({
          title: "Boleto atualizado e sincronizado!",
          description: "Alterações gravadas e enviadas ao Banco Inter."
        })
        setEditBoletoModalOpen(false)
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar boleto", description: err.message, variant: "destructive" })
    } finally {
      setSavingBoletoEdit(false)
    }
  }

  const handleMarkBoletoPaid = async (b: any) => {
    try {
      const resp = await fetch(`/api/boletos/${b.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paidAmount: b.amount })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        toast({ title: "Boleto quitado!", description: `Boleto #${b.code || b.id} marcado como PAGO.` })
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    }
  }

  const handleReconcileBoleto = async (b: any) => {
    try {
      const resp = await fetch(`/api/boletos/${b.id}/reconcile`, {
        method: "POST",
        credentials: "include"
      })
      const data = await resp.json()
      toast({
        title: data.paid ? "Pago no Banco Inter!" : "Status consultado no Banco Inter",
        description: data.paid ? `Liquidação confirmada para o boleto #${b.code || b.id}.` : `Situação atual: ${data.situacao || b.status}`
      })
      fetchPayments()
    } catch (err: any) {
      toast({ title: "Erro na conciliação", description: err.message, variant: "destructive" })
    }
  }

  const handleDispatchBoleto = async (b: any) => {
    try {
      toast({ title: "Disparando E-mail e WhatsApp...", description: `Enviando PDF da NFS-e + Boleto #${b.code || b.id} aos destinatários.` })
      const resp = await fetch(`/api/boletos/${b.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        toast({ title: "Envios concluídos!", description: "PDFs, linha digitável e PIX enviados aos destinatários marcados." })
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro ao reenviar", description: err.message, variant: "destructive" })
    }
  }

  const handleCancelBoleto = async (b: any) => {
    try {
      const resp = await fetch(`/api/boletos/${b.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ motivoCancelamento: "ACERTOS" })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        toast({ title: "Boleto cancelado", description: `Baixa efetuada para o boleto #${b.code || b.id}.` })
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" })
    }
  }

  const handleProcessBoletoReminders = async () => {
    setProcessingReminders(true)
    try {
      const resp = await fetch("/api/boletos/process-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force: true })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        toast({
          title: "Lembretes processados!",
          description: `${data.processedCount || 0} boleto(s) vencendo hoje ou em atraso notificados por E-mail e WhatsApp.`
        })
        fetchPayments()
      }
    } catch (err: any) {
      toast({ title: "Erro nos lembretes", description: err.message, variant: "destructive" })
    } finally {
      setProcessingReminders(false)
    }
  }

  // ── Exportar Relatório CSV ──────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!filteredTransactions.length) return
    const headers = ["Data", "Código", "Hóspede/Cliente", "Apartamento", "Canal", "Forma Pagamento", "Valor Bruto (R$)", "Taxa Gateway (R$)", "Comissão Canal (R$)", "Valor Líquido (R$)", "Status", "EndToEnd ID / TxId"]
    const rows = filteredTransactions.map((p: any) => [
      p.paidAt ? format(parseISO(p.paidAt), "dd/MM/yyyy HH:mm:ss") : (p.date || ""),
      p.code || "",
      `"${(p.guestName || "").replace(/"/g, '""')}"`,
      p.flatNumber || "",
      p.channel || "",
      p.paymentMethod || "",
      p.grossAmount.toFixed(2),
      p.gatewayFeeAmount.toFixed(2),
      p.channelCommissionAmount.toFixed(2),
      p.netAmount.toFixed(2),
      p.isPaid ? "Pago" : "Pendente",
      `"${p.pixEndToEndId || p.pixTxId || p.mpPaymentId || ""}"`
    ])

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `pagamentos_corpflats_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Derivações e Contadores ─────────────────────────────────────────────────
  const allPaymentsList: any[] = paymentsData?.payments || []
  const boletosList: any[] = paymentsData?.boletos || []
  const preBoletosList: any[] = paymentsData?.preBoletos || []
  const boletosSummary = paymentsData?.boletosSummary || {
    totalCount: 0,
    awaitingCount: 0,
    awaitingAmount: 0,
    openCount: 0,
    openAmount: 0,
    dueTodayCount: 0,
    dueTodayAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    cancelledCount: 0,
    cancelledAmount: 0
  }

  const summary = paymentsData?.summary || {
    totalGross: 0,
    totalFees: 0,
    totalCommissions: 0,
    totalDeductions: 0,
    totalNet: 0,
    totalPaidCount: 0,
    totalPendingCount: 0,
    totalPendingAmount: 0,
    averageTicket: 0,
    byMethod: [],
    byChannel: []
  }

  const isFaturadoRow = (p: any) => {
    const pm = String(p.paymentMethod || "").toLowerCase()
    return Boolean(p.isFaturadoBoleto || ["boleto_faturado", "faturado_boleto", "boleto", "faturado_pj", "faturado_b2b"].includes(pm))
  }

  const txCounts = useMemo(() => {
    let paid = 0
    let pendingPix = 0
    let faturado = 0
    for (const p of allPaymentsList) {
      if (p.isPaid) paid++
      if (isFaturadoRow(p)) faturado++
      else if (!p.isPaid) pendingPix++
    }
    return { all: allPaymentsList.length, paid, pendingPix, faturado }
  }, [allPaymentsList])

  const filteredTransactions = useMemo(() => {
    return allPaymentsList.filter(p => {
      if (quickViewFilter === "paid") return Boolean(p.isPaid)
      if (quickViewFilter === "pending_pix") return !p.isPaid && !isFaturadoRow(p)
      if (quickViewFilter === "faturado") return isFaturadoRow(p)
      return true
    })
  }, [allPaymentsList, quickViewFilter])

  // Lista combinada da Carteira de Boletos (Pré-Boletos Aguardando Emissão + Boletos Emitidos)
  const combinedBoletosRows = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const q = boletoSearch.trim().toLowerCase()

    const matchSearch = (item: any) => {
      if (!q) return true
      const hay = `${item.payerName || ""} ${item.payerDoc || ""} ${item.guestName || ""} ${item.companyName || ""} ${item.agencyName || ""} ${item.reservationCode || ""} ${item.nossoNumero || ""} ${item.code || ""} ${item.flatNumber || ""} ${item.financialResponsible?.name || ""}`.toLowerCase()
      return hay.includes(q)
    }

    const preFiltered = preBoletosList.filter(pre => {
      if (boletoStatusFilter !== "all" && boletoStatusFilter !== "aguardando_emissao") return false
      return matchSearch(pre)
    })

    const emittedFiltered = boletosList.filter(b => {
      if (boletoStatusFilter === "aguardando_emissao") return false
      const isOverdue = b.status === "vencido" || ((b.status === "aberto" || b.status === "em_aberto") && Boolean(b.dueDate && b.dueDate < todayIso))
      const isOpen = (b.status === "aberto" || b.status === "em_aberto") && !isOverdue
      if (boletoStatusFilter === "em_aberto" && !isOpen) return false
      if (boletoStatusFilter === "vencido" && !isOverdue) return false
      if (boletoStatusFilter === "pago" && b.status !== "pago") return false
      if (boletoStatusFilter === "cancelado" && b.status !== "cancelado") return false
      return matchSearch(b)
    })

    return [...preFiltered, ...emittedFiltered]
  }, [preBoletosList, boletosList, boletoStatusFilter, boletoSearch])

  if (loadingUser) {
    return (
      <Shell>
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando permissões...</div>
      </Shell>
    )
  }

  if (user?.role !== "admin" && user?.role !== "dev") {
    return (
      <Shell>
        <AccessDenied />
      </Shell>
    )
  }

  const totalBoletosReceivable = Number((boletosSummary.awaitingAmount || 0) + (boletosSummary.openAmount || 0) + (boletosSummary.overdueAmount || 0))
  const totalBoletosBadgeCount = (boletosSummary.awaitingCount || 0) + (boletosSummary.openCount || 0) + (boletosSummary.overdueCount || 0)

  return (
    <Shell>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5 pb-16">
        {/* ── CABEÇALHO PRINCIPAL (COM RECUO SEGURO QUANDO SIDEBAR DESFIXADA) ── */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4 transition-all ${!isSidebarPinned ? "md:pl-24" : ""}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2 flex-wrap">
                <span>Pagamentos, PIX & Boletos</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  Banco Inter mTLS + Gateways
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Recebimentos liquidados, conciliação PIX, carteira completa de boletos faturados a prazo e taxas por canal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/notas")}
              className="text-xs font-bold h-9 gap-1.5 rounded-xl"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Ir para Notas Fiscais (NFS-e)</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs font-semibold h-9 gap-1.5 rounded-xl"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </Button>

            <Button
              size="sm"
              onClick={() => { setSyncing(true); fetchPayments().then(() => setSyncing(false)) }}
              disabled={syncing || loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5 rounded-xl shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Sincronizando..." : "Atualizar"}</span>
            </Button>
          </div>
        </div>

        {/* ── 4 CARDS EXECUTIVOS SEM REDUNDÂNCIA ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Bruto Recebido */}
          <Card className="border-border/60 shadow-xs bg-card rounded-2xl">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Total Bruto Liquidado</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-foreground">
                R$ {summary.totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>{summary.totalPaidCount} recebimentos pagos</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Compensado</span>
              </div>
            </CardContent>
          </Card>

          {/* 2. Carteira a Receber (Boletos + Pré-Boletos) */}
          <Card
            onClick={() => handleTabChange("boletos")}
            className="border-indigo-500/30 shadow-xs bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors cursor-pointer rounded-2xl"
          >
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300">Carteira de Boletos / Faturado</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                R$ {totalBoletosReceivable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-indigo-500/20">
                <span>{boletosSummary.awaitingCount || 0} aguard. emissão • {(boletosSummary.openCount || 0) + (boletosSummary.overdueCount || 0)} emitidos</span>
                <span className="font-bold text-indigo-600 flex items-center gap-0.5">Abrir <ArrowRight className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>

          {/* 3. Taxas + Comissões Unificadas */}
          <Card
            onClick={() => handleTabChange("methods")}
            className="border-border/60 shadow-xs bg-card hover:bg-muted/20 transition-colors cursor-pointer rounded-2xl"
          >
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Taxas & Comissões Retidas</span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                - R$ {summary.totalDeductions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Gateways: -R$ {summary.totalFees.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span>OTAs: -R$ {summary.totalCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>

          {/* 4. Receita Líquida Real */}
          <Card className="border-emerald-300 dark:border-emerald-800 shadow-xs bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">Receita Líquida no Caixa</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {summary.totalNet.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300 pt-1 border-t border-emerald-200 dark:border-emerald-800/60">
                <span>Ticket Médio: R$ {summary.averageTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className="font-bold">Caixa Efetivo</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── NAVEGAÇÃO EM 3 ABAS DIRETAS (ÍCONES LIMPOS, SEM DUPLICIDADE) ── */}
        <div className="bg-card border border-border p-1.5 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-1.5 shadow-2xs">
          <button
            type="button"
            onClick={() => handleTabChange("history")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "history"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>Recebimentos & Conciliação</span>
            {txCounts.pendingPix > 0 && (
              <Badge className={`text-[10px] px-1.5 py-0 h-4 ${activeTab === "history" ? "bg-white/20 text-white" : "bg-amber-500 text-white"}`}>
                {txCounts.pendingPix} pend.
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("boletos")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "boletos"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Boletos & Faturado a Prazo</span>
            {totalBoletosBadgeCount > 0 && (
              <Badge className={`text-[10px] px-1.5 py-0 h-4 text-white ${
                (boletosSummary.overdueCount || 0) > 0
                  ? "bg-rose-600"
                  : activeTab === "boletos"
                    ? "bg-white/20"
                    : "bg-indigo-600"
              }`}>
                {totalBoletosBadgeCount}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("methods")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "methods"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0" />
            <span>Taxas, Meios & Canais</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 1: RECEBIMENTOS & CONCILIAÇÃO UNIFICADA                          */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {/* Pílulas Rápidas de Visão + Filtros Compactos */}
            <Card className="border-border/60 bg-card rounded-2xl p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: "all", label: `Todos os Lançamentos (${txCounts.all})` },
                    { id: "paid", label: `Pagos / Compensados (${txCounts.paid})` },
                    { id: "pending_pix", label: `Pendentes / Conciliação PIX (${txCounts.pendingPix})` },
                    { id: "faturado", label: `Reservas Faturadas / Boleto (${txCounts.faturado})` }
                  ] as const).map(pill => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setQuickViewFilter(pill.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        quickViewFilter === pill.id
                          ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                          : "bg-background text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {quickViewFilter === "pending_pix" && (
                  <Button
                    size="sm"
                    onClick={() => handleBatchReconcilePix(filteredTransactions)}
                    disabled={batchReconciling}
                    className="h-8 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    <ShieldCheck className={`w-3.5 h-3.5 ${batchReconciling ? "animate-spin" : ""}`} />
                    <span>{batchReconciling ? "Consultando Banco Inter..." : "Conciliar Fila PIX no Inter"}</span>
                  </Button>
                )}

                {quickViewFilter === "faturado" && (
                  <Button
                    size="sm"
                    onClick={() => handleTabChange("boletos")}
                    className="h-8 px-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Gerenciar Prazo & Boletos</span>
                  </Button>
                )}
              </div>

              {reconcileResult && (
                <div className={`p-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${
                  reconcileResult.reconciled
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200"
                    : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900 dark:text-amber-200"
                }`}>
                  <span>[{reconcileResult.code}] {reconcileResult.message}</span>
                  <button type="button" onClick={() => setReconcileResult(null)} className="text-[11px] underline ml-3">Fechar</button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Busca Instantânea</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Hóspede, empresa, reserva, flat, TxId..."
                      className="pl-8 text-xs h-8.5 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Período</Label>
                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger className="text-xs h-8.5 rounded-xl">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo o Histórico</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="7d">Últimos 7 dias</SelectItem>
                      <SelectItem value="month">Este Mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Meio de Pagamento</Label>
                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="text-xs h-8.5 rounded-xl">
                      <SelectValue placeholder="Método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Meios</SelectItem>
                      {(paymentsData?.paymentMethods || [
                        { id: "pix", name: "PIX Banco Inter" },
                        { id: "cartao_credito", name: "Cartão de Crédito" },
                        { id: "boleto_faturado", name: "Boleto Faturado" },
                        { id: "booking", name: "Booking.com" },
                        { id: "airbnb", name: "Airbnb" },
                        { id: "dinheiro", name: "Dinheiro em Espécie" }
                      ]).map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Canal da Reserva</Label>
                  <Select value={channelFilter} onValueChange={setChannelFilter}>
                    <SelectTrigger className="text-xs h-8.5 rounded-xl">
                      <SelectValue placeholder="Canal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Canais</SelectItem>
                      <SelectItem value="site">Site Próprio / Motor</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp / Direta</SelectItem>
                      <SelectItem value="booking">Booking.com</SelectItem>
                      <SelectItem value="airbnb">Airbnb</SelectItem>
                      <SelectItem value="b2b">Agência B2B / Corporativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Tabela de Recebimentos */}
            <Card className="border-border/60 bg-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/60 text-muted-foreground font-semibold">
                      <th className="p-3">Data / Hora</th>
                      <th className="p-3">Reserva / Cliente</th>
                      <th className="p-3">Flat</th>
                      <th className="p-3">Meio de Pagamento</th>
                      <th className="p-3 text-right">Valor Bruto</th>
                      <th className="p-3 text-right">Taxa Gateway</th>
                      <th className="p-3 text-right">Comissão Canal</th>
                      <th className="p-3 text-right font-bold text-foreground">Valor Líquido</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="p-10 text-center text-muted-foreground">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                          <span>Carregando recebimentos...</span>
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-10 text-center text-muted-foreground">
                          Nenhum lançamento encontrado para o filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((p: any) => {
                        const faturado = isFaturadoRow(p)
                        const pmObj = (paymentsData?.paymentMethods || []).find((m: any) => m.id === p.paymentMethod)
                        return (
                          <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-foreground block">
                                {p.paidAt ? format(parseISO(p.paidAt), "dd/MM/yyyy", { locale: ptBR }) : (p.date ? format(parseISO(p.date), "dd/MM/yyyy", { locale: ptBR }) : "—")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {p.paidAt ? format(parseISO(p.paidAt), "HH:mm", { locale: ptBR }) : (p.isPaid ? "Liquidado" : "Aguardando")}
                              </span>
                            </td>

                            <td className="p-3">
                              <span className="font-bold text-foreground block">{p.guestName || "Cliente"}</span>
                              {(p.companyName || p.agencyName) && (
                                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 block">
                                  {p.companyName || p.agencyName}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">{p.code}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">
                                  {p.channel || "direta"}
                                </Badge>
                              </div>
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              <Badge variant="outline" className="font-bold text-[11px]">
                                Apt {p.flatNumber}
                              </Badge>
                            </td>

                            <td className="p-3 whitespace-nowrap font-semibold text-foreground">
                              {faturado
                                ? "Boleto / Faturado a Prazo"
                                : pmObj?.name || (p.paymentMethod?.includes("pix") ? "PIX Banco Inter" : p.paymentMethod?.includes("cartao") ? "Cartão de Crédito" : p.paymentMethod || "Direto")}
                            </td>

                            <td className="p-3 text-right font-bold text-foreground whitespace-nowrap font-mono">
                              R$ {p.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>

                            <td className="p-3 text-right whitespace-nowrap font-mono">
                              {p.gatewayFeeAmount > 0 ? (
                                <div>
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold block">
                                    - R$ {p.gatewayFeeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({p.gatewayFeePct}%)</span>
                                </div>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">R$ 0,00</span>
                              )}
                            </td>

                            <td className="p-3 text-right whitespace-nowrap font-mono">
                              {p.channelCommissionAmount > 0 ? (
                                <div>
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold block">
                                    - R$ {p.channelCommissionAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({p.channelCommissionPct}%)</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">0%</span>
                              )}
                            </td>

                            <td className="p-3 text-right whitespace-nowrap font-mono">
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                R$ {p.netAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              <Badge className={
                                p.isPaid
                                  ? "bg-emerald-600 text-white font-bold text-[10px]"
                                  : faturado
                                    ? "bg-indigo-600 text-white font-bold text-[10px]"
                                    : "bg-amber-600 text-white font-bold text-[10px]"
                              }>
                                {p.isPaid ? "Pago" : faturado ? "Faturado a Prazo" : "Pendente"}
                              </Badge>
                            </td>

                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {faturado && !p.isPaid && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setBoletoSearch(p.code || "")
                                      handleTabChange("boletos")
                                    }}
                                    className="h-7 px-2 text-[10px] font-bold text-indigo-600 border-indigo-500/40 rounded-lg"
                                  >
                                    Ver Boleto
                                  </Button>
                                )}

                                {!p.isPaid && p.pixTxId && !faturado && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReconcile(p.code)}
                                    disabled={reconcilingCode === p.code}
                                    className="h-7 px-2 text-[10px] font-bold text-emerald-600 border-emerald-500/40 rounded-lg"
                                  >
                                    {reconcilingCode === p.code ? "Checando..." : "Conciliar PIX"}
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedPayment(p); setReceiptModalOpen(true) }}
                                  className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary/90 rounded-lg"
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  <span>{p.isPaid ? "Recibo" : "Detalhes"}</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 2: BOLETOS & FATURADO A PRAZO (PRÉ-BOLETOS + EMITIDOS INTER)     */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "boletos" && (
          <div className="space-y-4">
            {/* 5 KPIs do Ciclo Completo de Boletos (incluindo Aguardando Emissão!) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Card
                onClick={() => setBoletoStatusFilter(boletoStatusFilter === "aguardando_emissao" ? "all" : "aguardando_emissao")}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                  boletoStatusFilter === "aguardando_emissao"
                    ? "border-violet-600 bg-violet-500/15 ring-1 ring-violet-600"
                    : "border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10"
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">Aguardando Emissão</div>
                <div className="text-xl font-black text-violet-600 dark:text-violet-400 mt-1">
                  R$ {Number(boletosSummary.awaitingAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {boletosSummary.awaitingCount || 0} pré-boleto(s) editáveis
                </div>
              </Card>

              <Card
                onClick={() => setBoletoStatusFilter(boletoStatusFilter === "em_aberto" ? "all" : "em_aberto")}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                  boletoStatusFilter === "em_aberto"
                    ? "border-indigo-600 bg-indigo-500/15 ring-1 ring-indigo-600"
                    : "border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10"
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">Emitidos (A Vencer)</div>
                <div className="text-xl font-black text-indigo-600 mt-1">
                  R$ {Number(boletosSummary.openAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {boletosSummary.openCount || 0} título(s) no Banco Inter
                </div>
              </Card>

              <Card className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Vencendo Hoje</div>
                <div className="text-xl font-black text-amber-600 mt-1">
                  R$ {Number(boletosSummary.dueTodayAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {boletosSummary.dueTodayCount || 0} título(s) vencem hoje
                </div>
              </Card>

              <Card
                onClick={() => setBoletoStatusFilter(boletoStatusFilter === "vencido" ? "all" : "vencido")}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                  boletoStatusFilter === "vencido"
                    ? "border-rose-600 bg-rose-500/15 ring-1 ring-rose-600"
                    : "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10"
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">Vencidos / Em Atraso</div>
                <div className="text-xl font-black text-rose-600 mt-1">
                  R$ {Number(boletosSummary.overdueAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {boletosSummary.overdueCount || 0} título(s) c/ multa e juros
                </div>
              </Card>

              <Card
                onClick={() => setBoletoStatusFilter(boletoStatusFilter === "pago" ? "all" : "pago")}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                  boletoStatusFilter === "pago"
                    ? "border-emerald-600 bg-emerald-500/15 ring-1 ring-emerald-600"
                    : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Pagos / Liquidados</div>
                <div className="text-xl font-black text-emerald-600 mt-1">
                  R$ {Number(boletosSummary.paidAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {boletosSummary.paidCount || 0} título(s) compensado(s)
                </div>
              </Card>
            </div>

            <Card className="rounded-2xl border border-border bg-card shadow-xs">
              <CardHeader className="p-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Carteira Completa de Boletos & Reservas Faturadas (Banco Inter + PIX)</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Revise e edite o prazo de pagamento, pagador e destinatários antes mesmo da emissão ("Aguardando Emissão") ou gerencie os boletos já emitidos.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleProcessBoletoReminders}
                    disabled={processingReminders}
                    className="h-8 text-xs font-bold rounded-xl gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  >
                    <Bell className={`w-3.5 h-3.5 ${processingReminders ? "animate-spin" : ""}`} />
                    <span>{processingReminders ? "Disparando..." : "Disparar Lembretes de Vencimento"}</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchPayments}
                    disabled={loading}
                    className="h-8 text-xs font-bold rounded-xl gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>Atualizar</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      value={boletoSearch}
                      onChange={e => setBoletoSearch(e.target.value)}
                      placeholder="Buscar pagador, empresa, reserva, hóspede, nosso nº..."
                      className="pl-8 h-8.5 text-xs rounded-xl"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { id: "all", label: `Todos (${preBoletosList.length + boletosList.length})` },
                      { id: "aguardando_emissao", label: `Aguardando Emissão (${boletosSummary.awaitingCount || 0})` },
                      { id: "em_aberto", label: `Em Aberto (${boletosSummary.openCount || 0})` },
                      { id: "vencido", label: `Vencidos (${boletosSummary.overdueCount || 0})` },
                      { id: "pago", label: `Pagos (${boletosSummary.paidCount || 0})` },
                      { id: "cancelado", label: `Cancelados (${boletosSummary.cancelledCount || 0})` }
                    ] as const).map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setBoletoStatusFilter(st.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          boletoStatusFilter === st.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-background text-muted-foreground border-border hover:border-indigo-500/40"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border text-muted-foreground font-bold">
                        <th className="p-3">Pagador / Documento</th>
                        <th className="p-3">Reserva & Estadia</th>
                        <th className="p-3">Composição & NFS-e</th>
                        <th className="p-3">Prazo & Vencimento</th>
                        <th className="p-3 text-right">Valor & Encargos</th>
                        <th className="p-3">Destinatários Configurados</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {combinedBoletosRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-muted-foreground space-y-1">
                            <div className="font-bold text-foreground">Nenhum boleto ou pré-boleto encontrado para este filtro.</div>
                            <div className="text-[11px]">
                              Reservas marcadas como <strong>Boleto / Faturado PJ / Faturado B2B</strong> aparecem aqui automaticamente como <strong>Aguardando Emissão</strong>.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        combinedBoletosRows.map((item: any) => {
                          // ── LINHA DE PRÉ-BOLETO ("AGUARDANDO EMISSÃO") ──
                          if (item.isPreBoleto) {
                            const dr = item.billingDeliveryRecipients || item.billingRecipients || {}
                            const payerRoleLabel =
                              item.payerType === "company" ? "Empresa PJ" :
                              item.payerType === "agency" ? "Agência B2B" :
                              item.payerType === "requester" ? "Solicitante" :
                              item.payerType === "financial_responsible" ? "Resp. Financeiro" :
                              item.payerType === "custom" ? "Personalizado" : "Hóspede PF"

                            return (
                              <tr key={item.id} className="bg-violet-500/[0.03] hover:bg-violet-500/[0.07] transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                                    <span>{item.payerName || "Pagador a definir"}</span>
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/40 text-violet-700 dark:text-violet-300">
                                      {payerRoleLabel}
                                    </Badge>
                                  </div>
                                  {item.hasValidPayerDoc ? (
                                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{item.payerDoc}</div>
                                  ) : (
                                    <div className="text-[10px] font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Falta CPF/CNPJ do pagador</span>
                                    </div>
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="font-bold text-foreground">
                                    {item.reservationCode || `#${item.reservationId}`} • Flat {item.flatNumber}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    Hóspede: <strong className="text-foreground">{item.guestName}</strong>
                                  </div>
                                  <div className="text-[10px] font-mono text-muted-foreground">
                                    {formatBrDateStr(item.checkinDate)} até {formatBrDateStr(item.checkoutDate)}
                                  </div>
                                </td>

                                <td className="p-3">
                                  <Badge variant="outline" className="text-[10px] font-bold border-violet-500/40 text-violet-700 dark:text-violet-300">
                                    {item.consumptionMode === "separate"
                                      ? "2 Boletos (Hosp. + Consumo)"
                                      : "1 Boleto Unificado"}
                                  </Badge>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    Hosp: <strong>R$ {Number(item.accommodationAmount || 0).toFixed(2)}</strong>
                                    {Number(item.consumptionAmount || 0) > 0 && (
                                      <> • Cons: <strong>R$ {Number(item.consumptionAmount).toFixed(2)}</strong></>
                                    )}
                                  </div>
                                  {item.nfseNumber ? (
                                    <div className="text-[10px] text-emerald-600 font-bold mt-0.5">NFS-e #{item.nfseNumber} já emitida</div>
                                  ) : (
                                    <div className="text-[10px] text-muted-foreground">NFS-e será emitida junto</div>
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                                    Previsto: {formatBrDateStr(item.dueDate)}
                                  </div>
                                  <div className="text-[11px] font-semibold text-foreground mt-0.5">
                                    {item.isCustomDueDate
                                      ? "Vencimento fixo definido"
                                      : `Prazo: ${item.termDays} dias após check-out`}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {item.autoEmitBoletoOnCheckout ? "Emite automático no check-out" : "Emissão manual"}
                                  </div>
                                </td>

                                <td className="p-3 text-right font-mono">
                                  <div className="font-black text-sm text-foreground">
                                    R$ {Number(item.amount || 0).toFixed(2)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Multa {item.multaPct ?? 2}% • Juros {item.jurosMonthlyPct ?? 1}% a.m.
                                  </div>
                                </td>

                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1">
                                    {dr.guest && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Hóspede</Badge>}
                                    {dr.requester && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Solicitante</Badge>}
                                    {dr.company && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Empresa/Ag.</Badge>}
                                    {dr.financialResponsible && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Resp. Fin.</Badge>}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[190px]">
                                    {item.financialResponsible?.name
                                      ? `${item.financialResponsible.name} (${item.financialResponsible.email || item.financialResponsible.phone || "s/ contato"})`
                                      : `${dr.sendEmail !== false ? "E-mail" : ""}${dr.sendEmail !== false && dr.sendWhatsApp !== false ? " + " : ""}${dr.sendWhatsApp !== false ? "WhatsApp" : ""}`}
                                  </div>
                                </td>

                                <td className="p-3 text-center">
                                  <Badge className="bg-violet-600 text-white text-[10px] font-bold">
                                    Aguardando Emissão
                                  </Badge>
                                </td>

                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenPreBoletoModal(item)}
                                      className="h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1 border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Ver / Editar Dados</span>
                                    </Button>

                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenEmitFromPre(item)}
                                      className="h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                      <Zap className="w-3 h-3" />
                                      <span>Emitir Agora</span>
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }

                          // ── LINHA DE BOLETO JÁ EMITIDO NO BANCO INTER ──
                          const b = item
                          const todayIso = new Date().toISOString().slice(0, 10)
                          const isOverdue = b.status === "vencido" || ((b.status === "aberto" || b.status === "em_aberto") && Boolean(b.dueDate && b.dueDate < todayIso))
                          const isDueToday = (b.status === "aberto" || b.status === "em_aberto") && b.dueDate === todayIso
                          const isUnpaid = b.status !== "pago" && b.status !== "cancelado"
                          const dr = b.billingDeliveryRecipients || b.billingRecipients || {}

                          return (
                            <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-foreground">{b.payerName}</div>
                                <div className="text-[10px] font-mono text-muted-foreground">{b.payerDoc}</div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  Nosso Nº: {b.nossoNumero || "—"}
                                </div>
                              </td>

                              <td className="p-3">
                                <div className="font-bold text-foreground">
                                  {b.reservationCode || `#${b.reservationId}`} • Flat {b.flatNumber || "—"}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Hóspede: <strong className="text-foreground">{b.guestName || "—"}</strong>
                                </div>
                              </td>

                              <td className="p-3">
                                <Badge variant="outline" className="text-[10px] font-bold border-indigo-500/40 text-indigo-700 dark:text-indigo-300">
                                  {b.boletoKind === "accommodation"
                                    ? "1/2 • Só Hospedagem"
                                    : b.boletoKind === "consumption"
                                      ? "2/2 • Só Consumo"
                                      : "Unificado (Hosp + Consumo)"}
                                </Badge>
                                {b.nfseNumber && (
                                  <div className="text-[10px] text-emerald-600 font-bold mt-1">
                                    NFS-e #{b.nfseNumber}
                                  </div>
                                )}
                              </td>

                              <td className="p-3">
                                <div className="font-mono font-bold text-foreground">{formatBrDateStr(b.dueDate)}</div>
                                <div className="text-[10px] text-muted-foreground">Prazo: {b.termDays || 15} dias</div>
                                {isOverdue && (
                                  <Badge className="mt-0.5 bg-rose-600 text-white text-[9px] px-1.5 py-0">Em Atraso</Badge>
                                )}
                                {isDueToday && (
                                  <Badge className="mt-0.5 bg-amber-600 text-white text-[9px] px-1.5 py-0">Vence Hoje</Badge>
                                )}
                              </td>

                              <td className="p-3 text-right font-mono">
                                <div className="font-black text-sm text-foreground">
                                  R$ {Number(b.amount || 0).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Multa {b.multaPct ?? b.finePct ?? 2}% • Juros {b.jurosMonthlyPct ?? b.interestPct ?? 1}% a.m.
                                </div>
                              </td>

                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {dr.guest && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Hóspede</Badge>}
                                  {dr.requester && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Solicitante</Badge>}
                                  {dr.company && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Empresa</Badge>}
                                  {dr.financialResponsible && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Resp. Fin.</Badge>}
                                </div>
                                {b.financialResponsible?.name && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                                    Resp: {b.financialResponsible.name}
                                  </div>
                                )}
                              </td>

                              <td className="p-3 text-center">
                                {b.status === "pago" ? (
                                  <Badge className="bg-emerald-600 text-white text-[10px]">Pago</Badge>
                                ) : b.status === "cancelado" ? (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">Cancelado</Badge>
                                ) : isOverdue ? (
                                  <Badge className="bg-rose-600 text-white text-[10px]">Vencido</Badge>
                                ) : (
                                  <Badge className="bg-indigo-600 text-white text-[10px]">Em Aberto</Badge>
                                )}
                              </td>

                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(`/api/boletos/${b.id}/pdf`, "_blank")}
                                    className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1"
                                    title="Abrir PDF Oficial do Boleto Banco Inter"
                                  >
                                    <FileText className="w-3 h-3 text-indigo-600" />
                                    <span>PDF</span>
                                  </Button>

                                  {b.linhaDigitavel && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        navigator.clipboard.writeText(b.linhaDigitavel)
                                        toast({ title: "Linha Digitável copiada!", description: b.linhaDigitavel })
                                      }}
                                      className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1"
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>Linha</span>
                                    </Button>
                                  )}

                                  {b.pixCopiaECola && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        navigator.clipboard.writeText(b.pixCopiaECola)
                                        toast({ title: "PIX Copia e Cola copiado!" })
                                      }}
                                      className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1 text-emerald-600 border-emerald-500/30"
                                    >
                                      <QrCode className="w-3 h-3" />
                                      <span>PIX</span>
                                    </Button>
                                  )}

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenEditBoleto(b)}
                                    className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1 text-indigo-600 border-indigo-500/30"
                                  >
                                    <Sliders className="w-3 h-3" />
                                    <span>Editar</span>
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDispatchBoleto(b)}
                                    className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1"
                                    title="Reenviar PDF da NFS-e + Boleto por E-mail e WhatsApp"
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>Enviar</span>
                                  </Button>

                                  {isUnpaid && (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => handleMarkBoletoPaid(b)}
                                        className="h-7 px-2 text-[10px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                                      >
                                        Quitar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleReconcileBoleto(b)}
                                        className="h-7 px-1.5 text-[10px] font-bold rounded-lg"
                                        title="Consultar liquidação no Banco Inter"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleCancelBoleto(b)}
                                        className="h-7 px-1.5 text-[10px] font-bold rounded-lg text-rose-600"
                                        title="Cancelar boleto no Banco Inter"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 3: TAXAS, MEIOS DE PAGAMENTO & CANAIS (UNIFICADA E DINÂMICA)      */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "methods" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Coluna Esquerda (7 cols): Volume Real por Meio de Pagamento e Canal */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-border/60 bg-card rounded-2xl">
                <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-black flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      <span>Volume Liquidado por Meio de Pagamento</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Receita real compensada e líquido apurado em cada meio configurado.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPaymentMethodsModalOpen(true)}
                    className="text-xs font-bold gap-1.5 rounded-xl shrink-0"
                  >
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    <span>Gerenciar Formas de Pagamento</span>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  {(summary.byMethod || []).length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">Nenhum recebimento liquidado no período.</div>
                  ) : (
                    (summary.byMethod || [])
                      .slice()
                      .sort((a: any, b: any) => b.gross - a.gross)
                      .map((m: any) => {
                        const pct = summary.totalGross > 0 ? Math.round((m.gross / summary.totalGross) * 100) : 0
                        const pmObj = (paymentsData?.paymentMethods || []).find((pm: any) => pm.id === m.method)
                        return (
                          <div key={m.method} className="p-3 rounded-xl bg-muted/30 border border-border/60 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground capitalize">
                                {pmObj?.name || m.method} <span className="text-muted-foreground font-normal">({m.count} trans.)</span>
                              </span>
                              <div className="text-right font-mono">
                                <span className="font-black text-emerald-600">
                                  Líq. R$ {Number(m.net || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-muted-foreground ml-2">
                                  (Bruto R$ {Number(m.gross || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} • {pct}%)
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(3, pct)}%` }} />
                            </div>
                          </div>
                        )
                      })
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Desempenho e Margem por Canal de Reserva</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comparativo entre reservas diretas (0% comissão) e OTAs comissionadas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  {(summary.byChannel || []).length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">Nenhum canal com recebimento liquidado no período.</div>
                  ) : (
                    (summary.byChannel || [])
                      .slice()
                      .sort((a: any, b: any) => b.gross - a.gross)
                      .map((c: any) => {
                        const pct = summary.totalGross > 0 ? Math.round((c.gross / summary.totalGross) * 100) : 0
                        const retained = Math.max(0, Number((c.gross - c.net).toFixed(2)))
                        return (
                          <div key={c.channel} className="p-3 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between gap-3">
                            <div>
                              <span className="font-bold text-foreground uppercase text-[11px]">{c.channel}</span>
                              <div className="text-[10px] text-muted-foreground">{c.count} reservas pagas • {pct}% do volume</div>
                            </div>
                            <div className="text-right font-mono">
                              <div className="font-black text-foreground">
                                Bruto: R$ {Number(c.gross || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px]">
                                {retained > 0 ? (
                                  <span className="text-amber-600 font-semibold">
                                    Deduções: -R$ {retained.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} → Líq. R$ {Number(c.net || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-bold">100% Líquido (Sem comissão)</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Coluna Direita (5 cols): Configuração de Taxas e Comissões */}
            <div className="lg:col-span-5">
              <Card className="border-border/60 bg-card rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <Percent className="w-4 h-4 text-primary" />
                    <span>Tabela Padrão de Taxas & Comissões</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Defina os percentuais para cálculo automático da receita líquida no extrato.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveFees} className="space-y-4 text-xs">
                    <div className="p-3.5 bg-muted/40 rounded-xl space-y-3 border border-border/50">
                      <h3 className="font-bold text-xs text-foreground">1. Taxas de Processamento (Gateways)</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">PIX Banco Inter (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={feePixInter}
                            onChange={e => setFeePixInter(e.target.value)}
                            className="text-xs font-semibold rounded-xl"
                          />
                          <span className="text-[10px] text-muted-foreground">Padrão PJ Inter: 0.00%</span>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Cartão Crédito à Vista (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={feeMpSpot}
                            onChange={e => setFeeMpSpot(e.target.value)}
                            className="text-xs font-semibold rounded-xl"
                          />
                          <span className="text-[10px] text-muted-foreground">Mercado Pago: ~3.99%</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-muted/40 rounded-xl space-y-3 border border-border/50">
                      <div>
                        <h3 className="font-bold text-xs text-foreground">2. Comissões de Canais OTA</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Aplicadas apenas sobre reservas originadas na respectiva OTA. WhatsApp e Site têm 0%.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Booking.com (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={feeBooking}
                            onChange={e => setFeeBooking(e.target.value)}
                            className="text-xs font-semibold rounded-xl"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Airbnb (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={feeAirbnb}
                            onChange={e => setFeeAirbnb(e.target.value)}
                            className="text-xs font-semibold rounded-xl"
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={savingFees}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9.5 rounded-xl shadow-xs"
                    >
                      {savingFees ? "Salvando e recalculando..." : "Salvar Taxas & Recalcular Líquido"}
                    </Button>

                    {feeSuccessMsg && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 text-center font-semibold">
                        {feeSuccessMsg}
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: CONFIGURAR / EDITAR PRÉ-BOLETO ("AGUARDANDO EMISSÃO")         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={preBoletoModalOpen} onOpenChange={setPreBoletoModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border border-border rounded-3xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-violet-600" />
              <span>Dados que Serão Inseridos no Boleto • {activePreBoleto?.reservationCode}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confira e edite o pagador, o prazo de pagamento, a composição (1 ou 2 boletos) e os destinatários antes mesmo da emissão.
            </DialogDescription>
          </DialogHeader>

          {activePreBoleto && (
            <form onSubmit={e => handleSavePreBoleto(e, false)} className="space-y-4 text-xs pt-1">
              {/* Resumo de Valores da Reserva */}
              <div className="p-3.5 rounded-2xl bg-violet-500/10 border border-violet-500/30 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Hospedagem (NFS-e)</div>
                  <div className="text-base font-black text-emerald-600 font-mono">
                    R$ {Number(activePreBoleto.accommodationAmount || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Consumo / Extras</div>
                  <div className="text-base font-black text-amber-600 font-mono">
                    R$ {Number(activePreBoleto.consumptionAmount || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Total Previsto no Boleto</div>
                  <div className="text-base font-black text-violet-600 font-mono">
                    R$ {Number(activePreBoleto.amount || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Pagador que sairá no Boleto */}
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-2.5">
                <Label className="font-bold text-foreground block">1. Quem será o Pagador (Sacado) no Boleto?</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ...(activePreBoleto.companyName ? [{ id: "company", label: `Empresa (${activePreBoleto.companyName})` }] : []),
                    ...(activePreBoleto.agencyName ? [{ id: "agency", label: `Agência B2B (${activePreBoleto.agencyName})` }] : []),
                    { id: "guest", label: `Hóspede (${activePreBoleto.guestName})` },
                    { id: "financial_responsible", label: "Responsável Financeiro" },
                    { id: "custom", label: "Outro / Digitar Manualmente" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPbPayerType(opt.id as any)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        pbPayerType === opt.id
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-background text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {pbPayerType === "custom" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <Input
                      value={pbCustomPayerName}
                      onChange={e => setPbCustomPayerName(e.target.value)}
                      placeholder="Nome / Razão Social no Boleto"
                      className="h-8.5 text-xs rounded-xl"
                      required
                    />
                    <Input
                      value={pbCustomPayerDoc}
                      onChange={e => setPbCustomPayerDoc(e.target.value)}
                      placeholder="CPF ou CNPJ (obrigatório)"
                      className="h-8.5 text-xs rounded-xl font-mono"
                      required
                    />
                    <Input
                      value={pbCustomPayerEmail}
                      onChange={e => setPbCustomPayerEmail(e.target.value)}
                      placeholder="E-mail do Pagador"
                      className="h-8.5 text-xs rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground bg-background/80 p-2.5 rounded-xl border border-border/60 font-mono">
                    Pagador vinculado: <strong className="text-foreground font-sans">{
                      pbPayerType === "company" ? (activePreBoleto.companyName || activePreBoleto.payerName) :
                      pbPayerType === "agency" ? (activePreBoleto.agencyName || activePreBoleto.payerName) :
                      pbPayerType === "financial_responsible" ? (pbFinRespName || "Preencha o Resp. Financeiro abaixo") :
                      activePreBoleto.guestName
                    }</strong> • Doc: <strong>{
                      pbPayerType === "company" ? (activePreBoleto.companyCnpj || "Sem CNPJ") :
                      pbPayerType === "agency" ? (activePreBoleto.agencyCnpj || "Sem CNPJ") :
                      pbPayerType === "financial_responsible" ? (pbFinRespDoc || "Sem Doc") :
                      (activePreBoleto.guestDocument || "Sem CPF")
                    }</strong>
                  </div>
                )}
              </div>

              {/* Prazo de Pagamento, Vencimento e Encargos */}
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="font-bold text-foreground">2. Prazo de Pagamento & Vencimento</Label>
                  <Badge variant="outline" className="font-mono text-[11px] border-indigo-500/40 text-indigo-700 dark:text-indigo-300">
                    Vencimento resultante: {formatBrDateStr(pbCustomDueDate || addDaysPreview(activePreBoleto.checkoutDate, Number(pbTermDays) || 0))}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Prazo (dias após check-out)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={pbTermDays}
                      onChange={e => { setPbTermDays(e.target.value); if (pbCustomDueDate) setPbCustomDueDate("") }}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Ou Vencimento Fixo</Label>
                    <Input
                      type="date"
                      value={pbCustomDueDate}
                      onChange={e => setPbCustomDueDate(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Multa Atraso (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={pbMultaPct}
                      onChange={e => setPbMultaPct(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Juros ao Mês (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={pbJurosPct}
                      onChange={e => setPbJurosPct(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 1 Boleto vs 2 Boletos */}
              <div className="space-y-2">
                <Label className="font-bold">3. Composição dos Boletos</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPbConsumptionMode("single")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      pbConsumptionMode === "single"
                        ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                        : "bg-background border-border text-foreground"
                    }`}
                  >
                    <div className="text-xs font-black">1 Boleto Unificado (Hospedagem + Consumo)</div>
                    <div className={`text-[10px] mt-0.5 ${pbConsumptionMode === "single" ? "text-indigo-100" : "text-muted-foreground"}`}>
                      Soma hospedagem e eventuais extras em um único título
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPbConsumptionMode("separate")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      pbConsumptionMode === "separate"
                        ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                        : "bg-background border-border text-foreground"
                    }`}
                  >
                    <div className="text-xs font-black">2 Boletos Separados (1 Hosp. + 1 Consumo)</div>
                    <div className={`text-[10px] mt-0.5 ${pbConsumptionMode === "separate" ? "text-indigo-100" : "text-muted-foreground"}`}>
                      Separa diárias e consumo (permite pagador/vencimento distinto)
                    </div>
                  </button>
                </div>

                {pbConsumptionMode === "separate" && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold">
                      <input
                        type="checkbox"
                        checked={pbConsumptionSame}
                        onChange={e => setPbConsumptionSame(e.target.checked)}
                      />
                      <span>Usar mesmo pagador e prazo para o 2º boleto (Consumo)</span>
                    </label>
                    {!pbConsumptionSame && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          value={pbConsumptionPayerName}
                          onChange={e => setPbConsumptionPayerName(e.target.value)}
                          placeholder="Pagador do Consumo"
                          className="h-8 text-xs rounded-xl"
                        />
                        <Input
                          value={pbConsumptionPayerDoc}
                          onChange={e => setPbConsumptionPayerDoc(e.target.value)}
                          placeholder="CPF/CNPJ"
                          className="h-8 text-xs rounded-xl font-mono"
                        />
                        <Input
                          type="date"
                          value={pbConsumptionDueDate}
                          onChange={e => setPbConsumptionDueDate(e.target.value)}
                          className="h-8 text-xs rounded-xl font-mono"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Responsável Financeiro + Destinatários */}
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-2.5">
                <div className="font-bold text-foreground">4. Responsável Financeiro & Destinatários de Envio</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <Input
                    value={pbFinRespName}
                    onChange={e => setPbFinRespName(e.target.value)}
                    placeholder="Nome Resp. Financeiro"
                    className="h-8 text-xs rounded-xl"
                  />
                  <Input
                    value={pbFinRespEmail}
                    onChange={e => setPbFinRespEmail(e.target.value)}
                    placeholder="E-mail Financeiro"
                    className="h-8 text-xs rounded-xl"
                  />
                  <Input
                    value={pbFinRespPhone}
                    onChange={e => setPbFinRespPhone(e.target.value)}
                    placeholder="WhatsApp (DDD+Nº)"
                    className="h-8 text-xs rounded-xl font-mono"
                  />
                  <Input
                    value={pbFinRespDoc}
                    onChange={e => setPbFinRespDoc(e.target.value)}
                    placeholder="CPF/CNPJ Resp."
                    className="h-8 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <label className="flex items-center gap-1.5 p-2 rounded-xl border border-border bg-background cursor-pointer font-semibold">
                    <input type="checkbox" checked={pbRecGuest} onChange={e => setPbRecGuest(e.target.checked)} />
                    <span>Hóspede</span>
                  </label>
                  <label className="flex items-center gap-1.5 p-2 rounded-xl border border-border bg-background cursor-pointer font-semibold">
                    <input type="checkbox" checked={pbRecRequester} onChange={e => setPbRecRequester(e.target.checked)} />
                    <span>Solicitante</span>
                  </label>
                  <label className="flex items-center gap-1.5 p-2 rounded-xl border border-border bg-background cursor-pointer font-semibold">
                    <input type="checkbox" checked={pbRecCompany} onChange={e => setPbRecCompany(e.target.checked)} />
                    <span>Empresa/Agência</span>
                  </label>
                  <label className="flex items-center gap-1.5 p-2 rounded-xl border border-border bg-background cursor-pointer font-semibold">
                    <input type="checkbox" checked={pbRecFinResp} onChange={e => setPbRecFinResp(e.target.checked)} />
                    <span>Resp. Financeiro</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-indigo-600">
                      <input type="checkbox" checked={pbRecSendEmail} onChange={e => setPbRecSendEmail(e.target.checked)} />
                      <span>Enviar E-mail (PDFs)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-emerald-600">
                      <input type="checkbox" checked={pbRecSendWhatsApp} onChange={e => setPbRecSendWhatsApp(e.target.checked)} />
                      <span>Enviar WhatsApp</span>
                    </label>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-muted-foreground">
                    <Switch checked={pbAutoEmitOnCheckout} onCheckedChange={setPbAutoEmitOnCheckout} />
                    <span>Emitir automaticamente no Check-out</span>
                  </label>
                </div>
              </div>

              {/* Instruções / Observações + Salvar no CRM */}
              <div className="space-y-2">
                <Label className="font-bold">Observações / Instruções no Boleto</Label>
                <Input
                  value={pbNotes}
                  onChange={e => setPbNotes(e.target.value)}
                  placeholder="Ex: Centro de custo, número do pedido de compra, instruções internas..."
                  className="h-8.5 text-xs rounded-xl"
                />
                {(activePreBoleto.companyId || activePreBoleto.agencyId) && (
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-indigo-600 pt-1">
                    <input type="checkbox" checked={pbSaveToCrm} onChange={e => setPbSaveToCrm(e.target.checked)} />
                    <span>Salvar este prazo e destinatários também como padrão no cadastro da Empresa/Agência</span>
                  </label>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => setPreBoletoModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingPreBoleto}
                  onClick={e => handleSavePreBoleto(e as any, true)}
                  className="rounded-xl h-9 text-xs font-bold border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10 gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Salvar & Emitir Agora</span>
                </Button>
                <Button type="submit" disabled={savingPreBoleto} className="rounded-xl h-9 text-xs font-black bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingPreBoleto ? "Salvando..." : "Salvar Dados do Pré-Boleto"}</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: EMITIR AGORA (BOLETO BANCO INTER + NFS-E OPCIONAL)           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={emitBoletoModalOpen} onOpenChange={setEmitBoletoModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              <span>Emitir Boleto(s) Banco Inter Agora</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confirme os dados abaixo para registrar o boleto imediatamente no Banco Inter.
            </DialogDescription>
          </DialogHeader>

          {emitTargetPre && (
            <form onSubmit={handleConfirmEmitNow} className="space-y-4 text-xs pt-1">
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagador:</span>
                  <strong className="text-foreground">{emitTargetPre.payerName} ({emitTargetPre.payerDoc || "Sem doc"})</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reserva / Flat:</span>
                  <strong className="text-foreground">{emitTargetPre.reservationCode} • Flat {emitTargetPre.flatNumber}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento Configurado:</span>
                  <strong className="text-indigo-600 font-mono">{formatBrDateStr(emitTargetPre.dueDate)} ({emitTargetPre.termDays} dias)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Total do(s) Boleto(s):</span>
                  <strong className="text-emerald-600 font-mono text-sm">R$ {Number(emitTargetPre.amount || 0).toFixed(2)}</strong>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                  <div>
                    <div className="font-bold text-foreground">Emitir também a NFS-e de Hospedagem junto?</div>
                    <div className="text-[11px] text-muted-foreground">
                      {emitTargetPre.invoiceIssued ? `Já possui NFS-e #${emitTargetPre.nfseNumber} vinculada.` : "Gera a nota fiscal sobre o valor de hospedagem."}
                    </div>
                  </div>
                  <Switch checked={ebEmitNfseToo} onCheckedChange={setEbEmitNfseToo} disabled={Boolean(emitTargetPre.invoiceIssued)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                  <div>
                    <div className="font-bold text-foreground">Disparar E-mail e WhatsApp imediatamente?</div>
                    <div className="text-[11px] text-muted-foreground">Envia PDFs + Linha Digitável + PIX aos destinatários configurados.</div>
                  </div>
                  <Switch checked={ebAutoDispatch} onCheckedChange={setEbAutoDispatch} />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setEmitBoletoModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Voltar
                </Button>
                <Button type="submit" disabled={emittingBoletoPackage} className="rounded-xl h-9 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
                  {emittingBoletoPackage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>{emittingBoletoPackage ? "Emitindo no Inter..." : "Confirmar & Emitir Boleto"}</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: EDITAR BOLETO JÁ EMITIDO (SINCRONIZADO COM BANCO INTER)       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={editBoletoModalOpen} onOpenChange={setEditBoletoModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Editar Boleto #{editingBoleto?.code || editingBoleto?.id} (Banco Inter)</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Altere vencimento, valor, dados do pagador, multa/juros ou responsável financeiro com sincronização na API Inter.
            </DialogDescription>
          </DialogHeader>

          {editingBoleto && (
            <form onSubmit={handleSaveEditBoleto} className="space-y-3 text-xs pt-2">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="font-bold">Data de Vencimento</Label>
                  <Input
                    type="date"
                    value={editBoletoDueDate}
                    onChange={e => setEditBoletoDueDate(e.target.value)}
                    required
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Valor Nominal (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editBoletoAmount}
                    onChange={e => setEditBoletoAmount(e.target.value)}
                    required
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="font-bold">Nome / Razão Social do Pagador</Label>
                  <Input
                    value={editBoletoPayerName}
                    onChange={e => setEditBoletoPayerName(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">CPF / CNPJ do Pagador</Label>
                  <Input
                    value={editBoletoPayerDoc}
                    onChange={e => setEditBoletoPayerDoc(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="font-bold">Multa de Atraso (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editBoletoMultaPct}
                    onChange={e => setEditBoletoMultaPct(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Juros ao Mês (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editBoletoJurosPct}
                    onChange={e => setEditBoletoJurosPct(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-2">
                <div className="font-bold text-foreground">Responsável Financeiro</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    value={editBoletoFinRespName}
                    onChange={e => setEditBoletoFinRespName(e.target.value)}
                    placeholder="Nome"
                    className="h-8 text-xs rounded-xl"
                  />
                  <Input
                    value={editBoletoFinRespEmail}
                    onChange={e => setEditBoletoFinRespEmail(e.target.value)}
                    placeholder="E-mail"
                    className="h-8 text-xs rounded-xl"
                  />
                  <Input
                    value={editBoletoFinRespPhone}
                    onChange={e => setEditBoletoFinRespPhone(e.target.value)}
                    placeholder="WhatsApp"
                    className="h-8 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Observações Internas</Label>
                <Textarea
                  value={editBoletoNotes}
                  onChange={e => setEditBoletoNotes(e.target.value)}
                  rows={2}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditBoletoModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingBoletoEdit} className="rounded-xl h-9 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white">
                  {savingBoletoEdit ? "Sincronizando..." : "Salvar & Sincronizar Banco Inter"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 4: COMPROVANTE / DETALHES DE LIQUIDAÇÃO                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card text-foreground border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {selectedPayment?.isPaid ? (
                <>
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Comprovante de Liquidação Bancária</span>
                </>
              ) : (
                <>
                  <Building2 className="w-5 h-5 text-amber-600" />
                  <span>Demonstrativo de Cobrança / Faturamento</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selectedPayment?.isPaid
                ? "Registro auditável de pagamento recebido pela CorpFlats Hospedagens."
                : "Título aguardando compensação ou faturamento a prazo."}
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 text-xs py-2">
              <div className={`p-3.5 rounded-2xl flex items-center justify-between border ${
                selectedPayment.isPaid
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
              }`}>
                <div>
                  <span className={`text-[10px] font-bold uppercase block ${
                    selectedPayment.isPaid ? "text-emerald-800 dark:text-emerald-400" : "text-amber-800 dark:text-amber-400"
                  }`}>
                    {selectedPayment.isPaid ? "Valor Liquidado" : "Valor em Aberto"}
                  </span>
                  <span className={`text-2xl font-black ${
                    selectedPayment.isPaid ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                  }`}>
                    R$ {selectedPayment.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <Badge className={selectedPayment.isPaid ? "bg-emerald-600 text-white font-bold" : "bg-amber-600 text-white font-bold"}>
                  {selectedPayment.isPaid ? "Pago Integralmente" : "Aguardando Liquidação"}
                </Badge>
              </div>

              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border/60">
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Hóspede / Pagador:</span>
                  <span className="font-bold text-foreground">{selectedPayment.guestName}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Código da Reserva:</span>
                  <span className="font-mono font-bold text-foreground">{selectedPayment.code}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Apartamento:</span>
                  <span className="font-bold text-foreground">Apt {selectedPayment.flatNumber}</span>
                </div>
                {selectedPayment.paidAt && (
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground font-medium">Data de Compensação:</span>
                    <span className="font-semibold text-foreground">
                      {format(parseISO(selectedPayment.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                )}

                {selectedPayment.pixEndToEndId && (
                  <div className="space-y-1 pt-1 border-b border-border/40 pb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">End-to-End ID (BACEN):</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPayment.pixEndToEndId, "e2e")}
                        className="text-primary hover:underline text-[10px] flex items-center gap-1"
                      >
                        {copiedId === "e2e" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === "e2e" ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold break-all select-all block bg-background p-1.5 rounded-md border">
                      {selectedPayment.pixEndToEndId}
                    </span>
                  </div>
                )}

                {selectedPayment.mpPaymentId && !selectedPayment.pixEndToEndId && (
                  <div className="space-y-1 pt-1 border-b border-border/40 pb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">Transação Cartão (Mercado Pago):</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPayment.mpPaymentId, "mpid")}
                        className="text-primary hover:underline text-[10px] flex items-center gap-1"
                      >
                        {copiedId === "mpid" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === "mpid" ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-sky-700 dark:text-sky-400 font-bold break-all select-all block bg-background p-1.5 rounded-md border">
                      {selectedPayment.mpPaymentId}
                    </span>
                  </div>
                )}

                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-medium">Favorecido PJ:</span>
                  <span className="font-semibold text-foreground">CorpFlats (CNPJ 47.964.813/0001-65)</span>
                </div>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Bruto:</span>
                  <span className="font-bold text-foreground">R$ {selectedPayment.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>Taxa Gateway ({selectedPayment.gatewayFeePct}%):</span>
                  <span>- R$ {selectedPayment.gatewayFeeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Comissão Canal ({selectedPayment.channelCommissionPct}%):</span>
                  <span>- R$ {selectedPayment.channelCommissionAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/40 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                  <span>{selectedPayment.isPaid ? "Valor Líquido Creditado:" : "Valor Líquido Previsto:"}</span>
                  <span>R$ {selectedPayment.netAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setReceiptModalOpen(false)} className="text-xs rounded-xl">
              Fechar
            </Button>
            <Button type="button" size="sm" onClick={() => window.print()} className="bg-primary text-primary-foreground text-xs font-bold rounded-xl">
              Imprimir Comprovante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentMethodsModal
        open={paymentMethodsModalOpen}
        onOpenChange={setPaymentMethodsModalOpen}
        onSaved={fetchPayments}
      />
    </Shell>
  )
}
