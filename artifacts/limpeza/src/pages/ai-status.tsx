import React, { useState, useEffect, useCallback, useId } from "react"
import { Link } from "wouter"
import { Shell } from "@/components/layout"
import {
  Brain,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Activity,
  Key,
  Clock,
  ExternalLink,
  Settings,
  Cpu,
  Gauge,
  Layers,
  Terminal,
  ShoppingCart,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface KeySourceInfo {
  id: "env_gemini" | "db_settings" | "db_whatsapp" | "env_google_ai"
  label: string
  location: string
  configured: boolean
  masked: string | null
  length: number
  keyType: string | null
  isActiveForPrimary: boolean
  isActiveForB2b: boolean
}

interface EngineProbe {
  id: "gemini_38_flash" | "gemini_35_flash_lite" | "gemini_4_argon" | "gemini_38_b2b"
  label: string
  model: string
  protocol: string
  keySourceLabel: string
  usedBy: string[]
  ok: boolean
  status: number | null
  latencyMs: number
  code:
    | "operational"
    | "standby"
    | "billing_depleted"
    | "quota_exceeded"
    | "auth_error"
    | "model_not_found"
    | "provider_outage"
    | "network_error"
    | "unconfigured"
  diagnosis: string
  actionHint: string | null
  rawError: string | null
  responsePreview: string | null
}

interface AiModuleStatus {
  id: string
  name: string
  area: string
  engineId: EngineProbe["id"]
  configuredModel: string
  protocol: string
  keySourceLabel: string
  status: "operational" | "standby" | "fallback_active" | "disabled" | "degraded" | "error"
  statusLabel: string
  fallbackStrategy: string
  liveSummary: string
  latencyMs: number | null
  lastError: string | null
}

interface TokenUsageInfo {
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  thoughtTokens: number
  totalTokens: number
}

interface TelemetryBucket extends TokenUsageInfo {
  calls: number
  ok: number
  errors: number
  rateLimited429: number
  skippedByCooldown: number
}

interface RuntimeCallLog {
  at: string
  module: string
  model: string
  protocol: string
  ok: boolean
  status: number | null
  latencyMs: number
  error: string | null
  keySource: string | null
  skippedByCooldown?: boolean
  aborted?: boolean
  usage?: TokenUsageInfo | null
}

interface AiStatusOverviewResponse {
  checkedAt: string
  passive?: boolean
  cached: boolean
  cacheAgeSeconds: number
  cacheTtlSeconds: number
  overallStatus:
    | "operational"
    | "standby"
    | "degraded"
    | "billing_depleted"
    | "quota_exceeded"
    | "auth_error"
    | "offline"
    | "unconfigured"
  overallTitle: string
  overallSummary: string
  actionRequired: string | null
  actionUrl: string | null
  summary: {
    enginesOnline: number
    enginesTotal: number
    avgLatencyMs: number | null
    modulesAiActive: number
    modulesTotal: number
  }
  keys: {
    primaryActiveSource: string | null
    primaryMasked: string | null
    b2bActiveSource: string | null
    b2bMasked: string | null
    hasOverrideConflict: boolean
    overrideMessage: string | null
    sources: KeySourceInfo[]
    secondaryProbe: {
      testedSource: string
      masked: string
      model: string
      ok: boolean
      status: number | null
      latencyMs: number
      diagnosis: string
    } | null
  }
  probes: EngineProbe[]
  modules: AiModuleStatus[]
  recentRuntimeCalls: RuntimeCallLog[]
  telemetrySummary?: {
    totals: TelemetryBucket
    totalsByModule: Record<string, TelemetryBucket>
  }
}

interface ShoppingLabResult {
  ok: boolean
  mode: "shopping"
  product: string
  aiOk: boolean
  aiCategories: string[]
  fallbackCategories: string[]
  usedModel: string | null
  latencyMs: number
  status: number | null
  code: string
  diagnosis: string
  actionHint: string | null
  rawError: string | null
}

interface PromptLabResult {
  ok: boolean
  mode: "prompt"
  engine: string
  model: string
  protocol: string
  keySourceLabel: string | null
  status: number | null
  latencyMs: number
  replyText: string | null
  code: string
  diagnosis: string
  actionHint: string | null
  rawError: string | null
}

const MODULE_LABELS: Record<string, string> = {
  gemini_core: "Motor Principal Gemini",
  sofia_whatsapp: "Sofia WhatsApp",
  sofia_assist: "Sofia Assistente Chat",
  admin_copilot: "Copiloto Admin",
  b2b_vouchers: "Vouchers B2B (Zoho)",
  sentiment_ai: "Sentimento IA",
  precheckin_ocr: "OCR & Biometria Pré-Check-in",
  maid_triage: "Triagem Camareiras",
  fiscal_nlu: "Conferência Fiscal NFS-e",
  reviews_highlights: "Destaques de Avaliações",
  nps_improvements: "Resumo Melhorias NPS",
  shopping_list: "Lista de Compras",
  dev_coaching: "Treinamento Dev",
  faq_suggestions: "Sugestões FAQ",
  settings_test: "Teste /configuracoes",
  ai_status_probe: "Sonda /ia-status",
  ai_status_lab: "Laboratório /ia-status",
  gemini_untagged: "Chamada Gemini",
}

function formatTime(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return "—"
  }
}

