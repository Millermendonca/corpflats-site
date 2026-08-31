import { useState, useEffect } from "react"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts"
import { format, startOfMonth, endOfMonth, setDate, addMonths, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"
import { 
  CheckCircle2, Clock, Sparkles, User, Calendar, BarChart3, Printer, 
  DollarSign, Users, FileText, Check, Sliders, ChevronLeft, ChevronRight,
  Receipt, MessageSquare, Building2, CheckCheck, Star, ArrowRight, RefreshCw, ListFilter
} from "lucide-react"

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

export default function Reports() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const isAdmin = user?.role === "admin"

  // Controle de Mês e Quinzena Selecionada Inteligente
  const now = new Date()
  const currentDay = now.getDate()
  // Se hoje é dia 16 em diante, inicializa na 2ª Quinzena (16 ao fim). Se não, 1ª Quinzena (01 a 15)
  const initialType: "q1" | "q2" | "month" = "month" // Inicia no Mês Inteiro para ver tudo do mês sem risco de sumir dados!

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(now)
  const [selectedQuinzena, setSelectedQuinzena] = useState<"q1" | "q2" | "month" | "custom">("month")

  const initialStart = format(startOfMonth(now), "yyyy-MM-dd")
  const initialEnd = format(endOfMonth(now), "yyyy-MM-dd")

  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)

  const [report, setReport] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCleanerFilter, setSelectedCleanerFilter] = useState<string>("all")

  // Configuração de Taxa por Quarto (Global e Individual por Camareira)
  const [ratesModalOpen, setRatesModalOpen] = useState(false)
  const [defaultRateInput, setDefaultRateInput] = useState("35.00")
  const [cleanersList, setCleanersList] = useState<any[]>([])
  const [userRatesInput, setUserRatesInput] = useState<Record<string, string>>({})
  const [savingRates, setSavingRates] = useState(false)

  // Modal de Recibo Individual da Camareira
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [activeCleanerReceipt, setActiveCleanerReceipt] = useState<any | null>(null)

  // ── Aplicador de Quinzenas ──────────────────────────────────────────────────
  const applyQuinzena = (type: "q1" | "q2" | "month", targetMonth: Date = currentMonthDate) => {
    setSelectedQuinzena(type)
    if (type === "q1") {
      const s = format(startOfMonth(targetMonth), "yyyy-MM-dd")
      const e = format(setDate(targetMonth, 15), "yyyy-MM-dd")
      setStartDate(s)
      setEndDate(e)
    } else if (type === "q2") {
      const s = format(setDate(targetMonth, 16), "yyyy-MM-dd")
      const e = format(endOfMonth(targetMonth), "yyyy-MM-dd")
      setStartDate(s)
      setEndDate(e)
    } else if (type === "month") {
      const s = format(startOfMonth(targetMonth), "yyyy-MM-dd")
      const e = format(endOfMonth(targetMonth), "yyyy-MM-dd")
      setStartDate(s)
      setEndDate(e)
    }
  }

  // Navegação de Mês
  const handlePrevMonth = () => {
    const newMonth = subMonths(currentMonthDate, 1)
    setCurrentMonthDate(newMonth)
    applyQuinzena(selectedQuinzena === "custom" ? "q1" : selectedQuinzena, newMonth)
  }

  const handleNextMonth = () => {
    const newMonth = addMonths(currentMonthDate, 1)
    setCurrentMonthDate(newMonth)
    applyQuinzena(selectedQuinzena === "custom" ? "q1" : selectedQuinzena, newMonth)
  }

  // ── Busca de Dados ────────────────────────────────────────────────────────
  const fetchReport = async () => {
    setLoading(true)
    try {
      const [repRes, histRes, ratesRes] = await Promise.all([
        fetch(`/api/analytics/report?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/cleaning/history?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
        fetch("/api/cleaning/rates", { credentials: "include" }).then(r => r.json()).catch(() => null)
      ])
      setReport(repRes)
      setHistory(Array.isArray(histRes) ? histRes : [])
      if (ratesRes) {
        if (ratesRes.defaultRatePerRoom) setDefaultRateInput(String(ratesRes.defaultRatePerRoom))
        if (Array.isArray(ratesRes.cleaners)) {
          setCleanersList(ratesRes.cleaners)
          const initialMap: Record<string, string> = {}
          ratesRes.cleaners.forEach((c: any) => {
            initialMap[String(c.userId)] = String(c.rate !== undefined ? c.rate : ratesRes.defaultRatePerRoom || 35.00)
          })
          setUserRatesInput(initialMap)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchReport()
    }
  }, [user, startDate, endDate])

  // Salvar Taxas Gerais e Individuais por Camareira
  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingRates(true)
    try {
      const formattedUserRates: Record<string, number> = {}
      Object.entries(userRatesInput).forEach(([userId, val]) => {
        const num = parseFloat(val)
        if (!isNaN(num) && num >= 0) {
          formattedUserRates[userId] = num
        }
      })

      const res = await fetch("/api/cleaning/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRatePerRoom: parseFloat(defaultRateInput) || 35.00,
          userRates: formattedUserRates
        }),
        credentials: "include"
      })
      if (res.ok) {
        setRatesModalOpen(false)
        fetchReport()
      }
    } finally {
      setSavingRates(false)
    }
  }

  const filteredHistory = history.filter(h => {
    if (selectedCleanerFilter === "all") return true
    return String(h.assignedUserId) === selectedCleanerFilter || h.assignedUsername === selectedCleanerFilter
  })

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6 print:p-0 print:m-0 print:max-w-none">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <BarChart3 className="w-8 h-8 text-primary shrink-0" />
              {isAdmin ? "Relatório & Fechamento de Limpeza" : "Meu Fechamento de Diárias"}
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-1">
              {isAdmin 
                ? "Controle auditável por quinzena (1ª: 01 a 15 | 2ª: 16 ao fim) com cálculo exato de pagamentos e histórico" 
                : `Acompanhe suas diárias concluídas e valor acumulado a receber nesta quinzena, ${user?.username}!`}
            </p>
          </div>

          {/* Botões Globais */}
          <div className="flex items-center gap-2 print:hidden">
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setRatesModalOpen(true)}
                className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-border"
              >
                <Sliders className="w-4 h-4 text-primary" />
                <span>Configurar Valor por Quarto</span>
              </Button>
            )}

            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => window.print()} 
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Relatório</span>
            </Button>
          </div>
        </div>

        {/* ── BARRA SELETORA DE QUINZENAS E MESES ── */}
        <Card className="rounded-3xl border border-border p-3.5 sm:p-4 shadow-sm print:hidden">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Navegador de Mês */}
            <div className="flex items-center justify-between sm:justify-start gap-1 bg-muted/40 p-1.5 rounded-2xl border border-border/60">
              <Button size="icon" variant="ghost" onClick={handlePrevMonth} className="h-8 w-8 rounded-xl hover:bg-background">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="font-black text-xs sm:text-sm text-foreground min-w-[130px] text-center capitalize">
                {format(currentMonthDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </div>
              <Button size="icon" variant="ghost" onClick={handleNextMonth} className="h-8 w-8 rounded-xl hover:bg-background">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Seletor Rápido de Quinzenas */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5">
              <Button
                variant={selectedQuinzena === "q1" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("q1")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                <span>1ª Quinzena</span>
              </Button>

              <Button
                variant={selectedQuinzena === "q2" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("q2")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                <span>2ª Quinzena</span>
              </Button>

              <Button
                variant={selectedQuinzena === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("month")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <span>Mês Todo</span>
              </Button>
            </div>

            {/* Inputs Manuais de Data */}
            <div className="flex items-center gap-1.5 bg-muted/40 p-1.5 rounded-2xl border border-border/60">
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => {
                  setStartDate(e.target.value)
                  setSelectedQuinzena("custom")
                }} 
                className="h-8 text-xs flex-1 sm:w-32 rounded-xl bg-background border border-border/50" 
              />
              <span className="text-xs font-bold text-muted-foreground px-1">até</span>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => {
                  setEndDate(e.target.value)
                  setSelectedQuinzena("custom")
                }} 
                className="h-8 text-xs flex-1 sm:w-32 rounded-xl bg-background border border-border/50" 
              />
            </div>
          </div>
        </Card>

        {/* ── ABAS UNIFICADAS DE GOVERNANÇA ── */}
        {isAdmin ? (
          <Tabs defaultValue="payroll" className="space-y-5">
            <TabsList className="bg-card border border-border p-1.5 rounded-2xl h-auto grid grid-cols-1 sm:grid-cols-3 gap-1.5 shadow-xs print:hidden w-full">
              <TabsTrigger 
                value="payroll" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <DollarSign className="w-4 h-4 shrink-0 text-emerald-500 data-[state=active]:text-inherit" />
                <span>Fechamento Quinzenal</span>
              </TabsTrigger>

              <TabsTrigger 
                value="history" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <ListFilter className="w-4 h-4 shrink-0 text-primary data-[state=active]:text-inherit" />
                <span>Histórico Auditável ({history.length})</span>
              </TabsTrigger>

              <TabsTrigger 
                value="charts" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <BarChart3 className="w-4 h-4 shrink-0 text-indigo-500 data-[state=active]:text-inherit" />
                <span>Gráficos & Produtividade</span>
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: FECHAMENTO QUINZENAL */}
            <TabsContent value="payroll" className="space-y-5 m-0">
              {loading || !report ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/40 p-5 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-3.5">
                        <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shadow-sm">
                          <DollarSign className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                            Total a Pagar na Quinzena
                          </div>
                          <div className="text-3xl font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
                            R$ {((report.grandTotalToPay || (report.cleaningsByUser || []).reduce((acc: number, c: any) => acc + (Number(c.totalToPay) || 0), 0)) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1">
                            Taxa Padrão: <strong>R$ {Number(report.defaultRatePerRoom || 35).toFixed(2)}</strong> por quarto
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20 p-5 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-3.5">
                        <div className="p-3.5 bg-primary text-primary-foreground rounded-2xl shadow-sm">
                          <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-primary uppercase tracking-wider">
                            Quartos Limpos no Período
                          </div>
                          <div className="text-3xl font-black text-foreground mt-0.5">
                            {report.totalCleanings || 0} flats
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {startDate.split('-').reverse().join('/')} a {endDate.split('-').reverse().join('/')}
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-indigo-500/10 border-indigo-500/30 p-5 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-3.5">
                        <div className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                          <Users className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                            Camareiras com Diárias
                          </div>
                          <div className="text-3xl font-black text-foreground mt-0.5">
                            {report.cleaningsByUser?.length || 0} ativas
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Tabela Consolidada */}
                  <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                    <CardHeader className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-emerald-600" />
                          <span>Extrato de Fechamento por Camareira</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Quartos executados × Valor por quarto = Total a Pagar
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                            <tr>
                              <th className="p-3.5">Colaboradora</th>
                              <th className="p-3.5 text-center">Quartos Executados</th>
                              <th className="p-3.5 text-center">Valor por Quarto</th>
                              <th className="p-3.5 text-center">Total a Pagar (R$)</th>
                              <th className="p-3.5 text-center">Tempo Médio</th>
                              <th className="p-3.5 text-right print:hidden">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(!report.cleaningsByUser || report.cleaningsByUser.length === 0) ? (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                  Nenhuma limpeza finalizada registrada no período de {startDate.split('-').reverse().join('/')} a {endDate.split('-').reverse().join('/')}.
                                </td>
                              </tr>
                            ) : (
                              report.cleaningsByUser.map((c: any) => (
                                <tr key={c.userId} className="hover:bg-muted/20 transition-colors">
                                  <td className="p-3.5">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                                        {(c.name || c.username).charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <span className="font-bold text-foreground block">{c.name || c.username}</span>
                                        <span className="text-[10px] text-muted-foreground capitalize">{c.role}</span>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="p-3.5 text-center">
                                    <Badge className="bg-emerald-600 text-white font-black text-xs px-2.5 py-0.5">
                                      {c.count} {c.count === 1 ? "quarto" : "quartos"}
                                    </Badge>
                                  </td>

                                  <td className="p-3.5 text-center font-mono font-bold text-foreground">
                                    R$ {Number(c.ratePerRoom || report.defaultRatePerRoom || 35).toFixed(2)}
                                  </td>

                                  <td className="p-3.5 text-center">
                                    <span className="font-black text-emerald-600 text-base">
                                      R$ {Number(c.totalToPay || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  </td>

                                  <td className="p-3.5 text-center text-muted-foreground">
                                    ~{c.avgDurationMinutes || 35} min
                                  </td>

                                  <td className="p-3.5 text-right print:hidden">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setActiveCleanerReceipt(c)
                                        setReceiptModalOpen(true)
                                      }}
                                      className="h-8 px-2.5 text-[11px] font-bold rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                      <span>Ver Recibo</span>
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* ABA 2: HISTÓRICO AUDITÁVEL DE LIMPEZAS */}
            <TabsContent value="history" className="space-y-4 m-0">
              <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                <CardHeader className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                      <ListFilter className="w-5 h-5 text-primary" />
                      <span>Histórico Auditável de Limpezas Realizadas</span>
                    </CardTitle>
                    <CardDescription className="text-xs">Registro detalhado com data, flat, camareira e tempo de execução</CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCleanerFilter}
                      onChange={e => setSelectedCleanerFilter(e.target.value)}
                      className="h-8.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                    >
                      <option value="all">Todas as Camareiras</option>
                      {report?.cleaningsByUser?.map((u: any) => (
                        <option key={u.userId} value={String(u.userId)}>{u.name || u.username}</option>
                      ))}
                    </select>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {filteredHistory.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">Nenhuma limpeza encontrada no período selecionado.</div>
                  ) : (
                    <div>
                      {/* Sub-janelinha com barra de rolagem e cabeçalho fixo */}
                      <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-muted/95 backdrop-blur-md text-muted-foreground font-bold border-b border-border sticky top-0 z-10 shadow-2xs">
                            <tr>
                              <th className="p-3.5">Data / Hora</th>
                              <th className="p-3.5">Flat</th>
                              <th className="p-3.5">Camareira Responsável</th>
                              <th className="p-3.5">Duração</th>
                              <th className="p-3.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filteredHistory.map((entry: any) => (
                              <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                                  {entry.completedAt ? new Date(entry.completedAt).toLocaleString("pt-BR") : (entry.requestDate || "—")}
                                </td>
                                <td className="p-3.5 font-bold text-foreground">
                                  Apt {entry.flatNumber}
                                </td>
                                <td className="p-3.5 capitalize font-semibold text-foreground">
                                  {entry.assignedUsername || "Camareira"}
                                </td>
                                <td className="p-3.5 text-muted-foreground font-mono">
                                  {entry.durationMinutes ? `${entry.durationMinutes} min` : "~35 min"}
                                </td>
                                <td className="p-3.5">
                                  <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                                    Concluído
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Rodapé Compacto */}
                      <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                        <span>Total listado: <strong>{filteredHistory.length}</strong> limpezas no período</span>
                        <span>Rolagem vertical ativa</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA 3: GRÁFICOS & PRODUTIVIDADE */}
            <TabsContent value="charts" className="space-y-4 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Gráfico por Dia da Semana */}
                <Card className="rounded-3xl border border-border shadow-sm p-5 space-y-4">
                  <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    <span>Demandas de Limpeza por Dia da Semana</span>
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report?.cleaningsByDayOfWeek || []}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="dayName" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Ranking de Flats que mais limparam */}
                <Card className="rounded-3xl border border-border shadow-sm p-5 space-y-4">
                  <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Flats com Maior Rotatividade de Limpezas</span>
                  </h3>
                  <div className="h-64 overflow-y-auto space-y-1.5 pr-1">
                    {(report?.topFlatsByCleanings || []).map((f: any, i: number) => (
                      <div key={f.flatNumber} className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">
                            #{i + 1}
                          </span>
                          <span className="font-bold text-foreground">Flat {f.flatNumber}</span>
                        </div>
                        <Badge variant="outline" className="font-bold">
                          {f.count} limpezas
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* VISÃO PRÓPRIA DA CAMAREIRA */
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/40 p-5 rounded-3xl shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shadow-sm">
                    <DollarSign className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                      Seu Valor Acumulado a Receber
                    </div>
                    <div className="text-3xl font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
                      R$ {(report?.myTotalToPay || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1">
                      Valor por Quarto: <strong>R$ {Number(report?.myRatePerRoom || 35).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-primary/5 border-primary/20 p-5 rounded-3xl shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="p-3.5 bg-primary text-primary-foreground rounded-2xl shadow-sm">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-primary uppercase tracking-wider">
                      Quartos Limpos no Período
                    </div>
                    <div className="text-3xl font-black text-foreground mt-0.5">
                      {history.length || 0} flats
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-blue-500/10 border-blue-500/30 p-5 rounded-3xl shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-sm">
                    <Clock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                      Tempo Médio por Quarto
                    </div>
                    <div className="text-3xl font-black text-foreground mt-0.5">
                      ~35 min
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Lista dos Meus Atendimentos */}
            <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
              <CardHeader className="p-5 border-b border-border bg-muted/20">
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <span>Histórico das Minhas Diárias Concluídas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-xs">
                    Nenhum quarto limpo registrado no período selecionado.
                  </div>
                ) : (
                  <div>
                    {/* Sub-janelinha com barra de rolagem */}
                    <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60 p-4">
                      {[...(history || [])].sort((a: any, b: any) => new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime()).map((h, i) => (
                        <div key={i} className="py-3 flex items-center justify-between gap-2 hover:bg-muted/20 rounded-xl px-2 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-sm">
                              {h.flatNumber}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-foreground">Apartamento {h.flatNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                Data da Limpeza: {h.requestDate ? h.requestDate.split('-').reverse().join('/') : "-"}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <Badge className="bg-emerald-600 text-white font-bold text-xs">
                              + R$ {Number(report?.myRatePerRoom || 35).toFixed(2)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                      <span>Total de diárias: <strong>{history.length}</strong> quartos</span>
                      <span>Rolagem interna</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── MODAL: CONFIGURAR VALORES POR QUARTO (INDIVIDUAL POR CAMAREIRA) ── */}
        <Dialog open={ratesModalOpen} onOpenChange={setRatesModalOpen}>
          <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <span>Configurar Valores por Quarto por Camareira</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina valores personalizados para cada colaboradora conforme o acordo de diárias
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveRates} className="space-y-4 pt-2">
              {/* Valor Padrão Geral */}
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Valor Padrão Base (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-muted-foreground">R$</span>
                  <Input 
                    type="number"
                    step="0.50"
                    value={defaultRateInput}
                    onChange={e => setDefaultRateInput(e.target.value)}
                    required
                    className="pl-10 text-sm font-black text-emerald-600 rounded-xl h-10 bg-background"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Aplicado para novas camareiras que não tenham valor individual configurado abaixo.
                </p>
              </div>

              {/* Lista Individual de Camareiras */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Valores Específicos por Colaboradora:</span>
                </Label>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {cleanersList.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 text-center">Nenhuma camareira cadastrada na equipe.</div>
                  ) : (
                    cleanersList.map(c => (
                      <div key={c.userId} className="p-3 rounded-2xl bg-card border border-border flex items-center justify-between gap-3 shadow-2xs hover:border-primary/40 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                            {(c.name || c.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <span className="font-bold text-xs text-foreground block truncate">{c.name || c.username}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">{c.role}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <Input 
                            type="number"
                            step="0.50"
                            placeholder={defaultRateInput}
                            value={userRatesInput[String(c.userId)] || ""}
                            onChange={e => {
                              const val = e.target.value
                              setUserRatesInput(prev => ({ ...prev, [String(c.userId)]: val }))
                            }}
                            className="w-24 h-9 text-xs font-black text-emerald-600 rounded-xl text-right"
                          />
                          <span className="text-[10px] text-muted-foreground">/quarto</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setRatesModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingRates} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingRates ? "Salvando..." : "Salvar Todos os Valores"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL: RECIBO EXECUTIVO DE FECHAMENTO DE DIÁRIAS (DESIGN SENIOR) ── */}
        <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-3xl bg-slate-50 dark:bg-slate-950 border border-border rounded-3xl max-h-[92vh] overflow-y-auto p-0 overflow-x-hidden shadow-2xl">
            {/* Barra de Ações Superior (Oculta no Print) */}
            <div className="p-3.5 sm:p-4 bg-card border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-20 print:hidden">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white font-bold text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full shrink-0">
                    Recibo Oficial
                  </Badge>
                  <span className="text-xs text-muted-foreground font-semibold truncate">
                    Demonstrativo de Diárias
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReceiptModalOpen(false)}
                  className="h-8 w-8 p-0 rounded-xl sm:hidden text-muted-foreground hover:text-foreground"
                >
                  ✕
                </Button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {activeCleanerReceipt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const cleaningsCount = activeCleanerReceipt.count || 0
                      const rate = Number(activeCleanerReceipt.ratePerRoom || report?.defaultRatePerRoom || 35).toFixed(2)
                      const total = Number(activeCleanerReceipt.totalToPay || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                      const name = activeCleanerReceipt.name || activeCleanerReceipt.username
                      const msg = "📄 *CORPFLATS • FECHAMENTO DE DIÁRIAS*\n\nOlá, *" + name + "*!\nSegue o resumo do seu fechamento de governança:\n\n🗓️ *Período:* " + startDate.split('-').reverse().join('/') + " a " + endDate.split('-').reverse().join('/') + "\n🧹 *Total de Quartos Limpos:* " + cleaningsCount + " flats\n💵 *Valor por Quarto:* R$ " + rate + "\n💰 *VALOR TOTAL A RECEBER:* *R$ " + total + "*\n\nObrigado pela dedicação e excelente trabalho! ✨"
                      window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(msg), "_blank")
                    }}
                    className="flex-1 sm:flex-none h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 justify-center"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none h-9 px-3 sm:px-3.5 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm justify-center"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Imprimir / PDF</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReceiptModalOpen(false)}
                  className="hidden sm:inline-flex h-9 w-9 p-0 rounded-xl"
                >
                  ✕
                </Button>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                DOCUMENTO TIMBRADO A4 (FOLHA DE PRESTAÇÃO DE CONTAS)
               ══════════════════════════════════════════════════════════════════════ */}
            {activeCleanerReceipt && (
              <div className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans text-xs">
                {/* Cabeçalho da Empresa */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-900/10 dark:border-slate-100/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg sm:text-xl shadow-sm shrink-0">
                      CF
                    </div>
                    <div>
                      <h2 className="text-base sm:text-xl font-black tracking-tight text-slate-950 dark:text-white uppercase leading-snug">
                        CorpFlats Residence Service
                      </h2>
                      <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Demonstrativo de Fechamento de Diárias • Governança & Camareiras
                      </p>
                    </div>
                  </div>

                  <div className="font-mono text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 sm:text-right bg-slate-50 dark:bg-slate-800/40 p-2 sm:p-0 rounded-xl">
                    <div><strong>Protocolo:</strong> #REC-{format(new Date(), "yyyyMM")}-{String(activeCleanerReceipt.userId).padStart(3, "0")}</div>
                    <div><strong>Emissão:</strong> {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
                  </div>
                </div>

                {/* Período e Dados do Colaborador */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                      Colaboradora Responsável
                    </span>
                    <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{activeCleanerReceipt.name || activeCleanerReceipt.username}</span>
                      <Badge variant="outline" className="text-[10px] font-bold capitalize">
                        {activeCleanerReceipt.role}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                      Período de Apuração
                    </span>
                    <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      {startDate.split('-').reverse().join('/')} até {endDate.split('-').reverse().join('/')}
                    </div>
                  </div>
                </div>

                {/* Card de Valor Total a Receber (Em Grande Destaque) */}
                <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-2 border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-sm">
                  <div className="space-y-1">
                    <span className="text-[11px] sm:text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                      Valor Total Líquido a Receber
                    </span>
                    <div className="text-3xl sm:text-4xl font-black text-emerald-950 dark:text-emerald-100 tracking-tight">
                      R$ {Number(activeCleanerReceipt.totalToPay || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] sm:text-xs text-emerald-800/80 dark:text-emerald-300/80 font-medium">
                      Cálculo: <strong>{activeCleanerReceipt.count} quartos</strong> × <strong>R$ {Number(activeCleanerReceipt.ratePerRoom || report?.defaultRatePerRoom || 35).toFixed(2)}</strong> por quarto limpo
                    </div>
                  </div>

                  <div className="flex items-center sm:items-end">
                    <Badge className="bg-emerald-600 text-white text-[11px] sm:text-xs font-black px-3 py-1 rounded-full shadow-xs">
                      Status: Aprovado para Pagamento
                    </Badge>
                  </div>
                </div>

                {/* Painel de Indicadores de Produtividade */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase block truncate">Flats Executados</span>
                    <div className="text-base sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">{activeCleanerReceipt.count}</div>
                  </div>

                  <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase block truncate">Tempo Médio</span>
                    <div className="text-base sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">~{activeCleanerReceipt.avgDurationMinutes || 35} min</div>
                  </div>

                  <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase block truncate">Conclusão</span>
                    <div className="text-base sm:text-xl font-black text-emerald-600 mt-0.5">100%</div>
                  </div>
                </div>

                {/* Tabela Auditável Completa de Todos os Quartos Limpos (Sem Scroll no Print) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-black text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    <span>Detalhamento dos Apartamentos Atendidos ({activeCleanerReceipt.cleanings?.length || 0} itens):</span>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[460px] sm:min-w-0 border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-2.5 w-10 text-center">#</th>
                          <th className="p-2.5">Data</th>
                          <th className="p-2.5">Horário</th>
                          <th className="p-2.5">Apartamento</th>
                          <th className="p-2.5 text-center">Duração</th>
                          <th className="p-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {([...(activeCleanerReceipt.cleanings || [])].sort((a: any, b: any) => new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime())).map((c: any, idx: number) => {
                          const dateFormatted = c.requestDate ? c.requestDate.split('-').reverse().join('/') : "-"
                          const timeFormatted = c.completedAt ? new Date(c.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "12:00"
                          const rateVal = Number(activeCleanerReceipt.ratePerRoom || report?.defaultRatePerRoom || 35).toFixed(2)

                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                              <td className="p-2.5 text-center font-mono text-slate-400">
                                {String(idx + 1).padStart(2, "0")}
                              </td>
                              <td className="p-2.5 font-medium whitespace-nowrap">
                                {dateFormatted}
                              </td>
                              <td className="p-2.5 font-mono text-slate-500">
                                {timeFormatted}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                Apartamento {c.flatNumber}
                              </td>
                              <td className="p-2.5 text-center font-mono text-slate-500 whitespace-nowrap">
                                {c.durationMinutes || 35} min
                              </td>
                              <td className="p-2.5 text-right font-black text-emerald-600 font-mono whitespace-nowrap">
                                R$ {rateVal}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-300 dark:border-slate-700 font-black text-xs">
                        <tr>
                          <td colSpan={4} className="p-3 text-right uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Total Geral ({activeCleanerReceipt.count} diárias):
                          </td>
                          <td colSpan={2} className="p-3 text-right text-base text-emerald-600 font-mono whitespace-nowrap">
                            R$ {Number(activeCleanerReceipt.totalToPay || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Termo de Encerramento e Assinaturas */}
                <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 italic text-center">
                    "Declaramos para os devidos fins a realização das limpezas e higienizações acima discriminadas no padrão de excelência CorpFlats."
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-3">
                    <div className="text-center space-y-1">
                      <div className="border-t border-slate-400 dark:border-slate-600 w-4/5 sm:w-3/4 mx-auto pt-1.5" />
                      <span className="font-bold text-[11px] sm:text-xs block text-slate-900 dark:text-white">Gestão CorpFlats</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 block">Administração & Governança</span>
                    </div>

                    <div className="text-center space-y-1">
                      <div className="border-t border-slate-400 dark:border-slate-600 w-4/5 sm:w-3/4 mx-auto pt-1.5" />
                      <span className="font-bold text-[11px] sm:text-xs block text-slate-900 dark:text-white">{activeCleanerReceipt.name || activeCleanerReceipt.username}</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 block">Colaboradora Responsável</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
