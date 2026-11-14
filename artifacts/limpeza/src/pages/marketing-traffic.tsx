import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { 
  Sparkles, Bot, ShoppingCart, MessageCircle, TrendingUp,
  Play, Pause, Plus, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle,
  ArrowUpRight, Zap, Search, BarChart3, Copy, Download, Send, BookOpen, ExternalLink
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"
import { useBackTabState } from "@/lib/back-navigation"

const MOCK_PIXEL_IDS = new Set(["7489123891023", "000000000000000", "123456789012345"])
const MOCK_GADS_IDS = new Set(["AW-9481923", "9481923", "AW-000000000"])

function cleanLoadedPixelId(raw: unknown): string {
  const val = String(raw ?? "").trim()
  return MOCK_PIXEL_IDS.has(val) ? "" : val
}

function cleanLoadedGAdsId(raw: unknown): string {
  const val = String(raw ?? "").trim()
  return MOCK_GADS_IDS.has(val) ? "" : val
}

function cleanLoadedCapiToken(rawCapi: unknown, rawLegacy: unknown): string {
  const primary = String(rawCapi ?? rawLegacy ?? "").trim()
  if (!primary || primary === "EAABwz..." || /^EAABwz\.+$/i.test(primary)) return ""
  return primary
}

function extractSiteVerificationInput(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/content\s*=\s*["']([^"']+)["']/i)
  if (match?.[1]) return match[1].trim()
  return trimmed.replace(/^google-site-verification\s*=\s*/i, "").trim()
}

const READY_GOOGLE_KEYWORDS = `[hotel em campos dos goytacazes]
[flat em campos dos goytacazes]
[hospedagem corporativa campos dos goytacazes]
"hotel executivo campos dos goytacazes"
"hotel perto da pelinca campos"
"flat mobiliado centro campos rj"
"hospedagem diaria com nota fiscal campos"
[corpflats]
"corpflats campos"`

const READY_NEGATIVE_KEYWORDS = `emprego
vaga
curriculo
trabalhe conosco
recepcionista
camareira
auxiliar de limpeza
motel
pernoite
2 horas
aluguel mensal barato
kitnet estudante
republica uenf
olx
zap imoveis
vivareal
gratis
gratuito`

