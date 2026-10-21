import { useState, useEffect, useRef, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Building2, Coffee, ShieldCheck, Sparkles, CheckCircle2,
  ArrowRight, Clock, KeyRound, MessageCircle, AlertTriangle,
  Maximize, Minimize, Activity, TrendingUp, DollarSign,
  RefreshCw, Zap, Star, Wrench, Smile, Meh, Frown,
  Volume2, VolumeX, Server, Bot, Globe, Lock, Unlock,
  FileCheck2, CreditCard, Flame, Pause, Play, Wine
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// ══════════════════════════════════════════════════════════════════════════════
// SINTETIZADOR DE ÁUDIO DISCRETO (WEB AUDIO API — ZERO DEPENDÊNCIA DE MP3)
// ══════════════════════════════════════════════════════════════════════════════
function playSynthesizedSound(type: "booking" | "clean" | "alert") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    if (type === "booking") {
      // Som executivo de "Caixa Registradora / Chime Duplo" (Nova Reserva / PIX)
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(987.77, now) // B5
      osc1.frequency.setValueAtTime(1318.51, now + 0.11) // E6
      gain1.gain.setValueAtTime(0.14, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.55)
    } else if (type === "clean") {
      // Ping suave de governança (Flat Limpo e Pronto)
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "triangle"
      osc.frequency.setValueAtTime(659.25, now) // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18) // A5
      gain.gain.setValueAtTime(0.1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.4)
    } else if (type === "alert") {
      // Alerta discreto de atenção operacional (Duplo pulso grave-médio)
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.setValueAtTime(349.23, now + 0.18)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.45)
    }
  } catch {
    // Ignora caso o navegador bloqueie autoplay antes da primeira interação
  }
}

const DEFAULT_19_FLATS = [
  "113", "114", "116", "211",
  "212", "215", "313", "408",
  "509", "511", "512", "605",
  "712", "715", "904", "905",
  "907", "1004", "1304"
]

const CAROUSEL_INTERVAL_MS = 15000 // 15 segundos por slide