function formatLatency(ms?: number | null) {
  if (ms === null || ms === undefined || ms <= 0) return "—"
  return `${ms} ms`
}

function getProbeTone(probe: EngineProbe) {
  if (probe.ok) {
    return {
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      label: `HTTP ${probe.status ?? 200} • Online`,
    }
  }
  if (probe.code === "standby") {
    return {
      badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
      label: "Em Espera (Econômico)",
    }
  }
  if (probe.code === "billing_depleted") {
    return {
      badgeClass: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
      label: `HTTP ${probe.status ?? 402} • Sem Créditos`,
    }
  }
  if (probe.code === "quota_exceeded") {
    return {
      badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
      label: `HTTP ${probe.status ?? 429} • Cota Excedida`,
    }
  }
  if (probe.code === "auth_error") {
    return {
      badgeClass: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
      label: `HTTP ${probe.status ?? 401} • Chave Inválida`,
    }
  }
  if (probe.code === "unconfigured") {
    return {
      badgeClass: "bg-muted text-muted-foreground border-border",
      label: "Não Configurada",
    }
  }
  return {
    badgeClass: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    label: probe.status ? `HTTP ${probe.status} • Erro` : "Offline",
  }
}

function getModuleBadge(status: AiModuleStatus["status"]) {
  switch (status) {
    case "operational":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    case "standby":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
    case "degraded":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
    case "fallback_active":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
    case "disabled":
      return "bg-muted text-muted-foreground border-border"
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
  }
}