export default function MarketingTraffic() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [activeTab, setActiveTab] = useState<"funnel" | "carts" | "campaigns" | "studio" | "settings">("funnel")
  useBackTabState(activeTab, setActiveTab, { id: "marketing-tabs" })
  const [funnelData, setFunnelData] = useState<any>(null)
  const [cartsData, setCartsData] = useState<any>(null)
  const [campaignsData, setCampaignsData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // AI Studio State
  const [selectedAudience, setSelectedAudience] = useState("casais")
  const [generatedCopies, setGeneratedCopies] = useState<any[]>([])
  const [generatingCopies, setGeneratingCopies] = useState(false)

  // New Campaign Modal
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [campName, setCampName] = useState("")
  const [campAudience, setCampAudience] = useState("urgencia_baixa_ocupacao")
  const [campBudget, setCampBudget] = useState("35")
  const [campTitle, setCampTitle] = useState("")
  const [campCopy, setCampCopy] = useState("")
  const [creatingCamp, setCreatingCamp] = useState(false)

  // Google, Meta Pixel/CAPI, SEO & Ad Automation Settings State
  const [adSettings, setAdSettings] = useState({
    autoPilotEnabled: true,
    lowOccupancyThresholdPct: 60,
    highOccupancyPausePct: 85,
    dailyBudgetLimit: 50,
    ga4MeasurementId: "",
    googleAdsId: "",
    googleAdsConversionLabel: "",
    googleSiteVerification: "",
    metaPixelId: "",
    metaCapiToken: "",
    metaApiToken: "",
    metaTestEventCode: "",
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSavedMsg, setSettingsSavedMsg] = useState("")
  const [testingCapi, setTestingCapi] = useState(false)
  const [capiTestResult, setCapiTestResult] = useState<{ ok: boolean; message: string; fbtraceId?: string } | null>(null)
  const [copiedKey, setCopiedKey] = useState("")

  const handleCopySnippet = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(""), 2500)
    } catch {
      // Ignore clipboard permission errors
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [resFunnel, resCarts, resCamps] = await Promise.all([
        fetch("/api/funnel/analytics", { credentials: "include" }),
        fetch("/api/marketing/abandoned-carts", { credentials: "include" }),
        fetch("/api/marketing/ad-campaigns", { credentials: "include" })
      ])
      const [jsonFunnel, jsonCarts, jsonCamps] = await Promise.all([
        resFunnel.json(),
        resCarts.json(),
        resCamps.json()
      ])
      setFunnelData(jsonFunnel)
      setCartsData(jsonCarts)
      setCampaignsData(jsonCamps)
      if (jsonCamps?.settings) {
        const s = jsonCamps.settings
        const cleanToken = cleanLoadedCapiToken(s.metaCapiToken, s.metaApiToken)
        setAdSettings({
          autoPilotEnabled: Boolean(s.autoPilotEnabled ?? true),
          lowOccupancyThresholdPct: Number(s.lowOccupancyThresholdPct ?? 60),
          highOccupancyPausePct: Number(s.highOccupancyPausePct ?? 85),
          dailyBudgetLimit: Number(s.dailyBudgetLimit ?? s.defaultDailyBudget ?? 50),
          ga4MeasurementId: String(s.ga4MeasurementId ?? "").trim(),
          googleAdsId: cleanLoadedGAdsId(s.googleAdsId),
          googleAdsConversionLabel: String(s.googleAdsConversionLabel ?? "").trim(),
          googleSiteVerification: extractSiteVerificationInput(String(s.googleSiteVerification ?? "")),
          metaPixelId: cleanLoadedPixelId(s.metaPixelId),
          metaCapiToken: cleanToken,
          metaApiToken: cleanToken,
          metaTestEventCode: String(s.metaTestEventCode ?? "").trim(),
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAdSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSavingSettings(true)
    setSettingsSavedMsg("")
    try {
      const cleanToken = adSettings.metaCapiToken.trim()
      const payload = {
        ...adSettings,
        ga4MeasurementId: adSettings.ga4MeasurementId.trim().toUpperCase(),
        googleAdsId: cleanLoadedGAdsId(adSettings.googleAdsId),
        googleAdsConversionLabel: adSettings.googleAdsConversionLabel.trim(),
        googleSiteVerification: extractSiteVerificationInput(adSettings.googleSiteVerification),
        metaPixelId: cleanLoadedPixelId(adSettings.metaPixelId),
        metaCapiToken: cleanToken,
        metaApiToken: cleanToken,
        metaTestEventCode: adSettings.metaTestEventCode.trim(),
        dailyBudgetLimit: Number(adSettings.dailyBudgetLimit || 50),
        defaultDailyBudget: Number(adSettings.dailyBudgetLimit || 50),
      }
      const res = await fetch("/api/marketing/ad-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.settings) {
          setCampaignsData((prev: any) => prev ? { ...prev, settings: data.settings } : prev)
        }
        setSettingsSavedMsg("Configurações de Google, Meta Pixel/CAPI e SEO salvas com sucesso!")
        setTimeout(() => setSettingsSavedMsg(""), 4500)
      }
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestMetaCapi = async () => {
    setTestingCapi(true)
    setCapiTestResult(null)
    try {
      const res = await fetch("/api/marketing/test-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          metaPixelId: adSettings.metaPixelId.trim(),
          metaCapiToken: adSettings.metaCapiToken.trim(),
          testEventCode: adSettings.metaTestEventCode.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      const ok = Boolean(data?.ok || data?.success)
      setCapiTestResult({
        ok,
        message:
          data?.message ||
          (ok
            ? "Disparo de teste recebido pela Meta com sucesso!"
            : "Não foi possível validar o disparo CAPI. Verifique o Pixel ID e o Token."),
        fbtraceId: data?.fbtraceId,
      })
    } catch {
      setCapiTestResult({
        ok: false,
        message: "Falha de comunicação ao testar o disparo CAPI no servidor.",
      })
    } finally {
      setTestingCapi(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleGenerateCopy = async (aud: string) => {
    setSelectedAudience(aud)
    setGeneratingCopies(true)
    try {
      const res = await fetch(`/api/marketing/creative-generator?audience=${aud}`, { credentials: "include" })
      const json = await res.json()
      setGeneratedCopies(json.variations || [])
    } finally {
      setGeneratingCopies(false)
    }
  }

  useEffect(() => {
    if (activeTab === "studio" && generatedCopies.length === 0) {
      handleGenerateCopy("casais")
    }
  }, [activeTab])

  const handleToggleCampaign = async (id: number) => {
    await fetch(`/api/marketing/ad-campaigns/${id}/toggle`, { method: "POST", credentials: "include" })
    fetchData()
  }

  const handleRecoverCart = async (cartId: number) => {
    const res = await fetch(`/api/marketing/abandoned-carts/${cartId}/recover`, { method: "POST", credentials: "include" })
    const json = await res.json()
    if (json.whatsappUrl) {
      window.open(json.whatsappUrl, "_blank")
    }
    fetchData()
  }

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campName.trim()) return
    setCreatingCamp(true)
    try {
      await fetch("/api/marketing/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campName,
          targetAudience: campAudience,
          dailyBudget: Number(campBudget),
          creativeTitle: campTitle,
          creativeCopy: campCopy
        }),
        credentials: "include"
      })
      setCampaignModalOpen(false)
      setCampName("")
      setCampTitle("")
      setCampCopy("")
      fetchData()
    } finally {
      setCreatingCamp(false)
    }
  }

  if (!loadingUser && user?.role !== "admin" && user?.role !== "dev") {
    return <AccessDenied moduleName="o Tráfego Autônomo & IA" />
  }

  if (loading) {
    return (
      <Shell>
        <div className="p-8 text-center text-xs text-muted-foreground">
          Carregando motor de tráfego e IA...
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Bot className="w-6 h-6 text-indigo-600" />
                Tráfego Autônomo & Resgate de Carrinho com IA
              </h1>
              <Badge className={`text-[10px] font-bold ${adSettings.autoPilotEnabled ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" : "bg-slate-200 text-slate-700"}`}>
                {adSettings.autoPilotEnabled ? "Piloto Automático Ativo" : "Piloto Automático Pausado"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Gatilhos de ocupação no PMS, geração de anúncios com IA e recuperação instantânea de clientes no WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              onClick={() => setCampaignModalOpen(true)}
              className="text-xs font-semibold gap-1.5 shadow-2xs bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Campanha com IA</span>
            </Button>
          </div>
        </div>

        {/* Top KPIs Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-xl border shadow-2xs p-3.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Carrinhos a Recuperar</div>
            <div className="text-2xl font-black text-rose-600 mt-1">
              R$ {cartsData.stats.totalAbandonedAmount.toLocaleString("pt-BR")}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {cartsData.stats.totalAbandoned} clientes saíram sem pagar
            </div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Resgatados no WhatsApp</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              R$ {cartsData.stats.totalRecoveredAmount.toLocaleString("pt-BR")}
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-bold">
              Taxa de Sucesso: {cartsData.stats.recoveryRatePct}%
            </div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">ROAS Médio de Anúncios</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">
              {campaignsData.stats.overallRoas}x
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              R$ {campaignsData.stats.totalRevenue.toLocaleString("pt-BR")} gerados com R$ {campaignsData.stats.totalSpent} investidos
            </div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
            <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">Gatilho de Ocupação</div>
            <div className="text-2xl font-black text-indigo-600 mt-1 flex items-center gap-1.5">
              <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
              <span>{adSettings.autoPilotEnabled ? "Otimizando" : "Manual"}</span>
            </div>
            <div className="text-[10px] text-indigo-700 dark:text-indigo-400 mt-0.5 font-medium">
              Liga anúncios se ocupação &lt; {adSettings.lowOccupancyThresholdPct}% • Pausa &gt; {adSettings.highOccupancyPausePct}%
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("funnel")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "funnel" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span>0. Funil de Vendas do Motor</span>
          </button>

          <button
            onClick={() => setActiveTab("carts")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "carts" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>1. Carrinhos Abandonados ({cartsData?.stats?.totalAbandoned || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("campaigns")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "campaigns" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>2. Campanhas & Piloto Automático</span>
          </button>

          <button
            onClick={() => setActiveTab("studio")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "studio" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>3. Estúdio Criativo com IA</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "settings" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>4. Google, Meta Pixel &amp; SEO</span>
          </button>
        </div>

        {/* Tab 0: Sales Funnel Dashboard */}
        {activeTab === "funnel" && funnelData && (
          <div className="space-y-6 animate-in fade-in">
            {/* Visual Funnel Pipeline */}
            <Card className="rounded-2xl border shadow-2xs p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Pipeline do Funil de Conversão do Motor de Reservas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Acompanhamento em tempo real das etapas de compra dos hóspedes no site oficial.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs">
                    Taxa de Conversão Geral: {funnelData.funnel?.overallConversionRate || "0.0"}%
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchData}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar</span>
                  </Button>
                </div>
              </div>

              {/* 5 Funnel Stages Graphic */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                {funnelData.funnel?.steps?.map((s: any, idx: number) => {
                  const colors = [
                    "from-sky-500 to-blue-600",
                    "from-blue-600 to-indigo-600",
                    "from-indigo-600 to-violet-600",
                    "from-violet-600 to-purple-600",
                    "from-purple-600 to-emerald-600"
                  ]
                  const bgLight = [
                    "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800",
                    "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
                    "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800",
                    "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
                    "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                  ]
                  return (
                    <div
                      key={s.step}
                      className={`p-4 rounded-2xl border ${bgLight[idx]} flex flex-col justify-between space-y-3 relative shadow-xs`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-black text-muted-foreground text-[10px] uppercase">
                          Etapa {s.step}
                        </span>
                        {idx > 0 && s.dropOffRate > 0 && (
                          <span className="text-[10px] text-rose-500 font-bold">
                            -{s.dropOffRate}% perda
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                          {s.name}
                        </h4>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">
                          {s.count}
                        </div>
                        <span className="text-[10px] text-muted-foreground block">
                          visitantes nesta fase
                        </span>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-border/50">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span>Conversão:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{s.convRate}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${colors[idx]} rounded-full`}
                            style={{ width: `${Math.max(10, Math.min(100, s.convRate))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Live Funnel Sessions Table */}
            <Card className="rounded-2xl border shadow-2xs overflow-hidden">
              <CardHeader className="bg-muted/10 border-b pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Sessões Ativas no Funil & Leads de Alta Intenção</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {funnelData.sessions?.length || 0} sessões registradas
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Hóspedes que iniciaram o processo no motor de reservas. Dispare o resgate para fechar vendas pendentes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border text-xs">
                  {funnelData.sessions && funnelData.sessions.length > 0 ? (
                    funnelData.sessions.map((sess: any) => {
                      const isCompleted = sess.status === "concluido"
                      const isAwaitingPayment = sess.status === "aguardando_pagamento"
                      const hasContact = Boolean(sess.guestPhone)
                      const paidSourceLabel = sess.gclid
                        ? "Google Ads"
                        : sess.fbclid
                          ? "Meta Ads"
                          : sess.utm_source
                            ? String(sess.utm_source)
                            : ""
                      return (
                        <div key={sess.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                          <div className="space-y-1.5 min-w-[220px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                {sess.guestName || (hasContact ? "Hóspede c/ Contato" : "Visitante Anônimo")}
                              </span>
                              <Badge className={`text-[9px] font-bold ${
                                isCompleted
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : isAwaitingPayment
                                    ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                                    : (sess.status === "recuperado" 
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" 
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300")
                              }`}>
                                {isCompleted
                                  ? "✓ Reserva Paga"
                                  : isAwaitingPayment
                                    ? "⏳ PIX/Cartão Gerado (Aguardando Pagamento)"
                                    : (sess.status === "recuperado" ? "Mensagem Enviada" : `Etapa ${sess.currentStep || 1}: ${sess.currentStepName || "Navegando"}`)}
                              </Badge>
                              {paidSourceLabel && (
                                <Badge variant="outline" className="text-[9px] font-mono font-bold border-indigo-300 text-indigo-700 dark:text-indigo-300">
                                  🎯 {paidSourceLabel}{sess.utm_campaign ? ` • ${sess.utm_campaign}` : ""}
                                </Badge>
                              )}
                            </div>

                            <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                              {sess.guestPhone && <span>📱 {sess.guestPhone}</span>}
                              {sess.guestEmail && <span>✉️ {sess.guestEmail}</span>}
                              {sess.checkinDate && (
                                <span>📅 {sess.checkinDate} a {sess.checkoutDate}</span>
                              )}
                              <span>🏨 {sess.flatsCount || 1} {sess.flatsCount === 1 ? "flat" : "flats"}</span>
                              {sess.ratePlan && (
                                <span>☕ {sess.ratePlan === "with_breakfast" ? "Com Café" : "Sem Café"}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="font-black text-sm text-slate-900 dark:text-slate-100 font-mono">
                                R$ {Number(sess.totalAmount || 0).toLocaleString("pt-BR")}
                              </div>
                              <div className="text-[10px] text-muted-foreground">Valor Estimado</div>
                            </div>

                            {sess.recoveryWhatsappUrl && !isCompleted ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  window.open(sess.recoveryWhatsappUrl, "_blank")
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-2xs rounded-xl"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Resgatar no WhatsApp</span>
                              </Button>
                            ) : (
                              isCompleted && (
                                <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3 rounded-xl">
                                  {sess.reservationCode || "Pago"}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      Nenhuma sessão registrada no funil ainda hoje. As buscas no site aparecerão aqui automaticamente.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 1: Abandoned Carts */}
        {activeTab === "carts" && (
          <div className="space-y-4">
            <Card className="rounded-xl border shadow-2xs overflow-hidden">
              <CardHeader className="bg-muted/10 border-b pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Sessões Interrompidas no Checkout (Últimas 24h)</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {cartsData.carts.length} visitantes rastreados
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  O cliente preencheu nome e WhatsApp no site mas não concluiu o pagamento. Clique para disparar a mensagem de resgate.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border text-xs">
                  {cartsData.carts.map((cart: any) => (
                    <div key={cart.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/10">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{cart.guestName || "Cliente sem Nome"}</span>
                          <Badge className={`text-[9px] font-bold ${
                            cart.status === "recuperado" || cart.status === "concluido" 
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          }`}>
                            {cart.status === "recuperado" || cart.status === "concluido" ? "Recuperado / Pago" : "Abandonado"}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                          <span>📱 {cart.guestPhone}</span>
                          <span>•</span>
                          <span>📅 {cart.checkinDate} a {cart.checkoutDate}</span>
                          <span>•</span>
                          <span>🏨 Apt {cart.flatNumber}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-black text-sm text-slate-900 dark:text-slate-100 font-mono">
                            R$ {cart.totalAmount?.toLocaleString("pt-BR")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Valor do Carrinho</div>
                        </div>

                        <Button 
                          size="sm"
                          onClick={() => handleRecoverCart(cart.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-2xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Resgatar no WhatsApp</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 2: Campaigns & Auto-Pilot */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 divide-y border rounded-xl overflow-hidden bg-background">
              {campaignsData.campaigns.map((camp: any) => (
                <div key={camp.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-muted/10">
                  <div className="space-y-1.5 max-w-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{camp.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">{camp.platform}</Badge>
                      <Badge className={`text-[9px] font-bold ${
                        camp.status === "ativa" 
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}>
                        {camp.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground italic line-clamp-1">
                      "{camp.creativeCopy}"
                    </p>
                    <div className="text-[11px] text-muted-foreground flex gap-3 font-mono">
                      <span>Orçamento: R$ {camp.dailyBudget}/dia</span>
                      <span>•</span>
                      <span>Cliques: {camp.clicks}</span>
                      <span>•</span>
                      <span>Conversões: {camp.conversions}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-black text-indigo-600 font-mono">
                        {camp.roas}x ROAS
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        R$ {camp.revenue} faturados / R$ {camp.spent} gasto
                      </div>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleToggleCampaign(camp.id)}
                      className="text-xs font-semibold gap-1.5"
                    >
                      {camp.status === "ativa" ? <Pause className="w-3.5 h-3.5 text-amber-600" /> : <Play className="w-3.5 h-3.5 text-emerald-600" />}
                      <span>{camp.status === "ativa" ? "Pausar" : "Ativar"}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: AI Creative Studio */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-muted/20 border rounded-2xl">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Gerador de Anúncios e Copies Persuasivas
                </h3>
                <p className="text-xs text-muted-foreground">
                  A IA analisa o público-alvo e gera chamadas magnéticas com ganchos de alta conversão.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select value={selectedAudience} onValueChange={handleGenerateCopy}>
                  <SelectTrigger className="text-xs w-48">
                    <SelectValue placeholder="Selecione o Público" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casais">💑 Casais / Fim de Semana</SelectItem>
                    <SelectItem value="executivos">💼 Executivos & Empresas</SelectItem>
                    <SelectItem value="urgencia_baixa_ocupacao">🔥 Urgência (Baixa Ocupação)</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  size="sm" 
                  onClick={() => handleGenerateCopy(selectedAudience)}
                  disabled={generatingCopies}
                  className="text-xs font-semibold gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingCopies ? "animate-spin" : ""}`} />
                  <span>Gerar Variações</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {generatedCopies.map((copyItem: any, idx: number) => (
                <Card key={idx} className="rounded-2xl border shadow-2xs p-5 space-y-3 relative overflow-hidden bg-background">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold">
                      Opção #{idx + 1}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setCampTitle(copyItem.title)
                        setCampCopy(copyItem.body)
                        setCampName(`Anúncio IA - ${copyItem.title}`)
                        setCampaignModalOpen(true)
                      }}
                      className="text-xs text-primary font-semibold gap-1 h-7 px-2"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Usar em Campanha</span>
                    </Button>
                  </div>

                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{copyItem.title}</h4>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">{copyItem.hook}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{copyItem.body}</p>

                  <div className="p-2.5 bg-muted/40 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span>Botão de Ação:</span>
                    <span className="text-indigo-600">{copyItem.cta}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Google, Meta Pixel/CAPI, SEO & Layman 5-Min Setup Guide */}
        {activeTab === "settings" && (() => {
          const ga4Trim = adSettings.ga4MeasurementId.trim().toUpperCase()
          const isGa4Valid = /^G-[A-Z0-9]{4,24}$/.test(ga4Trim)
          const isGa4InvalidFormat = Boolean(ga4Trim) && !isGa4Valid

          const gAdsTrim = adSettings.googleAdsId.trim()
          const isGAdsValid = /^AW-\d{6,16}$/i.test(gAdsTrim) && !MOCK_GADS_IDS.has(gAdsTrim)
          const isGAdsInvalidFormat = Boolean(gAdsTrim) && !isGAdsValid

          const pixelTrim = adSettings.metaPixelId.trim()
          const isPixelValid = /^\d{10,20}$/.test(pixelTrim) && !MOCK_PIXEL_IDS.has(pixelTrim)
          const isPixelInvalidFormat = Boolean(pixelTrim) && !isPixelValid

          const hasCapiToken = adSettings.metaCapiToken.trim().length >= 20
          const hasSearchConsole = adSettings.googleSiteVerification.trim().length >= 8

          return (
            <div className="space-y-6 animate-in fade-in">
              {/* Top Diagnostic & Cross-Module Bar */}
              <Card className="rounded-2xl border p-4 bg-slate-50/70 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge className={hasSearchConsole ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
                      Search Console: {hasSearchConsole ? "Verificado ✓" : "Pendente"}
                    </Badge>
                    <Badge className={isGa4Valid ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
                      GA4: {isGa4Valid ? `${ga4Trim} ✓` : "Pendente"}
                    </Badge>
                    <Badge className={isGAdsValid ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
                      Google Ads: {isGAdsValid ? `${gAdsTrim.toUpperCase()} ✓` : "Pendente"}
                    </Badge>
                    <Badge className={isPixelValid && hasCapiToken ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : isPixelValid ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
                      Meta CAPI: {isPixelValid && hasCapiToken ? "Server-Side Ativo ✓" : isPixelValid ? "Só Pixel (Sem CAPI)" : "Aguardando Semana 2"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/editor-site")}
                      className="text-xs font-semibold gap-1.5 h-8"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Landing Pages &amp; Textos SEO</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/crm")}
                      className="text-xs font-semibold gap-1.5 h-8"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar Hóspedes Ex-OTA (CRM)</span>
                    </Button>
                  </div>
                </div>
              </Card>

              <form onSubmit={handleSaveAdSettings} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Column 1: Google Ecosystem (Week 1 Priority) */}
                <Card className="rounded-2xl border p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-blue-600" />
                        <span>Ecossistema Google (Ligar na Semana 1 — ~65% da Verba)</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Captura executivos buscando hotel/flat em Campos agora. Não exige seguidores no Instagram.
                      </p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold shrink-0">
                      Prioridade #1
                    </Badge>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Google Search Console (Código de Verificação HTML)</Label>
                        <button
                          type="button"
                          onClick={() => handleCopySnippet("sitemap", "https://corpflats.com.br/sitemap.xml")}
                          className="text-[11px] text-indigo-600 hover:underline font-semibold flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedKey === "sitemap" ? "Sitemap copiado!" : "Copiar URL do Sitemap"}</span>
                        </button>
                      </div>
                      <Input
                        value={adSettings.googleSiteVerification}
                        onChange={e => setAdSettings(prev => ({
                          ...prev,
                          googleSiteVerification: extractSiteVerificationInput(e.target.value),
                        }))}
                        placeholder='Cole o código ou a tag <meta name="google-site-verification" ... /> inteira'
                        className="text-xs font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Pode colar a tag HTML completa que o sistema extrai somente o código automaticamente.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
                          <span>Google Analytics 4 — ID da Métrica (Measurement ID)</span>
                        </Label>
                        {isGa4InvalidFormat && (
                          <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Deve começar com G-
                          </span>
                        )}
                      </div>
                      <Input
                        value={adSettings.ga4MeasurementId}
                        onChange={e => setAdSettings(prev => ({ ...prev, ga4MeasurementId: e.target.value }))}
                        placeholder="Ex: G-XXXXXXXXXX (deixe vazio enquanto não criar)"
                        className="text-xs font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Google Ads Conversion ID</Label>
                          {isGAdsInvalidFormat && (
                            <span className="text-[10px] text-rose-600 font-bold">Formato AW-123...</span>
                          )}
                        </div>
                        <Input
                          value={adSettings.googleAdsId}
                          onChange={e => {
                            const raw = e.target.value.trim()
                            if (raw.includes("/")) {
                              const [idPart, labelPart] = raw.split("/", 2)
                              setAdSettings(prev => ({
                                ...prev,
                                googleAdsId: idPart.trim(),
                                googleAdsConversionLabel: labelPart?.trim() || prev.googleAdsConversionLabel,
                              }))
                            } else {
                              setAdSettings(prev => ({ ...prev, googleAdsId: e.target.value }))
                            }
                          }}
                          placeholder="Ex: AW-16543210987"
                          className="text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Rótulo da Conversão (Compra)</Label>
                        <Input
                          value={adSettings.googleAdsConversionLabel}
                          onChange={e => setAdSettings(prev => ({ ...prev, googleAdsConversionLabel: e.target.value }))}
                          placeholder="Ex: AbCdEfGhIjKlMnOpQr"
                          className="text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Reservas pagas no PIX/Cartão com clique Google (<code className="font-mono">gclid</code>):
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open("/api/marketing/google-offline-conversions.csv", "_blank")}
                        className="text-xs font-semibold gap-1.5 h-8"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>Baixar Conversões Offline (CSV)</span>
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Column 2: Meta Pixel & Server-Side CAPI (Week 2) */}
                <Card className="rounded-2xl border p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Meta Pixel &amp; Conversions API (Server-Side CAPI)</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Dispara o evento <code className="font-mono">Purchase</code> direto do servidor assim que o Banco Inter confirma o PIX — mesmo se o hóspede fechar o navegador!
                      </p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold shrink-0">
                      Semana 2 (~35%)
                    </Badge>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Regra Anti-Desperdício Instagram:</strong> Ligue os anúncios pagos de Instagram/Facebook somente após publicar a vitrine de <strong>9 a 12 posts/Reels reais</strong> no perfil <code className="font-mono">@corpflats</code>. Enquanto isso, concentre a verba no Google Pesquisa!
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Meta Pixel ID (Identificação do Conjunto de Dados)</Label>
                        {isPixelInvalidFormat && (
                          <span className="text-[10px] text-rose-600 font-bold">Apenas 15–16 números reais</span>
                        )}
                      </div>
                      <Input
                        value={adSettings.metaPixelId}
                        onChange={e => setAdSettings(prev => ({ ...prev, metaPixelId: e.target.value }))}
                        placeholder="Cole aqui os 15 ou 16 dígitos do seu Pixel real (sem IDs de teste)"
                        className="text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Token de Acesso da API de Conversões (CAPI)</Label>
                      <Input
                        type="password"
                        value={adSettings.metaCapiToken}
                        onChange={e => {
                          const val = e.target.value
                          setAdSettings(prev => ({ ...prev, metaCapiToken: val, metaApiToken: val }))
                        }}
                        placeholder="Token gerado em Gerenciador de Eventos → Configurações → API de Conversões"
                        className="text-xs font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Código de Evento de Teste (Opcional)</Label>
                        <Input
                          value={adSettings.metaTestEventCode}
                          onChange={e => setAdSettings(prev => ({ ...prev, metaTestEventCode: e.target.value }))}
                          placeholder="Ex: TEST12345 (aba Eventos de Teste)"
                          className="text-xs font-mono"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingCapi}
                        onClick={handleTestMetaCapi}
                        className="text-xs font-bold gap-1.5 h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{testingCapi ? "Disparando p/ Meta..." : "Testar Disparo CAPI"}</span>
                      </Button>
                    </div>

                    {capiTestResult && (
                      <div className={`p-2.5 rounded-xl border text-[11px] font-medium ${
                        capiTestResult.ok
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
                          : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
                      }`}>
                        {capiTestResult.message}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Full-Width Card: PMS Occupancy Auto-Pilot + Save Button */}
                <Card className="rounded-2xl border p-5 space-y-4 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span>Piloto Automático de Ocupação no PMS &amp; Teto Diário (Orçamento Sugerido: R$ 30 a R$ 50/dia)</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Acelera campanhas quando houver suítes vagas na semana e pausa automaticamente quando a ocupação passar de {adSettings.highOccupancyPausePct}%.
                      </p>
                    </div>
                    <Switch
                      checked={adSettings.autoPilotEnabled}
                      onCheckedChange={val => setAdSettings(prev => ({ ...prev, autoPilotEnabled: val }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="space-y-1">
                      <Label className="text-xs">Ligar se Ocupação &lt; (%)</Label>
                      <Input
                        value={adSettings.lowOccupancyThresholdPct}
                        onChange={e => setAdSettings(prev => ({ ...prev, lowOccupancyThresholdPct: Number(e.target.value) || 0 }))}
                        type="number"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Pausar se Ocupação &gt; (%)</Label>
                      <Input
                        value={adSettings.highOccupancyPausePct}
                        onChange={e => setAdSettings(prev => ({ ...prev, highOccupancyPausePct: Number(e.target.value) || 0 }))}
                        type="number"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Teto Diário Total de Mídia (R$/dia)</Label>
                      <Input
                        value={adSettings.dailyBudgetLimit}
                        onChange={e => setAdSettings(prev => ({ ...prev, dailyBudgetLimit: Number(e.target.value) || 0 }))}
                        type="number"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3">
                    {settingsSavedMsg ? (
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {settingsSavedMsg}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Todas as tags são carregadas em modo ocioso (<code className="font-mono">requestIdleCallback</code>) para nota máxima de velocidade no celular.
                      </span>
                    )}

                    <Button
                      type="submit"
                      size="sm"
                      disabled={savingSettings}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-9 px-6"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{savingSettings ? "Salvando..." : "Salvar Google, Meta Pixel & Automação"}</span>
                    </Button>
                  </div>
                </Card>
              </form>

              {/* Embedded 5-Minute Layman Tutorial + Ready-to-Paste Campaign Kit */}
              <Card className="rounded-2xl border p-5 space-y-5 bg-gradient-to-br from-indigo-50/40 via-background to-emerald-50/30 dark:from-indigo-950/20 dark:to-emerald-950/10">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>Tutorial Leigo de 5 Minutos — Como Pegar Seus Códigos e Subir as Campanhas</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Passo a passo direto ao ponto, sem termos difíceis, desenhado para orçamento enxuto de <strong>R$ 30 a R$ 50/dia</strong>.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    65% Google Pesquisa (R$ 20–32/dia) • 35% Meta Ads (R$ 10–18/dia)
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl border bg-background space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      1️⃣ Google Search Console (1 min — Indexar no Google Grátis)
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      Acesse <strong>search.google.com/search-console</strong> → escolha <strong>Prefixo do URL</strong> e digite <code className="font-mono">https://corpflats.com.br</code> → clique em <strong>Tag HTML</strong> → copie a linha <code className="font-mono">&lt;meta...&gt;</code>, cole no primeiro campo acima e clique em Salvar. Depois clique em <strong>Sitemaps</strong> no Google e envie <code className="font-mono">sitemap.xml</code>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border bg-background space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      2️⃣ Google Analytics 4 / GA4 (1,5 min — Medir Visitas e Vendas)
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      Acesse <strong>analytics.google.com</strong> → clique na engrenagem (Administrador) → <strong>Criar Propriedade</strong> (Moeda: Real BRL, Fuso: Brasília) → plataforma <strong>Web</strong> (<code className="font-mono">corpflats.com.br</code>). Copie o <strong>ID da Métrica</strong> que começa com <code className="font-mono">G-</code> e cole no campo GA4 acima.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border bg-background space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      3️⃣ Google Ads + Google Meu Negócio (1,5 min — Ligar Hoje!)
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      Em <strong>ads.google.com</strong> → <strong>Metas → Conversões → Nova ação → Site → Compra</strong>. Clique em &ldquo;Usar o Gerenciador de tags&rdquo; para ver o <strong>ID de conversão</strong> (<code className="font-mono">AW-...</code>) e o <strong>Rótulo</strong> e cole acima. Em <strong>Recursos → Locais</strong>, vincule seu <strong>Google Meu Negócio</strong> para exibir pino no Maps e telefone direto!
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border bg-background space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      4️⃣ Meta Pixel + CAPI (1 min — Ligar após 9–12 posts no @corpflats)
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      Em <strong>business.facebook.com/events_manager</strong> → <strong>Conectar dados → Web</strong> → crie o Pixel <code className="font-mono">CorpFlats Oficial</code>. Em <strong>Configurações</strong>, copie a <strong>Identificação do conjunto de dados</strong> (15–16 números), role até <strong>API de Conversões → Gerar token de acesso</strong>, cole ambos acima, salve e clique em <strong>Testar Disparo CAPI</strong>.
                    </p>
                  </div>
                </div>

                {/* Ready-to-Copy Keyword & Negative Keyword Blocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        🎯 Palavras-Chave Google Pesquisa (Seg–Sex &amp; Dom • Corporativo/Fundo de Funil)
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopySnippet("kw", READY_GOOGLE_KEYWORDS)}
                        className="h-7 text-[11px] font-semibold gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedKey === "kw" ? "Copiado!" : "Copiar Lista"}</span>
                      </Button>
                    </div>
                    <pre className="p-3 rounded-xl bg-muted/50 border font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
                      {READY_GOOGLE_KEYWORDS}
                    </pre>
                    <p className="text-[11px] text-muted-foreground">
                      URL Final recomendada p/ Corporativo: <code className="font-mono">https://corpflats.com.br/hospedagem-corporativa-campos</code> • Lazer Sex–Dom: <code className="font-mono">/fim-de-semana-campos</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-700 dark:text-rose-400">
                        🛡️ Lista Obrigatória de Palavras Negativas (Bloqueia Curiosos/Vagas/Motel)
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopySnippet("neg", READY_NEGATIVE_KEYWORDS)}
                        className="h-7 text-[11px] font-semibold gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedKey === "neg" ? "Copiado!" : "Copiar Negativas"}</span>
                      </Button>
                    </div>
                    <pre className="p-3 rounded-xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/50 font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
                      {READY_NEGATIVE_KEYWORDS}
                    </pre>
                    <p className="text-[11px] text-muted-foreground">
                      Cole em <strong>Campanha → Palavras-chave negativas</strong> no dia 1 para não gastar 1 centavo com currículos, aluguel estudantil ou pernoite de motel.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )
        })()}

        {/* Create Campaign Modal */}
        <Dialog open={campaignModalOpen} onOpenChange={setCampaignModalOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleCreateCampaign}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Criar Nova Campanha de Tráfego
                </DialogTitle>
                <DialogDescription>
                  Configure os dados da campanha para veiculação no Meta Ads / Instagram.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nome da Campanha</Label>
                  <Input value={campName} onChange={e => setCampName(e.target.value)} required placeholder="Ex: Urgência Fim de Semana" className="text-xs" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Público-Alvo</Label>
                    <Select value={campAudience} onValueChange={setCampAudience}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgencia_baixa_ocupacao">🔥 Baixa Ocupação</SelectItem>
                        <SelectItem value="casais">💑 Casais</SelectItem>
                        <SelectItem value="executivos">💼 Executivos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Orçamento Diário (R$)</Label>
                    <Input value={campBudget} onChange={e => setCampBudget(e.target.value)} type="number" className="text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Título do Anúncio</Label>
                  <Input value={campTitle} onChange={e => setCampTitle(e.target.value)} placeholder="Ex: Flats com Vista e Desconto Direto" className="text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Texto / Copy do Anúncio</Label>
                  <Textarea value={campCopy} onChange={e => setCampCopy(e.target.value)} placeholder="Texto persuasivo gerado pela IA..." className="text-xs h-20 resize-none" />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCampaignModalOpen(false)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={creatingCamp} className="font-semibold text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                  {creatingCamp ? "Criando..." : "Publicar Campanha"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
