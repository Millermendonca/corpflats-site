import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  DollarSign, TrendingUp, TrendingDown, Percent, Calculator, Building2, Calendar, 
  ArrowUpRight, ShieldCheck, Sparkles, Layers, Sliders, AlertCircle, Plus, Trash2, 
  CheckCircle2, Clock, Check, FileText, MessageCircle, RefreshCw, Send, Users, Wallet
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function FinancialDashboard() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  // Tabs do ERP Financeiro
  const [activeTab, setActiveTab] = useState<"dre" | "payables" | "receivables" | "cashflow" | "contracts" | "pricing">("dre")
  const [data, setData] = useState<any | null>(null)
  const [payablesData, setPayablesData] = useState<any | null>(null)
  const [receivablesData, setReceivablesData] = useState<any | null>(null)
  const [cashflowData, setCashflowData] = useState<any | null>(null)
  const [contractsData, setContractsData] = useState<any[]>([])
  const [flats, setFlats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [payableStatusFilter, setPayableStatusFilter] = useState<string>("all")
  const [payableScopeFilter, setPayableScopeFilter] = useState<"all" | "corpflats" | "flats">("all")
  const [receivableStatusFilter, setReceivableStatusFilter] = useState<string>("all")

  // Modal Novo Contas a Pagar
  const [newPayableModalOpen, setNewPayableModalOpen] = useState(false)
  const [newPayFlat, setNewPayFlat] = useState("geral")
  const [newPayCat, setNewPayCat] = useState("marketing_anuncios")
  const [newPayDesc, setNewPayDesc] = useState("")
  const [newPaySupplier, setNewPaySupplier] = useState("")
  const [newPayAmount, setNewPayAmount] = useState("")
  const [newPayDueDate, setNewPayDueDate] = useState(new Date().toISOString().substring(0, 10))
  const [newPayRecurrence, setNewPayRecurrence] = useState("mensal")
  const [savingPayable, setSavingPayable] = useState(false)

  // Modal Novo Contas a Receber
  const [newReceivableModalOpen, setNewReceivableModalOpen] = useState(false)
  const [newRecFlat, setNewRecFlat] = useState("1017")
  const [newRecClient, setNewRecClient] = useState("")
  const [newRecCat, setNewRecCat] = useState("diaria_shortstay")
  const [newRecDesc, setNewRecDesc] = useState("")
  const [newRecAmount, setNewRecAmount] = useState("")
  const [newRecDueDate, setNewRecDueDate] = useState(new Date().toISOString().substring(0, 10))
  const [newRecMethod, setNewRecMethod] = useState("pix")
  const [savingReceivable, setSavingReceivable] = useState(false)

  // Modal Novo Contrato Long-Stay
  const [newContractModalOpen, setNewContractModalOpen] = useState(false)
  const [contractFlat, setContractFlat] = useState("1017")
  const [contractTenantType, setContractTenantType] = useState("pj")
  const [contractTenantName, setContractTenantName] = useState("")
  const [contractTenantDoc, setContractTenantDoc] = useState("")
  const [contractOccupant, setContractOccupant] = useState("")
  const [contractPhone, setContractPhone] = useState("")
  const [contractEmail, setContractEmail] = useState("")
  const [contractStart, setContractStart] = useState(new Date().toISOString().substring(0, 10))
  const [contractEnd, setContractEnd] = useState(new Date(Date.now() + 180 * 86400000).toISOString().substring(0, 10))
  const [contractRate, setContractRate] = useState("3800")
  const [contractDueDay, setContractDueDay] = useState("5")
  const [contractDeposit, setContractDeposit] = useState("3800")
  const [savingContract, setSavingContract] = useState(false)

  // Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [formRent, setFormRent] = useState("24000")
  const [formSalaries, setFormSalaries] = useState("8000")
  const [formCondo, setFormCondo] = useState("2500")
  const [formMaintenance, setFormMaintenance] = useState("1000")
  const [formCleaning, setFormCleaning] = useState("15")
  const [formMargin, setFormMargin] = useState("25")
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchAllERPData = async () => {
    setLoading(true)
    try {
      const [overviewRes, payRes, recRes, cashRes, contractsRes, flatsRes] = await Promise.all([
        fetch("/api/finance/overview", { credentials: "include" }),
        fetch("/api/finance/payables", { credentials: "include" }),
        fetch("/api/finance/receivables", { credentials: "include" }),
        fetch("/api/finance/cashflow", { credentials: "include" }),
        fetch("/api/pms/longstay-contracts", { credentials: "include" }),
        fetch("/api/flats", { credentials: "include" })
      ])

      if (flatsRes && flatsRes.ok) {
        const flatsJson = await flatsRes.json()
        if (Array.isArray(flatsJson)) setFlats(flatsJson)
      }

      if (overviewRes.ok) {
        const json = await overviewRes.json()
        setData(json)
        if (json.settings) {
          setFormRent(String(json.settings.fixedRent || 24000))
          setFormSalaries(String(json.settings.fixedSalaries || 8000))
          setFormCondo(String(json.settings.fixedCondoIptu || 2500))
          setFormMaintenance(String(json.settings.fixedSystemsMaintenance || 1000))
          setFormCleaning(String(json.settings.varCleaningPerDay || 15))
          setFormMargin(String((json.settings.targetProfitMarginPct || 0.25) * 100))
        }
      }

      if (payRes.ok) setPayablesData(await payRes.json())
      if (recRes.ok) setReceivablesData(await recRes.json())
      if (cashRes.ok) setCashflowData(await cashRes.json())
      if (contractsRes.ok) setContractsData(await contractsRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllERPData()
  }, [])

  // Ações de Contas a Pagar
  const handleMarkPayablePaid = async (id: number) => {
    await fetch(`/api/finance/payables/${id}/pay`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pago" }),
      credentials: "include"
    })
    fetchAllERPData()
  }

  const handleDeletePayable = async (id: number) => {
    if (!confirm("Deseja realmente excluir este lançamento de conta a pagar?")) return
    await fetch(`/api/finance/payables/${id}`, { method: "DELETE", credentials: "include" })
    fetchAllERPData()
  }

  const handleCreatePayable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPayDesc || !newPayAmount || !newPayDueDate) return
    setSavingPayable(true)
    try {
      await fetch("/api/finance/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: newPayFlat,
          category: newPayCat,
          description: newPayDesc,
          supplier: newPaySupplier,
          amount: Number(newPayAmount),
          dueDate: newPayDueDate,
          recurrence: newPayRecurrence
        }),
        credentials: "include"
      })
      setNewPayableModalOpen(false)
      setNewPayDesc("")
      setNewPaySupplier("")
      setNewPayAmount("")
      fetchAllERPData()
    } finally {
      setSavingPayable(false)
    }
  }

  // Ações de Contas a Receber
  const handleMarkReceivableReceived = async (id: number) => {
    await fetch(`/api/finance/receivables/${id}/receive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "recebido" }),
      credentials: "include"
    })
    fetchAllERPData()
  }

  const handleDeleteReceivable = async (id: number) => {
    if (!confirm("Deseja excluir esta conta a receber?")) return
    await fetch(`/api/finance/receivables/${id}`, { method: "DELETE", credentials: "include" })
    fetchAllERPData()
  }

  const handleCreateReceivable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRecClient || !newRecDesc || !newRecAmount || !newRecDueDate) return
    setSavingReceivable(true)
    try {
      await fetch("/api/finance/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: newRecFlat,
          clientName: newRecClient,
          category: newRecCat,
          description: newRecDesc,
          amount: Number(newRecAmount),
          dueDate: newRecDueDate,
          paymentMethod: newRecMethod
        }),
        credentials: "include"
      })
      setNewReceivableModalOpen(false)
      setNewRecClient("")
      setNewRecDesc("")
      setNewRecAmount("")
      fetchAllERPData()
    } finally {
      setSavingReceivable(false)
    }
  }

  // Ações de Contratos Long-Stay
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contractTenantName || !contractRate) return
    setSavingContract(true)
    try {
      await fetch("/api/pms/longstay-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: contractFlat,
          tenantType: contractTenantType,
          tenantName: contractTenantName,
          tenantDocument: contractTenantDoc,
          occupantName: contractOccupant,
          phone: contractPhone,
          email: contractEmail,
          startDate: contractStart,
          endDate: contractEnd,
          monthlyRate: Number(contractRate),
          dueDay: Number(contractDueDay),
          depositAmount: Number(contractDeposit)
        }),
        credentials: "include"
      })
      setNewContractModalOpen(false)
      setContractTenantName("")
      setContractTenantDoc("")
      setContractOccupant("")
      setContractPhone("")
      setContractEmail("")
      fetchAllERPData()
    } finally {
      setSavingContract(false)
    }
  }

  const handleGenerateContractInvoice = async (contractId: number) => {
    const res = await fetch(`/api/pms/longstay-contracts/${contractId}/generate-invoice`, {
      method: "POST",
      credentials: "include"
    })
    const json = await res.json()
    if (json.success) {
      alert(json.message)
      if (json.whatsappUrl) {
        window.open(json.whatsappUrl, "_blank")
      }
      fetchAllERPData()
    }
  }

  const handleDeleteContract = async (id: number) => {
    if (!confirm("Deseja realmente encerrar/excluir este contrato?")) return
    await fetch(`/api/pms/longstay-contracts/${id}`, { method: "DELETE", credentials: "include" })
    fetchAllERPData()
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      await fetch("/api/finance/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixedRent: Number(formRent),
          fixedSalaries: Number(formSalaries),
          fixedCondoIptu: Number(formCondo),
          fixedSystemsMaintenance: Number(formMaintenance),
          varCleaningPerDay: Number(formCleaning),
          targetProfitMarginPct: Number(formMargin) / 100
        }),
        credentials: "include"
      })
      setSettingsModalOpen(false)
      fetchAllERPData()
    } finally {
      setSavingSettings(false)
    }
  }

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="o ERP Financeiro & Contratos CorpFlats" />
  }

  const payablesList = (payablesData?.payables || []).filter((p: any) => {
    if (payableStatusFilter !== "all" && p.status !== payableStatusFilter) return false
    const isCorpGeral = !p.flatNumber || p.flatNumber === "geral" || p.flatNumber === "corpflats"
    if (payableScopeFilter === "corpflats" && !isCorpGeral) return false
    if (payableScopeFilter === "flats" && isCorpGeral) return false
    return true
  })

  const receivablesList = (receivablesData?.receivables || []).filter((r: any) => {
    if (receivableStatusFilter === "all") return true
    return r.status === receivableStatusFilter
  })

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full font-sans">
        {/* Header Principal CorpFlats ERP */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-amber-600/20 text-amber-500 flex items-center justify-center font-black">
                <Wallet className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                CorpFlats • ERP & Inteligência Financeira
              </h1>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                Short & Long Stay
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Controle de Contas a Pagar/Receber, DRE Gerencial, Fluxo de Caixa e Contratos Corporativos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchAllERPData}
              className="text-xs font-semibold gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              <span>Atualizar</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSettingsModalOpen(true)}
              className="text-xs font-semibold gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Custos Fixos / Parâmetros</span>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs do ERP */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-1.5 bg-muted/40 rounded-2xl border">
          <button
            type="button"
            onClick={() => setActiveTab("dre")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "dre"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-600" />
            <span>DRE Gerencial</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("payables")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "payables"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingDown className="w-4 h-4 text-rose-600" />
            <span>Contas a Pagar ({payablesData?.summary?.pending ? `R$ ${(payablesData.summary.pending / 1000).toFixed(1)}k` : '0'})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("receivables")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "receivables"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Contas a Receber</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contracts")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "contracts"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Long-Stay ({contractsData.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cashflow")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "cashflow"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <DollarSign className="w-4 h-4 text-amber-600" />
            <span>Fluxo de Caixa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "pricing"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Percent className="w-4 h-4 text-sky-600" />
            <span>Precificação</span>
          </button>
        </div>

        {/* ── ABA 1: DRE GERENCIAL ─────────────────────────────────────────── */}
        {activeTab === "dre" && data && (
          <div className="space-y-6">
            {/* Top Cards KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="rounded-2xl border p-4 shadow-xs">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Receita Bruta Total</span>
                <div className="text-2xl font-black text-foreground mt-1">
                  R$ {(data.dre.grossRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Diárias + Mensalidades Long-Stay</span>
              </Card>

              <Card className="rounded-2xl border p-4 shadow-xs">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Receita Líquida</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">
                  R$ {(data.dre.netRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-emerald-500 font-semibold mt-0.5 block">Após comissões de OTAs</span>
              </Card>

              <Card className="rounded-2xl border p-4 shadow-xs">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Aluguéis & Despesas Fixas</span>
                <div className="text-2xl font-black text-rose-600 mt-1">
                  R$ {(data.dre.totalFixedCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Flats arrendados + Salários</span>
              </Card>

              <Card className="rounded-2xl border p-4 shadow-xs bg-emerald-950/20 border-emerald-800/60">
                <span className="text-[11px] font-bold text-emerald-400 uppercase">Lucro Operacional (EBITDA)</span>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  R$ {(data.dre.ebitda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-emerald-300 font-bold mt-0.5 block">
                  Margem: {((data.dre.profitMarginPct || 0) * 100).toFixed(1)}%
                </span>
              </Card>
            </div>

            {/* Tabela Estruturada DRE */}
            <Card className="rounded-3xl border shadow-md overflow-hidden">
              <CardHeader className="bg-muted/20 border-b p-5">
                <CardTitle className="text-base font-black flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-emerald-600" />
                    Demonstrativo de Resultado do Exercício (DRE Gerencial CorpFlats)
                  </span>
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs">
                    Modelo de Arrendamento Fixo
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Demonstração de receitas, deduções de canais, custos operacionais e margem de lucro líquida.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0 divide-y divide-border/60">
                {/* Linhas da DRE */}
                <div className="p-4 flex items-center justify-between font-bold bg-muted/10">
                  <span className="text-sm text-foreground">(+) RECEITA OPERACIONAL BRUTA</span>
                  <span className="text-base text-foreground font-black">
                    R$ {(data.dre.grossRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="px-6 py-2.5 flex items-center justify-between text-xs text-muted-foreground pl-8">
                  <span>• Vendas Diretas (Site CorpFlats + WhatsApp + Long-Stay)</span>
                  <span>R$ {(data.dre.revenueDirect || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="px-6 py-2.5 flex items-center justify-between text-xs text-muted-foreground pl-8">
                  <span>• Vendas Booking.com / OTAs</span>
                  <span>R$ {(data.dre.revenueBooking || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="p-4 flex items-center justify-between font-semibold text-rose-600 bg-rose-950/10">
                  <span className="text-xs">(-) Deduções: Comissões Pagas a Canais (OTAs / Booking)</span>
                  <span className="text-xs font-black">
                    - R$ {(data.dre.totalCommissionsPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 flex items-center justify-between font-black bg-muted/20">
                  <span className="text-sm text-foreground">(=) RECEITA OPERACIONAL LÍQUIDA</span>
                  <span className="text-base text-emerald-500">
                    R$ {(data.dre.netRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 flex items-center justify-between font-semibold text-amber-600 bg-amber-950/10">
                  <span className="text-xs">(-) Custos Variáveis Operacionais (Limpeza por UH, Lavanderia, Insumos Café)</span>
                  <span className="text-xs font-black">
                    - R$ {(data.dre.totalVariableCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 flex items-center justify-between font-black bg-muted/20">
                  <span className="text-sm text-foreground">(=) MARGEM DE CONTRIBUIÇÃO</span>
                  <span className="text-base text-foreground">
                    R$ {((data.dre.netRevenue || 0) - (data.dre.totalVariableCosts || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 flex items-center justify-between font-semibold text-rose-600 bg-rose-950/10">
                  <span className="text-xs">(-) Despesas Fixas da CorpFlats (Aluguéis Fixos dos Flats + Condomínios + Folha)</span>
                  <span className="text-xs font-black">
                    - R$ {(data.dre.totalFixedCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-5 flex items-center justify-between font-black bg-emerald-950/40 text-emerald-400 text-base">
                  <span>(=) LUCRO OPERACIONAL LÍQUIDO (EBITDA DA CORPFLATS)</span>
                  <span className="text-xl">
                    R$ {(data.dre.ebitda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ABA 2: CONTAS A PAGAR (ACCOUNTS PAYABLE) ─────────────────────── */}
        {activeTab === "payables" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Filtro de Status */}
                <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
                  {["all", "pendente", "pago"].map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPayableStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                        payableStatusFilter === st 
                          ? "bg-background text-foreground shadow-xs" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st === "all" ? "Todos os Status" : st === "pendente" ? "A Pagar / Pendentes" : "Pagos"}
                    </button>
                  ))}
                </div>

                {/* Filtro de Escopo: Corporativo vs Flat */}
                <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPayableScopeFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      payableScopeFilter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Todos os Gastos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayableScopeFilter("corpflats")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      payableScopeFilter === "corpflats" ? "bg-indigo-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>🏢 Geral CorpFlats (Marketing / Treinamento)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayableScopeFilter("flats")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      payableScopeFilter === "flats" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🛏️ Por Flat Individual
                  </button>
                </div>
              </div>

              <Button 
                onClick={() => setNewPayableModalOpen(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-3 rounded-xl gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Lançar Conta a Pagar</span>
              </Button>
            </div>

            {/* Lista de Contas a Pagar */}
            <Card className="rounded-3xl border shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-black uppercase text-[10px] border-b">
                    <tr>
                      <th className="p-3.5">Flat / UH</th>
                      <th className="p-3.5">Categoria</th>
                      <th className="p-3.5">Descrição & Fornecedor</th>
                      <th className="p-3.5">Vencimento</th>
                      <th className="p-3.5 text-right">Valor (R$)</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {payablesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          Nenhum lançamento de conta a pagar encontrado.
                        </td>
                      </tr>
                    ) : (
                      payablesList.map((item: any) => {
                        const isPaid = item.status === "pago"
                        return (
                          <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3.5 font-black text-foreground">
                              {item.flatNumber === "geral" ? (
                                <Badge variant="outline" className="text-[10px]">Geral CorpFlats</Badge>
                              ) : (
                                <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                                  Apt {item.flatNumber}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3.5">
                              <span className="capitalize font-semibold text-muted-foreground">
                                {item.category.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-foreground">{item.description}</div>
                              <div className="text-[10px] text-muted-foreground">{item.supplier}</div>
                            </td>
                            <td className="p-3.5 font-mono text-muted-foreground">
                              {item.dueDate}
                            </td>
                            <td className="p-3.5 font-black text-rose-500 text-right text-sm">
                              R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3.5 text-center">
                              <Badge className={`text-[10px] font-black ${isPaid ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>
                                {isPaid ? '✓ Pago' : 'Pendente'}
                              </Badge>
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isPaid && (
                                  <Button 
                                    size="sm"
                                    onClick={() => handleMarkPayablePaid(item.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold h-7 px-2.5 rounded-lg"
                                  >
                                    Dar Baixa
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeletePayable(item.id)}
                                  className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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

        {/* ── ABA 3: CONTAS A RECEBER (ACCOUNTS RECEIVABLE) ──────────────────── */}
        {activeTab === "receivables" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 bg-muted/40 p-1 rounded-xl">
                  {["all", "pendente", "recebido"].map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setReceivableStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                        receivableStatusFilter === st 
                          ? "bg-background text-foreground shadow-xs" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st === "all" ? "Todos os Recebimentos" : st === "pendente" ? "A Receber / Pendentes" : "Recebidos"}
                    </button>
                  ))}
                </div>
              </div>

              <Button 
                onClick={() => setNewReceivableModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3 rounded-xl gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Lançar Conta a Receber</span>
              </Button>
            </div>

            {/* Lista de Contas a Receber */}
            <Card className="rounded-3xl border shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-black uppercase text-[10px] border-b">
                    <tr>
                      <th className="p-3.5">Flat / UH</th>
                      <th className="p-3.5">Cliente / Empresa PJ</th>
                      <th className="p-3.5">Descrição</th>
                      <th className="p-3.5">Vencimento</th>
                      <th className="p-3.5 text-right">Valor (R$)</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {receivablesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          Nenhum lançamento de conta a receber encontrado.
                        </td>
                      </tr>
                    ) : (
                      receivablesList.map((item: any) => {
                        const isReceived = item.status === "recebido"
                        return (
                          <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3.5 font-black text-foreground">
                              <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                                Apt {item.flatNumber}
                              </Badge>
                            </td>
                            <td className="p-3.5 font-bold text-foreground">
                              {item.clientName}
                            </td>
                            <td className="p-3.5 text-muted-foreground">
                              {item.description}
                            </td>
                            <td className="p-3.5 font-mono text-muted-foreground">
                              {item.dueDate}
                            </td>
                            <td className="p-3.5 font-black text-emerald-500 text-right text-sm">
                              R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3.5 text-center">
                              <Badge className={`text-[10px] font-black ${isReceived ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>
                                {isReceived ? '✓ Recebido' : 'Pendente'}
                              </Badge>
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isReceived && (
                                  <Button 
                                    size="sm"
                                    onClick={() => handleMarkReceivableReceived(item.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold h-7 px-2.5 rounded-lg"
                                  >
                                    Receber
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteReceivable(item.id)}
                                  className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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

        {/* ── ABA 4: CONTRATOS LONG-STAY (MENSALISTAS) ─────────────────────── */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-foreground">Contratos de Long-Stay & Mensalistas PJ</h2>
                <p className="text-xs text-muted-foreground">Locações de média e longa permanência faturadas mensalmente.</p>
              </div>

              <Button 
                onClick={() => setNewContractModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-3 rounded-xl gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Contrato Mensalista</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contractsData.length === 0 ? (
                <Card className="p-8 text-center col-span-2 text-muted-foreground">
                  Nenhum contrato long-stay cadastrado.
                </Card>
              ) : (
                contractsData.map((contract: any) => (
                  <Card key={contract.id} className="rounded-3xl border shadow-sm p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-950 text-amber-300 border-amber-800 font-bold text-xs">
                            Apt {contract.flatNumber}
                          </Badge>
                          <span className="font-black text-sm text-foreground">{contract.tenantName}</span>
                        </div>
                        {contract.occupantName && (
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            Ocupante: <strong>{contract.occupantName}</strong>
                          </span>
                        )}
                      </div>

                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                        Contrato Ativo
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-2xl text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Mensalidade</span>
                        <span className="font-black text-foreground text-sm">
                          R$ {contract.monthlyRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Dia Vencimento</span>
                        <span className="font-bold text-foreground">Todo dia {contract.dueDay}</span>
                      </div>
                      <div className="pt-2 border-t border-border/60">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Vigência</span>
                        <span className="font-semibold text-foreground text-[11px]">{contract.startDate} até {contract.endDate}</span>
                      </div>
                      <div className="pt-2 border-t border-border/60">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Caução Garantia</span>
                        <span className="font-semibold text-foreground text-[11px]">R$ {contract.depositAmount || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                      <Button
                        size="sm"
                        onClick={() => handleGenerateContractInvoice(contract.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8 px-3 rounded-xl gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Gerar Fatura & Cobrar WhatsApp</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteContract(contract.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── ABA 5: FLUXO DE CAIXA ─────────────────────────────────────────── */}
        {activeTab === "cashflow" && cashflowData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-5 rounded-3xl border shadow-xs bg-emerald-950/20 border-emerald-800/60">
                <span className="text-xs font-bold text-emerald-400 uppercase">Total Entradas Realizadas</span>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  R$ {(cashflowData.totalInflow || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  + R$ {(cashflowData.totalPendingInflow || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a receber
                </span>
              </Card>

              <Card className="p-5 rounded-3xl border shadow-xs bg-rose-950/20 border-rose-800/60">
                <span className="text-xs font-bold text-rose-400 uppercase">Total Saídas Pagas</span>
                <div className="text-2xl font-black text-rose-400 mt-1">
                  R$ {(cashflowData.totalOutflow || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  + R$ {(cashflowData.totalPendingOutflow || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a pagar
                </span>
              </Card>

              <Card className="p-5 rounded-3xl border shadow-xs bg-muted/40">
                <span className="text-xs font-bold text-foreground uppercase">Saldo Líquido Realizado</span>
                <div className={`text-2xl font-black mt-1 ${cashflowData.netRealized >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  R$ {(cashflowData.netRealized || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-foreground font-semibold mt-0.5 block">
                  Projetado: R$ {(cashflowData.netProjected || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </Card>
            </div>
          </div>
        )}

        {/* ── ABA 6: PRECIFICAÇÃO SEBRAE ───────────────────────────────────── */}
        {activeTab === "pricing" && data && (
          <div className="space-y-6">
            <Card className="p-5 rounded-3xl border shadow-xs space-y-4">
              <h2 className="text-base font-black text-foreground">Tarifa Sustentável & Custo por UH Ocupada</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-muted/30 rounded-2xl">
                  <span className="text-[11px] text-muted-foreground block uppercase font-bold">Custo Fixo por UH</span>
                  <span className="text-xl font-black text-foreground">
                    R$ {(data.costs?.fixedCostPerSoldNight || 0).toFixed(2)}
                  </span>
                </div>
                <div className="p-4 bg-muted/30 rounded-2xl">
                  <span className="text-[11px] text-muted-foreground block uppercase font-bold">Custo Variável / Noite</span>
                  <span className="text-xl font-black text-foreground">
                    R$ {(data.costs?.varCostPerNight || 0).toFixed(2)}
                  </span>
                </div>
                <div className="p-4 bg-emerald-950/30 border border-emerald-800 rounded-2xl">
                  <span className="text-[11px] text-emerald-400 block uppercase font-bold">Tarifa Mínima Recomendada</span>
                  <span className="text-xl font-black text-emerald-400">
                    R$ {(data.costs?.sustainableMinRate || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Modal: Novo Lançamento Contas a Pagar */}
      <Dialog open={newPayableModalOpen} onOpenChange={setNewPayableModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Lançar Conta a Pagar</DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre uma despesa fixa de flat (arrendamento, condomínio) ou custo geral.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePayable} className="space-y-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Destino / Escopo do Gasto *</Label>
                <select 
                  value={newPayFlat} 
                  onChange={e => setNewPayFlat(e.target.value)} 
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs font-bold"
                >
                  <option value="geral" className="text-indigo-600 font-bold">
                    🏢 CorpFlats Geral (Corporativo / Marketing / Treinamento)
                  </option>
                  <optgroup label="Flats Individuais">
                    {flats && flats.length > 0 ? (
                      flats.map((f: any) => (
                        <option key={f.id} value={String(f.number)}>
                          🛏️ Flat {f.number} {f.nickname ? `(${f.nickname})` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="1017">🛏️ Flat 1017</option>
                        <option value="113">🛏️ Flat 113</option>
                        <option value="304">🛏️ Flat 304</option>
                        <option value="511">🛏️ Flat 511</option>
                        <option value="712">🛏️ Flat 712</option>
                      </>
                    )}
                  </optgroup>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Escolha se o gasto é da CorpFlats como empresa ou de um flat específico.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Categoria de Despesa *</Label>
                <select 
                  value={newPayCat} 
                  onChange={e => setNewPayCat(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs"
                >
                  <optgroup label="🏢 Despesas Corporativas CorpFlats">
                    <option value="marketing_anuncios">📢 Marketing, Tráfego Pago & Anúncios</option>
                    <option value="treinamento_equipe">🎓 Treinamento & Capacitação de Equipe</option>
                    <option value="software_sistemas">💻 Softwares, Assinaturas & Sistemas</option>
                    <option value="contador_juridico">⚖️ Contabilidade & Assessoria Jurídica</option>
                    <option value="taxas_bancarias">💳 Taxas Bancárias & Meios de Pagamento</option>
                    <option value="material_escritorio">📎 Material de Escritório & Adm</option>
                    <option value="salarios_equipe">👥 Salários & Folha Operacional</option>
                    <option value="impostos">🏛️ Impostos & Tributos</option>
                  </optgroup>
                  <optgroup label="🛏️ Custos por Flat & Operação">
                    <option value="aluguel_flat">🏠 Aluguel Fixo do Flat (Arrendamento)</option>
                    <option value="condominio_iptu">🏢 Condomínio / IPTU do Flat</option>
                    <option value="insumos_cafe">☕ Insumos do Café da Manhã</option>
                    <option value="lavanderia">🧺 Lavanderia & Enxoval</option>
                    <option value="manutencao">🛠️ Manutenção & Reparos</option>
                    <option value="outros">📦 Outras Despesas</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Descrição da Despesa *</Label>
              <Input 
                value={newPayDesc} 
                onChange={e => setNewPayDesc(e.target.value)} 
                placeholder="Ex: Arrendamento mensal Flat 1017" 
                required 
                className="text-xs" 
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Fornecedor / Beneficiário</Label>
              <Input 
                value={newPaySupplier} 
                onChange={e => setNewPaySupplier(e.target.value)} 
                placeholder="Ex: Nome do Proprietário ou Empresa" 
                className="text-xs" 
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Valor (R$) *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={newPayAmount} 
                  onChange={e => setNewPayAmount(e.target.value)} 
                  placeholder="0.00" 
                  required 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Data de Vencimento *</Label>
                <Input 
                  type="date"
                  value={newPayDueDate} 
                  onChange={e => setNewPayDueDate(e.target.value)} 
                  required 
                  className="text-xs" 
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setNewPayableModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingPayable} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                {savingPayable ? "Salvando..." : "Salvar Conta a Pagar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Novo Lançamento Contas a Receber */}
      <Dialog open={newReceivableModalOpen} onOpenChange={setNewReceivableModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Lançar Conta a Receber</DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre um recebimento de diária, mensalidade long-stay ou consumo extra.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateReceivable} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Flat / UH</Label>
                <Input 
                  value={newRecFlat} 
                  onChange={e => setNewRecFlat(e.target.value)} 
                  placeholder="Ex: 1017" 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Categoria</Label>
                <select 
                  value={newRecCat} 
                  onChange={e => setNewRecCat(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs"
                >
                  <option value="diaria_shortstay">Diária Short-Stay</option>
                  <option value="mensalidade_longstay">Mensalidade Long-Stay</option>
                  <option value="cafe_avulso">Café da Manhã Avulso</option>
                  <option value="outros">Outras Receitas</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Cliente / Empresa PJ *</Label>
              <Input 
                value={newRecClient} 
                onChange={e => setNewRecClient(e.target.value)} 
                placeholder="Ex: Petrobras S.A. ou Nome do Hóspede" 
                required 
                className="text-xs" 
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Descrição *</Label>
              <Input 
                value={newRecDesc} 
                onChange={e => setNewRecDesc(e.target.value)} 
                placeholder="Ex: Mensalidade ref. Agosto/2026" 
                required 
                className="text-xs" 
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Valor (R$) *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={newRecAmount} 
                  onChange={e => setNewRecAmount(e.target.value)} 
                  placeholder="0.00" 
                  required 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Vencimento *</Label>
                <Input 
                  type="date"
                  value={newRecDueDate} 
                  onChange={e => setNewRecDueDate(e.target.value)} 
                  required 
                  className="text-xs" 
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setNewReceivableModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingReceivable} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {savingReceivable ? "Salvando..." : "Salvar Conta a Receber"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Novo Contrato Long-Stay */}
      <Dialog open={newContractModalOpen} onOpenChange={setNewContractModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Cadastrar Contrato Long-Stay</DialogTitle>
            <DialogDescription className="text-xs">
              Locação de média/longa permanência com faturamento recorrente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateContract} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Flat / UH *</Label>
                <Input 
                  value={contractFlat} 
                  onChange={e => setContractFlat(e.target.value)} 
                  placeholder="Ex: 1017" 
                  required 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Tipo</Label>
                <select 
                  value={contractTenantType} 
                  onChange={e => setContractTenantType(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs"
                >
                  <option value="pj">Pessoa Jurídica (PJ)</option>
                  <option value="pf">Pessoa Física (PF)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Nome da Empresa / Inquilino *</Label>
              <Input 
                value={contractTenantName} 
                onChange={e => setContractTenantName(e.target.value)} 
                placeholder="Ex: Vale S.A." 
                required 
                className="text-xs" 
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">CNPJ / CPF</Label>
                <Input 
                  value={contractTenantDoc} 
                  onChange={e => setContractTenantDoc(e.target.value)} 
                  placeholder="00.000.000/0001-00" 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">WhatsApp / Telefone</Label>
                <Input 
                  value={contractPhone} 
                  onChange={e => setContractPhone(e.target.value)} 
                  placeholder="(21) 99999-9999" 
                  className="text-xs" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Início Vigência</Label>
                <Input 
                  type="date"
                  value={contractStart} 
                  onChange={e => setContractStart(e.target.value)} 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Fim Vigência</Label>
                <Input 
                  type="date"
                  value={contractEnd} 
                  onChange={e => setContractEnd(e.target.value)} 
                  className="text-xs" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Mensalidade (R$) *</Label>
                <Input 
                  type="number"
                  value={contractRate} 
                  onChange={e => setContractRate(e.target.value)} 
                  required 
                  className="text-xs" 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Dia Vencimento</Label>
                <Input 
                  type="number"
                  min="1"
                  max="31"
                  value={contractDueDay} 
                  onChange={e => setContractDueDay(e.target.value)} 
                  className="text-xs" 
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setNewContractModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingContract} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {savingContract ? "Salvando..." : "Salvar Contrato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Configuração de Custos Fixos Gerais */}
      <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Custos Operacionais & Parâmetros</DialogTitle>
            <DialogDescription className="text-xs">
              Valores base usados para o cálculo do DRE e precificação sustentável.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSettings} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Total Aluguéis Fixos dos Flats Arrendados (R$/mês)</Label>
              <Input value={formRent} onChange={e => setFormRent(e.target.value)} className="text-xs" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Folha de Pagamento & Salários (R$/mês)</Label>
              <Input value={formSalaries} onChange={e => setFormSalaries(e.target.value)} className="text-xs" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Condomínios & IPTU dos Flats (R$/mês)</Label>
              <Input value={formCondo} onChange={e => setFormCondo(e.target.value)} className="text-xs" />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setSettingsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingSettings} className="font-bold">
                {savingSettings ? "Salvando..." : "Salvar Parâmetros"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