export default function AiStatusPage() {
  const [data, setData] = useState<AiStatusOverviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [statusAnnouncement, setStatusAnnouncement] = useState("")

  // Laboratório — Aba 1: Lista de Compras
  const [shoppingProduct, setShoppingProduct] = useState("queijo minas frescal")
  const [shoppingTesting, setShoppingTesting] = useState(false)
  const [shoppingResult, setShoppingResult] = useState<ShoppingLabResult | null>(null)
  const [shoppingError, setShoppingError] = useState<string | null>(null)

  // Laboratório — Aba 2: Prompt Direto
  const [promptEngine, setPromptEngine] = useState<"gemini_38_flash" | "gemini_35_flash_lite" | "gemini_4_argon" | "gemini_38_b2b">("gemini_38_flash")
  const [promptKeySource, setPromptKeySource] = useState<"active" | "db_settings">("active")
  const [promptInput, setPromptInput] = useState("Responda em 1 frase curta: a conexão com o CorpFlats está ativa?")
  const [promptTesting, setPromptTesting] = useState(false)
  const [promptResult, setPromptResult] = useState<PromptLabResult | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)

  const enginesCaptionId = useId()
  const modulesCaptionId = useId()
  const shoppingInputId = useId()
  const shoppingHintId = useId()
  const engineSelectId = useId()
  const keySourceSelectId = useId()
  const promptInputId = useId()
  const promptHintId = useId()

  useEffect(() => {
    const prevTitle = document.title
    document.title = "Status da IA | CorpFlats"
    return () => {
      document.title = prevTitle
    }
  }, [])

  const loadOverview = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setFetchError(null)
    try {
      const url = forceRefresh ? "/api/admin/ai-status?refresh=1" : "/api/admin/ai-status"
      const res = await fetch(url, { credentials: "include" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || `Falha HTTP ${res.status} ao consultar status da IA.`)
      }
      setData(json)
      setStatusAnnouncement(
        `Diagnóstico atualizado: ${json.overallTitle}. ${json.summary.enginesOnline} de ${json.summary.enginesTotal} motores sondados.`
      )
    } catch (err: any) {
      const msg = err?.message || "Erro ao consultar /api/admin/ai-status."
      setFetchError(msg)
      setStatusAnnouncement(`Erro ao atualizar status da IA: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview(false)
  }, [loadOverview])

  const handleTestShopping = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = shoppingProduct.trim()
    if (!trimmed) return
    setShoppingTesting(true)
    setShoppingError(null)
    try {
      const res = await fetch("/api/admin/ai-status/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "shopping", product: trimmed }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || `Erro HTTP ${res.status}`)
      }
      setShoppingResult(json)
      setStatusAnnouncement(
        json.aiOk
          ? `Categorização IA concluída para ${json.product}: ${json.aiCategories.join(", ")}.`
          : `Categorização IA falhou para ${json.product}; fallback local retornou ${json.fallbackCategories.join(", ")}.`
      )
    } catch (err: any) {
      setShoppingError(err?.message || "Erro ao testar categorização.")
    } finally {
      setShoppingTesting(false)
    }
  }

  const handleTestPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = promptInput.trim()
    if (!trimmed) return
    setPromptTesting(true)
    setPromptError(null)
    try {
      const res = await fetch("/api/admin/ai-status/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "prompt",
          engine: promptEngine,
          keySource: promptKeySource,
          prompt: trimmed,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || `Erro HTTP ${res.status}`)
      }
      setPromptResult(json)
      setStatusAnnouncement(
        json.ok
          ? `Teste de prompt bem-sucedido no modelo ${json.model} em ${json.latencyMs}ms.`
          : `Teste de prompt retornou erro no modelo ${json.model}: ${json.diagnosis}.`
      )
    } catch (err: any) {
      setPromptError(err?.message || "Erro ao executar teste de prompt.")
    } finally {
      setPromptTesting(false)
    }
  }

  const overall = data?.overallStatus
  const isStandbyOverall = overall === "standby"
  const isDegradedOverall = overall === "degraded" || overall === "quota_exceeded"
  const isHealthyOverall = overall === "operational"
  const isCriticalOverall =
    overall === "billing_depleted" || overall === "auth_error" || overall === "offline" || overall === "unconfigured"

  const heroStyles = isHealthyOverall
    ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800"
    : isStandbyOverall
      ? "border-blue-300 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800"
      : isDegradedOverall
        ? "border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800"
        : "border-red-300 bg-red-50/70 dark:bg-red-950/20 dark:border-red-800"

  const canTestSecondaryDbKey = Boolean(data?.keys?.hasOverrideConflict)

  return (
    <Shell>
      {/* CSS responsivo baseado em Container Queries (modern-web-guidance: responsive-table) */}
      <style>{`
        .ai-table-wrapper {
          overflow: auto;
          max-inline-size: 100%;
          container-type: inline-size;
        }
        .ai-table-wrapper:focus-visible {
          outline: 2px solid hsl(var(--primary));
          outline-offset: 2px;
        }
        .ai-responsive-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .ai-responsive-table thead {
          position: sticky;
          inset-block-start: 0;
          z-index: 1;
        }
        .ai-responsive-table tbody th {
          position: sticky;
          inset-inline-start: 0;
          background: hsl(var(--card));
        }
        @container (width < 680px) {
          .ai-responsive-table,
          .ai-responsive-table thead,
          .ai-responsive-table tbody,
          .ai-responsive-table tr,
          .ai-responsive-table th,
          .ai-responsive-table td {
            display: block;
          }
          .ai-responsive-table thead {
            display: none;
          }
          .ai-responsive-table tbody tr {
            margin-block-end: 0.75rem;
            border: 1px solid hsl(var(--border));
            border-radius: 0.75rem;
            overflow: hidden;
            background: hsl(var(--card));
          }
          .ai-responsive-table tbody th {
            position: sticky;
            inset-block-start: 0;
            z-index: 2;
            border-bottom: 1px solid hsl(var(--border));
            background: hsl(var(--muted) / 0.55);
          }
          .ai-responsive-table tbody td {
            border-bottom: 1px solid hsl(var(--border) / 0.5);
            padding-block: 0.55rem;
          }
          .ai-responsive-table tbody td:last-child {
            border-bottom: 0;
          }
          .ai-responsive-table tbody td::before {
            display: block;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: hsl(var(--muted-foreground));
            margin-bottom: 0.2rem;
          }
          .ai-responsive-table tbody td:nth-child(2)::before { content: var(--col-2); }
          .ai-responsive-table tbody td:nth-child(3)::before { content: var(--col-3); }
          .ai-responsive-table tbody td:nth-child(4)::before { content: var(--col-4); }
          .ai-responsive-table tbody td:nth-child(5)::before { content: var(--col-5); }
        }
      `}</style>

      {/* Região live polite centralizada para anúncios de atualização/teste */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </div>

      <div className="space-y-6 max-w-6xl mx-auto pb-20 w-full">
        {/* Cabeçalho */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Brain className="w-5 h-5" aria-hidden="true" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Central de Status da IA</h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Diagnóstico em tempo real dos motores Gemini, origem das chaves de API, latências e saúde dos módulos do CorpFlats.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/configuracoes">
              <Button variant="outline" size="sm" className="min-h-9 gap-1.5 rounded-xl">
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                Configurar Chaves
              </Button>
            </Link>
            <Button
              type="button"
              size="sm"
              onClick={() => loadOverview(true)}
              disabled={loading}
              className="min-h-9 gap-1.5 rounded-xl"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              {loading ? "Verificando..." : "Verificar Agora"}
            </Button>
          </div>
        </header>

        {loading && !data && (
          <div className="space-y-2">
            <progress aria-label="Executando sondas nos motores Gemini" className="w-full h-2 rounded-full overflow-hidden" />
            <p className="text-xs text-muted-foreground">Executando sondas ao vivo nos 3 motores Gemini em uso pelo sistema…</p>
          </div>
        )}

        {fetchError && (
          <div role="alert" className="p-4 rounded-2xl border-2 border-red-300 bg-red-50/70 dark:bg-red-950/20 dark:border-red-800 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-bold text-red-700 dark:text-red-300">Erro ao consultar o diagnóstico de IA</p>
              <p className="text-red-700/80 dark:text-red-300/80 mt-0.5">{fetchError}</p>
            </div>
          </div>
        )}

        {/* Banner de Saúde Geral */}
        {data && (
          <section>
            <div
              role={isCriticalOverall ? "alert" : undefined}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-colors ${heroStyles}`}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  {isHealthyOverall ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : isStandbyOverall ? (
                    <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : isDegradedOverall ? (
                    <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                  )}

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold leading-snug">{data.overallTitle}</h2>
                      <Badge variant="outline" className="text-[11px] font-mono">
                        {data.passive ? "Modo Econômico (Sem Sonda)" : data.cached ? `Cache (${data.cacheAgeSeconds}s)` : "Sonda Ao Vivo"}
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-foreground/85 leading-relaxed">{data.overallSummary}</p>
                    {data.actionRequired && (
                      <div className="mt-2 p-3 rounded-xl bg-background/80 border border-border/60 text-xs sm:text-sm space-y-2">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                          Ação recomendada:
                        </p>
                        <p className="text-muted-foreground leading-relaxed">{data.actionRequired}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {data.actionUrl && (
                            <a
                              href={data.actionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              Abrir Google AI Studio
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            </a>
                          )}
                          <Link href="/configuracoes">
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg">
                              Ir para /configuracoes
                              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 text-xs text-muted-foreground shrink-0">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    Verificado às {formatTime(data.checkedAt)}
                  </span>
                  <span className="text-[11px]">Modo econômico: sondas apenas ao clicar em Verificar Agora</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* KPIs Rápidos */}
        {data && (
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="rounded-2xl">
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Motores Online</p>
                    <p className="text-2xl font-bold mt-1">
                      {data.summary.enginesOnline}
                      <span className="text-sm font-normal text-muted-foreground">/{data.summary.enginesTotal}</span>
                    </p>
                  </div>
                  <Cpu className="w-5 h-5 text-primary/70 shrink-0" aria-hidden="true" />
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Latência Média</p>
                    <p className="text-2xl font-bold mt-1 font-mono">
                      {data.summary.avgLatencyMs !== null ? `${data.summary.avgLatencyMs}ms` : "—"}
                    </p>
                  </div>
                  <Gauge className="w-5 h-5 text-primary/70 shrink-0" aria-hidden="true" />
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Módulos com IA Ativa</p>
                    <p className="text-2xl font-bold mt-1">
                      {data.summary.modulesAiActive}
                      <span className="text-sm font-normal text-muted-foreground">/{data.summary.modulesTotal}</span>
                    </p>
                  </div>
                  <Layers className="w-5 h-5 text-primary/70 shrink-0" aria-hidden="true" />
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Chave Principal Ativa</p>
                    <p className="text-sm font-bold mt-1 leading-tight break-words">
                      {data.keys.primaryActiveSource || "Não configurada"}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {data.keys.primaryMasked || "—"}
                    </p>
                  </div>
                  <Key className="w-5 h-5 text-primary/70 shrink-0" aria-hidden="true" />
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Seção 1: Diagnóstico de Chaves & Precedência */}
        {data && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <h2 className="font-semibold leading-none tracking-tight text-base flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" aria-hidden="true" />
                Diagnóstico de Chaves &amp; Precedência
              </h2>
              <CardDescription className="text-xs">
                Mostra exatamente qual chave cada motor está lendo em produção (variáveis do Render vs. banco de dados).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.keys.hasOverrideConflict && data.keys.overrideMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-950/25 dark:border-amber-800 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-amber-900 dark:text-amber-300">
                        Sobreposição detectada: Render ENV está vencendo /configuracoes
                      </p>
                      <p className="text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                        {data.keys.overrideMessage}
                      </p>
                    </div>
                  </div>

                  {data.keys.secondaryProbe && (
                    <div
                      className={`ml-6 p-2.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                        data.keys.secondaryProbe.ok
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
                          : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                      }`}
                    >
                      <span>
                        <strong>Teste da chave secundária ({data.keys.secondaryProbe.testedSource} — {data.keys.secondaryProbe.masked}):</strong>{" "}
                        {data.keys.secondaryProbe.diagnosis}
                      </span>
                      <span className="font-mono font-semibold">{formatLatency(data.keys.secondaryProbe.latencyMs)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                {data.keys.sources.map((src) => (
                  <div
                    key={src.id}
                    className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
                      src.configured
                        ? "bg-card border-border"
                        : "bg-muted/20 border-border/50 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-tight">{src.label}</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{src.location}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          src.configured
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shrink-0"
                            : "text-muted-foreground shrink-0"
                        }
                      >
                        {src.configured ? "Configurada" : "Ausente"}
                      </Badge>
                    </div>

                    {src.configured && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <code className="px-2 py-0.5 rounded bg-muted font-mono text-[11px]">
                          {src.masked} ({src.length} chars)
                        </code>
                        {src.keyType && (
                          <span className="text-[11px] text-muted-foreground">{src.keyType}</span>
                        )}
                      </div>
                    )}

                    {(src.isActiveForPrimary || src.isActiveForB2b) && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {src.isActiveForPrimary && (
                          <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/20 border border-primary/30">
                            Ativa: Motor Principal / Sofia / OCR
                          </Badge>
                        )}
                        {src.isActiveForB2b && (
                          <Badge className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/30">
                            Ativa: Vouchers B2B (Zoho)
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seção 2: Motores & Protocolos Gemini (Tabela Responsiva) */}
        {data && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <h2 className="font-semibold leading-none tracking-tight text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" aria-hidden="true" />
                Motores Gemini em Produção
              </h2>
              <CardDescription className="text-xs">
                Sonda direta nos 3 modelos/protocolos efetivamente usados pelo backend, com latência medida em milissegundos e erro completo sem truncamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={enginesCaptionId}
                className="ai-table-wrapper rounded-xl border border-border/70"
              >
                <table
                  className="ai-responsive-table text-left text-xs"
                  style={
                    {
                      "--col-2": '"Status"',
                      "--col-3": '"Latência"',
                      "--col-4": '"Chave Usada"',
                      "--col-5": '"Diagnóstico Completo"',
                    } as React.CSSProperties
                  }
                >
                  <caption id={enginesCaptionId} className="sr-only">
                    Status e latência dos motores Gemini em produção
                  </caption>
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Motor &amp; Protocolo</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Latência</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Chave Usada</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Diagnóstico Completo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.probes.map((probe) => {
                      const tone = getProbeTone(probe)
                      return (
                        <tr key={probe.id} className="align-top">
                          <th scope="row" className="px-4 py-3 font-medium text-foreground">
                            <div className="font-bold text-xs sm:text-sm">{probe.label}</div>
                            <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                              {probe.model} • {probe.protocol}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {probe.usedBy.map((u) => (
                                <span
                                  key={u}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                >
                                  {u}
                                </span>
                              ))}
                            </div>
                          </th>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant="outline" className={tone.badgeClass}>
                              {tone.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold">
                            {formatLatency(probe.latencyMs)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {probe.keySourceLabel}
                          </td>
                          <td className="px-4 py-3 max-w-md space-y-1">
                            <p className="font-medium text-foreground">{probe.diagnosis}</p>
                            {probe.ok && probe.responsePreview && (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                                Resposta: "{probe.responsePreview}"
                              </p>
                            )}
                            {probe.rawError && (
                              <p className="text-[11px] text-red-700/90 dark:text-red-300/90 break-words leading-relaxed bg-red-500/5 p-2 rounded-lg border border-red-500/20">
                                {probe.rawError}
                              </p>
                            )}
                            {probe.actionHint && (
                              <p className="text-[11px] text-muted-foreground">{probe.actionHint}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seção 3: Mapa de Módulos de IA do CorpFlats (Tabela Responsiva) */}
        {data && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <h2 className="font-semibold leading-none tracking-tight text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" aria-hidden="true" />
                Módulos de IA do CorpFlats
              </h2>
              <CardDescription className="text-xs">
                Visão real de impacto operacional: quais recursos estão rodando com Gemini ativo e quais estão protegidos por fallback determinístico local.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={modulesCaptionId}
                className="ai-table-wrapper rounded-xl border border-border/70"
              >
                <table
                  className="ai-responsive-table text-left text-xs"
                  style={
                    {
                      "--col-2": '"Estado Atual"',
                      "--col-3": '"Modelo & Chave"',
                      "--col-4": '"Contexto Ao Vivo"',
                      "--col-5": '"Plano B (Fallback)"',
                    } as React.CSSProperties
                  }
                >
                  <caption id={modulesCaptionId} className="sr-only">
                    Módulos de inteligência artificial do CorpFlats e status operacional
                  </caption>
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Módulo</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Estado Atual</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Modelo &amp; Chave</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Contexto Ao Vivo</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Plano B (Fallback)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.modules.map((mod) => (
                      <tr key={mod.id} className="align-top">
                        <th scope="row" className="px-4 py-3 font-medium text-foreground">
                          <div className="font-bold text-xs sm:text-sm">{mod.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{mod.area}</div>
                        </th>
                        <td className="px-4 py-3 space-y-1">
                          <Badge variant="outline" className={getModuleBadge(mod.status)}>
                            {mod.statusLabel}
                          </Badge>
                          {mod.latencyMs ? (
                            <div className="text-[11px] font-mono text-muted-foreground">
                              {formatLatency(mod.latencyMs)}
                            </div>
                          ) : null}
                          {mod.lastError && (
                            <div className="text-[11px] text-red-600 dark:text-red-400">
                              {mod.lastError}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 space-y-0.5">
                          <div className="font-mono font-semibold text-foreground">{mod.configuredModel}</div>
                          <div className="text-[11px] text-muted-foreground">{mod.protocol}</div>
                          <div className="text-[11px] text-muted-foreground">Chave: {mod.keySourceLabel}</div>
                        </td>
                        <td className="px-4 py-3 text-foreground/85 max-w-xs leading-relaxed">
                          {mod.liveSummary}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-xs leading-relaxed">
                          {mod.fallbackStrategy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seção 4: Laboratório de Testes Ao Vivo */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <h2 className="font-semibold leading-none tracking-tight text-base flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" aria-hidden="true" />
              Laboratório de Testes Ao Vivo
            </h2>
            <CardDescription className="text-xs">
              Testes reais sem cache: valide a categorização real da Lista de Compras (IA vs. Keywords) ou dispare um prompt direto para qualquer motor Gemini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="prompt" className="w-full">
              <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2 mb-4">
                <TabsTrigger value="prompt" className="gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Testar Prompt por Motor
                </TabsTrigger>
                <TabsTrigger value="shopping" className="gap-1.5 text-xs">
                  <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
                  Categorização Compras
                </TabsTrigger>
              </TabsList>

              {/* Aba 1: Prompt Direto */}
              <TabsContent value="prompt" className="space-y-4">
                <form onSubmit={handleTestPrompt} className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor={engineSelectId} className="text-xs font-semibold block">
                        Motor / Protocolo Gemini
                      </label>
                      <select
                        id={engineSelectId}
                        value={promptEngine}
                        onChange={(e) => setPromptEngine(e.target.value as any)}
                        className="w-full min-h-10 rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <option value="gemini_38_flash">Gemini 3.8 Flash — Interactions API (Sofia, Copiloto, OCR)</option>
                        <option value="gemini_35_flash_lite">Gemini 3.5 Flash-Lite — Interactions API (Leve: Sentimento, Compras, Triagem, Fiscal)</option>
                        <option value="gemini_4_argon">Gemini 4 Argon — Interactions API (Opcional / Raciocínio Pesado)</option>
                        <option value="gemini_38_b2b">Gemini 3.8 Flash B2B — Interactions API + JSON Schema (Vouchers Zoho)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor={keySourceSelectId} className="text-xs font-semibold block">
                        Origem da Chave para Teste
                      </label>
                      <select
                        id={keySourceSelectId}
                        value={promptKeySource}
                        onChange={(e) => setPromptKeySource(e.target.value as any)}
                        className="w-full min-h-10 rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <option value="active">Chave ativa em produção ({data?.keys.primaryActiveSource || "padrão"})</option>
                        {canTestSecondaryDbKey && (
                          <option value="db_settings">Chave salva em /configuracoes (ignorar override Render)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={promptInputId} className="text-xs font-semibold block">
                      Prompt de diagnóstico
                    </label>
                    <p id={promptHintId} className="text-[11px] text-muted-foreground">
                      Envie uma instrução curta (até 500 caracteres) para medir resposta real e latência exata.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id={promptInputId}
                        type="text"
                        maxLength={500}
                        required
                        aria-describedby={promptHintId}
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        placeholder="Ex: Responda OK e diga seu nome de modelo"
                        className="flex-1 min-h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                      <Button type="submit" disabled={promptTesting || !promptInput.trim()} className="min-h-10 rounded-xl px-5">
                        {promptTesting ? "Executando..." : "Executar Teste"}
                      </Button>
                    </div>
                  </div>
                </form>

                {promptError && (
                  <div role="alert" className="p-3 rounded-xl border border-red-300 bg-red-50/70 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
                    {promptError}
                  </div>
                )}

                {promptResult && (
                  <div className="p-4 rounded-xl border border-border bg-muted/25 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            promptResult.ok
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
                          }
                        >
                          {promptResult.ok ? `HTTP ${promptResult.status ?? 200} • Sucesso` : `HTTP ${promptResult.status ?? "—"} • Falha`}
                        </Badge>
                        <span className="font-mono font-semibold">{promptResult.model}</span>
                        <span className="text-muted-foreground">({promptResult.protocol})</span>
                      </div>
                      <span className="font-mono font-bold">{formatLatency(promptResult.latencyMs)}</span>
                    </div>

                    <p className="text-muted-foreground">
                      Chave testada: <strong className="text-foreground">{promptResult.keySourceLabel || "—"}</strong>
                    </p>

                    {promptResult.ok && promptResult.replyText ? (
                      <div className="p-3 rounded-lg bg-background border border-emerald-500/30 font-mono text-xs whitespace-pre-wrap">
                        {promptResult.replyText}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/25 space-y-1">
                        <p className="font-semibold text-red-700 dark:text-red-300">{promptResult.diagnosis}</p>
                        {promptResult.rawError && (
                          <p className="text-red-700/85 dark:text-red-300/85 break-words">{promptResult.rawError}</p>
                        )}
                        {promptResult.actionHint && (
                          <p className="text-muted-foreground pt-1">{promptResult.actionHint}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Aba 2: Categorização Real da Lista de Compras */}
              <TabsContent value="shopping" className="space-y-4">
                <form onSubmit={handleTestShopping} className="space-y-2">
                  <label htmlFor={shoppingInputId} className="text-xs font-semibold block">
                    Nome do produto para testar categorização (IA vs. Keywords)
                  </label>
                  <p id={shoppingHintId} className="text-[11px] text-muted-foreground">
                    Executa a categorização real sem cache e compara o retorno do Gemini com as regras locais de palavras-chave.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id={shoppingInputId}
                      type="text"
                      required
                      aria-describedby={shoppingHintId}
                      value={shoppingProduct}
                      onChange={(e) => setShoppingProduct(e.target.value)}
                      placeholder="Ex: sabão em pó, queijo minas frescal, filtro de café"
                      className="flex-1 min-h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    />
                    <Button type="submit" disabled={shoppingTesting || !shoppingProduct.trim()} className="min-h-10 rounded-xl px-5">
                      {shoppingTesting ? "Testando..." : "Testar Produto"}
                    </Button>
                  </div>
                </form>

                {shoppingError && (
                  <div role="alert" className="p-3 rounded-xl border border-red-300 bg-red-50/70 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
                    {shoppingError}
                  </div>
                )}

                {shoppingResult && (
                  <div className="p-4 rounded-xl border border-border bg-muted/25 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-muted-foreground">Produto testado: </span>
                        <strong className="text-sm text-foreground">{shoppingResult.product}</strong>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        {shoppingResult.usedModel && <span>{shoppingResult.usedModel}</span>}
                        <span className="font-bold">{formatLatency(shoppingResult.latencyMs)}</span>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                          Resultado IA (Gemini)
                        </p>
                        {shoppingResult.aiOk && shoppingResult.aiCategories.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {shoppingResult.aiCategories.map((c) => (
                              <Badge key={c} variant="secondary" className="text-[11px]">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-red-600 dark:text-red-400 font-medium">{shoppingResult.diagnosis}</p>
                            {shoppingResult.rawError && (
                              <p className="text-[11px] text-muted-foreground break-words">{shoppingResult.rawError}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                          Fallback Local (Keywords)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {shoppingResult.fallbackCategories.map((c) => (
                            <Badge key={c} variant="outline" className="text-[11px]">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Seção 5: Telemetria das Últimas Chamadas Reais do Servidor */}
        {data && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <h2 className="font-semibold leading-none tracking-tight text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
                Consumo de Tokens &amp; Últimas Chamadas do Servidor
              </h2>
              <CardDescription className="text-xs">
                Telemetria unificada de todos os módulos Gemini (Sofia, B2B, OCR, Sentimento, Camareiras, Compras e Fiscal) desde o último restart.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.telemetrySummary && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl border bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">Chamadas Totais</p>
                      <p className="text-base font-bold font-mono mt-0.5">
                        {data.telemetrySummary.totals.calls}
                        <span className="text-[11px] font-normal text-muted-foreground ml-1">
                          ({data.telemetrySummary.totals.ok} ok)
                        </span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">Tokens Entrada</p>
                      <p className="text-base font-bold font-mono mt-0.5">
                        {data.telemetrySummary.totals.inputTokens.toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
                      <p className="text-[11px] text-muted-foreground">Cache Hit (90% desc.)</p>
                      <p className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {data.telemetrySummary.totals.cachedTokens.toLocaleString("pt-BR")}
                        <span className="text-[11px] font-normal ml-1">
                          ({data.telemetrySummary.totals.inputTokens > 0
                            ? Math.round((data.telemetrySummary.totals.cachedTokens / data.telemetrySummary.totals.inputTokens) * 100)
                            : 0}%)
                        </span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">Saída + Thinking</p>
                      <p className="text-base font-bold font-mono mt-0.5">
                        {data.telemetrySummary.totals.outputTokens.toLocaleString("pt-BR")}
                        <span className="text-[11px] font-normal text-muted-foreground ml-1">
                          ({data.telemetrySummary.totals.thoughtTokens.toLocaleString("pt-BR")} thk)
                        </span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">429 / Circuit Breaker</p>
                      <p className="text-base font-bold font-mono mt-0.5">
                        {data.telemetrySummary.totals.rateLimited429}
                        <span className="text-[11px] font-normal text-muted-foreground ml-1">
                          / {data.telemetrySummary.totals.skippedByCooldown} puladas
                        </span>
                      </p>
                    </div>
                  </div>

                  {Object.keys(data.telemetrySummary.totalsByModule || {}).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(data.telemetrySummary.totalsByModule)
                        .sort(([, a], [, b]) => b.calls - a.calls)
                        .map(([modKey, bucket]) => (
                          <span
                            key={modKey}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-card text-[11px]"
                          >
                            <strong className="font-semibold">{MODULE_LABELS[modKey] || modKey}</strong>
                            <span className="font-mono text-muted-foreground">
                              {bucket.calls}x • {bucket.totalTokens.toLocaleString("pt-BR")} tok
                            </span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {data.recentRuntimeCalls.length === 0 ? (
                <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Nenhuma chamada operacional registrada ainda desde o último restart. Execute um teste no laboratório acima ou utilize um módulo de IA para ver os registros aqui.
                </div>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
                  {data.recentRuntimeCalls.map((call, idx) => (
                    <li key={`${call.at}-${idx}`} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-card">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className={
                            call.ok
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : call.skippedByCooldown
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
                                : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
                          }
                        >
                          {call.ok
                            ? `OK (${call.status ?? 200})`
                            : call.skippedByCooldown
                              ? `PAUSA 429`
                              : `ERRO (${call.status ?? "—"})`}
                        </Badge>
                        <span className="font-semibold">{MODULE_LABELS[call.module] || call.module}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{call.model}</span>
                        {call.keySource && (
                          <span className="text-[11px] text-muted-foreground">• {call.keySource}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {call.usage && (
                          <span title="Tokens: Entrada / Cache / Saída (Thinking)">
                            In {call.usage.inputTokens} • Cache {call.usage.cachedTokens} • Out {call.usage.outputTokens}
                            {call.usage.thoughtTokens > 0 ? ` (${call.usage.thoughtTokens} thk)` : ""}
                          </span>
                        )}
                        <span className="font-semibold text-foreground">{formatLatency(call.latencyMs)}</span>
                        <span>{formatTime(call.at)}</span>
                      </div>
                      {call.error && (
                        <p className="w-full text-[11px] text-red-600 dark:text-red-400 break-words sm:mt-0.5">
                          {call.error}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  )
}
