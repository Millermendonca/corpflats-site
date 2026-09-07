import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { 
  Smartphone, 
  Key, 
  QrCode, 
  RefreshCw, 
  Check, 
  Send, 
  Zap, 
  AlertCircle, 
  ExternalLink, 
  Wifi, 
  Star, 
  MessageSquare, 
  ShieldCheck, 
  SlidersHorizontal,
  ChevronRight,
  Info
} from "lucide-react"
import { AccessDenied } from "@/components/access-denied"

interface ZapiConfig {
  instanceId: string
  token: string
  clientToken: string
  enabled: boolean
  deliveryMode?: "text_links" | "buttons" | "auto"
  fallbackToText: boolean
  wifiNetwork: string
  wifiPassword: string
  googleReviewUrl: string
}

export default function ZapiConnection() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()

  // State: Z-API Config & Status
  const [config, setConfig] = useState<ZapiConfig>({
    instanceId: "",
    token: "",
    clientToken: "",
    enabled: false,
    deliveryMode: "text_links",
    fallbackToText: true,
    wifiNetwork: "CorpFlats-Hospedes",
    wifiPassword: "corpflats2026",
    googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
  })
  const [statusInfo, setStatusInfo] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false)
  const [savingConfig, setSavingConfig] = useState<boolean>(false)

  // State: QR Code Modal
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false)
  const [qrImageData, setQrImageData] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState<boolean>(false)

  // State: Quick Test Modal
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false)
  const [testPhone, setTestPhone] = useState<string>("")
  const [testMessage, setTestMessage] = useState<string>(
    "Olá! Esta é uma mensagem de teste enviada pela central CorpFlats via Z-API. Conexão operacional e funcionando perfeitamente!"
  )
  const [testSendMode, setTestSendMode] = useState<"text" | "buttons">("text")
  const [sendingTest, setSendingTest] = useState<boolean>(false)

  useEffect(() => {
    fetchConfig()
    checkStatus()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/whatsapp/config")
      if (res.ok) {
        const data = await res.json()
        setConfig(prev => ({ ...prev, ...data }))
      }
    } catch (e) {
      console.error("Erro ao buscar configurações Z-API:", e)
    }
  }

  const checkStatus = async (showToast = false) => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/whatsapp/status")
      if (res.ok) {
        const data = await res.json()
        setStatusInfo(data)
        if (showToast) {
          if (data.connected) {
            toast({
              title: "🟢 WhatsApp Conectado com Sucesso!",
              description: data.phone 
                ? `Instância Z-API online no aparelho +${data.phone}. Pronta para disparos!`
                : "Instância Z-API online e pronta para disparos."
            })
          } else {
            toast({
              title: "Atenção: Instância Desconectada",
              description: data.error || data.message || "Aguardando leitura do QR Code na Z-API.",
              variant: "destructive"
            })
          }
        }
      } else {
        if (showToast) {
          toast({
            title: "Falha na Verificação",
            description: "Não foi possível contactar a Z-API. Verifique as credenciais.",
            variant: "destructive"
          })
        }
      }
    } catch (e: any) {
      console.error(e)
      if (showToast) {
        toast({ title: "Erro de Conexão", description: e.message, variant: "destructive" })
      }
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        toast({ title: "Configurações salvas com sucesso!", description: "Credenciais e parâmetros da Z-API atualizados." })
        checkStatus(true)
      } else {
        toast({ title: "Erro ao salvar", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleShowQrCode = async () => {
    setLoadingQr(true)
    setQrModalOpen(true)
    try {
      const res = await fetch("/api/whatsapp/qr-code")
      if (res.ok) {
        const data = await res.json()
        setQrImageData(data.qrImage || null)
      } else {
        toast({ title: "Não foi possível carregar o QR Code", variant: "destructive" })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingQr(false)
    }
  }

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: "Telefone obrigatório", description: "Digite o WhatsApp com DDD.", variant: "destructive" })
      return
    }

    setSendingTest(true)
    try {
      const payload: any = {
        phone: testPhone,
        message: testMessage,
        title: "CorpFlats - Teste Z-API",
        footer: "Sistema CorpFlats Soho Residence",
        sendMode: testSendMode
      }

      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok && data.success) {
        const isSelf = statusInfo?.phone && testPhone.replace(/\D/g, "").endsWith(statusInfo.phone.replace(/\D/g, ""))
        toast({
          title: "✓ Teste enviado com sucesso!",
          description: isSelf
            ? `Entregue via Z-API (${data.method === "buttons" ? "Com Botões" : "Texto com Links"}). Verifique sua conversa "Você" no WhatsApp!`
            : `Entregue via Z-API (${data.method === "buttons" ? "Com Botões" : "Texto com Links"}). Verifique o aparelho destinatário!`
        })
        setTestModalOpen(false)
      } else {
        toast({
          title: "Falha ao enviar teste",
          description: data.error || "Verifique as credenciais da Z-API e conexão do WhatsApp.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de disparo", description: err.message, variant: "destructive" })
    } finally {
      setSendingTest(false)
    }
  }

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="Conexão Z-API" />
  }

  return (
    <Shell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-20">
        
        {/* Header Superior */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                    Conexão Z-API (WhatsApp)
                  </h1>
                  <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-[11px] font-bold">
                    Sistema & Integrações
                  </Badge>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Gerenciamento da instância, credenciais de conexão, leitura de QR Code e status do aparelho WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => checkStatus(true)} 
              disabled={loadingStatus}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
              Testar Conexão
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setTestModalOpen(true)}
              className="gap-1.5 text-xs h-9 rounded-xl border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
              Disparo de Teste
            </Button>

            <Button 
              onClick={() => setLocation("/whatsapp")}
              className="bg-primary text-primary-foreground text-xs font-bold h-9 rounded-xl gap-1.5 shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Ir para Automação WhatsApp
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── CARD 1: STATUS DA INSTÂNCIA E APARELHO ── */}
        <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border pb-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  Status da Conexão Z-API
                </CardTitle>
                <CardDescription className="text-xs">
                  Comunicação em tempo real entre o CorpFlats e os servidores da Z-API / WhatsApp Web.
                </CardDescription>
              </div>

              <div>
                {loadingStatus ? (
                  <Badge variant="outline" className="gap-1 text-xs py-1 px-2.5">
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                    Consultando Z-API...
                  </Badge>
                ) : statusInfo?.connected ? (
                  <Badge className="bg-emerald-600 text-white gap-1.5 text-xs py-1 px-3 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    Instância Online & Conectada
                  </Badge>
                ) : config.instanceId ? (
                  <Badge className="bg-amber-500 text-white gap-1.5 text-xs py-1 px-3 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    Aguardando Leitura do QR Code
                  </Badge>
                ) : (
                  <Badge className="bg-rose-500 text-white gap-1.5 text-xs py-1 px-3 shadow-xs">
                    Instância Não Configurada
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            {/* Detalhes do Aparelho */}
            {statusInfo?.connected ? (
              <div className="p-4 rounded-2xl border bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div>
                      <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200 block">
                        Dispositivo WhatsApp Conectado: {statusInfo.name ? `${statusInfo.name}` : "Aparelho Registrado"}
                      </span>
                      {statusInfo.phone && (
                        <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          Número: +{statusInfo.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={statusInfo.isBusiness ? "bg-emerald-600 text-white text-xs" : "bg-amber-600 text-white text-xs"}>
                    {statusInfo.isBusiness ? "WhatsApp Business (Botões Nativos)" : "Conta Pessoal (Modo Texto com Links)"}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {statusInfo.isBusiness 
                    ? "Esta conta é um WhatsApp Business oficial e suporta envio com botões interativos de alta conversão." 
                    : "Você conectou uma conta pessoal do WhatsApp. Mensagens automáticas e testes são entregues com links diretos de acesso (Ficha de Check-in, Portaria, Café da Manhã) devidamente formatados no corpo da mensagem para garantir 100% de entrega sem restrições da Meta."}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl border bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Nenhum aparelho conectado ou sessão expirada
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique no botão abaixo para escanear o QR Code com o WhatsApp do seu celular corporativo.
                  </p>
                </div>

                <Button 
                  onClick={handleShowQrCode}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 rounded-xl gap-1.5 shrink-0 shadow-xs"
                >
                  <QrCode className="w-4 h-4" />
                  Conectar via QR Code
                </Button>
              </div>
            )}

            {/* Switch de Ativação Geral */}
            <div className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-foreground block">Habilitar Motor de Envio WhatsApp</span>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, permite que o sistema dispare automaticamente mensagens da régua aos hóspedes.
                </p>
              </div>
              <Switch 
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── CARD 2: CREDENCIAIS DA INSTÂNCIA Z-API ── */}
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader className="p-5 border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  Credenciais da Instância Z-API
                </CardTitle>
                <CardDescription className="text-xs">
                  Obtenha estas chaves no painel oficial da Z-API (<a href="https://developer.z-api.io" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">developer.z-api.io</a>).
                </CardDescription>
              </div>
              
              <a 
                href="https://developer.z-api.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
              >
                <span>Abrir Painel Z-API</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Instance ID (ID da Instância)</Label>
                <Input 
                  placeholder="Ex: 3B4C5D6E7F8G9H0"
                  value={config.instanceId}
                  onChange={(e) => setConfig({ ...config, instanceId: e.target.value })}
                  className="text-xs font-mono h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Token da Instância</Label>
                <Input 
                  type="password"
                  placeholder="Ex: 8A7B6C5D4E3F2G1"
                  value={config.token}
                  onChange={(e) => setConfig({ ...config, token: e.target.value })}
                  className="text-xs font-mono h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Client-Token (Token de Segurança da Conta)</Label>
                <Input 
                  type="password"
                  placeholder="Opcional (se ativado no painel Z-API)"
                  value={config.clientToken}
                  onChange={(e) => setConfig({ ...config, clientToken: e.target.value })}
                  className="text-xs font-mono h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-center">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                  <div>
                    <span className="text-xs font-semibold block">Fallback Automático para Texto</span>
                    <span className="text-[10px] text-muted-foreground">Se botões falharem na API, converte para texto com links.</span>
                  </div>
                  <Switch 
                    checked={config.fallbackToText}
                    onCheckedChange={(c) => setConfig({ ...config, fallbackToText: c })}
                  />
                </div>
              </div>
            </div>

            {/* Seletor Oficial de Modo de Entrega das Mensagens */}
            <div className="p-4 rounded-2xl border bg-emerald-500/5 border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                    Modo de Envio Padrão do WhatsApp (Automações &amp; Mensagens Rápidas)
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Escolha como os disparos automáticos da régua, mensagens rápidas do card e testes são entregues ao hóspede.
                  </p>
                </div>
                <Badge className={(config.deliveryMode || "text_links") === "text_links" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                  {(config.deliveryMode || "text_links") === "text_links" ? "✓ 100% Entregue via Texto" : "🔘 Botões Interativos"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div 
                  onClick={() => setConfig({ ...config, deliveryMode: "text_links" })}
                  className={`cursor-pointer p-3 rounded-xl border transition-all ${
                    (config.deliveryMode || "text_links") === "text_links"
                      ? "border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/60 ring-1 ring-emerald-600 shadow-2xs"
                      : "border-border hover:bg-muted/30 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      💬 Texto Formatado com Links
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded-md">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    <strong>100% de entrega garantida</strong> em qualquer conta de WhatsApp (pessoal, business ou recém-trocada). Os botões são convertidos em links clicáveis diretos e elegantes. Não sofre bloqueios da Meta.
                  </p>
                </div>

                <div 
                  onClick={() => setConfig({ ...config, deliveryMode: "buttons" })}
                  className={`cursor-pointer p-3 rounded-xl border transition-all ${
                    config.deliveryMode === "buttons"
                      ? "border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/60 ring-1 ring-emerald-600 shadow-2xs"
                      : "border-border hover:bg-muted/30 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      🔘 Botões Interativos Nativos
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                      Meta Business
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    Envia os botões nativos do WhatsApp. <em>Atenção:</em> se a conta conectada na Z-API foi trocada recentemente ou for nova, a Meta pode silenciar o envio dos botões.
                  </p>
                </div>
              </div>
            </div>

            {/* Parâmetros da Propriedade para preenchimento de tags */}
            <div className="p-4 rounded-2xl border bg-muted/20 space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground block">
                  Informações Fixas do Hotel (Puxadas automaticamente pelas tags nas réguas de envio):
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1.5">
                    <Wifi className="w-3 h-3 text-muted-foreground" />
                    Nome da Rede Wi-Fi ({"{{wifi_rede}}"})
                  </Label>
                  <Input 
                    value={config.wifiNetwork}
                    onChange={(e) => setConfig({ ...config, wifiNetwork: e.target.value })}
                    className="text-xs h-8.5 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1.5">
                    <Key className="w-3 h-3 text-muted-foreground" />
                    Senha do Wi-Fi ({"{{wifi_senha}}"})
                  </Label>
                  <Input 
                    value={config.wifiPassword}
                    onChange={(e) => setConfig({ ...config, wifiPassword: e.target.value })}
                    className="text-xs h-8.5 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-amber-500" />
                    Avaliação Google ({"{{link_avaliacao_google}}"})
                  </Label>
                  <Input 
                    value={config.googleReviewUrl}
                    onChange={(e) => setConfig({ ...config, googleReviewUrl: e.target.value })}
                    className="text-xs h-8.5 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé de Ações */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleShowQrCode}
                className="text-xs h-9 rounded-xl gap-1.5 w-full sm:w-auto"
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
                Ler QR Code da Z-API
              </Button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 rounded-xl gap-1.5 shadow-xs w-full sm:w-auto"
                >
                  <Check className="w-4 h-4" />
                  {savingConfig ? "Salvando..." : "Salvar Configurações Z-API"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── SEÇÃO INFORMATIVA ── */}
        <div className="p-4 rounded-2xl border border-border bg-card flex items-start gap-3 text-xs text-muted-foreground">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-foreground block">Como funciona a integração com a Z-API?</span>
            <p className="leading-relaxed">
              A Z-API atua como ponte segura entre o CorpFlats e o WhatsApp. Todas as réguas de gatilhos automáticos (confirmação imediata, formulário de check-in digital, cartão de acesso com Wi-Fi, pedidos de café da manhã e pesquisa de satisfação) utilizam esta mesma conexão centralizada.
            </p>
          </div>
        </div>

      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL DE LEITURA DO QR CODE
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Conectar WhatsApp via QR Code
            </DialogTitle>
            <DialogDescription className="text-xs">
              Abra o WhatsApp no aparelho da empresa, vá em Aparelhos Conectados &gt; Conectar um Aparelho e aponte para o código.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-6 space-y-4">
            {loadingQr ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-2">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                <span className="text-xs text-muted-foreground">Gerando QR Code na Z-API...</span>
              </div>
            ) : qrImageData ? (
              <div className="p-3 bg-white rounded-2xl shadow-md border">
                <img 
                  src={qrImageData.startsWith("data:") ? qrImageData : `data:image/png;base64,${qrImageData}`} 
                  alt="QR Code Z-API" 
                  className="w-64 h-64 object-contain"
                />
              </div>
            ) : (
              <div className="text-center py-8 space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  Não foi possível obter a imagem do QR Code. Verifique se o Instance ID e Token estão corretos e salvos.
                </p>
              </div>
            )}

            <div className="text-center text-[11px] text-muted-foreground">
              O QR Code expira a cada 20 segundos caso não seja escaneado.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleShowQrCode}
              disabled={loadingQr}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingQr ? "animate-spin" : ""}`} />
              Atualizar QR Code
            </Button>
            <Button 
              onClick={() => {
                setQrModalOpen(false)
                checkStatus(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 rounded-xl"
            >
              Já Escaneei / Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL DE DISPARO DE TESTE RÁPIDO
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              Disparo de Teste no WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Envie uma mensagem instantânea para validar que as credenciais e o aparelho conectado estão enviando perfeitamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {/* Informações do Remetente */}
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Aparelho Remetente:
                </span>
                <span className="font-bold text-emerald-800 dark:text-emerald-300">
                  {statusInfo?.name ? `${statusInfo.name} ` : ""}({statusInfo?.phone ? `+${statusInfo.phone}` : "Conectado"})
                </span>
              </div>
              <div className="text-[11px] leading-tight">
                {statusInfo?.isBusiness ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    ✓ Conta WhatsApp Business detectada (Suporta botões nativos).
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    ⚠️ <strong>Conta Pessoal em Teste:</strong> Envie em modo <strong>Texto com Links</strong> para garantir entrega direta no WhatsApp sem bloqueios da Meta.
                  </span>
                )}
              </div>
            </div>

            {/* Seletor de Formato do Envio */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold">Modo de Envio do Teste</Label>
              <div className="grid grid-cols-2 gap-2">
                <div 
                  onClick={() => setTestSendMode("text")}
                  className={`cursor-pointer p-2.5 rounded-xl border text-center transition-all ${
                    testSendMode === "text" 
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 font-bold text-emerald-800 dark:text-emerald-200" 
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span className="block text-xs">💬 Texto com Links</span>
                  <span className="text-[10px] opacity-80 block">100% compatível</span>
                </div>

                <div 
                  onClick={() => setTestSendMode("buttons")}
                  className={`cursor-pointer p-2.5 rounded-xl border text-center transition-all ${
                    testSendMode === "buttons" 
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 font-bold text-emerald-800 dark:text-emerald-200" 
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span className="block text-xs">🔘 Botões Interativos</span>
                  <span className="text-[10px] opacity-80 block">Exige WhatsApp Business</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold">Número de WhatsApp Destino (com DDD)</Label>
              <Input 
                placeholder="Ex: 22998877665 (apenas números)" 
                value={testPhone} 
                onChange={e => setTestPhone(e.target.value)} 
                className="text-xs h-9 rounded-xl font-mono"
              />
              <span className="text-[10px] text-muted-foreground block">
                Dica: Você pode digitar o seu próprio número de WhatsApp para testar o recebimento em tempo real.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold">Mensagem de Teste</Label>
              <Input 
                value={testMessage} 
                onChange={e => setTestMessage(e.target.value)} 
                className="text-xs h-9 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setTestModalOpen(false)}
              className="text-xs h-9 rounded-xl"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSendTest} 
              disabled={sendingTest}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 rounded-xl gap-1.5 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTest ? "Enviando..." : "Disparar Mensagem de Teste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
