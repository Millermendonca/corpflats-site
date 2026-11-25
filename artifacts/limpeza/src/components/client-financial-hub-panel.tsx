import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  QrCode,
  Receipt,
  Search,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  PublicBoletoItem,
  PublicNfseItem,
  PublicPreBoletoItem,
  copyTextReliably,
  formatDateBrShort,
  formatMoneyBr,
  getBoletoStatusBadgeMeta,
} from "@/components/financial-documents-section"

export interface FinancialHubSummary {
  overdueCount: number
  overdueAmount: number
  overdueWithChargesAmount: number
  dueTodayCount: number
  dueTodayAmount: number
  openCount: number
  openAmount: number
  openAllCount: number
  openAllAmount: number
  awaitingCount: number
  awaitingAmount: number
  paidCount: number
  paidAmount: number
  totalPendingCount: number
  totalPendingAmount: number
  invoicesCount: number
  invoicesAmount: number
}

interface ClientFinancialHubPanelProps {
  summary: FinancialHubSummary | null
  boletos: PublicBoletoItem[]
  preBoletos: PublicPreBoletoItem[]
  invoices: PublicNfseItem[]
  loading?: boolean
  linkedCompanies?: Array<{ id: number; name: string; cnpj?: string }>
  linkedAgencies?: Array<{ id: number; name: string; cnpj?: string }>
}

type StatusFilter = "all" | "vencido" | "vence_hoje" | "aberto" | "aguardando_emissao" | "pago"

function extractMonthKey(dateStr?: string | null): string {
  const s = String(dateStr || "").trim()
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  return ""
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const idx = Math.max(0, Math.min(11, Number(m) - 1))
  return `${months[idx]}/${y}`
}