export default function LiveOperationsPanel() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Carrossel da Zona D (0: Financeiro/Comercial, 1: Clima/Avaliações/NPS, 2: Manutenção/Frigobar/Café)
  const [activeSlide, setActiveSlide] = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [slideProgress, setSlideProgress] = useState(0)

  // Rotação de alertas críticos no topo
  const [activeAlertIdx, setActiveAlertIdx] = useState(0)

  // Referência para detectar mudanças e tocar avisos sonoros
  const prevCountersRef = useRef<{
    reservationsCount: number
    paidReservationsCount: number
    cleanFlatsTodayCount: number
    criticalAlertsCount: number
  } | null>(null)

  // Relógio em tempo real (1s)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Rotação do Carrossel da Zona D (15s por slide com barra de progresso suave)
  useEffect(() => {
    if (carouselPaused) return
    const stepMs = 250
    const increment = (stepMs / CAROUSEL_INTERVAL_MS) * 100
    const timer = setInterval(() => {
      setSlideProgress((prev) => {
        if (prev + increment >= 100) {
          setActiveSlide((s) => (s + 1) % 3)
          return 0
        }
        return prev + increment
      })
    }, stepMs)
    return () => clearInterval(timer)
  }, [carouselPaused])

  // Rotação do Banner de Alertas Críticos no Topo (5s)
  useEffect(() => {
    const alertsLen = data?.criticalAlerts?.length || 0
    if (alertsLen <= 1) {
      setActiveAlertIdx(0)
      return
    }
    const timer = setInterval(() => {
      setActiveAlertIdx((i) => (i + 1) % alertsLen)
    }, 5000)
    return () => clearInterval(timer)
  }, [data?.criticalAlerts?.length])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/live-ops/metrics")
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastRefreshed(new Date())

        // Checagem de gatilhos sonoros
        if (json.soundCounters) {
          const prev = prevCountersRef.current
          const curr = json.soundCounters
          if (prev && soundEnabled) {
            if (
              curr.reservationsCount > prev.reservationsCount ||
              curr.paidReservationsCount > prev.paidReservationsCount
            ) {
              playSynthesizedSound("booking")
            } else if (curr.criticalAlertsCount > prev.criticalAlertsCount) {
              playSynthesizedSound("alert")
            } else if (curr.cleanFlatsTodayCount > prev.cleanFlatsTodayCount) {
              playSynthesizedSound("clean")
            }
          }
          prevCountersRef.current = curr
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar live metrics:", e)
    } finally {
      setLoading(false)
    }
  }, [soundEnabled])

  // Polling Ao Vivo a cada 5 segundos
  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Extração segura de dados
  const health = data?.systemHealth || {
    zapi: { connected: true, label: "Z-API Online" },
    sofiaAi: { active: true, activePreReservationsCount: 0, unmetDemandsCount: 0 },
    otaWbp: { synced: true, quarantinePendingCount: 0 },
    server: { rssMB: 180, cloudSynced: true }
  }
  const criticalAlerts: any[] = data?.criticalAlerts || []
  const currentAlert = criticalAlerts[activeAlertIdx] || null

  const occ = data?.occupancy || { rate: 0, occupiedCount: 0, totalFlats: 19, next7Days: [] }
  const checkins = data?.checkins || { total: 0, done: 0, pending: 0, list: [] }
  const checkouts = data?.checkouts || { total: 0, done: 0, pending: 0, list: [] }
  const turnarounds: any[] = data?.turnarounds || []
  const gov = data?.governance || { clean: 0, inProgress: 0, dirty: 0, maintenance: 0 }

  const rawFlatsGrid: any[] = data?.flatsGrid || []
  const flatsGrid = rawFlatsGrid.length >= 19
    ? rawFlatsGrid
    : DEFAULT_19_FLATS.map((num, i) => {
        const existing = rawFlatsGrid.find((f: any) => String(f.number) === num)
        if (existing) return existing
        return {
          id: i + 1,
          number: num,
          shortType: "Flat",
          visualState: "available_clean",
          cleanStatus: "clean",
          maidName: null,
          isOccupied: false,
          isTurnaround: false,
          currentGuest: null,
          arrivingToday: null,
          leavingToday: null,
          badges: null,
          maintenance: { hasIssue: false }
        }
      })

  const wppClimate = data?.whatsappClimate || {
    analyzedCount: 0,
    avgScore: 88,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    positivePercent: 85,
    neutralPercent: 15,
    negativePercent: 0,
    attentionQueue: [],
    activePreReservations: [],
    unmetDemandsCount: 0
  }

  const rep = data?.reputationAndNps || {
    avgReviewScore: 4.9,
    totalReviews: 0,
    npsSent: 0,
    npsResponded: 0,
    npsPromoters: 0,
    npsNeutrals: 0,
    npsDetractors: 0,
    npsSatisfactionRate: 100,
    recentFeedbacks: [],
    pendingImprovementsCount: 0,
    pendingImprovementItems: []
  }

  const maintOps = data?.maintenanceAndOps || {
    activeOsCount: 0,
    pendingObsCount: 0,
    serviceOrdersList: [],
    minibarOrdersTodayCount: 0,
    minibarRevenueToday: 0
  }

  const breakfast = data?.breakfast || { count: 0, deliveredCount: 0, pendingCount: 0, orders: [] }
  const fin = data?.financial || {
    todayRevenue: 0,
    monthRevenue: 0,
    adr: 250,
    revpar: 0,
    benchmarkSohoPrice: 289,
    corpFlatsPrice: 250,
    benchmarkSavingsPercent: 14,
    channelCounts: { site: 0, whatsapp: 0, booking: 0, airbnb: 0, corporate: 0 }
  }
  const traffic = data?.traffic || { visitorsToday: 0, convertedToday: 0, conversionRate: "0%", cartAbandonmentCount: 0 }
  const events: any[] = data?.liveEvents || []

  // Estilização semântica dos Cards dos 15 Flats
  const getFlatCardStyle = (flat: any) => {
    switch (flat.visualState) {
      case "turnaround_dirty":
        return {
          card: "bg-gradient-to-br from-rose-950/90 via-rose-950/60 to-slate-950 border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.25)] animate-pulse",
          badge: "bg-rose-600 text-white",
          badgeText: "⚡ GIRO • SUJO",
          numColor: "text-rose-300"
        }
      case "dirty":
        return {
          card: "bg-gradient-to-br from-rose-950/60 to-slate-950 border-rose-800/70",
          badge: "bg-rose-900/90 text-rose-200 border border-rose-700",
          badgeText: "AGUARD. FAXINA",
          numColor: "text-rose-300"
        }
      case "cleaning":
        return {
          card: "bg-gradient-to-br from-amber-950/80 via-amber-950/40 to-slate-950 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.2)]",
          badge: "bg-amber-500 text-slate-950 font-black animate-pulse",
          badgeText: "🧹 EM FAXINA",
          numColor: "text-amber-300"
        }
      case "maintenance":
        return {
          card: "bg-gradient-to-br from-purple-950/80 to-slate-950 border-purple-500/70",
          badge: "bg-purple-600 text-white",
          badgeText: "🛠️ MANUTENÇÃO",
          numColor: "text-purple-300"
        }
      case "ready_checkin_today":
        return {
          card: "bg-gradient-to-br from-emerald-950/80 via-emerald-950/40 to-slate-950 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
          badge: "bg-emerald-500 text-slate-950 font-black",
          badgeText: "✓ PRONTO CHECK-IN",
          numColor: "text-emerald-300"
        }
      case "occupied":
        return {
          card: "bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-sky-800/60",
          badge: "bg-sky-950 text-sky-300 border border-sky-800/80",
          badgeText: "HÓSPEDE NA CASA",
          numColor: "text-sky-300"
        }
      default:
        return {
          card: "bg-gradient-to-br from-emerald-950/30 to-slate-950/90 border-emerald-900/50",
          badge: "bg-emerald-950/90 text-emerald-400 border border-emerald-800/60",
          badgeText: "LIVRE & LIMPO",
          numColor: "text-emerald-400"
        }
    }
  }

  const formatShortGuestName = (name: string | null) => {
    if (!name) return ""
    const parts = String(name).trim().split(/\s+/)
    if (parts.length <= 2) return name
    return `${parts[0]} ${parts[parts.length - 1]}`
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 p-2.5 xl:p-3.5 font-sans select-none flex flex-col justify-between overflow-hidden">
      {/* ════════════════════════════════════════════════════════════════════════
          🧭 ZONA A — BARRA DE COMANDO, RADAR DE URGÊNCIAS & SAÚDE TÉCNICA
      ════════════════════════════════════════════════════════════════════════ */}
      <header className="grid grid-cols-12 items-center gap-3 bg-slate-900/80 border border-slate-800/90 px-3.5 py-2 rounded-2xl shrink-0 shadow-lg">
        {/* Identidade Esquerda (3 cols) */}
        <div className="col-span-3 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-black text-base shadow-md shrink-0">
            CF
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm xl:text-base font-black text-white tracking-tight truncate">
                CorpFlats • Command Center
              </h1>
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                32&quot; LIVE
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
              <span className="truncate">Soho Residence • Gestão Executiva</span>
            </div>
          </div>
        </div>

        {/* Faixa Central de Urgências Dinâmicas (5 cols) */}
        <div className="col-span-5">
          {currentAlert ? (
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                currentAlert.severity === "critical"
                  ? "bg-rose-950/90 border-rose-500 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-pulse"
                  : "bg-amber-950/80 border-amber-500/80 text-amber-100"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 ${
                    currentAlert.severity === "critical" ? "text-rose-400" : "text-amber-400"
                  }`}
                />
                <span className="text-xs font-black tracking-wide truncate">
                  {currentAlert.title}
                </span>
              </div>
              {criticalAlerts.length > 1 && (
                <Badge className="bg-slate-950/80 text-slate-300 text-[9px] font-mono shrink-0">
                  {activeAlertIdx + 1}/{criticalAlerts.length}
                </Badge>
              )}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl border border-emerald-800/50 bg-emerald-950/25 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-emerald-300 truncate">
                  Operação 100% dentro do SLA • Sem gargalos críticos de giro ou atendimento
                </span>
              </div>
              <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[9px] font-mono shrink-0">
                SLA OK
              </Badge>
            </div>
          )}
        </div>

        {/* Saúde Técnica + Relógio Digital Grande (4 cols) */}
        <div className="col-span-4 flex items-center justify-end gap-3">
          {/* Pílulas de Saúde Técnica */}
          <div className="hidden 2xl:flex items-center gap-1.5">
            <div
              className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                health.zapi.connected
                  ? "bg-slate-950 border-slate-800 text-emerald-400"
                  : "bg-rose-950 border-rose-600 text-rose-300 animate-pulse"
              }`}
              title="Status WhatsApp Z-API"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${health.zapi.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
              Z-API
            </div>
            <div
              className="px-2 py-1 rounded-lg border bg-slate-950 border-slate-800 text-sky-400 text-[10px] font-bold flex items-center gap-1"
              title="Agente IA Sofia"
            >
              <Bot className="w-3 h-3" />
              Sofia IA
            </div>
            <div
              className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                health.otaWbp.synced
                  ? "bg-slate-950 border-slate-800 text-indigo-400"
                  : "bg-amber-950 border-amber-500 text-amber-300 animate-pulse"
              }`}
              title="Sincronização OTAs / WebBookingPro"
            >
              <Globe className="w-3 h-3" />
              {health.otaWbp.quarantinePendingCount > 0 ? `OTA (${health.otaWbp.quarantinePendingCount})` : "OTAs OK"}
            </div>
          </div>

          {/* Relógio Digital com Segundos */}
          <div className="text-right leading-none border-l border-slate-800 pl-3">
            <span className="text-xl xl:text-2xl font-mono font-black text-amber-400 tracking-wider block">
              {format(currentTime, "HH:mm:ss")}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
              {format(currentTime, "EEE, dd MMM yyyy", { locale: ptBR })}
            </span>
          </div>

          {/* Botões Discretos: Voltar ao PMS, Som & Tela Cheia */}
          <div className="flex items-center gap-1">
            <a
              href="/reservas"
              title="Voltar ao Mapa de Reservas (PMS)"
              className="h-8 px-2.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-bold flex items-center gap-1"
            >
              ← PMS
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = !soundEnabled
                setSoundEnabled(next)
                if (next) playSynthesizedSound("clean")
              }}
              title={soundEnabled ? "Avisos sonoros ativados" : "Avisos sonoros silenciados"}
              className={`h-8 w-8 p-0 rounded-xl border-slate-800 ${
                soundEnabled ? "bg-slate-950 text-emerald-400" : "bg-slate-950 text-slate-500"
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              title="Alternar Tela Cheia"
              className="h-8 w-8 p-0 bg-slate-950 border-slate-800 text-amber-400 hover:text-amber-300 rounded-xl"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════════
          CORPO PRINCIPAL DE 12 COLUNAS (ZONA B + ZONA C + ZONA D)
      ════════════════════════════════════════════════════════════════════════ */}
      <main className="grid grid-cols-12 gap-3 my-2.5 flex-1 min-h-0">
        {/* ════════════════════════════════════════════════════════════════════
            🏢 ZONA B — MAPA VISUAL AO VIVO DOS 19 FLATS (5 Colunas • Fixo • Grid 4x5)
        ════════════════════════════════════════════════════════════════════ */}
        <section className="col-span-5 bg-slate-900/75 border border-slate-800/90 rounded-2xl p-3 flex flex-col justify-between min-h-0 shadow-xl">
          {/* Header da Zona B + Resumo de Governança */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-white">
                Mapa Ao Vivo das 19 Unidades
              </h2>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-sky-950/90 text-sky-300 border border-sky-800/70">
                Ocup: {occ.occupiedCount}/{occ.totalFlats}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-800/70">
                Prontos: {gov.clean}
              </span>
              {gov.inProgress > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse">
                  Faxina: {gov.inProgress}
                </span>
              )}
              {gov.dirty > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-800">
                  Sujos: {gov.dirty}
                </span>
              )}
            </div>
          </div>

          {/* Grid 4x5 (19 Flats + 1 Card de Fechamento da Grade) */}
          <div className="grid grid-cols-4 grid-rows-5 gap-1.5 flex-1 min-h-0">
            {flatsGrid.slice(0, 19).map((flat: any) => {
              const st = getFlatCardStyle(flat)
              const guestDisplay = flat.arrivingToday
                ? formatShortGuestName(flat.arrivingToday.guestName)
                : flat.currentGuest
                ? formatShortGuestName(flat.currentGuest)
                : null

              return (
                <div
                  key={flat.id || flat.number}
                  className={`rounded-xl border p-1.5 flex flex-col justify-between transition-all overflow-hidden ${st.card}`}
                >
                  {/* Topo do Card: Número do Flat + Badge de Status */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-baseline gap-1 leading-none">
                      <span className={`text-base xl:text-lg font-black font-mono tracking-tight ${st.numColor}`}>
                        {flat.number}
                      </span>
                      {flat.isTurnaround && (
                        <span
                          className="text-[8px] font-black bg-amber-500 text-slate-950 px-1 py-0 rounded uppercase"
                          title="Dobradinha: Sai hoje e Entra hoje!"
                        >
                          GIRO
                        </span>
                      )}
                    </div>
                    <span className={`text-[7px] xl:text-[8px] font-bold px-1 py-0.5 rounded truncate ${st.badge}`}>
                      {st.badgeText}
                    </span>
                  </div>

                  {/* Meio do Card: Hóspede / Camareira / Manutenção */}
                  <div className="my-auto py-0.5 min-w-0">
                    {flat.cleanStatus === "in_progress" && flat.maidName ? (
                      <div className="text-[9px] text-amber-200 font-bold truncate flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        <span className="truncate">{flat.maidName}</span>
                      </div>
                    ) : flat.maintenance?.hasIssue ? (
                      <div className="text-[9px] text-purple-200 font-bold truncate flex items-center gap-1">
                        <Wrench className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                        <span className="truncate">{flat.maintenance.title || "OS Aberta"}</span>
                      </div>
                    ) : guestDisplay ? (
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold text-white truncate leading-tight">
                          {guestDisplay}
                        </p>
                        <p className="text-[8px] text-slate-400 font-medium truncate">
                          {flat.arrivingToday
                            ? `Entra hoje (${flat.arrivingToday.checkinTime || "14:00"})`
                            : flat.leavingToday && !flat.leavingToday.isDone
                            ? `Sai às ${flat.leavingToday.checkoutTime || "12:00"}`
                            : flat.checkoutDate
                            ? `Até ${flat.checkoutDate.slice(8, 10)}/${flat.checkoutDate.slice(5, 7)}`
                            : flat.shortType}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 font-medium truncate">
                        {flat.shortType} • Livre
                      </p>
                    )}
                  </div>

                  {/* Rodapé do Card: Micro-Indicadores (FNRH, Pagto, Senha, Humor WhatsApp) */}
                  <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-slate-800/70 text-[8px] font-bold">
                    {flat.badges ? (
                      <>
                        <div className="flex items-center gap-0.5">
                          <span
                            className={`px-1 py-0 rounded ${
                              flat.badges.fnrh
                                ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800/60"
                                : "bg-amber-950/90 text-amber-300 border border-amber-800/60"
                            }`}
                            title={flat.badges.fnrh ? "FNRH Assinada" : "FNRH Pendente"}
                          >
                            FNRH
                          </span>
                          <span
                            className={`px-1 py-0 rounded ${
                              flat.badges.paid
                                ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800/60"
                                : "bg-rose-950/90 text-rose-300 border border-rose-800/60"
                            }`}
                            title={flat.badges.paid ? "Pagamento Confirmado" : "Pagamento Pendente"}
                          >
                            R$
                          </span>
                          <span
                            className={`px-1 py-0 rounded flex items-center ${
                              flat.badges.password
                                ? "bg-sky-950/90 text-sky-300 border border-sky-800/60"
                                : "bg-slate-900 text-slate-500 border border-slate-800"
                            }`}
                            title={flat.badges.password ? "Senha Enviada" : "Senha Aguardando"}
                          >
                            {flat.badges.password ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                          </span>
                        </div>

                        {/* Emoji de Sentimento no WhatsApp */}
                        <div className="flex items-center gap-0.5">
                          {flat.badges.whatsappTone === "negative" ? (
                            <span className="text-rose-400 font-black animate-bounce" title="Humor Crítico no WhatsApp">
                              😠
                            </span>
                          ) : flat.badges.whatsappTone === "neutral" ? (
                            <span className="text-amber-300" title="Humor Neutro no WhatsApp">
                              😐
                            </span>
                          ) : flat.badges.whatsappTone === "positive" ? (
                            <span className="text-emerald-400" title="Hóspede Satisfeito no WhatsApp">
                              😊
                            </span>
                          ) : (
                            <span className="text-slate-500 uppercase text-[7px]">
                              {(flat.channel || "SITE").slice(0, 4)}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full text-[8px] text-slate-500">
                        <span>DISPONÍVEL</span>
                        <span className="text-emerald-400">✓ 100%</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* 20º Bloco do Grid 4x5: Card Consolidado de Taxa de Ocupação das 19 Unidades */}
            <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black uppercase tracking-wider text-amber-300">
                  19 UNIDADES
                </span>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[8px] px-1 py-0">
                  HOJE
                </Badge>
              </div>
              <div className="my-auto text-center">
                <span className="text-xl xl:text-2xl font-black font-mono text-amber-400 leading-none block">
                  {occ.rate}%
                </span>
                <span className="text-[8px] text-slate-300 font-bold block mt-0.5">
                  {occ.occupiedCount} ocup • {Math.max(0, occ.totalFlats - occ.occupiedCount)} livres
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full"
                  style={{ width: `${Math.min(100, Math.max(0, occ.rate))}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            🔄 ZONA C — GIRO DO DIA & CLIMA NO WHATSAPP (3.5 Colunas • Fixo)
        ════════════════════════════════════════════════════════════════════ */}
        <section className="col-span-4 flex flex-col gap-3 min-h-0">
          {/* BLOCO C1: GIRO DO DIA (DOBRADINHAS, CHECK-INS & CHECK-OUTS) */}
          <div className="bg-slate-900/75 border border-slate-800/90 rounded-2xl p-3 flex-1 flex flex-col justify-between min-h-0 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-black uppercase tracking-wider text-white">
                  Giro do Dia • Check-ins &amp; Saídas
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  IN: {checkins.done}/{checkins.total}
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  OUT: {checkouts.done}/{checkouts.total}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 my-1.5 pr-1">
              {/* Destaque de Dobradinhas (Saem hoje e Entram hoje) */}
              {turnarounds.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-300">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      Dobradinhas Hoje (Saída 12h ➔ Entrada 14h)
                    </span>
                    <span>{turnarounds.length} flat(s)</span>
                  </div>
                  {turnarounds.map((t: any, i: number) => (
                    <div
                      key={i}
                      className={`p-2 rounded-xl border text-xs ${
                        t.isUrgentDelay
                          ? "bg-rose-950/70 border-rose-500 animate-pulse"
                          : "bg-amber-950/30 border-amber-700/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-white">
                          Flat {t.flatNumber} • Entra: {formatShortGuestName(t.arrivingGuest)}
                        </span>
                        <Badge
                          className={`text-[9px] px-1.5 py-0 font-bold ${
                            t.cleanStatus === "clean"
                              ? "bg-emerald-600 text-white"
                              : t.cleanStatus === "in_progress"
                              ? "bg-amber-500 text-slate-950"
                              : "bg-rose-600 text-white"
                          }`}
                        >
                          {t.cleanStatus === "clean"
                            ? "Quarto Pronto"
                            : t.cleanStatus === "in_progress"
                            ? `Faxina (${t.maidName || "Gov"})`
                            : "Aguard. Limpeza"}
                        </Badge>
                      </div>
                      {/* Pipeline de 4 etapas da dobradinha */}
                      <div className="grid grid-cols-4 gap-1 mt-1.5 text-[9px] font-bold text-center">
                        <div
                          className={`py-0.5 rounded ${
                            t.checkoutDone
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-slate-900 text-amber-300 border border-amber-800/60"
                          }`}
                        >
                          1. Saída {t.checkoutDone ? "✓" : "Pend"}
                        </div>
                        <div
                          className={`py-0.5 rounded ${
                            t.cleanStatus === "clean"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : t.cleanStatus === "in_progress"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                              : "bg-rose-950/80 text-rose-300 border border-rose-800"
                          }`}
                        >
                          2. Faxina {t.cleanStatus === "clean" ? "✓" : t.cleanStatus === "in_progress" ? "⏳" : "!"}
                        </div>
                        <div
                          className={`py-0.5 rounded ${
                            t.isFnrhDone && t.isPaid
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-slate-900 text-slate-400 border border-slate-800"
                          }`}
                        >
                          3. FNRH/PIX {t.isFnrhDone && t.isPaid ? "✓" : "Pend"}
                        </div>
                        <div
                          className={`py-0.5 rounded ${
                            t.isPasswordSent
                              ? "bg-sky-950 text-sky-300 border border-sky-800"
                              : "bg-slate-900 text-slate-500 border border-slate-800"
                          }`}
                        >
                          4. Senha {t.isPasswordSent ? "🔑" : "🔒"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de Check-ins de Hoje */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> Chegadas de Hoje ({checkins.total})
                </span>
                {checkins.list?.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-2 text-center bg-slate-950/60 rounded-xl border border-slate-800/60">
                    Nenhum check-in programado para hoje.
                  </div>
                ) : (
                  checkins.list.slice(0, 5).map((c: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-white truncate block">
                          Flat {c.flatNumber} • {formatShortGuestName(c.guestName)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {(c.channel || "Site").toUpperCase()} • {c.checkinTime || "14:00"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 text-[9px] font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            c.cleanStatus === "clean"
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-rose-950 text-rose-300"
                          }`}
                        >
                          {c.cleanStatus === "clean" ? "Limpo" : "Sujo"}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            c.isFnrhDone ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"
                          }`}
                        >
                          FNRH
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            c.isPaid ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"
                          }`}
                        >
                          PIX
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Lista de Check-outs Pendentes Hoje */}
              {checkouts.list?.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-800/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> Saídas de Hoje ({checkouts.done}/{checkouts.total} liberados)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {checkouts.list.slice(0, 4).map((co: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-950/70 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-between text-[10px]"
                      >
                        <span className="font-bold text-slate-200 truncate">
                          Flat {co.flatNumber} • {formatShortGuestName(co.guestName)}
                        </span>
                        <span
                          className={`font-black px-1 rounded ${
                            co.isDone ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {co.isDone ? "Saiu" : "No Flat"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BLOCO C2: CLIMA NO WHATSAPP & FILA DA IA SOFIA */}
          <div className="bg-slate-900/75 border border-slate-800/90 rounded-2xl p-3 flex-1 flex flex-col justify-between min-h-0 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-black uppercase tracking-wider text-white">
                  Clima no WhatsApp &amp; Radar IA Sofia
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                  Score Humor: {wppClimate.avgScore ?? 88}/100
                </Badge>
              </div>
            </div>

            {/* Barra de Sentimento (Positivo / Neutro / Negativo) */}
            <div className="my-1.5 shrink-0">
              <div className="flex justify-between text-[10px] font-bold mb-1">
                <span className="text-emerald-400 flex items-center gap-1">
                  <Smile className="w-3 h-3" /> 😊 Positivo ({wppClimate.positivePercent}%)
                </span>
                <span className="text-amber-300 flex items-center gap-1">
                  <Meh className="w-3 h-3" /> 😐 Neutro ({wppClimate.neutralPercent}%)
                </span>
                <span
                  className={`flex items-center gap-1 ${
                    wppClimate.negativeCount > 0 ? "text-rose-400 font-black animate-pulse" : "text-slate-500"
                  }`}
                >
                  <Frown className="w-3 h-3" /> 😠 Crítico ({wppClimate.negativeCount})
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${wppClimate.positivePercent}%` }}
                />
                <div
                  className="bg-amber-400 h-full transition-all"
                  style={{ width: `${wppClimate.neutralPercent}%` }}
                />
                <div
                  className="bg-rose-500 h-full transition-all"
                  style={{ width: `${wppClimate.negativePercent}%` }}
                />
              </div>
            </div>

            {/* Lista de Conversas Monitoradas / Fila de Atenção */}
            <div className="flex-1 overflow-y-auto space-y-1.5 my-1 pr-1">
              {wppClimate.attentionQueue?.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800/60">
                  Clima tranquilo no WhatsApp • Nenhuma reclamação ativa detectada pela IA.
                </div>
              ) : (
                wppClimate.attentionQueue.slice(0, 4).map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      item.tone === "negative"
                        ? "bg-rose-950/60 border-rose-500/80 animate-pulse"
                        : item.tone === "neutral"
                        ? "bg-amber-950/30 border-amber-800/50"
                        : "bg-slate-950/80 border-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {item.tone === "negative" ? "😠" : item.tone === "neutral" ? "😐" : "😊"}
                        </span>
                        <span className="font-bold text-white truncate">
                          {formatShortGuestName(item.guestName)}
                        </span>
                        {item.flatNumber && item.flatNumber !== "--" && (
                          <Badge className="bg-slate-800 text-slate-200 text-[9px] px-1 py-0">
                            Flat {item.flatNumber}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-300 truncate mt-0.5">{item.summary}</p>
                    </div>
                    <span
                      className={`font-mono font-black text-xs shrink-0 ${
                        item.tone === "negative"
                          ? "text-rose-400"
                          : item.tone === "neutral"
                          ? "text-amber-300"
                          : "text-emerald-400"
                      }`}
                    >
                      {item.score}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé do Clima: Pré-Reservas da Sofia & Demandas */}
            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80 text-[10px] font-bold shrink-0">
              <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Pré-Reservas Sofia:</span>
                <span className="text-amber-400 font-mono text-xs font-black">
                  {wppClimate.activePreReservations?.length || 0}
                </span>
              </div>
              <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Demandas Abertas:</span>
                <span
                  className={`font-mono text-xs font-black ${
                    wppClimate.unmetDemandsCount > 0 ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {wppClimate.unmetDemandsCount}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            🎠 ZONA D — CARROSSEL EXECUTIVO & OPERACIONAL (3 Colunas • 15s)
        ════════════════════════════════════════════════════════════════════ */}
        <section className="col-span-3 bg-slate-900/75 border border-slate-800/90 rounded-2xl p-3 flex flex-col justify-between min-h-0 shadow-xl">
          {/* Topo do Carrossel: Abas Indicadoras + Barra de Progresso */}
          <div className="space-y-2 pb-2 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                {[
                  { id: 0, label: "💰 Financeiro", icon: DollarSign },
                  { id: 1, label: "⭐ Avaliações", icon: Star },
                  { id: 2, label: "🛠️ OS & Café", icon: Wrench }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveSlide(tab.id)
                      setSlideProgress(0)
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${
                      activeSlide === tab.id
                        ? "bg-amber-500 text-slate-950 shadow"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCarouselPaused(!carouselPaused)}
                title={carouselPaused ? "Retomar rotação automática" : "Fixar neste slide"}
                className="p-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              >
                {carouselPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3" />}
              </button>
            </div>

            {/* Barra de Progresso de 15s */}
            <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-200"
                style={{ width: `${carouselPaused ? 100 : slideProgress}%` }}
              />
            </div>
          </div>

          {/* ── SLIDE 1: FINANCEIRO, OCUPAÇÃO 7 DIAS & FUNIL COMERCIAL ── */}
          {activeSlide === 0 && (
            <div className="flex-1 flex flex-col justify-between space-y-2.5 py-1 min-h-0 animate-in fade-in duration-300">
              {/* Card Faturamento */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Faturamento &amp; Indicadores
                  </span>
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[9px]">
                    Tempo Real
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 font-bold block">Receita Hoje</span>
                    <span className="text-base xl:text-lg font-black text-emerald-400 font-mono">
                      R$ {Number(fin.todayRevenue || 0).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 font-bold block">Acumulado Mês</span>
                    <span className="text-base xl:text-lg font-black text-white font-mono">
                      R$ {Number(fin.monthRevenue || 0).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-slate-900/60 py-1 px-2 rounded-lg border border-slate-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold">ADR:</span>
                    <span className="font-mono font-black text-amber-300">R$ {fin.adr}</span>
                  </div>
                  <div className="bg-slate-900/60 py-1 px-2 rounded-lg border border-slate-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold">RevPAR:</span>
                    <span className="font-mono font-black text-sky-300">R$ {fin.revpar}</span>
                  </div>
                </div>
              </div>

              {/* Ocupação Hoje + Próximos 7 Dias */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                    Ocupação Hoje &amp; Horizonte 7 Dias
                  </span>
                  <span className="text-sm font-black font-mono text-amber-400">{occ.rate}%</span>
                </div>

                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, occ.rate))}%` }}
                  />
                </div>

                <div className="grid grid-cols-7 gap-1 pt-1 text-center">
                  {occ.next7Days?.map((d: any, i: number) => (
                    <div key={i} className="bg-slate-900 p-1 rounded-lg border border-slate-800/80">
                      <span className="text-[8px] text-slate-400 block font-bold uppercase">{d.dayName}</span>
                      <span className="text-[10px] font-black text-white block">{d.dayNum}</span>
                      <span
                        className={`text-[9px] font-bold block ${
                          d.occupancyRate >= 70 ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {d.occupancyRate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funil Comercial & Mix de Canais */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Funil Direto &amp; Canais do Mês
                </span>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[8px] text-slate-400 block font-bold">Visitas Hoje</span>
                    <span className="text-xs font-black text-white">{traffic.visitorsToday}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[8px] text-slate-400 block font-bold">Carrinhos</span>
                    <span className="text-xs font-black text-amber-400">{traffic.cartAbandonmentCount}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[8px] text-slate-400 block font-bold">Conversão</span>
                    <span className="text-xs font-black text-emerald-400">{traffic.conversionRate}</span>
                  </div>
                </div>

                {fin.channelCounts && (
                  <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800 font-bold">
                    <span>Site: {fin.channelCounts.site}</span>
                    <span>Wpp: {fin.channelCounts.whatsapp}</span>
                    <span>Booking: {fin.channelCounts.booking}</span>
                    <span>Corp: {fin.channelCounts.corporate}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SLIDE 2: AVALIAÇÕES, NPS PÓS-CHECKOUT & MELHORIAS IA ── */}
          {activeSlide === 1 && (
            <div className="flex-1 flex flex-col justify-between space-y-2.5 py-1 min-h-0 animate-in fade-in duration-300">
              {/* Resumo Reputação & NPS */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400" /> Reputação &amp; NPS WhatsApp
                  </span>
                  <span className="text-sm font-black text-amber-400 font-mono">
                    ★ {rep.avgReviewScore} / 5.0
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-emerald-950/50 p-1.5 rounded-lg border border-emerald-800/60">
                    <span className="text-[8px] text-emerald-300 block font-bold">⭐⭐⭐⭐⭐ Promotores</span>
                    <span className="text-sm font-black text-emerald-400">{rep.npsPromoters}</span>
                  </div>
                  <div className="bg-amber-950/40 p-1.5 rounded-lg border border-amber-800/60">
                    <span className="text-[8px] text-amber-300 block font-bold">⭐⭐⭐ Neutros</span>
                    <span className="text-sm font-black text-amber-300">{rep.npsNeutrals}</span>
                  </div>
                  <div className="bg-rose-950/40 p-1.5 rounded-lg border border-rose-800/60">
                    <span className="text-[8px] text-rose-300 block font-bold">⭐ Detratores</span>
                    <span className="text-sm font-black text-rose-400">{rep.npsDetractors}</span>
                  </div>
                </div>
              </div>

              {/* Últimos Feedbacks & Avaliações */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 flex-1 flex flex-col min-h-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 mb-1.5 block shrink-0">
                  Últimas Avaliações &amp; Respostas NPS
                </span>
                <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                  {rep.recentFeedbacks?.length === 0 ? (
                    <div className="text-[11px] text-slate-500 text-center py-4">
                      Nenhuma avaliação recente registrada.
                    </div>
                  ) : (
                    rep.recentFeedbacks.slice(0, 3).map((fb: any, i: number) => (
                      <div key={fb.id || i} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-white truncate">
                            {formatShortGuestName(fb.author)} {fb.flatNumber ? `• Flat ${fb.flatNumber}` : ""}
                          </span>
                          <span className="text-amber-400 font-black shrink-0">{"★".repeat(Math.max(1, Math.min(5, fb.rating || 5)))}</span>
                        </div>
                        <p className="text-slate-300 truncate mt-0.5">{fb.comment}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Pontos de Melhoria Extraídos pela IA */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 shrink-0">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-purple-300 mb-1">
                  <span>Radar de Melhorias IA (Notas 1–4)</span>
                  <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-[9px]">
                    {rep.pendingImprovementsCount} pendente(s)
                  </Badge>
                </div>
                {rep.pendingImprovementItems?.length === 0 ? (
                  <p className="text-[10px] text-slate-400">Nenhuma melhoria pendente no backlog.</p>
                ) : (
                  <div className="space-y-1">
                    {rep.pendingImprovementItems.slice(0, 2).map((imp: any, i: number) => (
                      <div key={i} className="text-[10px] text-slate-200 truncate flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                        <span className="truncate">
                          {imp.flatNumber ? `[Flat ${imp.flatNumber}] ` : ""}
                          {imp.title || imp.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SLIDE 3: MANUTENÇÃO (OS), FRIGOBAR & CAFÉ DA MANHÃ ── */}
          {activeSlide === 2 && (
            <div className="flex-1 flex flex-col justify-between space-y-2.5 py-1 min-h-0 animate-in fade-in duration-300">
              {/* Ordens de Serviço & Avarias */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1.5 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-purple-400" /> Ordens de Serviço &amp; Avarias
                  </span>
                  <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-[9px]">
                    {maintOps.activeOsCount} OS • {maintOps.pendingObsCount} Avarias
                  </Badge>
                </div>

                <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                  {maintOps.serviceOrdersList?.length === 0 ? (
                    <div className="text-[11px] text-emerald-400/90 text-center py-4 bg-emerald-950/20 rounded-lg border border-emerald-900/40">
                      ✓ Nenhuma Ordem de Serviço ou avaria pendente!
                    </div>
                  ) : (
                    maintOps.serviceOrdersList.slice(0, 4).map((os: any, idx: number) => (
                      <div
                        key={os.id || idx}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-[10px]"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white truncate block">
                            Flat {os.flatsText} • {os.title}
                          </span>
                          <span className="text-slate-400 block truncate">Resp: {os.workerName}</span>
                        </div>
                        <Badge
                          className={`text-[8px] shrink-0 ${
                            os.status === "in_progress"
                              ? "bg-amber-500 text-slate-950 font-black"
                              : "bg-purple-950 text-purple-300"
                          }`}
                        >
                          {os.status === "in_progress" ? "No Local" : "Aberta"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Café da Manhã no Quarto */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" /> Cafés da Manhã Hoje ({breakfast.count})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">
                    {breakfast.deliveredCount}/{breakfast.count} entregues
                  </span>
                </div>

                {breakfast.orders?.length === 0 ? (
                  <p className="text-[10px] text-slate-500 py-1">Sem pedidos de café programados hoje.</p>
                ) : (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {breakfast.orders.slice(0, 3).map((ord: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] bg-slate-900 px-2 py-1 rounded border border-slate-800"
                      >
                        <span className="font-bold text-white truncate">
                          Flat {ord.flatNumber} • {ord.deliveryTime}
                        </span>
                        <span
                          className={
                            ord.status === "Entregue" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"
                          }
                        >
                          {ord.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Frigobar do Dia */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <Wine className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-300 block">
                      Consumo Frigobar Hoje
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {maintOps.minibarOrdersTodayCount} pedido(s) registrado(s)
                    </span>
                  </div>
                </div>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  R$ {Number(maintOps.minibarRevenueToday || 0).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ════════════════════════════════════════════════════════════════════════
          📡 RODAPÉ — TICKER DE EVENTOS AO VIVO & TELEMETRIA DO SERVIDOR
      ════════════════════════════════════════════════════════════════════════ */}
      <footer className="bg-slate-900/80 border border-slate-800/90 px-3.5 py-1.5 rounded-xl flex items-center justify-between gap-4 text-[11px] shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase shrink-0 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Feed Ao Vivo
          </Badge>

          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar whitespace-nowrap">
            {events.length === 0 ? (
              <span className="text-slate-500 text-[10px]">Monitorando eventos em tempo real...</span>
            ) : (
              events.slice(0, 5).map((ev: any, idx: number) => (
                <div key={ev.id || idx} className="flex items-center gap-1.5 text-[10px] shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${ev.badgeColor || "bg-emerald-500"}`} />
                  <span className="font-bold text-slate-200">{ev.title}:</span>
                  <span className="text-slate-400">{ev.subtitle}</span>
                  <span className="text-slate-600">•</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono shrink-0">
          <span className="flex items-center gap-1 text-emerald-400 font-sans font-bold">
            <Server className="w-3 h-3" />
            Cloud Sync OK ({health.server.rssMB}MB)
          </span>
          <span>•</span>
          <span>Atualizado: {format(lastRefreshed, "HH:mm:ss")}</span>
        </div>
      </footer>
    </div>
  )
}
