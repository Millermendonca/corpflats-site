import { useState, useEffect } from "react"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format, subDays, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns"
import { 
  BarChart3, TrendingUp, DollarSign, Calendar, Percent, Building2, 
  DoorOpen, DoorClosed, Globe, ArrowUpRight, ArrowDownRight, Printer, 
  RefreshCw, Sparkles, Filter, ChevronLeft, ChevronRight, PieChart, Users
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function PmsReportsPage() {
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [selectedQuickFilter, setSelectedQuickFilter] = useState<string>("this_month")

  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pms/analytics/reports?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" })
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [startDate, endDate])

  const applyQuickPeriod = (type: "this_month" | "last_month" | "last_30" | "last_90") => {
    setSelectedQuickFilter(type)
    const now = new Date()
    if (type === "this_month") {
      setStartDate(format(startOfMonth(now), "yyyy-MM-dd"))
      setEndDate(format(endOfMonth(now), "yyyy-MM-dd"))
    } else if (type === "last_month") {
      const lastM = subMonths(now, 1)
      setStartDate(format(startOfMonth(lastM), "yyyy-MM-dd"))
      setEndDate(format(endOfMonth(lastM), "yyyy-MM-dd"))
    } else if (type === "last_30") {
      setStartDate(format(subDays(now, 30), "yyyy-MM-dd"))
      setEndDate(format(now, "yyyy-MM-dd"))
    } else if (type === "last_90") {
      setStartDate(format(subDays(now, 90), "yyyy-MM-dd"))
      setEndDate(format(now, "yyyy-MM-dd"))
    }
  }

  if (!loadingUser && user?.role !== "admin") {
    return <Shell><AccessDenied /></Shell>
  }

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto w-full print:p-0 print:m-0 print:max-w-none">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <span>Relatórios & Ocupação (PMS)</span>
                <Badge className="bg-indigo-600 text-white text-[10px]">Indicadores Hoteleiros</Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Taxa de ocupação, diária média (ADR), RevPAR, ranking de rentabilidade dos flats e previsão futura
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-10 px-3.5 rounded-2xl text-xs font-bold gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Relatório</span>
            </Button>
          </div>
        </div>

        {/* ── SELETOR DE PERÍODO RÁPIDO ── */}
        <Card className="rounded-3xl border border-border p-4 shadow-sm print:hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "this_month", label: "Mês Atual" },
                { id: "last_month", label: "Mês Anterior" },
                { id: "last_30", label: "Últimos 30 Dias" },
                { id: "last_90", label: "Últimos 90 Dias" }
              ].map(b => (
                <Button
                  key={b.id}
                  variant={selectedQuickFilter === b.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => applyQuickPeriod(b.id as any)}
                  className="h-9 px-3 text-xs font-bold rounded-xl"
                >
                  {b.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Período:</span>
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => {
                  setStartDate(e.target.value)
                  setSelectedQuickFilter("custom")
                }} 
                className="h-9 text-xs w-32 rounded-xl" 
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => {
                  setEndDate(e.target.value)
                  setSelectedQuickFilter("custom")
                }} 
                className="h-9 text-xs w-32 rounded-xl" 
              />
              <Button size="icon" variant="ghost" onClick={fetchReports} className="h-9 w-9 rounded-xl">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </Card>

        {/* ── CARDS DE PRINCIPAIS INDICADORES HOTELEIROS (KPIs) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {/* Taxa de Ocupação */}
          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Taxa de Ocupação</div>
                <div className="text-2xl font-black text-indigo-600">
                  {data?.metrics?.occupancyRate || 0}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {data?.metrics?.totalNightsSold || 0} noites vendidas
                </div>
              </div>
            </div>
          </Card>

          {/* Diária Média (ADR) */}
          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Diária Média (ADR)</div>
                <div className="text-2xl font-black text-emerald-600">
                  R$ {Number(data?.metrics?.adr || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Preço médio por noite
                </div>
              </div>
            </div>
          </Card>

          {/* RevPAR */}
          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">RevPAR</div>
                <div className="text-2xl font-black text-blue-600">
                  R$ {Number(data?.metrics?.revPar || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Receita / quarto disponível
                </div>
              </div>
            </div>
          </Card>

          {/* Receita Bruta Total */}
          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Receita de Hospedagem</div>
                <div className="text-xl font-black text-foreground">
                  R$ {(data?.metrics?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {data?.metrics?.totalStays || 0} reservas no período
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── ABAS DE RELATÓRIOS DETALHADOS ── */}
        <Tabs defaultValue="flats" className="space-y-4">
          <TabsList className="bg-card border border-border p-1.5 rounded-2xl h-auto grid grid-cols-2 md:grid-cols-4 gap-1.5 shadow-xs print:hidden">
            <TabsTrigger value="flats" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="w-4 h-4" />
              <span>🏆 Performance dos Flats</span>
            </TabsTrigger>

            <TabsTrigger value="checkins" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DoorOpen className="w-4 h-4" />
              <span>🚪 Check-ins & Outs ({data?.checkins?.length || 0})</span>
            </TabsTrigger>

            <TabsTrigger value="channels" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="w-4 h-4" />
              <span>🌐 Canais de Venda</span>
            </TabsTrigger>

            <TabsTrigger value="forecast" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sparkles className="w-4 h-4" />
              <span>🔮 Previsão Futura (Forecast)</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 1: RANKING E PERFORMANCE POR APARTAMENTO
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="flats" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
              <CardHeader className="p-5 border-b border-border bg-muted/20">
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <span>Ranking de Faturamento & Rentabilidade por Flat</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Comparativo de receita bruta, noites vendidas, taxa de ocupação individual e diária média de cada apartamento
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                      <tr>
                        <th className="p-3.5">Apartamento</th>
                        <th className="p-3.5 text-center">Noites Vendidas</th>
                        <th className="p-3.5 text-center">Taxa de Ocupação</th>
                        <th className="p-3.5 text-center">Diária Média (ADR)</th>
                        <th className="p-3.5 text-right">Receita Bruta Gerada (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(!data?.rankingFlats || data.rankingFlats.length === 0) ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma reserva registrada no período selecionado.</td>
                        </tr>
                      ) : (
                        data.rankingFlats.map((f: any, idx: number) => (
                          <tr key={f.flatNumber} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3.5 font-bold text-sm text-foreground flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-[10px] font-mono text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <span>Flat {f.flatNumber}</span>
                            </td>

                            <td className="p-3.5 text-center font-semibold">
                              {f.nightsSold} noites ({f.staysCount} estadias)
                            </td>

                            <td className="p-3.5 text-center">
                              <Badge variant="outline" className="font-mono text-xs font-bold">
                                {f.occupancyRate}%
                              </Badge>
                            </td>

                            <td className="p-3.5 text-center font-mono font-semibold text-muted-foreground">
                              R$ {f.adr.toFixed(2)}
                            </td>

                            <td className="p-3.5 text-right font-black text-emerald-600 text-sm">
                              R$ {f.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 2: CHECK-INS E CHECK-OUTS DO PERÍODO
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="checkins" className="space-y-4 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Entradas */}
              <Card className="rounded-3xl border border-border shadow-sm">
                <CardHeader className="p-5 border-b border-border bg-emerald-500/5">
                  <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                    <DoorOpen className="w-4 h-4 text-emerald-600" />
                    <span>Entradas / Check-ins no Período ({data?.checkins?.length || 0})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {(!data?.checkins || data.checkins.length === 0) ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">Nenhum check-in registrado.</div>
                    ) : (
                      data.checkins.map((c: any) => (
                        <div key={c.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-muted/20">
                          <div>
                            <div className="font-bold text-foreground">{c.guestName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              Flat <strong>{c.flatNumber}</strong> • Entrada: {c.checkinDate.split('-').reverse().join('/')}
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold text-emerald-600">
                            R$ {Number(c.totalAmount || 0).toFixed(2)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Saídas */}
              <Card className="rounded-3xl border border-border shadow-sm">
                <CardHeader className="p-5 border-b border-border bg-rose-500/5">
                  <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                    <DoorClosed className="w-4 h-4 text-rose-600" />
                    <span>Saídas / Check-outs no Período ({data?.checkouts?.length || 0})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {(!data?.checkouts || data.checkouts.length === 0) ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">Nenhum check-out registrado.</div>
                    ) : (
                      data.checkouts.map((c: any) => (
                        <div key={c.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-muted/20">
                          <div>
                            <div className="font-bold text-foreground">{c.guestName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              Flat <strong>{c.flatNumber}</strong> • Saída: {c.checkoutDate.split('-').reverse().join('/')}
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold text-muted-foreground">
                            Saída
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 3: CANAIS DE VENDA E ORIGEM DAS RESERVAS
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="channels" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-600" />
                  <span>Distribuição por Canal de Origem</span>
                </CardTitle>
                <CardDescription className="text-xs">De onde vêm as reservas do CorpFlats</CardDescription>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {(data?.channels || []).map((ch: any) => (
                    <div key={ch.channel} className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-foreground">{ch.channel}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Canal de Aquisição</div>
                      </div>
                      <div className="text-2xl font-black text-primary">
                        {ch.count}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 4: PREVISÃO DE OCUPAÇÃO FUTURA (FORECAST)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="forecast" className="space-y-4 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Próximos 30 dias */}
              <Card className="rounded-3xl border border-border shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-black text-sm">
                      30d
                    </div>
                    <div>
                      <h3 className="font-black text-base text-foreground">Previsão Próximos 30 Dias</h3>
                      <p className="text-xs text-muted-foreground">Reservas já confirmadas no sistema</p>
                    </div>
                  </div>
                  <Badge className="bg-indigo-600 text-white text-xs">
                    {data?.forecast?.next30Days?.occupancyRate || 0}% Ocupação
                  </Badge>
                </div>

                <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita Já Garantida:</span>
                    <strong className="text-emerald-600 text-sm font-black">
                      R$ {(data?.forecast?.next30Days?.confirmedRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Noites Reservadas:</span>
                    <strong>{data?.forecast?.next30Days?.confirmedNights || 0} noites</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total de Reservas Futuras:</span>
                    <strong>{data?.forecast?.next30Days?.reservationsCount || 0}</strong>
                  </div>
                </div>
              </Card>

              {/* Próximos 60 dias */}
              <Card className="rounded-3xl border border-border shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black text-sm">
                      60d
                    </div>
                    <div>
                      <h3 className="font-black text-base text-foreground">Previsão Próximos 60 Dias</h3>
                      <p className="text-xs text-muted-foreground">Projeção de médio prazo</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-600 text-white text-xs">
                    {data?.forecast?.next60Days?.occupancyRate || 0}% Ocupação
                  </Badge>
                </div>

                <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita Confirmada 60d:</span>
                    <strong className="text-emerald-600 text-sm font-black">
                      R$ {(data?.forecast?.next60Days?.confirmedRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Noites Reservadas:</span>
                    <strong>{data?.forecast?.next60Days?.confirmedNights || 0} noites</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total de Reservas Futuras:</span>
                    <strong>{data?.forecast?.next60Days?.reservationsCount || 0}</strong>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  )
}
