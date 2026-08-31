import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Building2, Calendar, Users, Wifi, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Maximize, Minimize, Activity, TrendingUp, DollarSign, Car,
  RefreshCw, Check, Zap, Flame, Waves, Dumbbell, Shield
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function LiveOperationsPanel() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  // Relógio em tempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/live-ops/metrics")
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastRefreshed(new Date())
      }
    } catch (e) {
      console.warn("Erro ao buscar live metrics:", e)
    } finally {
      setLoading(false)
    }
  }

  // Live Polling a cada 5 segundos (Live Command Center)
  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000)
    return () => clearInterval(interval)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const occ = data?.occupancy || { rate: 0, occupiedCount: 0, totalFlats: 10, next7Days: [] }
  const checkins = data?.checkins || { total: 0, done: 0, pending: 0, list: [] }
  const checkouts = data?.checkouts || { total: 0, done: 0, pending: 0, list: [] }
  const gov = data?.governance || { clean: 0, inProgress: 0, dirty: 0, maintenance: 0, flatsMap: [] }
  const fin = data?.financial || { todayRevenue: 0, monthRevenue: 0, adr: 0, revpar: 0, benchmarkSohoPrice: 289, corpFlatsPrice: 250, benchmarkSavingsPercent: 14 }
  const traffic = data?.traffic || { visitorsToday: 0, convertedToday: 0, conversionRate: "0%", cartAbandonmentCount: 0 }
  const breakfast = data?.breakfast || { count: 0, orders: [] }
  const events = data?.liveEvents || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 font-sans select-none flex flex-col justify-between overflow-x-hidden">
      {/* ── Top Command Bar ────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 py-3 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-black text-lg shadow-lg">
            CF
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-tight">CorpFlats • Live Command Center</h1>
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                AO VIVO (27" Display)
              </Badge>
            </div>
            <span className="text-[11px] text-slate-400 font-medium block">
              Edifício Soho Residence Service • Campos dos Goytacazes - RJ
            </span>
          </div>
        </div>

        {/* Relógio Digital Grande com Segundos */}
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <span className="text-2xl font-mono font-black text-amber-400 tracking-wider block">
              {format(currentTime, "HH:mm:ss")}
            </span>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
              {format(currentTime, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMetrics}
              className="h-9 px-3 bg-slate-900 border-slate-700 text-slate-300 hover:text-white text-xs font-bold gap-1.5 rounded-xl"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden md:inline">Atualizar</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="h-9 px-3 bg-slate-900 border-slate-700 text-amber-400 hover:text-amber-300 text-xs font-bold gap-1.5 rounded-xl"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isFullscreen ? "Sair Tela Cheia" : "Tela Cheia"}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Dashboard Grid (4 Colunas para 27") ────────────────────── */}
      <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 my-3.5 flex-1">
        
        {/* ══ COLUNA 1: Feed de Eventos em Tempo Real ════════════════════ */}
        <Card className="bg-slate-900/80 border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-800/80 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Feed de Eventos Ao Vivo
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700 font-mono">
              {events.length} logs
            </Badge>
          </CardHeader>
          <CardContent className="p-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-190px)] space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 font-medium">
                Aguardando novos eventos do sistema...
              </div>
            ) : (
              events.map((ev: any, idx: number) => (
                <div 
                  key={ev.id || idx} 
                  className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1 hover:border-slate-700 transition-colors animate-in fade-in"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-xs text-white truncate">{ev.title}</span>
                    <Badge className={`${ev.badgeColor || 'bg-slate-700'} text-white text-[9px] px-1.5 py-0 font-bold shrink-0`}>
                      {ev.badge}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-300 font-medium truncate">{ev.subtitle}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span className="truncate">{ev.detail}</span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {ev.time ? format(new Date(ev.time), "HH:mm") : "--:--"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ══ COLUNA 2: Operações do Dia (Ocupação, Check-ins/Outs) ════════ */}
        <div className="space-y-3.5 flex flex-col justify-between">
          
          {/* Card Ocupação Hoje */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-amber-400" />
                Taxa de Ocupação Hoje
              </span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                {occ.rate}%
              </span>
            </div>

            {/* Barra de Progresso de Ocupação */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div 
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, occ.rate))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-1">
              <span>{occ.occupiedCount} de {occ.totalFlats} flats ocupados</span>
              <span className="text-emerald-400 font-bold">{occ.totalFlats - occ.occupiedCount} disponíveis</span>
            </div>

            {/* Mini Grid Próximos 7 Dias */}
            <div className="grid grid-cols-7 gap-1 mt-3 pt-3 border-t border-slate-800 text-center">
              {occ.next7Days?.map((d: any, i: number) => (
                <div key={i} className="bg-slate-950 p-1 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-400 block font-bold uppercase">{d.dayName}</span>
                  <span className="text-[10px] font-black text-white block">{d.dayNum}</span>
                  <span className={`text-[10px] font-bold block ${d.occupancyRate >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {d.occupancyRate}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Card Check-ins & Check-outs do Dia */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              {/* Check-ins */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" /> Check-ins Hoje
                  </span>
                  <span className="text-white font-mono">{checkins.done} / {checkins.total} ({checkins.total > 0 ? Math.round((checkins.done/checkins.total)*100) : 100}%)</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${checkins.total > 0 ? (checkins.done / checkins.total) * 100 : 0}%` }}
                  />
                </div>
                {checkins.list?.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-20 overflow-y-auto">
                    {checkins.list.slice(0, 3).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[11px] bg-slate-950 px-2 py-1 rounded border border-slate-800/80">
                        <span className="font-bold text-slate-200 truncate">Apt {c.flatNumber} • {c.guestName}</span>
                        <Badge className={`${c.isDone ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800'} text-[9px] px-1 py-0`}>
                          {c.isDone ? 'Concluído' : 'Pendente'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Check-outs */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-sky-400 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" /> Check-outs Hoje
                  </span>
                  <span className="text-white font-mono">{checkouts.done} / {checkouts.total} ({checkouts.total > 0 ? Math.round((checkouts.done/checkouts.total)*100) : 100}%)</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="bg-sky-500 h-full rounded-full transition-all"
                    style={{ width: `${checkouts.total > 0 ? (checkouts.done / checkouts.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Governança rápida */}
            <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-slate-800 text-center text-xs mt-2">
              <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold">Limpos</span>
                <span className="font-black text-emerald-400 text-sm">{gov.clean}</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold">Faxina</span>
                <span className="font-black text-amber-400 text-sm">{gov.inProgress}</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold">Sujos</span>
                <span className="font-black text-rose-400 text-sm">{gov.dirty}</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold">Avarias</span>
                <span className="font-black text-purple-400 text-sm">{gov.maintenance}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ══ COLUNA 3: Café da Manhã & Garagem Soho ═════════════════════ */}
        <div className="space-y-3.5 flex flex-col justify-between">
          
          {/* Card Café da Manhã Hoje */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-amber-400" />
                Cafés no Quarto ({breakfast.count})
              </span>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold">
                Hoje
              </Badge>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {breakfast.orders?.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  Nenhum pedido de café para hoje.
                </div>
              ) : (
                breakfast.orders.map((ord: any, idx: number) => (
                  <div key={idx} className="p-2 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">Apt {ord.flatNumber} • {ord.guestName}</span>
                      <span className="text-[10px] text-slate-400">Entrega às {ord.deliveryTime}</span>
                    </div>
                    <Badge className={`${ord.status === 'Entregue' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'} text-[9px] font-bold`}>
                      {ord.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Card Benchmark de Mercado Soho Residence */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                Radar Competitivo • Soho Residence
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Comparativo de diárias de outros flats alugados por terceiros no mesmo condomínio:
              </p>

              <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Média Soho (Outros)</span>
                  <span className="text-lg font-black text-slate-300">R$ {fin.benchmarkSohoPrice}</span>
                </div>
                <div className="bg-emerald-950/40 p-2 rounded-xl border border-emerald-800/60">
                  <span className="text-[10px] text-emerald-400 block font-bold">CorpFlats Direto</span>
                  <span className="text-lg font-black text-emerald-400">R$ {fin.corpFlatsPrice}</span>
                </div>
              </div>
            </div>

            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-300 font-bold mt-2">
              Vantagem competitiva: {fin.benchmarkSavingsPercent}% mais barato no site direto!
            </div>
          </Card>
        </div>

        {/* ══ COLUNA 4: Financeiro & Conversões de Anúncios ═══════════════ */}
        <div className="space-y-3.5 flex flex-col justify-between">
          
          {/* Card Financeiro */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Receita em Tempo Real
            </span>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400 font-bold">Receita de Hoje:</span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  R$ {fin.todayRevenue.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-800 pt-1.5">
                <span className="text-xs text-slate-400 font-bold">Acumulado Mês:</span>
                <span className="text-lg font-black text-white font-mono">
                  R$ {fin.monthRevenue.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-center text-xs">
                <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-500 block font-bold">Diária Média (ADR)</span>
                  <span className="font-black text-slate-300">R$ {fin.adr}</span>
                </div>
                <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-500 block font-bold">RevPAR</span>
                  <span className="font-black text-slate-300">R$ {fin.revpar}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Card Conversões de Marketing & Tráfego */}
          <Card className="bg-slate-900/80 border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Funil de Anúncios & Site
              </span>

              <div className="grid grid-cols-3 gap-1.5 text-center my-2">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-bold">Visitas</span>
                  <span className="text-base font-black text-white">{traffic.visitorsToday}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-bold">Carrinhos</span>
                  <span className="text-base font-black text-amber-400">{traffic.cartAbandonmentCount}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-bold">Reservas</span>
                  <span className="text-base font-black text-emerald-400">{traffic.convertedToday}</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
              <span className="text-slate-400 font-bold">Taxa de Conversão:</span>
              <span className="font-black text-emerald-400 text-sm font-mono">{traffic.conversionRate}</span>
            </div>
          </Card>
        </div>

      </main>

      {/* ── Bottom Status Bar ────────────────────────────────────────────── */}
      <footer className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 pt-2 border-t border-slate-800/80 px-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            PostgreSQL Cloud & Microsoft Graph Sincronizados
          </span>
          <span>•</span>
          <span>Última checagem: {format(lastRefreshed, "HH:mm:ss")}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>CorpFlats PMS v3.0 • Monitor Operacional 24/7</span>
        </div>
      </footer>
    </div>
  )
}