export function ClientFinancialHubPanel({
  summary,
  boletos = [],
  preBoletos = [],
  invoices = [],
  loading = false,
  linkedCompanies = [],
  linkedAgencies = [],
}: ClientFinancialHubPanelProps) {
  const [subView, setSubView] = useState<"boletos" | "invoices">(() =>
    boletos.length === 0 && preBoletos.length === 0 && invoices.length > 0 ? "invoices" : "boletos"
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [monthFilter, setMonthFilter] = useState("all")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState("")
  const lastLiveMsgRef = useRef("")
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const triggerCopy = async (key: string, value: string, label: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    const ok = await copyTextReliably(value)
    setCopiedKey(ok ? key : null)
    setFailedKey(ok ? null : key)
    let msg = ok ? `${label} copiado` : `Falha ao copiar ${label}`
    if (msg === lastLiveMsgRef.current) msg += "\u00A0"
    lastLiveMsgRef.current = msg
    setLiveStatus(msg)
    timerRef.current = window.setTimeout(() => {
      setCopiedKey(null)
      setFailedKey(null)
      setLiveStatus("")
    }, 2400)
  }

  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    boletos.forEach((b) => {
      const mk = extractMonthKey(b.dueDate || b.issuedAt)
      if (mk) set.add(mk)
    })
    preBoletos.forEach((p) => {
      const mk = extractMonthKey(p.dueDate || p.checkoutDate)
      if (mk) set.add(mk)
    })
    invoices.forEach((inv) => {
      const mk = extractMonthKey(inv.dataEmissao)
      if (mk) set.add(mk)
    })
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [boletos, preBoletos, invoices])

  const combinedBillings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    const issuedTagged = boletos.map((b) => ({ kind: "issued" as const, status: b.displayStatus, item: b }))
    const preTagged = preBoletos.map((p) => ({ kind: "pre" as const, status: "aguardando_emissao", item: p }))
    const all = [...issuedTagged, ...preTagged]

    return all.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false
      if (monthFilter !== "all") {
        const mk = extractMonthKey(
          entry.kind === "issued"
            ? entry.item.dueDate || entry.item.issuedAt
            : entry.item.dueDate || entry.item.checkoutDate
        )
        if (mk !== monthFilter) return false
      }
      if (!q) return true
      const it: any = entry.item
      const hay = [
        it.code,
        it.nossoNumero,
        it.reservationCode,
        it.packageId,
        it.guestName,
        it.payerName,
        it.payerDocument,
        it.companyName,
        it.agencyName,
        it.flatNumber ? `flat ${it.flatNumber}` : "",
        it.linkedInvoice?.numeroNfse ? `nfse ${it.linkedInvoice.numeroNfse}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [boletos, preBoletos, statusFilter, monthFilter, searchTerm])

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (monthFilter !== "all" && extractMonthKey(inv.dataEmissao) !== monthFilter) return false
      if (!q) return true
      const hay = [
        inv.numeroNfse,
        inv.codigoVerificacao,
        inv.reservationCode,
        inv.packageCode,
        inv.guestName,
        inv.tomadorNome,
        inv.tomadorCpfCnpj,
        inv.flatNumber ? `flat ${inv.flatNumber}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [invoices, monthFilter, searchTerm])

  const s = summary || {
    overdueCount: 0,
    overdueAmount: 0,
    overdueWithChargesAmount: 0,
    dueTodayCount: 0,
    dueTodayAmount: 0,
    openCount: 0,
    openAmount: 0,
    openAllCount: 0,
    openAllAmount: 0,
    awaitingCount: 0,
    awaitingAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    totalPendingCount: 0,
    totalPendingAmount: 0,
    invoicesCount: invoices.length,
    invoicesAmount: invoices.reduce((acc, i) => acc + Number(i.valorServico || 0), 0),
  }

  if (loading) {
    return (
      <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs p-8 text-center">
        <p className="text-xs text-slate-500 font-semibold animate-pulse">
          Carregando boletos e notas fiscais...
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <span className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </span>

      {/* Empresas / Agências vinculadas ao escopo */}
      {(linkedCompanies.length > 0 || linkedAgencies.length > 0) && (
        <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 flex flex-wrap items-center gap-2 text-xs">
          <Building2 className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
          <span className="font-bold text-sky-950 dark:text-sky-200">
            Faturamento corporativo vinculado:
          </span>
          {linkedCompanies.map((c) => (
            <Badge key={`c_${c.id}`} variant="outline" className="bg-white dark:bg-slate-900 text-[11px] font-bold">
              {c.name}
              {c.cnpj ? ` (${c.cnpj})` : ""}
            </Badge>
          ))}
          {linkedAgencies.map((a) => (
            <Badge key={`a_${a.id}`} variant="outline" className="bg-white dark:bg-slate-900 text-[11px] font-bold">
              {a.name}
              {a.cnpj ? ` (${a.cnpj})` : ""}
            </Badge>
          ))}
        </div>
      )}

      {/* Faixa de KPIs Clicáveis */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setSubView("boletos")
            setStatusFilter(statusFilter === "vencido" ? "all" : "vencido")
          }}
          className={`text-left p-3 rounded-2xl border transition-all ${
            statusFilter === "vencido" && subView === "boletos"
              ? "border-rose-500 ring-2 ring-rose-500/25 bg-rose-50 dark:bg-rose-950/40"
              : "border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 hover:bg-rose-50/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-rose-600 block">
            Em Atraso
          </span>
          <span className="text-base font-black font-mono text-rose-700 dark:text-rose-400 block mt-0.5">
            R$ {formatMoneyBr(s.overdueWithChargesAmount || s.overdueAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.overdueCount} boleto(s)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubView("boletos")
            setStatusFilter(statusFilter === "vence_hoje" ? "all" : "vence_hoje")
          }}
          className={`text-left p-3 rounded-2xl border transition-all ${
            statusFilter === "vence_hoje" && subView === "boletos"
              ? "border-amber-500 ring-2 ring-amber-500/25 bg-amber-50 dark:bg-amber-950/40"
              : "border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-900 hover:bg-amber-50/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400 block">
            Vence Hoje
          </span>
          <span className="text-base font-black font-mono text-amber-800 dark:text-amber-300 block mt-0.5">
            R$ {formatMoneyBr(s.dueTodayAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.dueTodayCount} boleto(s)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubView("boletos")
            setStatusFilter(statusFilter === "aberto" ? "all" : "aberto")
          }}
          className={`text-left p-3 rounded-2xl border transition-all ${
            statusFilter === "aberto" && subView === "boletos"
              ? "border-indigo-500 ring-2 ring-indigo-500/25 bg-indigo-50 dark:bg-indigo-950/40"
              : "border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 hover:bg-indigo-50/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-400 block">
            Pendente
          </span>
          <span className="text-base font-black font-mono text-indigo-700 dark:text-indigo-300 block mt-0.5">
            R$ {formatMoneyBr(s.openAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.openCount} a vencer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubView("boletos")
            setStatusFilter(statusFilter === "aguardando_emissao" ? "all" : "aguardando_emissao")
          }}
          className={`text-left p-3 rounded-2xl border transition-all ${
            statusFilter === "aguardando_emissao" && subView === "boletos"
              ? "border-slate-500 ring-2 ring-slate-500/25 bg-slate-100 dark:bg-slate-800"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400 block">
            Aguard. Emissão
          </span>
          <span className="text-base font-black font-mono text-slate-800 dark:text-slate-200 block mt-0.5">
            R$ {formatMoneyBr(s.awaitingAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.awaitingCount} faturada(s)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubView("boletos")
            setStatusFilter(statusFilter === "pago" ? "all" : "pago")
          }}
          className={`text-left p-3 rounded-2xl border transition-all ${
            statusFilter === "pago" && subView === "boletos"
              ? "border-emerald-500 ring-2 ring-emerald-500/25 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 hover:bg-emerald-50/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400 block">
            Pago / Quitado
          </span>
          <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
            R$ {formatMoneyBr(s.paidAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.paidCount} boleto(s)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView("invoices")}
          className={`text-left p-3 rounded-2xl border transition-all ${
            subView === "invoices"
              ? "border-sky-600 ring-2 ring-sky-500/25 bg-sky-50 dark:bg-sky-950/40"
              : "border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 hover:bg-sky-50/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-400 block">
            NFS-e Emitidas
          </span>
          <span className="text-base font-black font-mono text-sky-800 dark:text-sky-300 block mt-0.5">
            R$ {formatMoneyBr(s.invoicesAmount)}
          </span>
          <span className="text-[10px] text-slate-500">{s.invoicesCount} nota(s)</span>
        </button>
      </div>

      {/* Card Principal: Sub-abas + Filtros + Listas */}
      <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#0F3D4C] dark:text-sky-400 shrink-0" />
                <span>Financeiro • Boletos &amp; Notas Fiscais (NFS-e)</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Consulte o status atualizado de todos os boletos faturados e baixe PDFs e XMLs das notas fiscais emitidas.
              </CardDescription>
            </div>
          </div>

          {/* Sub-abas em linha única rolável com indicador estrutural de borda */}
          <div
            role="tablist"
            aria-label="Seções do painel financeiro"
            className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === "boletos"}
              onClick={() => setSubView("boletos")}
              className={`shrink-0 relative px-4 py-2.5 text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                subView === "boletos"
                  ? "text-[#0F3D4C] dark:text-sky-300 after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[#0F3D4C] dark:after:border-sky-400"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Boletos &amp; Cobranças ({boletos.length + preBoletos.length})</span>
              {(s.overdueCount + s.dueTodayCount) > 0 && (
                <Badge className="bg-rose-600 text-white text-[10px] px-1.5 py-0">
                  {s.overdueCount + s.dueTodayCount}
                </Badge>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subView === "invoices"}
              onClick={() => setSubView("invoices")}
              className={`shrink-0 relative px-4 py-2.5 text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                subView === "invoices"
                  ? "text-[#0F3D4C] dark:text-sky-300 after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[#0F3D4C] dark:after:border-sky-400"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Receipt className="w-3.5 h-3.5 shrink-0" />
              <span>Notas Fiscais / NFS-e ({invoices.length})</span>
            </button>
          </div>

          {/* Barra de Busca + Filtro de Mês */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por reserva, hóspede, flat, nº boleto, nº NFS-e ou pagador..."
                className="pl-9 h-9 rounded-xl text-xs"
              />
            </div>

            {availableMonths.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  aria-label="Filtrar por mês"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
                >
                  <option value="all">Todos os períodos</option>
                  {availableMonths.map((mk) => (
                    <option key={mk} value={mk}>
                      {formatMonthLabel(mk)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Pills de Status (na aba de Boletos) */}
          {subView === "boletos" && (
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {(
                [
                  { id: "all", label: `Todos (${boletos.length + preBoletos.length})` },
                  { id: "vencido", label: `Em Atraso (${s.overdueCount})` },
                  { id: "vence_hoje", label: `Vence Hoje (${s.dueTodayCount})` },
                  { id: "aberto", label: `Pendente (${s.openCount})` },
                  { id: "aguardando_emissao", label: `Aguardando Emissão (${s.awaitingCount})` },
                  { id: "pago", label: `Pago / Quitado (${s.paidCount})` },
                ] as Array<{ id: StatusFilter; label: string }>
              ).map((pill) => {
                const active = statusFilter === pill.id
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                      active
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] dark:bg-sky-600 dark:border-sky-600"
                        : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {pill.label}
                  </button>
                )
              })}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {subView === "boletos" ? (
            combinedBillings.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-500">
                  Nenhum boleto encontrado para os filtros selecionados.
                </p>
                {(statusFilter !== "all" || searchTerm || monthFilter !== "all") && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStatusFilter("all")
                      setSearchTerm("")
                      setMonthFilter("all")
                    }}
                    className="rounded-xl text-xs font-bold"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {combinedBillings.map((entry) => {
                  if (entry.kind === "pre") {
                    const pre = entry.item
                    const meta = getBoletoStatusBadgeMeta("aguardando_emissao")
                    return (
                      <div
                        key={`hub_pre_${pre.id}`}
                        className={`p-4 rounded-2xl border space-y-2 ${meta.cardClassName}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Clock className="w-4 h-4 text-slate-600 shrink-0" />
                              <span className="font-black text-xs text-slate-900 dark:text-slate-100">
                                {pre.reservationCode || pre.code}
                              </span>
                              {pre.flatNumber && (
                                <Badge variant="outline" className="text-[10px] font-bold">
                                  Flat {pre.flatNumber}
                                </Badge>
                              )}
                              <Badge className={`text-[10px] font-bold border ${meta.className}`}>
                                {meta.label}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                              {pre.guestName && <span>Hóspede: <strong>{pre.guestName}</strong></span>}
                              {pre.payerName && <span>Pagador: {pre.payerName}</span>}
                              <span>Venc. previsto: <strong>{formatDateBrShort(pre.dueDate)}</strong></span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                              R$ {formatMoneyBr(pre.amount)}
                            </div>
                            <span className="text-[10px] text-slate-500">Valor previsto</span>
                          </div>
                        </div>

                        {pre.linkedInvoice && (
                          <div className="pt-1 flex flex-wrap gap-1.5">
                            <a
                              href={pre.linkedInvoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 min-h-8 py-1 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white text-[11px] font-bold"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>Baixar NFS-e Nº {pre.linkedInvoice.numeroNfse}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    )
                  }

                  const b = entry.item
                  const meta = getBoletoStatusBadgeMeta(b.displayStatus, b.daysOverdue)
                  const cleanLinha = String(b.linhaDigitavel || "").replace(/\D/g, "")
                  const copyLinha = cleanLinha.length >= 44 && cleanLinha.length <= 48 ? cleanLinha : (b.linhaDigitavel || "")

                  return (
                    <div
                      key={`hub_bol_${b.id || b.code}`}
                      className={`p-4 rounded-2xl border space-y-3 ${meta.cardClassName}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                              Boleto #{b.code}
                            </span>
                            <Badge className={`text-[10px] font-bold border ${meta.className}`}>
                              {meta.label}
                            </Badge>
                            {b.reservationCode && (
                              <Badge variant="outline" className="text-[10px] font-mono font-bold bg-white/80 dark:bg-slate-900">
                                {b.reservationCode}
                              </Badge>
                            )}
                            {b.flatNumber && (
                              <Badge variant="outline" className="text-[10px] font-bold bg-white/80 dark:bg-slate-900">
                                Flat {b.flatNumber}
                              </Badge>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>
                              Vencimento: <strong className="text-slate-900 dark:text-slate-200">{formatDateBrShort(b.dueDate)}</strong>
                            </span>
                            {b.guestName && <span>Hóspede: <strong>{b.guestName}</strong></span>}
                            {b.payerName && <span>Pagador: {b.payerName}</span>}
                            {b.nossoNumero && <span className="font-mono">Nosso Nº: {b.nossoNumero}</span>}
                            {b.isPaid && b.paidAt && (
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                ✓ Quitado em {formatDateBrShort(b.paidAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-black text-base text-slate-900 dark:text-slate-100">
                            R$ {formatMoneyBr(b.isPaid ? (b.paidAmount || b.amount) : b.amount)}
                          </div>
                          {b.isOverdue && b.updatedTotalWithCharges && b.updatedTotalWithCharges > b.amount && (
                            <div className="text-[10.5px] font-bold text-rose-700 dark:text-rose-400 flex items-center justify-end gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>c/ multa e juros: R$ {formatMoneyBr(b.updatedTotalWithCharges)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                        <a
                          href={b.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px]"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span>Baixar PDF</span>
                        </a>

                        {!b.isPaid && copyLinha && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => triggerCopy(`hub_linha_${b.id}`, copyLinha, "Linha digitável")}
                            className="min-h-8 h-auto py-1.5 px-3 rounded-xl text-[11px] font-bold gap-1.5 bg-white dark:bg-slate-900"
                          >
                            {copiedKey === `hub_linha_${b.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {copiedKey === `hub_linha_${b.id}`
                                ? "Linha Copiada!"
                                : failedKey === `hub_linha_${b.id}`
                                  ? "Falha ao copiar"
                                  : "Copiar Linha"}
                            </span>
                          </Button>
                        )}

                        {!b.isPaid && b.pixCopiaECola && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => triggerCopy(`hub_pix_${b.id}`, b.pixCopiaECola || "", "Código PIX")}
                            className="min-h-8 h-auto py-1.5 px-3 rounded-xl text-[11px] font-bold gap-1.5 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                          >
                            {copiedKey === `hub_pix_${b.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <QrCode className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {copiedKey === `hub_pix_${b.id}`
                                ? "PIX Copiado!"
                                : failedKey === `hub_pix_${b.id}`
                                  ? "Falha ao copiar"
                                  : "Copiar PIX"}
                            </span>
                          </Button>
                        )}

                        {!b.isPaid && b.copyPageUrl && (
                          <a
                            href={b.copyPageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1 px-2.5 min-h-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span>QR / Pagar</span>
                          </a>
                        )}

                        {b.linkedInvoice && (
                          <a
                            href={b.linkedInvoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-[11px] sm:ml-auto"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>NFS-e Nº {b.linkedInvoice.numeroNfse}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : filteredInvoices.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">
                Nenhuma Nota Fiscal (NFS-e) autorizada encontrada para os filtros selecionados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((inv) => (
                <div
                  key={`hub_inv_${inv.id || inv.numeroNfse}`}
                  className="p-4 rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        NFS-e Nº {inv.numeroNfse}
                      </span>
                      <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                        Autorizada
                      </Badge>
                      {inv.reservationCode && (
                        <Badge variant="outline" className="text-[10px] font-mono font-bold bg-white dark:bg-slate-900">
                          {inv.reservationCode}
                        </Badge>
                      )}
                      {inv.flatNumber && (
                        <Badge variant="outline" className="text-[10px] font-bold bg-white dark:bg-slate-900">
                          Flat {inv.flatNumber}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Emissão: <strong>{formatDateBrShort(inv.dataEmissao)}</strong></span>
                      {inv.guestName && <span>Hóspede: <strong>{inv.guestName}</strong></span>}
                      {inv.tomadorNome && (
                        <span>
                          Tomador: {inv.tomadorNome}
                          {inv.tomadorCpfCnpj ? ` (${inv.tomadorCpfCnpj})` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-400 mr-1">
                      R$ {formatMoneyBr(inv.valorServico)}
                    </span>
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-[11px]"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>Baixar PDF</span>
                    </a>
                    <a
                      href={inv.xmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-800 dark:text-slate-200 font-bold text-[11px]"
                    >
                      <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                      <span>XML</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
