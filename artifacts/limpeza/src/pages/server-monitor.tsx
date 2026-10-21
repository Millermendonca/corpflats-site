import React, { useState, useEffect, useRef, useMemo } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Activity,
  Cpu,
  HardDrive,
  Gauge,
  Server,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  RefreshCw,
  Copy,
  Check,
  Flame,
  Radio,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  HelpCircle,
  TrendingUp,
  Sparkles
} from "lucide-react"

interface MetricSnapshot {
  timestamp: string
  cpu: {
    processPercent: number
    userPercent: number
    systemPercent: number
    containerPercent: number
    loadAvg: number | null
  }
  memory: {
    rssMB: number
    heapUsedMB: number
    heapTotalMB: number
    heapLimitMB: number
    heapPercent: number
    externalMB: number
    containerMemUsedMB: number
    containerMemLimitMB: number
    containerMemPercent: number
    spaces: Array<{ name: string; sizeMB: number; usedMB: number }>
  }
  eventLoop: {
    p50: number
    p90: number
    p99: number
    max: number
    mean: number
  }
  gc: {
    count: number
    totalDurationMs: number
    lastPauseMs: number
    lastType: string
    lastTimestamp: string | null
  }
  traffic: {
    activeRequestsCount: number
    activeRequests: Array<{ id: string; method: string; url: string; ip: string; elapsedMs: number }>
  }
  renderStreamConnected: boolean
}

interface DiagnosticItem {
  id: string
  severity: "info" | "warning" | "critical"
  category: string
  title: string
  probableCause: string
  technicalEvidence: any
  recommendedAction: string
  timestamp: string
}

interface MonitorConfig {
  renderWebhookUrl: string
  renderWebhookToken: string
  streamConnected: boolean
  lastStreamReceivedAt: string | null
  thresholds: {
    memoryWarningPercent: number
    memoryCriticalPercent: number
    eventLoopWarningMs: number
    cpuWarningPercent: number
  }
}

