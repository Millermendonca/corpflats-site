import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Globe, Sparkles, Save, RotateCcw, ExternalLink, Image as ImageIcon,
  CheckCircle2, Plus, Trash2, Star, Eye, Layers, HelpCircle,
  MessageSquare, Coffee, Wifi, Wind, Car, Utensils, Tv, Dumbbell, Waves,
  MapPin, Phone, Mail, ShieldCheck, Award, Heart, ShieldAlert,
  BadgeDollarSign, Building2, Receipt, Coins
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const CURATED_AIRY_PHOTOS = [
  {
    title: "Living & Sala Arejada com Luz Natural",
    url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1920&q=80"
  },
  {
    title: "Suíte Master com Cama King & Decoração Clean",
    url: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1920&q=80"
  },
  {
    title: "Varanda Arejada com Vista Mar",
    url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1920&q=80"
  },
  {
    title: "Flat Contemporâneo com Tons Naturais",
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1920&q=80"
  },
  {
    title: "Piscina e Deck Solar com Vista",
    url: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1920&q=80"
  }
]

export default function SiteEditor() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("hero")

  useEffect(() => {
    fetchSiteContent()
  }, [])

  const fetchSiteContent = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/site-content")
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch (err) {
      console.error("Erro ao carregar conteúdo do site:", err)
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar as configurações do site.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        toast({
          title: "Site atualizado com sucesso! ✨",
          description: "Todas as alterações nos textos e fotos já estão visíveis no site público de reservas.",
        })
      } else {
        throw new Error("Falha ao salvar")
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar as configurações.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm("Deseja restaurar todas as fotos e textos para a estética padrão clean, moderna e arejada?")) {
      return
    }
    try {
      setSaving(true)
      const res = await fetch("/api/site-content/reset", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setConfig(data.siteConfig)
        toast({
          title: "Estética Restaurada!",
          description: "O site foi resetado para os padrões modernos e arejados.",
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !config) {
    return (
      <Shell>
        <div className="p-8 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando editor do site...</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6 pb-28">
        {/* Header Superior com Ações Rápidas */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Editor & Personalizador do Site
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Edite todas as fotos, títulos, textos, comodidades e depoimentos do seu site de reservas com visualização em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/tarifas")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-amber-300 dark:border-amber-700 bg-amber-50/80 text-amber-900 dark:text-amber-200 hover:bg-amber-100 shadow-2xs"
            >
              <Coins className="w-3.5 h-3.5 text-amber-600" />
              <span>💰 Gestão de Tarifas & Taxas</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/reservar?edit=true", "_blank")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-sky-300 dark:border-sky-700 bg-sky-50/70 text-sky-700 hover:bg-sky-100 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>✏️ Editor Visual na Página</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/reservar", "_blank")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-slate-100"
            >
              <Eye className="w-3.5 h-3.5 text-slate-600" />
              <span>Ver Site Público</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-colors"
              title="Restaurar padrão clean moderno"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs gap-1.5 h-9 px-4 rounded-xl shadow-md transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Salvando..." : "Salvar Alterações"}</span>
            </Button>
          </div>
        </div>

        {/* Abas de Configuração do Site */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 inline-flex gap-1 h-auto min-w-full sm:min-w-0">
              <TabsTrigger value="hero" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Banner & Hero</span>
              </TabsTrigger>
              <TabsTrigger value="branding" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Identidade & Contato</span>
              </TabsTrigger>
              <TabsTrigger value="amenities" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Comodidades</span>
              </TabsTrigger>
              <TabsTrigger value="gallery" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Galeria de Fotos</span>
              </TabsTrigger>
              <TabsTrigger value="testimonials" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Star className="w-3.5 h-3.5" />
                <span>Avaliações</span>
              </TabsTrigger>
              <TabsTrigger value="about" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Award className="w-3.5 h-3.5" />
                <span>Sobre o Flat</span>
              </TabsTrigger>
              <TabsTrigger value="faq" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Perguntas (FAQ)</span>
              </TabsTrigger>
              <TabsTrigger value="rates" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300 data-[state=active]:shadow-xs gap-1.5">
                <BadgeDollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tarifas & Taxas</span>
              </TabsTrigger>
              <TabsTrigger value="pets" className="rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-xs gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                <span>Pets & Políticas</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 1. ABA BANNER & HERO */}
          <TabsContent value="hero" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sky-600" />
                  Banner Principal (Hero - Topo do Site)
                </CardTitle>
                <CardDescription className="text-xs">
                  Esta é a primeira seção que os hóspedes visualizam ao acessar o seu site de reservas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Título Principal do Site</Label>
                    <Input
                      value={config.hero?.title || ""}
                      onChange={e => setConfig({ ...config, hero: { ...config.hero, title: e.target.value } })}
                      placeholder="Ex: Sua Estadia dos Sonhos em Macaé"
                      className="font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Texto de Destaque / Subtítulo</Label>
                    <Input
                      value={config.hero?.highlightText || ""}
                      onChange={e => setConfig({ ...config, hero: { ...config.hero, highlightText: e.target.value } })}
                      placeholder="Ex: Conforto, Luz Natural e Vista Mar"
                      className="font-medium text-sm text-sky-700 dark:text-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Parágrafo Descritivo de Apresentação</Label>
                  <Textarea
                    rows={3}
                    value={config.hero?.description || ""}
                    onChange={e => setConfig({ ...config, hero: { ...config.hero, description: e.target.value } })}
                    placeholder="Descreva a experiência acolhedora, arejada e os diferenciais dos seus flats..."
                    className="text-xs leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Texto do Botão de Busca</Label>
                    <Input
                      value={config.hero?.buttonText || ""}
                      onChange={e => setConfig({ ...config, hero: { ...config.hero, buttonText: e.target.value } })}
                      placeholder="Ex: Buscar Disponibilidade"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Badge Flutuante de Avaliação</Label>
                    <Input
                      value={config.hero?.floatingBadgeText || ""}
                      onChange={e => setConfig({ ...config, hero: { ...config.hero, floatingBadgeText: e.target.value } })}
                      placeholder="Ex: 🏆 Avaliação 4.9/5 estrelas por mais de 1.200 hóspedes"
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Foto de Fundo do Banner */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-sky-600" />
                      URL da Foto de Fundo do Banner (Alta Resolução)
                    </Label>
                    <span className="text-[11px] text-slate-400">Recomendado: 1920x1080px (iluminação natural)</span>
                  </div>

                  <Input
                    value={config.hero?.backgroundImage || ""}
                    onChange={e => setConfig({ ...config, hero: { ...config.hero, backgroundImage: e.target.value } })}
                    placeholder="https://..."
                    className="text-xs font-mono"
                  />

                  {/* Sugestões de Fotos Arejadas Prontas */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      💡 Sugestões de Fotos de Flats Arejados (Clique para aplicar):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {CURATED_AIRY_PHOTOS.map((p, idx) => (
                        <div
                          key={idx}
                          onClick={() => setConfig({ ...config, hero: { ...config.hero, backgroundImage: p.url } })}
                          className={`group cursor-pointer p-2 rounded-xl border transition-all flex items-center gap-2.5 ${
                            config.hero?.backgroundImage === p.url 
                              ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-500" 
                              : "border-slate-200 dark:border-slate-800 hover:border-sky-300 bg-white dark:bg-slate-900"
                          }`}
                        >
                          <img src={p.url} alt={p.title} className="w-12 h-10 object-cover rounded-lg shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">{p.title}</p>
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">Usar esta foto</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pré-visualização do Banner */}
                  {config.hero?.backgroundImage && (
                    <div className="mt-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative h-48 sm:h-64 shadow-inner">
                      <img
                        src={config.hero.backgroundImage}
                        alt="Preview Banner"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent flex flex-col justify-end p-6 text-white space-y-1">
                        <Badge className="bg-sky-500 text-white font-bold text-[10px] w-fit shadow-xs">
                          {config.branding?.badgeTop || "Destaque"}
                        </Badge>
                        <h3 className="text-xl sm:text-2xl font-black tracking-tight drop-shadow-md">
                          {config.hero.title}
                        </h3>
                        <p className="text-xs text-sky-200 font-semibold drop-shadow-sm">
                          {config.hero.highlightText}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. ABA IDENTIDADE & CONTATO */}
          <TabsContent value="branding" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-600" />
                  Identidade Visual, Nome & Canais de Atendimento
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure o nome do empreendimento, slogan, telefones de suporte e localização.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Nome do Empreendimento (Marca)</Label>
                    <Input
                      value={config.branding?.brandName || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, brandName: e.target.value } })}
                      placeholder="Ex: CorpFlats Macaé"
                      className="font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Faixa / Badge de Oferta do Topo</Label>
                    <Input
                      value={config.branding?.badgeTop || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, badgeTop: e.target.value } })}
                      placeholder="Ex: ⭐ 15% OFF na Reserva Direta | Sem Taxas Ocultas"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Slogan Curto / Tagline</Label>
                  <Input
                    value={config.branding?.tagline || ""}
                    onChange={e => setConfig({ ...config, branding: { ...config.branding, tagline: e.target.value } })}
                    placeholder="Ex: Flats modernos, arejados e confortáveis com vista panorâmica..."
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      WhatsApp de Reservas
                    </Label>
                    <Input
                      value={config.branding?.whatsapp || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, whatsapp: e.target.value } })}
                      placeholder="5522997124021"
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-sky-600" />
                      Telefone Fixo / Central
                    </Label>
                    <Input
                      value={config.branding?.phone || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, phone: e.target.value } })}
                      placeholder="(22) 99712-4021"
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      E-mail de Contato
                    </Label>
                    <Input
                      value={config.branding?.email || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, email: e.target.value } })}
                      placeholder="reservas@corpflats.com.br"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      Endereço Completo
                    </Label>
                    <Input
                      value={config.branding?.address || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, address: e.target.value } })}
                      placeholder="Av. Atlântica, 1788 - Cavaleiros, Macaé - RJ"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Link do Google Maps</Label>
                    <Input
                      value={config.branding?.googleMapsUrl || ""}
                      onChange={e => setConfig({ ...config, branding: { ...config.branding, googleMapsUrl: e.target.value } })}
                      placeholder="https://maps.google.com/..."
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-600" />
                      <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Chave do Google Sign-In & One Tap (Google Client ID)
                      </Label>
                    </div>
                    <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold">
                      Login Social
                    </Badge>
                  </div>
                  <Input
                    value={config.authConfig?.googleClientId || ""}
                    onChange={e => {
                      const current = config.authConfig || {}
                      setConfig({ ...config, authConfig: { ...current, googleClientId: e.target.value } })
                    }}
                    placeholder="Ex: 415372338786-xxxxxx.apps.googleusercontent.com"
                    className="text-xs font-mono h-9 rounded-xl"
                  />
                  <p className="text-[10px] text-slate-500">
                    Insira seu Client ID do Google Cloud Console com o domínio autorizado https://corpflats.onrender.com para habilitar o popup de login rápido do Google para todos os visitantes.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. ABA COMODIDADES */}
          <TabsContent value="amenities" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-600" />
                    Comodidades & Diferenciais do Flat
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Edite os cards de comodidades que aparecem em destaque na página pública de reservas.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newAmenities = [...(config.amenities || [])]
                    newAmenities.push({
                      id: `amenity_${Date.now()}`,
                      icon: "Sparkles",
                      title: "Nova Comodidade",
                      description: "Descrição do diferencial oferecido...",
                      badge: "Diferencial"
                    })
                    setConfig({ ...config, amenities: newAmenities })
                  }}
                  className="text-xs font-bold gap-1.5 h-8 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Comodidade
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(config.amenities || []).map((amenity: any, idx: number) => (
                    <div
                      key={amenity.id || idx}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3 relative group"
                    >
                      <button
                        onClick={() => {
                          const updated = (config.amenities || []).filter((_: any, i: number) => i !== idx)
                          setConfig({ ...config, amenities: updated })
                        }}
                        title="Excluir comodidade"
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-[11px] font-bold">Título da Comodidade</Label>
                          <Input
                            value={amenity.title || ""}
                            onChange={e => {
                              const updated = [...config.amenities]
                              updated[idx].title = e.target.value
                              setConfig({ ...config, amenities: updated })
                            }}
                            placeholder="Ex: Piscina com Deck"
                            className="font-bold text-xs h-8"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold">Tag / Selo</Label>
                          <Input
                            value={amenity.badge || ""}
                            onChange={e => {
                              const updated = [...config.amenities]
                              updated[idx].badge = e.target.value
                              setConfig({ ...config, amenities: updated })
                            }}
                            placeholder="Ex: Incluso"
                            className="text-xs h-8"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Descrição</Label>
                        <Input
                          value={amenity.description || ""}
                          onChange={e => {
                            const updated = [...config.amenities]
                            updated[idx].description = e.target.value
                            setConfig({ ...config, amenities: updated })
                          }}
                          placeholder="Explique o diferencial..."
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. ABA GALERIA DE FOTOS */}
          <TabsContent value="gallery" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-sky-600" />
                    Galeria de Fotos dos Ambientes & Flats
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Adicione fotos iluminadas e arejadas dos quartos, sala, varanda, cozinha e lazer.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newGallery = [...(config.gallery || [])]
                    newGallery.push({
                      id: Date.now(),
                      title: "Novo Ambiente Arejado",
                      category: "Quartos",
                      imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80"
                    })
                    setConfig({ ...config, gallery: newGallery })
                  }}
                  className="text-xs font-bold gap-1.5 h-8 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Foto
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(config.gallery || []).map((item: any, idx: number) => (
                    <div
                      key={item.id || idx}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 relative group"
                    >
                      <button
                        onClick={() => {
                          const updated = (config.gallery || []).filter((_: any, i: number) => i !== idx)
                          setConfig({ ...config, gallery: updated })
                        }}
                        title="Excluir foto"
                        className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-colors shadow-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="h-36 rounded-xl overflow-hidden relative bg-slate-100">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <Badge className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[10px]">
                          {item.category || "Geral"}
                        </Badge>
                      </div>

                      <div className="space-y-1.5">
                        <Input
                          value={item.title || ""}
                          onChange={e => {
                            const updated = [...config.gallery]
                            updated[idx].title = e.target.value
                            setConfig({ ...config, gallery: updated })
                          }}
                          placeholder="Título da foto..."
                          className="text-xs font-bold h-8"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={item.category || ""}
                            onChange={e => {
                              const updated = [...config.gallery]
                              updated[idx].category = e.target.value
                              setConfig({ ...config, gallery: updated })
                            }}
                            placeholder="Categoria (ex: Varanda)"
                            className="text-xs h-7"
                          />
                          <Input
                            value={item.imageUrl || ""}
                            onChange={e => {
                              const updated = [...config.gallery]
                              updated[idx].imageUrl = e.target.value
                              setConfig({ ...config, gallery: updated })
                            }}
                            placeholder="URL da imagem..."
                            className="text-[11px] font-mono h-7"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 5. ABA DEPOIMENTOS / AVALIAÇÕES */}
          <TabsContent value="testimonials" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    Depoimentos de Hóspedes Reais
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Edite as avaliações com nota 5 estrelas que geram credibilidade e autoridade para reservas diretas.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newTestimonials = [...(config.testimonials || [])]
                    newTestimonials.push({
                      id: Date.now(),
                      name: "Nome do Hóspede",
                      city: "Cidade, UF",
                      rating: 5,
                      comment: "Excelente estadia! Flat arejado, limpo e com vista linda.",
                      date: "Mês de 2026",
                      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
                    })
                    setConfig({ ...config, testimonials: newTestimonials })
                  }}
                  className="text-xs font-bold gap-1.5 h-8 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Avaliação
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(config.testimonials || []).map((t: any, idx: number) => (
                    <div
                      key={t.id || idx}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 relative group"
                    >
                      <button
                        onClick={() => {
                          const updated = (config.testimonials || []).filter((_: any, i: number) => i !== idx)
                          setConfig({ ...config, testimonials: updated })
                        }}
                        title="Excluir avaliação"
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-2.5">
                        <img
                          src={t.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"}
                          alt={t.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            value={t.name || ""}
                            onChange={e => {
                              const updated = [...config.testimonials]
                              updated[idx].name = e.target.value
                              setConfig({ ...config, testimonials: updated })
                            }}
                            placeholder="Nome do hóspede..."
                            className="font-bold text-xs h-7"
                          />
                          <Input
                            value={t.city || ""}
                            onChange={e => {
                              const updated = [...config.testimonials]
                              updated[idx].city = e.target.value
                              setConfig({ ...config, testimonials: updated })
                            }}
                            placeholder="Cidade / Origem..."
                            className="text-[11px] h-6 text-slate-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Comentário do Hóspede</Label>
                        <Textarea
                          rows={3}
                          value={t.comment || ""}
                          onChange={e => {
                            const updated = [...config.testimonials]
                            updated[idx].comment = e.target.value
                            setConfig({ ...config, testimonials: updated })
                          }}
                          placeholder="Texto do elogio..."
                          className="text-xs leading-relaxed"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={t.date || ""}
                          onChange={e => {
                            const updated = [...config.testimonials]
                            updated[idx].date = e.target.value
                            setConfig({ ...config, testimonials: updated })
                          }}
                          placeholder="Data (ex: Fev 2026)"
                          className="text-[11px] h-7"
                        />
                        <Input
                          value={t.avatar || ""}
                          onChange={e => {
                            const updated = [...config.testimonials]
                            updated[idx].avatar = e.target.value
                            setConfig({ ...config, testimonials: updated })
                          }}
                          placeholder="URL Foto..."
                          className="text-[10px] font-mono h-7"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 6. ABA SOBRE NÓS & ESTATÍSTICAS */}
          <TabsContent value="about" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Award className="w-5 h-5 text-sky-600" />
                  Seção "Sobre a CorpFlats" & Métricas de Destaque
                </CardTitle>
                <CardDescription className="text-xs">
                  Apresente a história do flat boutique, padrão de atendimento e números de sucesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Título da Seção</Label>
                    <Input
                      value={config.about?.title || ""}
                      onChange={e => setConfig({ ...config, about: { ...config.about, title: e.target.value } })}
                      placeholder="Ex: Uma Nova Experiência em Hospedagem"
                      className="font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Subtítulo / Conceito</Label>
                    <Input
                      value={config.about?.subtitle || ""}
                      onChange={e => setConfig({ ...config, about: { ...config.about, subtitle: e.target.value } })}
                      placeholder="Ex: Conceito Flat Boutique com Liberdade e Serviços de Alto Padrão"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Texto de Apresentação</Label>
                  <Textarea
                    rows={4}
                    value={config.about?.description || ""}
                    onChange={e => setConfig({ ...config, about: { ...config.about, description: e.target.value } })}
                    placeholder="Conte como os flats unem conforto residencial com hospitalidade de excelência..."
                    className="text-xs leading-relaxed"
                  />
                </div>

                {/* Métricas / Stats */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold">4 Métricas de Destaque</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(config.about?.stats || []).map((st: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1 text-center">
                        <Input
                          value={st.value || ""}
                          onChange={e => {
                            const updated = [...config.about.stats]
                            updated[idx].value = e.target.value
                            setConfig({ ...config, about: { ...config.about, stats: updated } })
                          }}
                          placeholder="19+"
                          className="font-black text-center text-sm h-8 text-sky-600"
                        />
                        <Input
                          value={st.label || ""}
                          onChange={e => {
                            const updated = [...config.about.stats]
                            updated[idx].label = e.target.value
                            setConfig({ ...config, about: { ...config.about, stats: updated } })
                          }}
                          placeholder="Flats Exclusivos"
                          className="text-[11px] text-center h-7"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 7. ABA PERGUNTAS FREQUENTES (FAQ) */}
          <TabsContent value="faq" className="space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-sky-600" />
                    Perguntas Frequentes (FAQ)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tire as principais dúvidas dos hóspedes sobre horários, café, estacionamento e pagamentos.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newFaq = [...(config.faq || [])]
                    newFaq.push({
                      q: "Nova Pergunta Frequente?",
                      a: "Resposta detalhada e clara para o hóspede..."
                    })
                    setConfig({ ...config, faq: newFaq })
                  }}
                  className="text-xs font-bold gap-1.5 h-8 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Pergunta
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {(config.faq || []).map((faqItem: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2.5 relative group"
                  >
                    <button
                      onClick={() => {
                        const updated = (config.faq || []).filter((_: any, i: number) => i !== idx)
                        setConfig({ ...config, faq: updated })
                      }}
                      title="Excluir pergunta"
                      className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="space-y-1 pr-8">
                      <Label className="text-[11px] font-bold">Pergunta #{idx + 1}</Label>
                      <Input
                        value={faqItem.q || ""}
                        onChange={e => {
                          const updated = [...config.faq]
                          updated[idx].q = e.target.value
                          setConfig({ ...config, faq: updated })
                        }}
                        placeholder="Ex: Como funciona o estacionamento?"
                        className="font-bold text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Resposta</Label>
                      <Textarea
                        rows={2}
                        value={faqItem.a || ""}
                        onChange={e => {
                          const updated = [...config.faq]
                          updated[idx].a = e.target.value
                          setConfig({ ...config, faq: updated })
                        }}
                        placeholder="Explique com gentileza..."
                        className="text-xs leading-relaxed"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 7. ABA TARIFAS & TAXAS (Redirecionamento para a Tela Dedicada) */}
          <TabsContent value="rates" className="space-y-6">
            <Card className="rounded-3xl border-amber-200 dark:border-amber-900/60 shadow-xs bg-gradient-to-b from-amber-50/40 to-transparent p-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-amber-500 text-white flex items-center justify-center font-bold mx-auto shadow-md">
                <Coins className="w-8 h-8" />
              </div>
              <div className="space-y-2 max-w-lg mx-auto">
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                  Gestão Centralizada de Tarifas, Preços & Taxas
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Para suportar a futura integração com a planilha inteligente de precificação dinâmica automatizada, todas as tarifas (com/sem café, limpeza, pet, 3º hóspede e camas de solteiro) agora são gerenciadas em uma tela própria e dedicada.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() => setLocation("/tarifas")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-11 px-6 rounded-2xl shadow-md transition-all gap-2"
                >
                  <Coins className="w-4 h-4" />
                  <span>Acessar Painel de Tarifas & Taxas</span>
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* 8. ABA PETS & POLÍTICAS DE CANCELAMENTO */}
          <TabsContent value="pets" className="space-y-6">
            {/* Configuração de Pets */}
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <Heart className="w-5 h-5 text-rose-500" />
                      Módulo Pet Friendly (Hospedagem com Animais)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Defina se a sua propriedade aceita animais, o valor da taxa de higienização e o regulamento da casa.
                    </CardDescription>
                  </div>
                  <Badge className={config?.petPolicy?.enabled ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold" : "bg-slate-100 text-slate-500 font-bold"}>
                    {config?.petPolicy?.enabled ? "✓ Pet Friendly Ativo" : "✕ Pets Desabilitados"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Aceitar Animais de Estimação?</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={config?.petPolicy?.enabled ? "default" : "outline"}
                        onClick={() => {
                          const current = config.petPolicy || { enabled: true, feeAmount: 80, feeType: "per_stay" }
                          setConfig({ ...config, petPolicy: { ...current, enabled: true } })
                        }}
                        className="flex-1 text-xs font-bold rounded-xl h-8"
                      >
                        Sim (Aceita Pets)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!config?.petPolicy?.enabled ? "default" : "outline"}
                        onClick={() => {
                          const current = config.petPolicy || { enabled: false, feeAmount: 80, feeType: "per_stay" }
                          setConfig({ ...config, petPolicy: { ...current, enabled: false } })
                        }}
                        className="flex-1 text-xs font-bold rounded-xl h-8"
                      >
                        Não
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Valor da Taxa Pet (R$)</Label>
                    <Input
                      type="number"
                      value={config?.petPolicy?.feeAmount ?? 80}
                      onChange={e => {
                        const current = config.petPolicy || { enabled: true, feeType: "per_stay" }
                        setConfig({ ...config, petPolicy: { ...current, feeAmount: Number(e.target.value) } })
                      }}
                      placeholder="80"
                      className="text-xs h-8 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Tipo da Cobrança</Label>
                    <select
                      value={config?.petPolicy?.feeType || "per_stay"}
                      onChange={e => {
                        const current = config.petPolicy || { enabled: true, feeAmount: 80 }
                        setConfig({ ...config, petPolicy: { ...current, feeType: e.target.value } })
                      }}
                      className="w-full h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium"
                    >
                      <option value="per_stay">Taxa Única por Estadia (Recomendado)</option>
                      <option value="per_night">Taxa por Diária</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-amber-950 dark:text-amber-200">
                        Espécies de Animais Permitidas
                      </Label>
                      <span className="text-[11px] text-amber-800/80 dark:text-amber-400 block">
                        Todos os outros animais não listados serão expressamente proibidos nas regras.
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const species = config?.petPolicy?.allowedSpecies || "Cachorros (Cães)"
                        const defaultRule = `• É expressamente proibida a entrada de quaisquer animais, EXCETO ${species} de pequeno e médio porte (até 15kg).\n• É obrigatório o uso de coleira/guia nas áreas comuns do condomínio.\n• Proibido deixar o animal sozinho no apartamento por longos períodos.\n• O hóspede tutor é responsável pela limpeza e conservação dos móveis e enxoval.`
                        const current = config.petPolicy || { enabled: true, feeAmount: 80, feeType: "per_stay" }
                        setConfig({ ...config, petPolicy: { ...current, rules: defaultRule } })
                      }}
                      className="text-[11px] h-7 px-2.5 rounded-lg border-amber-300 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-100"
                    >
                      Gerar Texto Padrão com Proibição
                    </Button>
                  </div>

                  <Input
                    value={config?.petPolicy?.allowedSpecies || "Cachorros (Cães)"}
                    onChange={e => {
                      const current = config.petPolicy || { enabled: true, feeAmount: 80, feeType: "per_stay" }
                      setConfig({ ...config, petPolicy: { ...current, allowedSpecies: e.target.value } })
                    }}
                    placeholder="Ex: Cachorros (Cães), Gatos"
                    className="text-xs h-8 rounded-xl bg-white dark:bg-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Regulamento & Regras da Casa para Pets (Exibido no Checkout e no Portal)</Label>
                  <Textarea
                    rows={4}
                    value={config?.petPolicy?.rules || ""}
                    onChange={e => {
                      const current = config.petPolicy || { enabled: true, feeAmount: 80, feeType: "per_stay" }
                      setConfig({ ...config, petPolicy: { ...current, rules: e.target.value } })
                    }}
                    placeholder="Descreva o regulamento: proibição expressa de animais não autorizados, porte permitido, uso obrigatório de coleira..."
                    className="text-xs leading-relaxed rounded-xl font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Configuração de Camas (1 Cama Queen vs 2 Camas de Solteiro) */}
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <Layers className="w-5 h-5 text-sky-600" />
                      Configuração de Camas (1 Queen vs 2 Camas de Solteiro)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Configure os valores de acréscimo para 2 camas solteiro, horário limite de pedido no dia e quais flats suportam esse layout.
                    </CardDescription>
                  </div>
                  <Badge className={config?.bedConfig?.allowTwinBeds !== false ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold" : "bg-slate-100 text-slate-500 font-bold"}>
                    {config?.bedConfig?.allowTwinBeds !== false ? "✓ 2 Camas Solteiro Ativo" : "✕ Apenas Cama Queen"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Permitir Escolha de 2 Camas Solteiro?</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={config?.bedConfig?.allowTwinBeds !== false ? "default" : "outline"}
                        onClick={() => {
                          const current = config.bedConfig || { allowTwinBeds: true, twinFeeAmount: 30, twinFeeType: "per_stay", twinAllowedFlats: [113, 114, 115, 202, 905], twinSameDayCutoffTime: "12:00" }
                          setConfig({ ...config, bedConfig: { ...current, allowTwinBeds: true } })
                        }}
                        className="flex-1 text-xs font-bold rounded-xl h-8"
                      >
                        Sim
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={config?.bedConfig?.allowTwinBeds === false ? "default" : "outline"}
                        onClick={() => {
                          const current = config.bedConfig || { allowTwinBeds: false, twinFeeAmount: 30, twinFeeType: "per_stay", twinAllowedFlats: [113, 114, 115, 202, 905], twinSameDayCutoffTime: "12:00" }
                          setConfig({ ...config, bedConfig: { ...current, allowTwinBeds: false } })
                        }}
                        className="flex-1 text-xs font-bold rounded-xl h-8"
                      >
                        Não (Apenas Queen)
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Acréscimo para 2 Camas Solteiro (R$)</Label>
                    <Input
                      type="number"
                      value={config?.bedConfig?.twinFeeAmount ?? 30}
                      onChange={e => {
                        const current = config.bedConfig || { allowTwinBeds: true, twinFeeType: "per_stay", twinAllowedFlats: [113, 114, 115, 202, 905], twinSameDayCutoffTime: "12:00" }
                        setConfig({ ...config, bedConfig: { ...current, twinFeeAmount: Number(e.target.value) } })
                      }}
                      placeholder="30"
                      className="text-xs h-8 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Tipo da Cobrança do Acréscimo</Label>
                    <select
                      value={config?.bedConfig?.twinFeeType || "per_stay"}
                      onChange={e => {
                        const current = config.bedConfig || { allowTwinBeds: true, twinFeeAmount: 30, twinAllowedFlats: [113, 114, 115, 202, 905], twinSameDayCutoffTime: "12:00" }
                        setConfig({ ...config, bedConfig: { ...current, twinFeeType: e.target.value } })
                      }}
                      className="w-full h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium"
                    >
                      <option value="per_stay">Taxa Única por Estadia (Recomendado)</option>
                      <option value="per_night">Taxa por Diária</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Horário Limite no Dia do Check-in</Label>
                    <Input
                      type="time"
                      value={config?.bedConfig?.twinSameDayCutoffTime || "12:00"}
                      onChange={e => {
                        const current = config.bedConfig || { allowTwinBeds: true, twinFeeAmount: 30, twinFeeType: "per_stay", twinAllowedFlats: [113, 114, 115, 202, 905] }
                        setConfig({ ...config, bedConfig: { ...current, twinSameDayCutoffTime: e.target.value } })
                      }}
                      className="text-xs h-8 rounded-xl font-mono"
                    />
                    <p className="text-[10px] text-slate-500">
                      Após este horário, reservas para o mesmo dia não poderão solicitar 2 camas separadas.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Flats que Permitem 2 Camas de Solteiro (Separados por vírgula)</Label>
                    <Input
                      value={Array.isArray(config?.bedConfig?.twinAllowedFlats) ? config.bedConfig.twinAllowedFlats.join(", ") : "113, 114, 115, 202, 905"}
                      onChange={e => {
                        const flatsArray = e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                        const current = config.bedConfig || { allowTwinBeds: true, twinFeeAmount: 30, twinFeeType: "per_stay", twinSameDayCutoffTime: "12:00" }
                        setConfig({ ...config, bedConfig: { ...current, twinAllowedFlats: flatsArray } })
                      }}
                      placeholder="Ex: 113, 114, 115, 202, 905"
                      className="text-xs h-8 rounded-xl font-mono"
                    />
                    <p className="text-[10px] text-slate-500">
                      O motor só alocará hóspedes com 2 camas de solteiro nestes apartamentos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Política de Cancelamento Dinâmica */}
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-sky-600" />
                  Política de Cancelamento Automatizada
                </CardTitle>
                <CardDescription className="text-xs">
                  Regra automatizada baseada na antecedência da reserva para maximizar ocupação e transparência.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 space-y-3">
                  <h4 className="font-bold text-xs text-sky-900 dark:text-sky-200 uppercase tracking-wider">
                    Lógica Ativa de Aplicação Automática:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                      <Badge className="bg-rose-100 text-rose-800 text-[10px] font-bold">Mais de 7 Dias de Antecedência</Badge>
                      <h5 className="font-bold text-slate-900 dark:text-slate-100">🔒 Política Rigorosa</h5>
                      <p className="text-[11px] text-slate-500">
                        Como a unidade fica bloqueada por muito tempo, a reserva é não-reembolsável após a confirmação.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">7 Dias ou Menos de Antecedência</Badge>
                      <h5 className="font-bold text-slate-900 dark:text-slate-100">✓ Política Flexível</h5>
                      <p className="text-[11px] text-slate-500">
                        Reembolso integral (100%) permitido se cancelado até 24 horas antes do check-in às 14:00.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Barra Flutuante de Salvamento Fixo no Rodapé */}
        <div className="fixed bottom-4 right-4 sm:right-8 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/reservar", "_blank")}
            className="text-xs font-bold gap-1.5 h-9 rounded-xl"
          >
            <Eye className="w-3.5 h-3.5 text-sky-600" />
            <span>Ver Site</span>
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs gap-1.5 h-9 px-5 rounded-xl shadow-md"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Gravando..." : "Salvar Alterações"}</span>
          </Button>
        </div>
      </div>
    </Shell>
  )
}
