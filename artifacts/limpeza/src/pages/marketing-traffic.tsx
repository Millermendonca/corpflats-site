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
  Sparkles, Bot, ShoppingCart, MessageCircle, TrendingUp, DollarSign,
  Play, Pause, Plus, RefreshCw, Send, ShieldCheck, CheckCircle2, AlertTriangle, ArrowUpRight, Zap
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function MarketingTraffic() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [activeTab, setActiveTab] = useState<"carts" | "campaigns" | "studio" | "settings">("carts")
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

  const fetchData = async () => {
    setLoading(true)
    try {
      const [resCarts, resCamps] = await Promise.all([
        fetch("/api/marketing/abandoned-carts", { credentials: "include" }),
        fetch("/api/marketing/ad-campaigns", { credentials: "include" })
      ])
      const [jsonCarts, jsonCamps] = await Promise.all([
        resCarts.json(),
        resCamps.json()
      ])
      setCartsData(jsonCarts)
      setCampaignsData(jsonCamps)
    } finally {
      setLoading(false)
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

  if (!loadingUser && user?.role !== "admin") {
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
              <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold">
                Piloto Automático Ativo
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
              <span>Otimizando</span>
            </div>
            <div className="text-[10px] text-indigo-700 dark:text-indigo-400 mt-0.5 font-medium">
              Liga anúncios se ocupação &lt; 60%
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("carts")}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "carts" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>1. Carrinhos Abandonados ({cartsData.stats.totalAbandoned})</span>
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
            <ShieldCheck className="w-4 h-4" />
            <span>4. Meta CAPI & Pixel</span>
          </button>
        </div>

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

        {/* Tab 4: Settings Meta CAPI & Pixel */}
        {activeTab === "settings" && (
          <div className="space-y-6 max-w-2xl">
            <Card className="rounded-2xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Piloto Automático de Tráfego</h3>
                  <p className="text-xs text-muted-foreground">Liga/pausa anúncios conforme a ocupação real do PMS</p>
                </div>
                <Switch defaultChecked={campaignsData.settings.autoPilotEnabled} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs">Ligar se Ocupação for Menor que (%)</Label>
                  <Input defaultValue={campaignsData.settings.lowOccupancyThresholdPct} type="number" className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pausar se Ocupação Ultrapassar (%)</Label>
                  <Input defaultValue={campaignsData.settings.highOccupancyPausePct} type="number" className="text-xs" />
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border p-5 space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Meta Conversions API (Server-Side CAPI)
              </h3>
              <p className="text-xs text-muted-foreground">
                Envia eventos de compra diretamente do servidor para o Facebook/Instagram sem perdas por adblockers.
              </p>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs">Facebook Pixel ID</Label>
                  <Input defaultValue={campaignsData.settings.metaPixelId} placeholder="Ex: 7489123891023" className="text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Token de Acesso da API de Conversões (CAPI)</Label>
                  <Input type="password" defaultValue={campaignsData.settings.metaApiToken} placeholder="EAABwz..." className="text-xs font-mono" />
                </div>
              </div>
            </Card>
          </div>
        )}

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
