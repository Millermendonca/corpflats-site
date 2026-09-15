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
  Info,
  Phone,
  Sparkles,
  Bell,
  BellRing,
  Mail,
  Copy,
  CheckCircle2,
  History,
  AlertTriangle,
  Activity,
  Webhook,
  Building,
  DoorOpen
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
  alertEmail?: string
  alertEmailEnabled?: boolean
  alertOnReconnect?: boolean
  externalWebhookUrl?: string
  externalWebhookEnabled?: boolean
  connectionState?: "connected" | "disconnected" | "unknown"
  disconnectedAt?: string | null
  connectedAt?: string | null
  lastDisconnectReason?: string | null
  lastAlertSentAt?: string | null
  webhookDisconnectedUrl?: string
  webhookConnectedUrl?: string
  webhookReceivedUrl?: string
  webhooksSyncedAt?: string
  conciergeMonitoringEnabled?: boolean
  conciergeGroupId?: string
  conciergeGroupName?: string
  conciergeRequireKeywords?: boolean
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
    googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ",
    alertEmail: "millerpessanha@gmail.com",
    alertEmailEnabled: true,
    alertOnReconnect: true,
    externalWebhookUrl: "",
    externalWebhookEnabled: false,
    connectionState: "unknown",
    webhookDisconnectedUrl: "https://corpflats.onrender.com/api/whatsapp/webhook/disconnected",
    webhookConnectedUrl: "https://corpflats.onrender.com/api/whatsapp/webhook/connected"
  })
  const [statusInfo, setStatusInfo] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false)
  const [savingConfig, setSavingConfig] = useState<boolean>(false)

  // State: Webhooks & Monitoring
  const [syncingWebhooks, setSyncingWebhooks] = useState<boolean>(false)
  const [testingAlert, setTestingAlert] = useState<boolean>(false)
  const [connectionLogs, setConnectionLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false)
  const [showLogs, setShowLogs] = useState<boolean>(false)

  // State: Monitoramento Grupo da Portaria
  const [conciergeGroups, setConciergeGroups] = useState<any[]>([])
  const [loadingGroups, setLoadingGroups] = useState<boolean>(false)
  const [conciergeLogs, setConciergeLogs] = useState<any[]>([])
  const [loadingConciergeLogs, setLoadingConciergeLogs] = useState<boolean>(false)
  const [showConciergeLogs, setShowConciergeLogs] = useState<boolean>(true)
  const [testSimMessage, setTestSimMessage] = useState<string>("Check-outs de hoje: 113, 215, 302 e 508. Chaves na portaria.")
  const [simulatingMessage, setSimulatingMessage] = useState<boolean>(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)

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
  const [testSendMode, setTestSendMode] = useState<"text" | "buttons">("buttons")
  const [testButtons, setTestButtons] = useState<any[]>([
    { id: "btn_test_chk", type: "URL", label: "📝 Ficha Check-in", url: "https://corpflats.onrender.com/pre-checkin/RES-113-0034" },
    { id: "btn_test_res", type: "URL", label: "🏨 Ver Reserva", url: "https://corpflats.onrender.com/minha-reserva/RES-113-0034" },
    { id: "btn_test_call", type: "CALL", label: "📞 Ligar Administração", phone: "5522997124021" }
  ])
  const [sendingTest, setSendingTest] = useState<boolean>(false)

  useEffect(() => {
    fetchConfig()
    checkStatus()
    fetchLogs()
    fetchConciergeLogs()
  }, [])

  const fetchConciergeLogs = async () => {
    setLoadingConciergeLogs(true)
    try {
      const res = await fetch("/api/whatsapp/concierge-logs")
      if (res.ok) {
        const data = await res.json()
        setConciergeLogs(data)
      }
    } catch (e) {
      console.error("Erro ao buscar logs da portaria:", e)
    } finally {
      setLoadingConciergeLogs(false)
    }
  }

  const fetchConciergeGroups = async () => {
    setLoadingGroups(true)
    try {
      const res = await fetch("/api/whatsapp/groups")
      if (res.ok) {
        const data = await res.json()
        setConciergeGroups(data.groups || [])
        if (data.groups?.length > 0) {
          toast({ title: `${data.groups.length} grupos encontrados no WhatsApp!` })
        } else {
          toast({ title: "Nenhum grupo retornado", description: "Verifique se a conta WhatsApp participa de grupos." })
        }
      }
    } catch (e: any) {
      toast({ title: "Erro ao buscar grupos", description: e.message, variant: "destructive" })
    } finally {
      setLoadingGroups(false)
    }
  }

  const handleSimulateMessage = async () => {
    if (!testSimMessage.trim()) {
      toast({ title: "Mensagem obrigatória", description: "Digite a mensagem para testar.", variant: "destructive" })
      return
    }
    setSimulatingMessage(true)
    setSimulationResult(null)
    try {
      const res = await fetch("/api/whatsapp/test-concierge-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testSimMessage.trim(),
          groupName: config.conciergeGroupName || "Portaria Residencial",
          senderName: "Porteiro Teste"
        })
      })
      const data = await res.json()
      setSimulationResult(data)
      if (data.success) {
        const count = data.updatedFlats?.length || 0
        toast({
          title: `✓ Teste Concluído! ${count} flat(s) CorpFlats liberado(s).`,
          description: count > 0 
            ? `Flats desocupados: ${data.updatedFlats.join(", ")}. Outros proprietários ignorados: ${data.otherFlatsIgnored?.join(", ") || "Nenhum"}`
            : "Nenhum flat seu encontrado na mensagem."
        })
        fetchConciergeLogs()
      } else {
        toast({
          title: "Mensagem ignorada ou sem flats",
          description: data.reason || "Nenhum flat CorpFlats detectado no texto.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({ title: "Erro na simulação", description: e.message, variant: "destructive" })
    } finally {
      setSimulatingMessage(false)
    }
  }

  const handleClearConciergeLogs = async () => {
    try {
      await fetch("/api/whatsapp/concierge-logs", { method: "DELETE" })
      setConciergeLogs([])
      toast({ title: "Histórico de portaria limpo com sucesso!" })
    } catch (e) {
      console.error(e)
    }
  }

  const fetchLogs = async () => {
    setLoadingLogs(true)
    try {
      const res = await fetch("/api/whatsapp/connection-logs")
      if (res.ok) {
        const data = await res.json()
        setConnectionLogs(data)
      }
    } catch (e) {
      console.error("Erro ao buscar histórico de conexões:", e)
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleSyncWebhooks = async () => {
    if (!config.instanceId || !config.token) {
      toast({
        title: "Credenciais necessárias",
        description: "Preencha e salve o Instance ID e Token antes de sincronizar os webhooks.",
        variant: "destructive"
      })
      return
    }

    setSyncingWebhooks(true)
    try {
      const res = await fetch("/api/whatsapp/sync-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: window.location.origin })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "⚡ Webhooks Sincronizados com a Z-API!",
          description: "Os webhooks de Desconexão e Conexão foram cadastrados com sucesso na sua instância Z-API."
        })
        fetchConfig()
      } else {
        toast({
          title: "Falha na sincronização automática",
          description: data.error || "A Z-API não confirmou a operação. Verifique as credenciais ou insira as URLs manualmente.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({
        title: "Erro ao sincronizar",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setSyncingWebhooks(false)
    }
  }

  const handleTestDisconnectionAlert = async () => {
    setTestingAlert(true)
    try {
      const res = await fetch("/api/whatsapp/test-disconnection-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user?.name || user?.username || "admin" })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "🔔 Alerta de Teste Disparado com Sucesso!",
          description: `Notificação crítica enviada para o painel do sistema e e-mail de teste para ${config.alertEmail || "o e-mail configurado"}.`
        })
        fetchLogs()
      } else {
        toast({
          title: "Falha no teste",
          description: data.error || "Não foi possível disparar o teste.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({
        title: "Erro ao disparar teste",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setTestingAlert(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "✓ Copiado com sucesso!",
      description: `${label} copiado para a área de transferência.`
    })
  }

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
        sendMode: testSendMode,
        buttons: testSendMode === "buttons" ? testButtons : []
      }

      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok && data.success) {
        const isSelf = statusInfo?.phone && testPhone.replace(/\D/g, "").endsWith(statusInfo.phone.replace(/\D/g, ""))
        const isButtons = data.method === "buttons"
        const isFallback = data.method === "fallback_text"

        toast({
          title: isFallback 
            ? "⚠️ Entregue via Texto com Links (Fallback Z-API)" 
            : isButtons 
              ? "✓ Teste enviado com Botões Interativos!" 
              : "✓ Teste enviado com sucesso!",
          description: isFallback
            ? `Aviso Z-API: "${data.buttonError || 'Recurso de botões requer ativação prévia'}". A mensagem foi entregue em texto com todos os links diretos para não perder o envio.`
            : isSelf
              ? `Entregue via Z-API (${isButtons ? "Com Botões Interativos" : "Texto com Links"}). Verifique sua conversa "Você" no WhatsApp!`
              : `Entregue via Z-API (${isButtons ? "Com Botões Interativos" : "Texto com Links"}). Verifique o aparelho destinatário!`
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

        {/* ── CARD: MONITORAMENTO DE QUEDAS & ALERTAS DE DESCONEXÃO (WEBHOOKS Z-API) ── */}
        <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border pb-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-rose-600" />
                  Monitoramento de Quedas &amp; Alertas de Desconexão (Webhooks Z-API)
                </CardTitle>
                <CardDescription className="text-xs">
                  Detecção instantânea de deslogamento ou queda do WhatsApp na Z-API com alertas automáticos por E-mail, Notificação Sonora no PMS e Webhook externo.
                </CardDescription>
              </div>

              <div>
                {config.connectionState === "disconnected" ? (
                  <Badge className="bg-rose-600 text-white gap-1.5 text-xs py-1 px-3 shadow-xs animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    🚨 WhatsApp Desconectado!
                  </Badge>
                ) : statusInfo?.connected ? (
                  <Badge className="bg-emerald-600 text-white gap-1.5 text-xs py-1 px-3 shadow-xs">
                    <Activity className="w-3.5 h-3.5" />
                    Monitoramento Ativo (Webhook + Watchdog)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1.5 text-xs py-1 px-3">
                    <Activity className="w-3.5 h-3.5" />
                    Monitoramento em Espera
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* Aviso de Desconexão Ativa se estiver caído */}
            {config.connectionState === "disconnected" && (
              <div className="p-4 rounded-2xl border bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span className="text-sm font-black text-rose-900 dark:text-rose-200">
                    Atenção: A instância Z-API está desconectada do WhatsApp!
                  </span>
                </div>
                <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                  As mensagens agendadas e automáticas para hóspedes não estão sendo entregues. 
                  {config.lastDisconnectReason && ` Motivo registrado: "${config.lastDisconnectReason}".`}
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={handleShowQrCode}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl h-8 gap-1.5 shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Escanear QR Code para Reconectar
                  </Button>
                </div>
              </div>
            )}

            {/* SEÇÃO 1: WEBHOOKS DA Z-API (CONFIGURAÇÃO AUTOMÁTICA & MANUAL) */}
            <div className="p-4 rounded-2xl border bg-card space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Webhook className="w-4 h-4 text-emerald-600" />
                    URLs dos Webhooks de Monitoramento (HTTPS)
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    A Z-API chama estes endpoints instantaneamente quando o WhatsApp cai ou reconecta.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleSyncWebhooks}
                  disabled={syncingWebhooks || !config.instanceId || !config.token}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8.5 rounded-xl gap-1.5 shadow-xs shrink-0"
                >
                  <Zap className={`w-3.5 h-3.5 ${syncingWebhooks ? "animate-spin" : ""}`} />
                  {syncingWebhooks ? "Sincronizando..." : "Sincronizar na Z-API Automaticamente"}
                </Button>
              </div>

              {config.webhooksSyncedAt && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Sincronizado automaticamente com sua instância Z-API em {new Date(config.webhooksSyncedAt).toLocaleString("pt-BR")}.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Webhook Desconexão */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Webhook de Desconexão (on-whatsapp-disconnected)
                    </Label>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(config.webhookDisconnectedUrl || "https://corpflats.onrender.com/api/whatsapp/webhook/disconnected", "URL de Desconexão")}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar
                    </button>
                  </div>
                  <Input
                    readOnly
                    value={config.webhookDisconnectedUrl || "https://corpflats.onrender.com/api/whatsapp/webhook/disconnected"}
                    className="text-[11px] font-mono h-8.5 rounded-xl bg-muted/40 text-muted-foreground"
                  />
                </div>

                {/* Webhook Conexão */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Webhook de Reconexão (on-whatsapp-connected)
                    </Label>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(config.webhookConnectedUrl || "https://corpflats.onrender.com/api/whatsapp/webhook/connected", "URL de Reconexão")}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar
                    </button>
                  </div>
                  <Input
                    readOnly
                    value={config.webhookConnectedUrl || "https://corpflats.onrender.com/api/whatsapp/webhook/connected"}
                    className="text-[11px] font-mono h-8.5 rounded-xl bg-muted/40 text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: CANAIS DE DISPARO DE ALERTA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Alerta por E-mail */}
              <div className="p-4 rounded-2xl border bg-muted/15 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block">Alerta Urgente por E-mail</span>
                      <span className="text-[10px] text-muted-foreground">Dispara e-mail com botão direto para o QR Code</span>
                    </div>
                  </div>
                  <Switch
                    checked={config.alertEmailEnabled !== false}
                    onCheckedChange={(c) => setConfig({ ...config, alertEmailEnabled: c })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-foreground">E-mail para Recebimento do Alerta</Label>
                  <Input
                    type="email"
                    placeholder="Ex: miller@corpflats.com.br"
                    value={config.alertEmail || ""}
                    onChange={(e) => setConfig({ ...config, alertEmail: e.target.value })}
                    className="text-xs h-8.5 rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">Avisar também quando for reconectado</span>
                  <Switch
                    checked={config.alertOnReconnect !== false}
                    onCheckedChange={(c) => setConfig({ ...config, alertOnReconnect: c })}
                  />
                </div>
              </div>

              {/* Alerta por Webhook Externo (Slack, Discord, n8n) */}
              <div className="p-4 rounded-2xl border bg-muted/15 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                      <Webhook className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block">Webhook Externo (TI / Equipe)</span>
                      <span className="text-[10px] text-muted-foreground">Discord, Slack, n8n ou Zapier</span>
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(config.externalWebhookEnabled)}
                    onCheckedChange={(c) => setConfig({ ...config, externalWebhookEnabled: c })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-foreground">URL do Webhook Externo (Opcional)</Label>
                  <Input
                    placeholder="https://discord.com/api/webhooks/... ou n8n webhook"
                    value={config.externalWebhookUrl || ""}
                    onChange={(e) => setConfig({ ...config, externalWebhookUrl: e.target.value })}
                    className="text-xs h-8.5 rounded-xl font-mono"
                  />
                </div>

                <p className="text-[10px] text-muted-foreground pt-1 leading-relaxed">
                  Envia um payload JSON instantâneo para automações ou canais da equipe quando a sessão cair.
                </p>
              </div>
            </div>

            {/* SEÇÃO 3: BOTÕES DE TESTE E HISTÓRICO */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-border pt-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestDisconnectionAlert}
                  disabled={testingAlert}
                  className="text-xs h-9 rounded-xl gap-1.5 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 w-full sm:w-auto cursor-pointer"
                >
                  <Bell className={`w-3.5 h-3.5 text-rose-600 ${testingAlert ? "animate-bounce" : ""}`} />
                  {testingAlert ? "Disparando Simulação..." : "🔔 Simular Alerta de Desconexão"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowLogs(!showLogs)
                    if (!showLogs) fetchLogs()
                  }}
                  className="text-xs h-9 rounded-xl gap-1.5 w-full sm:w-auto cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-muted-foreground" />
                  {showLogs ? "Ocultar Histórico" : `Histórico de Quedas (${connectionLogs.length})`}
                </Button>
              </div>

              <span className="text-[11px] text-muted-foreground text-center sm:text-right">
                Watchdog ativo: verifica integridade a cada 3 minutos como segurança redundante.
              </span>
            </div>

            {/* LISTA EXPANSÍVEL DE HISTÓRICO DE CONEXÕES */}
            {showLogs && (
              <div className="p-4 rounded-2xl border bg-muted/25 space-y-2 mt-2">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-primary" />
                    Registros Recentes de Conexão e Desconexão
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                    className="h-6 text-[11px] px-2"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${loadingLogs ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>

                {loadingLogs ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                    Carregando eventos...
                  </div>
                ) : connectionLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Nenhum registro de queda recente. Conexão operando normalmente!
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {connectionLogs.map((log: any, idx: number) => {
                      const isDisc = log.event === "disconnected"
                      return (
                        <div
                          key={log.id || idx}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                            isDisc
                              ? "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60"
                              : "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isDisc ? (
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            <div>
                              <span className="font-bold block">
                                {isDisc ? "🚨 WhatsApp Desconectado" : "✅ WhatsApp Reconectado"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {log.reason ? `Motivo: ${log.reason} • ` : ""}
                                Origem: {log.source === "webhook" ? "Webhook Z-API" : log.source === "watchdog_heartbeat" ? "Watchdog Periódico" : "Simulação Manual"}
                              </span>
                            </div>
                          </div>

                          <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                            {new Date(log.timestamp).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CARD: MONITORAMENTO DE CHECK-OUTS DA PORTARIA (GRUPO WHATSAPP) ── */}
        <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border pb-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-emerald-600" />
                  Monitoramento de Check-outs da Portaria (Grupo WhatsApp)
                </CardTitle>
                <CardDescription className="text-xs">
                  Escuta em tempo real do grupo de WhatsApp da portaria. Toda vez que informarem saída de flats, o sistema identifica seus apartamentos, marca como desocupado e libera no dashboard de limpeza.
                </CardDescription>
              </div>

              <div>
                {config.conciergeMonitoringEnabled !== false ? (
                  <Badge className="bg-emerald-600 text-white gap-1.5 text-xs py-1 px-3 shadow-xs">
                    <Activity className="w-3.5 h-3.5" />
                    Monitoramento Portaria Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1.5 text-xs py-1 px-3">
                    Monitoramento Pausado
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* Switch Principal do Monitoramento da Portaria */}
            <div className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-foreground block">
                  Ativar Check-out Automático via Grupo da Portaria
                </span>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, mensagens recebidas no grupo configurado mudarão o flat para "Desocupado" e atualizarão o dashboard de limpeza imediatamente.
                </p>
              </div>
              <Switch 
                checked={config.conciergeMonitoringEnabled !== false}
                onCheckedChange={(checked) => setConfig({ ...config, conciergeMonitoringEnabled: checked })}
              />
            </div>

            {/* Configuração do Grupo da Portaria */}
            <div className="p-4 rounded-2xl border bg-card space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-primary" />
                  Grupo da Portaria no WhatsApp
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchConciergeGroups}
                  disabled={loadingGroups || !statusInfo?.connected}
                  className="h-7 text-xs rounded-lg gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingGroups ? "animate-spin" : ""}`} />
                  {loadingGroups ? "Buscando grupos..." : "Carregar Grupos do WhatsApp"}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Grupo Específico (ID / Seleção)</Label>
                  {conciergeGroups.length > 0 ? (
                    <div className="space-y-1">
                      <select
                        value={config.conciergeGroupId || ""}
                        onChange={(e) => {
                          const selected = conciergeGroups.find(g => g.id === e.target.value)
                          setConfig({
                            ...config,
                            conciergeGroupId: e.target.value,
                            conciergeGroupName: selected?.name || config.conciergeGroupName || ""
                          })
                        }}
                        className="w-full h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                      >
                        <option value="">-- Qualquer grupo ou filtrar por nome ao lado --</option>
                        {conciergeGroups.map(g => (
                          <option key={g.id} value={g.id}>
                            👥 {g.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-muted-foreground block">
                        Selecionado: {config.conciergeGroupName ? `"${config.conciergeGroupName}"` : "Nenhum grupo específico fixado"}
                      </span>
                    </div>
                  ) : (
                    <Input 
                      placeholder="Ex: 120363028392819283@g.us (ou clique acima para listar)"
                      value={config.conciergeGroupId || ""}
                      onChange={(e) => setConfig({ ...config, conciergeGroupId: e.target.value })}
                      className="text-xs h-9 rounded-xl"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Filtro por Nome do Grupo / Palavra-chave</Label>
                  <Input 
                    placeholder="Ex: Portaria, Condomínio, Recepção..."
                    value={config.conciergeGroupName || ""}
                    onChange={(e) => setConfig({ ...config, conciergeGroupName: e.target.value })}
                    className="text-xs h-9 rounded-xl"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Se o ID estiver vazio, qualquer grupo cujo título contenha este nome será monitorado.
                  </span>
                </div>
              </div>

              {/* Opção de exigir palavras-chave */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-foreground">Exigir Palavras de Check-out</span>
                  <p className="text-[11px] text-muted-foreground">
                    Quando desmarcado, qualquer mensagem no grupo contendo números dos seus flats marcará o check-out. Quando marcado, exige termos como "checkout", "saída", "desocupado", "chaves".
                  </p>
                </div>
                <Switch 
                  checked={Boolean(config.conciergeRequireKeywords)}
                  onCheckedChange={(checked) => setConfig({ ...config, conciergeRequireKeywords: checked })}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8.5 rounded-xl gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar Preferências da Portaria
                </Button>
              </div>
            </div>

            {/* Caixa de Simulação / Teste Rápido */}
            <div className="p-4 rounded-2xl border bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Simulador de Mensagens da Portaria (Teste Imediato)
                </span>
                <Badge variant="outline" className="text-[10px]">
                  Ambiente de Teste
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Digite um exemplo de mensagem enviada pela portaria (com flats seus e de outros proprietários misturados) para validar a extração e o comportamento do sistema.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <Input 
                  value={testSimMessage}
                  onChange={(e) => setTestSimMessage(e.target.value)}
                  placeholder="Ex: Check-outs hoje: 113, 215, 302 e 508. Chaves na portaria."
                  className="text-xs h-9 rounded-xl flex-1"
                />
                <Button 
                  onClick={handleSimulateMessage}
                  disabled={simulatingMessage}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold h-9 rounded-xl gap-1.5 shrink-0"
                >
                  <Send className={`w-3.5 h-3.5 ${simulatingMessage ? "animate-spin" : ""}`} />
                  {simulatingMessage ? "Testando..." : "Simular Mensagem"}
                </Button>
              </div>

              {simulationResult && (
                <div className="p-3 rounded-xl border bg-card text-xs space-y-1.5 animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <span>Resultado do Teste:</span>
                    <Badge className={simulationResult.success ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}>
                      {simulationResult.success ? "Processado com Sucesso" : "Ignorado"}
                    </Badge>
                  </div>
                  {simulationResult.updatedFlats?.length > 0 && (
                    <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                      ✓ Flats da CorpFlats desocupados: <strong>{simulationResult.updatedFlats.join(", ")}</strong>
                    </p>
                  )}
                  {simulationResult.otherFlatsIgnored?.length > 0 && (
                    <p className="text-muted-foreground">
                      • Flats de outros proprietários (ignorados com segurança): <strong>{simulationResult.otherFlatsIgnored.join(", ")}</strong>
                    </p>
                  )}
                  {simulationResult.reason && (
                    <p className="text-amber-600 dark:text-amber-400">
                      Motivo: {simulationResult.reason}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Histórico dos Últimos Check-outs Detectados */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!showConciergeLogs) fetchConciergeLogs();
                    setShowConciergeLogs(!showConciergeLogs);
                  }}
                  className="h-8 text-xs font-bold gap-1.5 p-0 hover:bg-transparent"
                >
                  <History className="w-4 h-4 text-primary" />
                  <span>Histórico de Check-outs Processados da Portaria ({conciergeLogs.length})</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {showConciergeLogs ? "Ocultar" : "Ver Lista"}
                  </Badge>
                </Button>

                {showConciergeLogs && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchConciergeLogs}
                      disabled={loadingConciergeLogs}
                      className="h-6 text-[11px] px-2"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${loadingConciergeLogs ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                    {conciergeLogs.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearConciergeLogs}
                        className="h-6 text-[11px] px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {showConciergeLogs && (
                <div className="p-4 rounded-2xl border bg-muted/25 space-y-2">
                  {loadingConciergeLogs ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                      Carregando histórico da portaria...
                    </div>
                  ) : conciergeLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">
                      Nenhuma mensagem da portaria processada ainda. Assim que postarem no grupo, os registros aparecerão aqui em tempo real.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {conciergeLogs.map((log: any, idx: number) => {
                        const hasOurFlats = log.matchedFlats && log.matchedFlats.length > 0
                        return (
                          <div
                            key={log.id || idx}
                            className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                              hasOurFlats
                                ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60"
                                : "bg-card border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${hasOurFlats ? "bg-emerald-500" : "bg-amber-500"} shrink-0`} />
                                <span className="font-bold text-foreground">
                                  {log.senderName || "Portaria"} • {log.groupName || "Grupo WhatsApp"}
                                </span>
                                {log.isTest && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1 font-normal">
                                    Simulação
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                                {new Date(log.timestamp).toLocaleString("pt-BR")}
                              </span>
                            </div>

                            <p className="text-muted-foreground text-[11px] bg-muted/40 p-2 rounded-lg italic">
                              "{log.rawText}"
                            </p>

                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {hasOurFlats ? (
                                <Badge className="bg-emerald-600 text-white text-[10px] py-0.5">
                                  🚪 Desocupado(s) CorpFlats: {log.matchedFlats.join(", ")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px] py-0.5">
                                  Nenhum flat seu na mensagem
                                </Badge>
                              )}

                              {log.otherFlats && log.otherFlats.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  Outros proprietários (ignorados): {log.otherFlats.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
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

              {/* Guia e Requisitos Oficiais da Z-API para Botões Interativos */}
              <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    💡 Requisitos Importantes para Uso dos Botões Interativos (Z-API)
                  </span>
                  <a 
                    href="https://developer.z-api.io/message/send-button-actions" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] text-blue-700 dark:text-blue-300 font-semibold underline flex items-center gap-0.5"
                  >
                    Documentação Oficial <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <ul className="text-[11px] text-blue-800 dark:text-blue-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>
                    <strong>Ativação no Painel da Z-API:</strong> O recurso de botões requer que você acesse sua instância no painel <a href="https://app.z-api.io" target="_blank" rel="noopener noreferrer" className="underline font-bold">app.z-api.io</a>, vá em <em>Configurações</em> e aceite os termos de uso de mensagens com botão.
                  </li>
                  <li>
                    <strong>Regra do WhatsApp:</strong> Não misture botões de <em>Link (URL) / Ligação (CALL)</em> com botões de <em>Resposta Rápida (REPLY)</em> na mesma mensagem, pois o WhatsApp Web rejeita o envio. O CorpFlats filtra e organiza os botões automaticamente para evitar falhas.
                  </li>
                  <li>
                    <strong>Fallback Automático de Segurança:</strong> Caso o WhatsApp ou a Z-API rejeitem o botão por qualquer motivo momentâneo, o CorpFlats converte a mensagem instantaneamente em texto formatado com os links clicáveis, assegurando que o hóspede nunca deixe de receber a mensagem.
                  </li>
                </ul>
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

            {testSendMode === "buttons" && (
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    🔘 Botões Interativos Anexados ({testButtons.length})
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                    Ativos no disparo
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {testButtons.map((btn, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-background rounded-lg border text-xs shadow-xs font-medium">
                      <span>{btn.label}</span>
                      <span className="text-[9px] px-1 py-0.2 bg-muted text-muted-foreground rounded font-mono">
                        {btn.type === "CALL" ? "Ligação" : "Link"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  Estes botões de ação nativos aparecerão clicáveis no WhatsApp do destinatário.
                </p>
              </div>
            )}
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