export default function ServerMonitorPage() {
  const [liveData, setLiveData] = useState<{
    status: "healthy" | "warning" | "critical"
    statusMessage: string
    current: MetricSnapshot | null
    renderContainer: any
    recentSlowRequests: any[]
    latestDiagnostics: DiagnosticItem[]
  }>({
    status: "healthy",
    statusMessage: "Conectando ao monitor...",
    current: null,
    renderContainer: null,
    recentSlowRequests: [],
    latestDiagnostics: []
  })

  const [history, setHistory] = useState<MetricSnapshot[]>([])
  const [allDiagnostics, setAllDiagnostics] = useState<DiagnosticItem[]>([])
  const [config, setConfig] = useState<MonitorConfig | null>(null)
  const [refreshInterval, setRefreshInterval] = useState<number>(3000)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false)
  const [copiedToken, setCopiedToken] = useState<boolean>(false)
  const [gcActionStatus, setGcActionStatus] = useState<string | null>(null)

  // Busca snapshot ao vivo
  const fetchLive = async () => {
    try {
      setIsRefreshing(true)
      const res = await fetch("/api/admin/server-monitor/live")
      if (res.ok) {
        const data = await res.json()
        setLiveData(data)
      }
    } catch (err) {
      console.error("Erro ao obter telemetria ao vivo:", err)
    } finally {
      setIsRefreshing(false)
      setIsLoading(false)
    }
  }

  // Busca histórico de métricas para gráficos
  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/admin/server-monitor/history?minutes=15")
      if (res.ok) {
        const data = await res.json()
        if (data.history) setHistory(data.history)
      }
    } catch (_) {}
  }

  // Busca todos os diagnósticos
  const fetchDiagnostics = async () => {
    try {
      const res = await fetch("/api/admin/server-monitor/diagnostics?limit=30")
      if (res.ok) {
        const data = await res.json()
        if (data.diagnostics) setAllDiagnostics(data.diagnostics)
      }
    } catch (_) {}
  }

  // Busca credenciais do webhook do Render
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/admin/server-monitor/config")
      if (res.ok) {
        const data = await res.json()
        if (data.config) setConfig(data.config)
      }
    } catch (_) {}
  }

  // Acionamento de Garbage Collection
  const handleTriggerGc = async () => {
    try {
      setGcActionStatus("Executando...")
      const res = await fetch("/api/admin/server-monitor/trigger-gc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Acionamento manual via dashboard de monitoramento" })
      })
      const data = await res.json()
      if (data.triggered) {
        setGcActionStatus(`Liberados ${data.freedHeapMB}MB de Heap!`)
      } else {
        setGcActionStatus("Sinalização de GC enviada ao runtime.")
      }
      fetchLive()
      fetchDiagnostics()
      setTimeout(() => setGcActionStatus(null), 4000)
    } catch (err) {
      setGcActionStatus("Falha ao solicitar GC.")
      setTimeout(() => setGcActionStatus(null), 3000)
    }
  }

  // Inicialização
  useEffect(() => {
    fetchLive()
    fetchHistory()
    fetchDiagnostics()
    fetchConfig()
  }, [])

  // Loop de atualização contínua
  useEffect(() => {
    if (refreshInterval <= 0) return
    const interval = setInterval(() => {
      fetchLive()
      fetchHistory()
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  const copyToClipboard = (text: string, type: "url" | "token") => {
    navigator.clipboard.writeText(text)
    if (type === "url") {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  const cur = liveData.current

  // Preparação de dados de linha para mini-gráficos SVG
  const chartPoints = useMemo(() => {
    if (history.length < 2) return { mem: "", cpu: "", lag: "" }
    const width = 300
    const height = 60
    const step = width / (history.length - 1)

    // Memória Heap (0 a 384MB)
    const maxMem = cur?.memory.heapLimitMB || 384
    const memCoords = history.map((pt, i) => {
      const x = Math.round(i * step)
      const val = pt.memory.heapUsedMB
      const y = Math.round(height - (val / maxMem) * height)
      return `${x},${Math.max(2, Math.min(height - 2, y))}`
    })

    // CPU (0 a 100%)
    const cpuCoords = history.map((pt, i) => {
      const x = Math.round(i * step)
      const val = Math.min(100, pt.cpu.processPercent)
      const y = Math.round(height - (val / 100) * height)
      return `${x},${Math.max(2, Math.min(height - 2, y))}`
    })

    // Event Loop Lag (0 a 200ms)
    const maxLag = 200
    const lagCoords = history.map((pt, i) => {
      const x = Math.round(i * step)
      const val = Math.min(maxLag, pt.eventLoop.max)
      const y = Math.round(height - (val / maxLag) * height)
      return `${x},${Math.max(2, Math.min(height - 2, y))}`
    })

    return {
      mem: memCoords.join(" "),
      cpu: cpuCoords.join(" "),
      lag: lagCoords.join(" ")
    }
  }, [history, cur])

  return (
    <Shell>
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                  Monitor do Servidor & IA
                  <Badge variant="outline" className="text-[11px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                    Tempo Real (RCA)
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Telemetria contínua do runtime Node.js, V8 heap spaces, stream de métricas do Render e motor de diagnóstico de causa raiz.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Status Geral */}
            <div className={`px-3.5 py-1.5 rounded-full border flex items-center gap-2 text-xs font-bold transition-all shadow-xs ${
              liveData.status === "healthy" 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : liveData.status === "warning"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse"
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full ${
                liveData.status === "healthy" ? "bg-emerald-500 animate-ping" : liveData.status === "warning" ? "bg-amber-500" : "bg-rose-500"
              }`} />
              <span>{liveData.status === "healthy" ? "Operação Saudável" : liveData.status === "warning" ? "Atenção Requerida" : "Carga Crítica"}</span>
            </div>

            {/* Seletor de Frequência de Atualização */}
            <div className="flex items-center bg-card border border-border/80 rounded-xl p-1 text-xs">
              <span className="px-2 text-muted-foreground font-medium text-[11px]">Atualizar:</span>
              <button
                onClick={() => setRefreshInterval(1500)}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${refreshInterval === 1500 ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                1.5s
              </button>
              <button
                onClick={() => setRefreshInterval(3000)}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${refreshInterval === 3000 ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                3s
              </button>
              <button
                onClick={() => setRefreshInterval(0)}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${refreshInterval === 0 ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                Pausar
              </button>
            </div>

            {/* Botão de Coleta Manual de Lixo (GC) */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTriggerGc}
              className="text-xs font-bold gap-1.5 border-border/80 hover:bg-muted/50"
              title="Solicita ao motor V8 a liberação imediata de memória não utilizada"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>{gcActionStatus || "Liberar RAM (GC)"}</span>
            </Button>

            {/* Botão Atualizar */}
            <Button
              variant="default"
              size="sm"
              onClick={() => { fetchLive(); fetchHistory(); fetchDiagnostics(); }}
              disabled={isRefreshing}
              className="text-xs font-bold gap-1.5 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </Button>
          </div>
        </div>

        {/* 4 Cards de Métricas Vitais Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Memória V8 Heap */}
          <Card className="border-border/60 shadow-xs relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              (cur?.memory.heapPercent || 0) >= 85 ? "bg-rose-500" : (cur?.memory.heapPercent || 0) >= 70 ? "bg-amber-500" : "bg-indigo-500"
            }`} />
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                  Heap Node.js (V8)
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {cur?.memory.heapPercent || 0}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-foreground">
                  {cur?.memory.heapUsedMB || 0} <span className="text-xs font-normal text-muted-foreground">MB</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  limite: <span className="font-bold text-foreground">{cur?.memory.heapLimitMB || 384} MB</span>
                </div>
              </div>
              <Progress value={cur?.memory.heapPercent || 0} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>RSS Total: <b className="text-foreground">{cur?.memory.rssMB || 0} MB</b></span>
                <span>Heap Total: <b className="text-foreground">{cur?.memory.heapTotalMB || 0} MB</b></span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Memória do Container Render (Limite 512MB) */}
          <Card className="border-border/60 shadow-xs relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              (cur?.memory.containerMemPercent || 0) >= 88 ? "bg-rose-500" : (cur?.memory.containerMemPercent || 0) >= 75 ? "bg-amber-500" : "bg-emerald-500"
            }`} />
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-500" />
                  Container Render (RAM)
                </CardTitle>
                <Badge className={`text-[10px] font-bold ${
                  (cur?.memory.containerMemPercent || 0) >= 85 ? "bg-rose-500 text-white" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                }`}>
                  {cur?.memory.containerMemPercent || 0}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-foreground">
                  {cur?.memory.containerMemUsedMB || 0} <span className="text-xs font-normal text-muted-foreground">MB</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  teto: <span className="font-bold text-foreground">{cur?.memory.containerMemLimitMB || 512} MB</span>
                </div>
              </div>
              <Progress value={cur?.memory.containerMemPercent || 0} className="h-2" />
              <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span className="flex items-center gap-1">
                  {cur?.renderStreamConnected ? (
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Stream Render Ativo
                    </span>
                  ) : (
                    <span className="text-muted-foreground">RSS Proxy</span>
                  )}
                </span>
                <span>Margem livre: <b className="text-foreground">{Math.max(0, (cur?.memory.containerMemLimitMB || 512) - (cur?.memory.containerMemUsedMB || 0))} MB</b></span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Uso de Processador (CPU) */}
          <Card className="border-border/60 shadow-xs relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              (cur?.cpu.processPercent || 0) >= 80 ? "bg-rose-500" : (cur?.cpu.processPercent || 0) >= 60 ? "bg-amber-500" : "bg-sky-500"
            }`} />
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-sky-500" />
                  Processador (CPU)
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {cur?.cpu.processPercent || 0}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-foreground">
                  {cur?.cpu.processPercent || 0} <span className="text-xs font-normal text-muted-foreground">%</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Container: <span className="font-bold text-foreground">{cur?.cpu.containerPercent || 0}%</span>
                </div>
              </div>
              <Progress value={Math.min(100, cur?.cpu.processPercent || 0)} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>User: <b className="text-foreground">{cur?.cpu.userPercent || 0}%</b></span>
                <span>System: <b className="text-foreground">{cur?.cpu.systemPercent || 0}%</b></span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Event Loop Lag (Termômetro de Bloqueio Node.js) */}
          <Card className="border-border/60 shadow-xs relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              (cur?.eventLoop.max || 0) >= 150 ? "bg-rose-500" : (cur?.eventLoop.max || 0) >= 60 ? "bg-amber-500" : "bg-violet-500"
            }`} />
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-violet-500" />
                  Event Loop Lag (Delay)
                </CardTitle>
                <Badge className={`text-[10px] font-bold ${
                  (cur?.eventLoop.max || 0) >= 100 ? "bg-rose-500 text-white" : "bg-violet-500/10 text-violet-600 border border-violet-500/20"
                }`}>
                  p99: {cur?.eventLoop.p99 || 0}ms
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-foreground">
                  {cur?.eventLoop.max || 0} <span className="text-xs font-normal text-muted-foreground">ms máx</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  p50: <span className="font-bold text-foreground">{cur?.eventLoop.p50 || 0} ms</span>
                </div>
              </div>
              <Progress value={Math.min(100, ((cur?.eventLoop.max || 0) / 200) * 100)} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Ativas: <b className="text-foreground">{cur?.traffic.activeRequestsCount || 0} reqs</b></span>
                <span>GC Pausa: <b className="text-foreground">{cur?.gc.lastPauseMs || 0}ms</b></span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Banner Especial de Integração: Render Observability (Add Metrics Stream) */}
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    Conectar Stream de Métricas do Render (Render Dashboard)
                    {config?.streamConnected ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px]">
                        Conectado & Recebendo OTel
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        Aguardando Destino no Render
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Copie as credenciais abaixo e cole na tela <b>Add Metrics Stream</b> (Integrations &gt; Observability) do seu Render Dashboard.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="https://dashboard.render.com/observability#metric-streams"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-xs"
                >
                  Abrir Render Dashboard
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Endpoint */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Endpoint (URL do Destino Custom)</label>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border/80">
                  <span className="text-xs font-mono select-all truncate text-foreground flex-1">
                    {config?.renderWebhookUrl || "https://corpflats.com.br/api/observability/render-metrics"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(config?.renderWebhookUrl || "", "url")}
                    className="h-7 px-2 text-xs font-bold shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="ml-1 text-[11px]">{copiedUrl ? "Copiado!" : "Copiar"}</span>
                  </Button>
                </div>
              </div>

              {/* Token */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Token / API Key</label>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border/80">
                  <span className="text-xs font-mono select-all truncate text-foreground flex-1">
                    {config?.renderWebhookToken || "corpflats_render_stream_token_2026"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(config?.renderWebhookToken || "", "token")}
                    className="h-7 px-2 text-xs font-bold shrink-0"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="ml-1 text-[11px]">{copiedToken ? "Copiado!" : "Copiar"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Painel Central: Diagnóstico de Causa Raiz em Tempo Real (RCA Engine) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-500" />
                    <div>
                      <CardTitle className="text-base font-bold text-foreground">
                        Diagnósticos de Causa Raiz em Tempo Real (RCA)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Análise heurística que correlaciona picos de memória e bloqueios de processador com rotas ativas e operações síncronas.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {allDiagnostics.length} eventos registrados
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {allDiagnostics.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-muted/20 border border-dashed border-border flex flex-col items-center justify-center gap-2">
                    <ShieldCheck className="w-10 h-10 text-emerald-500/80" />
                    <p className="text-sm font-bold text-foreground">Nenhuma anomalia ou causa de sobrecarga detectada</p>
                    <p className="text-xs text-muted-foreground max-w-md">
                      O motor está monitorando continuamente. Se ocorrer qualquer salto abrupto de memória (&gt;25MB), bloqueio do Event Loop (&gt;100ms) ou pressão no limite do Render, a causa exata será exibida aqui instantaneamente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                    {allDiagnostics.map((diag) => (
                      <div
                        key={diag.id}
                        className={`p-4 rounded-2xl border transition-all text-xs space-y-2 ${
                          diag.severity === "critical"
                            ? "bg-rose-500/5 border-rose-500/30 text-rose-950 dark:text-rose-100"
                            : diag.severity === "warning"
                            ? "bg-amber-500/5 border-amber-500/30 text-amber-950 dark:text-amber-100"
                            : "bg-muted/30 border-border text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-bold">
                            {diag.severity === "critical" ? (
                              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : diag.severity === "warning" ? (
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                            )}
                            <span className="text-sm font-black">{diag.title}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(diag.timestamp).toLocaleTimeString("pt-BR")}
                          </span>
                        </div>

                        {/* Causa Provável */}
                        <div className="p-2.5 rounded-xl bg-background/80 border border-border/60">
                          <span className="font-bold text-[11px] block uppercase text-muted-foreground mb-0.5">
                            🎯 Causa Identificada em Tempo Real:
                          </span>
                          <p className="font-medium text-foreground">{diag.probableCause}</p>
                        </div>

                        {/* Ação Recomendada */}
                        <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <span><b>Recomendação:</b> {diag.recommendedAction}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mini Gráficos de Tendência Histórica */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Evolução Temporal das Últimas Amostras (15 Minutos)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Gráfico 1: Heap */}
                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/60 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Memória Heap</span>
                      <span className="font-mono font-bold text-indigo-500">{cur?.memory.heapUsedMB} MB</span>
                    </div>
                    <svg viewBox="0 0 300 60" className="w-full h-14 overflow-visible">
                      <polyline
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints.mem}
                      />
                    </svg>
                  </div>

                  {/* Gráfico 2: CPU */}
                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/60 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Processador</span>
                      <span className="font-mono font-bold text-sky-500">{cur?.cpu.processPercent}%</span>
                    </div>
                    <svg viewBox="0 0 300 60" className="w-full h-14 overflow-visible">
                      <polyline
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints.cpu}
                      />
                    </svg>
                  </div>

                  {/* Gráfico 3: Event Loop Lag */}
                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/60 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Event Loop Delay</span>
                      <span className="font-mono font-bold text-violet-500">{cur?.eventLoop.max} ms</span>
                    </div>
                    <svg viewBox="0 0 300 60" className="w-full h-14 overflow-visible">
                      <polyline
                        fill="none"
                        stroke="#8b5cf6"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints.lag}
                      />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna Direita: Requisições Ativas & V8 Heap Spaces */}
          <div className="space-y-6">
            {/* Requisições Ativas em Andamento */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-500" />
                    Requisições Ativas Agora
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {cur?.traffic.activeRequestsCount || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-xs">
                {(!cur?.traffic.activeRequests || cur.traffic.activeRequests.length === 0) ? (
                  <p className="text-muted-foreground text-center py-6">
                    Nenhuma requisição HTTP ativa no exato momento.
                  </p>
                ) : (
                  cur.traffic.activeRequests.map((req) => (
                    <div key={req.id} className="p-2.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between">
                      <div className="space-y-0.5 truncate max-w-[200px]">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">
                            {req.method}
                          </Badge>
                          <span className="truncate">{req.url}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground block font-mono">{req.ip}</span>
                      </div>
                      <span className={`font-mono text-xs font-bold ${req.elapsedMs > 500 ? "text-amber-500" : "text-emerald-500"}`}>
                        {req.elapsedMs}ms
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Espaços de Memória do V8 (Heap Spaces Breakdown) */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  V8 Heap Spaces Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                {(!cur?.memory.spaces || cur.memory.spaces.length === 0) ? (
                  <p className="text-muted-foreground text-center py-4">Carregando detalhes do V8...</p>
                ) : (
                  cur.memory.spaces.map((sp) => (
                    <div key={sp.name} className="space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-mono font-medium text-foreground">{sp.name}</span>
                        <span className="text-muted-foreground">
                          <b>{sp.usedMB}</b> / {sp.sizeMB} MB
                        </span>
                      </div>
                      <Progress
                        value={sp.sizeMB > 0 ? (sp.usedMB / sp.sizeMB) * 100 : 0}
                        className="h-1.5"
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Histórico Recente de Requisições Custosas */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Últimos Gargalos (&gt;500ms ou &gt;10MB)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-xs">
                {liveData.recentSlowRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhuma rota com lentidão recente registrada.</p>
                ) : (
                  liveData.recentSlowRequests.slice(0, 5).map((sr) => (
                    <div key={sr.id} className="p-2 rounded-xl bg-muted/20 border border-border/40 flex justify-between items-center">
                      <div className="truncate max-w-[170px]">
                        <span className="font-bold text-[11px] block truncate">{sr.method} {sr.url}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(sr.timestamp).toLocaleTimeString("pt-BR")}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold font-mono text-amber-500 block">{sr.durationMs}ms</span>
                        <span className="text-[10px] text-muted-foreground">+{sr.heapDeltaMB}MB</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  )
}
