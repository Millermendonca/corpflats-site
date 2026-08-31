import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  CreditCard, DollarSign, TrendingUp, TrendingDown, Percent, Calculator, Building2, Calendar, 
  ArrowUpRight, ShieldCheck, Sparkles, Sliders, AlertCircle, Plus, Trash2, 
  CheckCircle2, Clock, Check, Copy, FileText, RefreshCw, Send, Users, Wallet, Download, Search,
  ExternalLink, ArrowDownLeft, Shield, Filter, Eye, ArrowRight
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AccessDenied } from "@/components/access-denied"

export default function Payments() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  // Tabs
  const [activeTab, setActiveTab] = useState<"history" | "methods" | "feeSettings" | "reconcile">("history")
  
  // Data States
  const [paymentsData, setPaymentsData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filtros
  const [periodFilter, setPeriodFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [flatFilter, setFlatFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Modal de Comprovante Detalhado
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null)

  // Modal / Edição de Taxas
  const [feePixInter, setFeePixInter] = useState("0")
  const [feeMpSpot, setFeeMpSpot] = useState("3.99")
  const [feeMpInstallments, setFeeMpInstallments] = useState("5.49")
  const [feeBooking, setFeeBooking] = useState("13.0")
  const [feeAirbnb, setFeeAirbnb] = useState("3.0")
  const [savingFees, setSavingFees] = useState(false)
  const [feeSuccessMsg, setFeeSuccessMsg] = useState("")

  // Conciliação Ativa
  const [reconcilingCode, setReconcilingCode] = useState<string | null>(null)
  const [reconcileResult, setReconcileResult] = useState<any | null>(null)

  // Fetch de Pagamentos
  const fetchPayments = async () => {
    setLoading(true)
    try {
      let url = `/api/finance/payments?method=${encodeURIComponent(methodFilter)}&channel=${encodeURIComponent(channelFilter)}&status=${encodeURIComponent(statusFilter)}&flatId=${encodeURIComponent(flatFilter)}`
      
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

      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`
      }

      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setPaymentsData(data)
        if (data.feeSettings) {
          setFeePixInter(String(data.feeSettings.pixInterRate || 0))
          setFeeMpSpot(String(data.feeSettings.mpCreditSpotRate || 3.99))
          setFeeMpInstallments(String(data.feeSettings.mpCreditInstallmentRate || 5.49))
          setFeeBooking(String(data.feeSettings.bookingCommissionRate || 13))
          setFeeAirbnb(String(data.feeSettings.airbnbCommissionRate || 3))
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
  }, [periodFilter, methodFilter, channelFilter, statusFilter, flatFilter])

  // Copiar identificadores
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Salvar Novas Taxas
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
        setFeeSuccessMsg("Taxas e comissões atualizadas com sucesso! Os valores líquidos foram recalculados.")
        fetchPayments()
        setTimeout(() => setFeeSuccessMsg(""), 4000)
      }
    } catch {}
    setSavingFees(false)
  }

  // Reconciliar Pagamento em Tempo Real na API do Inter
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

  // Exportar Relatório CSV
  const handleExportCSV = () => {
    if (!paymentsData?.payments || paymentsData.payments.length === 0) return
    const headers = ["Data", "Código", "Hóspede/Cliente", "Apartamento", "Canal", "Forma Pagamento", "Valor Bruto (R$)", "Taxa Gateway (R$)", "Comissão Canal (R$)", "Valor Líquido (R$)", "Status", "EndToEnd ID / TxId"]
    const rows = paymentsData.payments.map((p: any) => [
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

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `relatorio_pagamentos_corpflats_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loadingUser) {
    return (
      <Shell>
        <div className="p-8 text-center text-sm text-slate-500">Carregando permissões...</div>
      </Shell>
    )
  }

  if (user?.role !== "admin") {
    return (
      <Shell>
        <AccessDenied />
      </Shell>
    )
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

  return (
    <Shell>
      <div className="space-y-6 pb-12">
        {/* Cabeçalho Principal */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                  <span>Central de Pagamentos & Recebíveis</span>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                    ⚡ Conciliação em Tempo Real
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Gestão completa de recebimentos, taxas de gateways, comissões de canais e conciliação bancária oficial.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs font-semibold h-9 gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </Button>

            <Button
              size="sm"
              onClick={() => { setSyncing(true); fetchPayments().then(() => setSyncing(false)) }}
              disabled={syncing || loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Sincronizando..." : "Sincronizar"}</span>
            </Button>
          </div>
        </div>

        {/* 4 Cards de Métricas Principais (KPIs) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Receita Bruta Transacionada */}
          <Card className="border-border/60 shadow-xs bg-card">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Total Bruto Recebido</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                R$ {summary.totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>{summary.totalPaidCount} transações pagas</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% compensado</span>
              </div>
            </CardContent>
          </Card>

          {/* 2. Taxas de Gateways (Inter 0%, MP 3.99%) */}
          <Card className="border-border/60 shadow-xs bg-card">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Taxas de Gateways (PIX/Cartão)</span>
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                - R$ {summary.totalFees.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>PIX Inter: 0% taxa</span>
                <span className="font-semibold">Mercado Pago ~3.99%</span>
              </div>
            </CardContent>
          </Card>

          {/* 3. Comissões de Canais (OTAs Booking / Airbnb) */}
          <Card className="border-border/60 shadow-xs bg-card">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Comissões OTAs (Booking/Airbnb)</span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                - R$ {summary.totalCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Total Deduções: R$ {summary.totalDeductions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className="font-semibold text-amber-600">Comissões</span>
              </div>
            </CardContent>
          </Card>

          {/* 4. Receita Líquida Real */}
          <Card className="border-border/60 shadow-xs bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800">
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
                <span className="font-bold">✓ Caixa Efetivo</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas de Navegação */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "history"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>📋 Histórico de Pagamentos Recebidos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("methods")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "methods"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>💳 Formas de Pagamento & Canais</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("feeSettings")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "feeSettings"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>⚙️ Tabela de Taxas & Comissões</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reconcile")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "reconcile"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🔍 Conciliação Bancária Ativa</span>
            {summary.totalPendingCount > 0 && (
              <Badge className="bg-amber-600 text-white font-bold text-[9px] px-1.5 py-0 h-4 ml-1">
                {summary.totalPendingCount}
              </Badge>
            )}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 1: HISTÓRICO DE PAGAMENTOS RECEBIDOS                             */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {/* Barra de Filtros */}
            <Card className="border-border/60 bg-card p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Buscar</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && fetchPayments()}
                      placeholder="Nome, código, TxId..."
                      className="pl-8 text-xs h-8"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Período</Label>
                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger className="text-xs h-8">
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
                  <Label className="text-[11px] font-semibold text-muted-foreground">Forma de Pagamento</Label>
                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Métodos</SelectItem>
                      <SelectItem value="pix">⚡ PIX Banco Inter</SelectItem>
                      <SelectItem value="cartao">💳 Cartão (Mercado Pago)</SelectItem>
                      <SelectItem value="booking_payments">🔵 Booking Payments</SelectItem>
                      <SelectItem value="airbnb_payout">🔴 Airbnb Payout</SelectItem>
                      <SelectItem value="direto_manual">💵 Dinheiro / Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Canal de Origem</Label>
                  <Select value={channelFilter} onValueChange={setChannelFilter}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Canal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Canais</SelectItem>
                      <SelectItem value="site">🌐 Site Próprio / Motor</SelectItem>
                      <SelectItem value="whatsapp">💬 WhatsApp / Direta</SelectItem>
                      <SelectItem value="booking">🔵 Booking.com</SelectItem>
                      <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="paid">✓ Pagos / Compensados</SelectItem>
                      <SelectItem value="pending">⏳ Aguardando Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={fetchPayments}
                    className="w-full text-xs h-8 font-semibold"
                  >
                    Filtrar Resultados
                  </Button>
                </div>
              </div>
            </Card>

            {/* Tabela de Pagamentos */}
            <Card className="border-border/60 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/60 text-muted-foreground font-semibold">
                      <th className="p-3">Data / Hora</th>
                      <th className="p-3">Reserva / Hóspede</th>
                      <th className="p-3">Flat</th>
                      <th className="p-3">Forma de Pagamento</th>
                      <th className="p-3 text-right">Valor Bruto</th>
                      <th className="p-3 text-right">Taxa Gateway</th>
                      <th className="p-3 text-right">Comissão OTA</th>
                      <th className="p-3 text-right font-bold text-foreground">Valor Líquido</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                          <span>Carregando histórico de pagamentos...</span>
                        </td>
                      </tr>
                    ) : !paymentsData?.payments || paymentsData.payments.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          Nenhum pagamento encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      paymentsData.payments.map((p: any) => {
                        const isPix = p.paymentMethod?.includes("pix")
                        const isCard = p.paymentMethod?.includes("cartao")
                        const isBooking = p.channel === "booking"
                        const isAirbnb = p.channel === "airbnb"

                        return (
                          <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                            {/* Data/Hora */}
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                {p.paidAt ? format(parseISO(p.paidAt), "dd/MM/yyyy", { locale: ptBR }) : (p.date ? format(parseISO(p.date), "dd/MM/yyyy", { locale: ptBR }) : "-")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {p.paidAt ? format(parseISO(p.paidAt), "HH:mm:ss", { locale: ptBR }) : "Horário pendente"}
                              </span>
                            </td>

                            {/* Hóspede & Código */}
                            <td className="p-3">
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {p.guestName || "Hóspede sem nome"}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {p.code}
                              </span>
                            </td>

                            {/* Flat */}
                            <td className="p-3 whitespace-nowrap">
                              <Badge variant="outline" className="font-bold text-[11px]">
                                Apt {p.flatNumber}
                              </Badge>
                            </td>

                            {/* Forma de Pagamento */}
                            <td className="p-3 whitespace-nowrap">
                              {isPix ? (
                                <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span>⚡ PIX Banco Inter</span>
                                </div>
                              ) : isCard ? (
                                <div className="flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-400">
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>💳 Cartão Mercado Pago</span>
                                </div>
                              ) : isBooking ? (
                                <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400">
                                  <span>🔵 Booking Payments</span>
                                </div>
                              ) : isAirbnb ? (
                                <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400">
                                  <span>🔴 Airbnb Payout</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground font-medium">💵 Manual / Direto</span>
                              )}
                            </td>

                            {/* Valor Bruto */}
                            <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              R$ {p.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>

                            {/* Taxa Gateway */}
                            <td className="p-3 text-right whitespace-nowrap">
                              {p.gatewayFeeAmount > 0 ? (
                                <div>
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold block">
                                    - R$ {p.gatewayFeeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({p.gatewayFeePct}%)</span>
                                </div>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">R$ 0,00 (0%)</span>
                              )}
                            </td>

                            {/* Comissão OTA */}
                            <td className="p-3 text-right whitespace-nowrap">
                              {p.channelCommissionAmount > 0 ? (
                                <div>
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold block">
                                    - R$ {p.channelCommissionAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({p.channelCommissionPct}%)</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">0% (Site/Direta)</span>
                              )}
                            </td>

                            {/* Valor Líquido */}
                            <td className="p-3 text-right whitespace-nowrap">
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                R$ {p.netAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="p-3 text-center whitespace-nowrap">
                              <Badge className={p.isPaid ? "bg-emerald-600 text-white font-bold text-[10px]" : "bg-amber-600 text-white font-bold text-[10px]"}>
                                {p.isPaid ? "✓ Pago" : "Pendente"}
                              </Badge>
                            </td>

                            {/* Ações */}
                            <td className="p-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedPayment(p); setReceiptModalOpen(true); }}
                                  className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary/90"
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  <span>Ver Recibo</span>
                                </Button>

                                {!p.isPaid && p.pixTxId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReconcile(p.code)}
                                    disabled={reconcilingCode === p.code}
                                    className="h-7 px-2 text-[10px] font-bold text-emerald-600 border-emerald-500/40"
                                  >
                                    {reconcilingCode === p.code ? "Checando..." : "Reconciliar"}
                                  </Button>
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
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 2: FORMAS DE PAGAMENTO & DESEMPENHO POR CANAL                    */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "methods" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Comparativo por Método */}
              <Card className="border-border/60 bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <span>Volume por Forma de Pagamento</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comparativo de receita bruta, taxas descontadas e líquido por gateway.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {/* PIX Banco Inter */}
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span className="text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                          ⚡ PIX Banco Inter (mTLS Oficial)
                        </span>
                        <Badge className="bg-emerald-600 text-white font-bold text-[10px]">0% Taxa de Gateway</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Liquidação instantânea em conta PJ do Banco Inter. Custo de transação <strong>R$ 0,00</strong>.
                      </p>
                    </div>

                    {/* Mercado Pago Checkout Pro */}
                    <div className="p-3 bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span className="text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                          💳 Cartão de Crédito Mercado Pago
                        </span>
                        <Badge className="bg-sky-600 text-white font-bold text-[10px]">3.99% Taxa</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Permite parcelamento em até 12x para o hóspede com repasse direto via Checkout Pro.
                      </p>
                    </div>

                    {/* OTAs (Booking / Airbnb) */}
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span className="text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                          🌐 Plataformas OTAs (Booking.com & Airbnb)
                        </span>
                        <Badge className="bg-amber-600 text-white font-bold text-[10px]">13% - 15% Comissão</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Pagamentos processados pelas OTAs com repasse quinzenal/mensal deduzida a comissão de canal.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Estratégia de Maximização de Lucro Líquido */}
              <Card className="border-border/60 bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Economia com Vendas Diretas & PIX</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Vantagem financeira de vendas pelo site próprio da CorpFlats.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2">
                    <span className="font-bold text-xs text-emerald-800 dark:text-emerald-300 block">
                      💡 Ganho Médio por Reserva Direta:
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      Ao vender diretamente pelo <strong>Motor de Reservas CorpFlats</strong> com <strong>PIX Banco Inter</strong>, sua margem líquida aumenta em <strong>13% a 18%</strong> por não pagar comissão para Booking/Airbnb nem taxas abusivas de cartão.
                    </p>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-border/40">
                      <span className="text-muted-foreground">Reserva de R$ 1.000 no Booking.com:</span>
                      <span className="font-bold text-rose-600">Líquido ~R$ 870,00</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border/40">
                      <span className="text-muted-foreground">Reserva de R$ 1.000 no Site (PIX Inter):</span>
                      <span className="font-black text-emerald-600">Líquido R$ 1.000,00 (100%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 3: TABELA DE TAXAS & COMISSÕES                                   */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "feeSettings" && (
          <div className="max-w-2xl mx-auto space-y-4">
            <Card className="border-border/60 bg-card">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <span>Configuração de Taxas e Comissões</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Ajuste as taxas praticadas pelos seus intermediadores para cálculo automático e conciliação do valor líquido.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveFees} className="space-y-4 text-xs">
                  <div className="p-3 bg-muted/40 rounded-xl space-y-3">
                    <h3 className="font-bold text-xs text-foreground">1. Gateways de Pagamento (Processamento)</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Taxa PIX Banco Inter (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={feePixInter}
                          onChange={e => setFeePixInter(e.target.value)}
                          className="text-xs font-semibold"
                        />
                        <span className="text-[10px] text-muted-foreground">Padrão: 0.00% (gratuito)</span>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Taxa Cartão Crédito à Vista (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={feeMpSpot}
                          onChange={e => setFeeMpSpot(e.target.value)}
                          className="text-xs font-semibold"
                        />
                        <span className="text-[10px] text-muted-foreground">Padrão Mercado Pago: 3.99%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/40 rounded-xl space-y-3">
                    <h3 className="font-bold text-xs text-foreground">2. Comissões de Canais de Venda (OTAs)</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Comissão Booking.com (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={feeBooking}
                          onChange={e => setFeeBooking(e.target.value)}
                          className="text-xs font-semibold"
                        />
                        <span className="text-[10px] text-muted-foreground">Padrão: 13.00% a 15.00%</span>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Comissão Airbnb (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={feeAirbnb}
                          onChange={e => setFeeAirbnb(e.target.value)}
                          className="text-xs font-semibold"
                        />
                        <span className="text-[10px] text-muted-foreground">Padrão: 3.00% (anfitrião)</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={savingFees}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 shadow-xs"
                  >
                    {savingFees ? "Salvando e Recalculando..." : "Salvar Configurações & Recalcular Histórico"}
                  </Button>

                  {feeSuccessMsg && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 text-center font-semibold">
                      ✓ {feeSuccessMsg}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* ABA 4: CONCILIAÇÃO BANCÁRIA ATIVA                                    */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "reconcile" && (
          <div className="space-y-4">
            <Card className="border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-foreground">Fila de Conciliação em Tempo Real</h3>
                  <p className="text-xs text-muted-foreground">
                    Verifique cobranças PIX ou pendências diretamente nos servidores do Banco Central e Banco Inter.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={fetchPayments}
                  className="bg-primary text-primary-foreground text-xs font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  <span>Atualizar Fila</span>
                </Button>
              </div>

              {reconcileResult && (
                <div className={`p-3 rounded-xl text-xs font-semibold border ${reconcileResult.reconciled ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200" : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900 dark:text-amber-200"}`}>
                  {reconcileResult.message}
                </div>
              )}
            </Card>

            <Card className="border-border/60 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/60 text-muted-foreground font-semibold">
                      <th className="p-3">Código</th>
                      <th className="p-3">Hóspede</th>
                      <th className="p-3">Apartamento</th>
                      <th className="p-3">TxId da Cobrança</th>
                      <th className="p-3 text-right">Valor Esperado</th>
                      <th className="p-3 text-center">Status Atual</th>
                      <th className="p-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {paymentsData?.payments?.filter((p: any) => !p.isPaid).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">Todas as transações estão 100% conciliadas!</span>
                          <span className="text-xs text-muted-foreground">Não há pagamentos pendentes no momento.</span>
                        </td>
                      </tr>
                    ) : (
                      paymentsData?.payments?.filter((p: any) => !p.isPaid).map((p: any) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="p-3 font-mono font-bold">{p.code}</td>
                          <td className="p-3 font-semibold">{p.guestName}</td>
                          <td className="p-3">Apt {p.flatNumber}</td>
                          <td className="p-3 font-mono text-[10px] text-muted-foreground">{p.pixTxId || "Não gerado"}</td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                            R$ {p.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-center">
                            <Badge className="bg-amber-600 text-white font-bold text-[10px]">Aguardando</Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              onClick={() => handleReconcile(p.code)}
                              disabled={reconcilingCode === p.code}
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              {reconcilingCode === p.code ? "Consultando Inter..." : "Consultar Banco Inter"}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL DE COMPROVANTE BANCÁRIO OFICIAL                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Comprovante de Liquidação Bancária</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registro auditável de pagamento recebido pela CorpFlats Hospedagens.
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 text-xs py-2">
              {/* Header do Recibo */}
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase block">Valor Liquidado</span>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    R$ {selectedPayment.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <Badge className={selectedPayment.isPaid ? "bg-emerald-600 text-white font-bold" : "bg-amber-600 text-white font-bold"}>
                  {selectedPayment.isPaid ? "✓ Pago Integralmente" : "Pendente"}
                </Badge>
              </div>

              {/* Dados da Transação */}
              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border/60">
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Hóspede / Pagador:</span>
                  <span className="font-bold text-foreground">{selectedPayment.guestName}</span>
                </div>

                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Localizador da Reserva:</span>
                  <span className="font-mono font-bold text-foreground">{selectedPayment.code}</span>
                </div>

                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Apartamento:</span>
                  <span className="font-bold text-foreground">Apt {selectedPayment.flatNumber}</span>
                </div>

                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground font-medium">Forma de Pagamento:</span>
                  <span className="font-semibold text-foreground">
                    {selectedPayment.pixTxId ? "⚡ PIX Banco Inter Oficial (mTLS v2)" : (selectedPayment.mpPaymentId ? "💳 Cartão de Crédito (Mercado Pago)" : "PIX / PMS")}
                  </span>
                </div>

                {selectedPayment.paidAt && (
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground font-medium">Data e Hora da Compensação:</span>
                    <span className="font-semibold text-foreground">
                      {format(parseISO(selectedPayment.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                )}

                {selectedPayment.pixEndToEndId && (
                  <div className="space-y-1 pt-1 border-b border-border/40 pb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">End-to-End ID (Banco Central):</span>
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

                {selectedPayment.pixTxId && (
                  <div className="space-y-1 pt-1 border-b border-border/40 pb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">Identificador TxId (Banco Inter):</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPayment.pixTxId, "txid")}
                        className="text-primary hover:underline text-[10px] flex items-center gap-1"
                      >
                        {copiedId === "txid" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === "txid" ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground break-all select-all block bg-background p-1.5 rounded-md border">
                      {selectedPayment.pixTxId}
                    </span>
                  </div>
                )}

                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-medium">Favorecido / Conta PJ:</span>
                  <span className="font-semibold text-foreground">CorpFlats (CNPJ 47.964.813/0001-65)</span>
                </div>
              </div>

              {/* Resumo de Taxas do Pagamento */}
              <div className="p-3 bg-muted/30 rounded-xl space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Bruto:</span>
                  <span className="font-bold text-foreground">R$ {selectedPayment.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>Taxa de Processamento Gateway ({selectedPayment.gatewayFeePct}%):</span>
                  <span>- R$ {selectedPayment.gatewayFeeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Comissão Canal ({selectedPayment.channelCommissionPct}%):</span>
                  <span>- R$ {selectedPayment.channelCommissionAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/40 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                  <span>Valor Líquido Creditado:</span>
                  <span>R$ {selectedPayment.netAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReceiptModalOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              className="bg-primary text-primary-foreground text-xs font-bold"
            >
              Imprimir Comprovante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
