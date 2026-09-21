import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { 
  Mail, Send, Clock, CheckCircle2, AlertCircle, RefreshCw, 
  Settings, Play, Pause, Search, Eye, Filter, Sparkles, Building2,
  Calendar, User, Check, Trash2, ArrowRight, ShieldCheck, HelpCircle, Workflow
} from "lucide-react"

export default function EmailHub() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<string>("history")

  // Estado do Motor de E-mails & Config
  const [engineConfig, setEngineConfig] = useState<any>({
    enabled: true,
    isConfigured: false,
    host: "smtp.zoho.com",
    port: 465,
    user: "",
    fromName: "CorpFlats",
    fromEmail: "",
    receptionEmail: "millerpessanha@gmail.com",
    garageEmail: "millerpessanha@gmail.com"
  })
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [togglingEngine, setTogglingEngine] = useState(false)

  // Listagens: Histórico e Fila
  const [history, setHistory] = useState<any[]>([])
  const [queue, setQueue] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingQueue, setLoadingQueue] = useState(false)

  // Filtros
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Modal de Leitura / Preview do E-mail
  const [selectedMail, setSelectedMail] = useState<any | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Formulário de Novo Envio Manual
  const [formRecipient, setFormRecipient] = useState("")
  const [formCc, setFormCc] = useState("")
  const [formSubject, setFormSubject] = useState("")
  const [formBody, setFormBody] = useState("")
  const [formTemplate, setFormTemplate] = useState("custom")
  const [sendingManual, setSendingManual] = useState(false)

  // Modal de Teste SMTP
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testTargetEmail, setTestTargetEmail] = useState("")
  const [testingSmtp, setTestingSmtp] = useState(false)

  // Ação de disparo na fila
  const [dispatchingQueueId, setDispatchingQueueId] = useState<string | null>(null)
  const [resendingCommId, setResendingCommId] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
    fetchHistory()
    fetchQueue()
  }, [])

  const fetchConfig = async () => {
    setLoadingConfig(true)
    try {
      const res = await fetch("/api/emails/config")
      if (res.ok) {
        const d = await res.json()
        setEngineConfig(d)
        if (d.fromEmail) setTestTargetEmail(d.fromEmail)
      }
    } catch (e) {
      console.error("Erro ao carregar config de emails:", e)
    } finally {
      setLoadingConfig(false)
    }
  }

  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch("/api/emails/history")
      if (res.ok) {
        const d = await res.json()
        setHistory(Array.isArray(d) ? d : [])
      }
    } catch (e) {
      console.error("Erro ao carregar histórico de emails:", e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const fetchQueue = async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch("/api/emails/queue")
      if (res.ok) {
        const d = await res.json()
        setQueue(Array.isArray(d) ? d : [])
      }
    } catch (e) {
      console.error("Erro ao carregar fila de emails:", e)
    } finally {
      setLoadingQueue(false)
    }
  }

  // Alternar motor de e-mail (Ativar / Pausar)
  const handleToggleEngine = async (newState: boolean) => {
    setTogglingEngine(true)
    try {
      const res = await fetch("/api/emails/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newState })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        setEngineConfig((prev: any) => ({ ...prev, enabled: newState }))
        toast({
          title: newState ? "🟢 Motor de E-mails Ativado" : "⏸️ Motor de E-mails Pausado",
          description: newState 
            ? "Os envios automáticos de confirmação e rotinas serão processados normalmente." 
            : "Os envios automáticos foram pausados. Você ainda pode antecipar envios manualmente pela fila."
        })
      } else {
        toast({ title: "Erro ao alterar motor", description: d.error || "Falha na comunicação", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setTogglingEngine(false)
    }
  }

  // Antecipar envio de e-mail agendado ("Enviar Agora")
  const handleSendNow = async (queueId: string) => {
    setDispatchingQueueId(queueId)
    try {
      const res = await fetch(`/api/emails/queue/${queueId}/send-now`, {
        method: "POST"
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "⚡ E-mail Enviado com Sucesso!",
          description: "O e-mail programado foi antecipado e despachado imediatamente via servidor SMTP."
        })
        fetchQueue()
        fetchHistory()
      } else {
        toast({
          title: "Falha no Envio",
          description: d.error || "Não foi possível antecipar o disparo.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de envio", description: err.message, variant: "destructive" })
    } finally {
      setDispatchingQueueId(null)
    }
  }

  // Cancelar e-mail agendado
  const handleCancelQueueItem = async (queueId: string) => {
    if (!confirm("Deseja realmente cancelar este agendamento de e-mail?")) return
    try {
      const res = await fetch(`/api/emails/queue/${queueId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Agendamento Cancelado", description: "O e-mail não será enviado." })
        fetchQueue()
      }
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" })
    }
  }

  // Reenviar e-mail com falha do histórico
  const handleResendComm = async (commId: string) => {
    setResendingCommId(commId)
    try {
      const res = await fetch(`/api/pms/reservations/communications/${commId}/resend`, { method: "POST" })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({ title: "✓ E-mail Reenviado!", description: "Tentativa de reenvio concluída com sucesso." })
        fetchHistory()
      } else {
        toast({ title: "Falha no Reenvio", description: d.error || "Erro ao reenviar", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Erro de reenvio", description: e.message, variant: "destructive" })
    } finally {
      setResendingCommId(null)
    }
  }

  // Enviar e-mail manual
  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRecipient.trim() || !formSubject.trim() || !formBody.trim()) {
      toast({ title: "Campos obrigatórios", description: "Preencha destinatário, assunto e mensagem.", variant: "destructive" })
      return
    }

    setSendingManual(true)
    try {
      const res = await fetch("/api/emails/send-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: formRecipient.trim(),
          cc: formCc.trim() || undefined,
          subject: formSubject.trim(),
          body: formBody.trim()
        })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "✓ E-mail Enviado com Sucesso!",
          description: `Disparado via Zoho SMTP para ${formRecipient}.`
        })
        setFormRecipient("")
        setFormCc("")
        setFormSubject("")
        setFormBody("")
        fetchHistory()
        setActiveTab("history")
      } else {
        toast({
          title: "Falha no Envio",
          description: d.error || "Verifique se o SMTP está configurado.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de disparo", description: err.message, variant: "destructive" })
    } finally {
      setSendingManual(false)
    }
  }

  // Testar conexão SMTP
  const handleTestSmtp = async () => {
    if (!testTargetEmail.trim()) {
      toast({ title: "E-mail de teste obrigatório", description: "Informe o e-mail de destino do teste.", variant: "destructive" })
      return
    }
    setTestingSmtp(true)
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail: testTargetEmail.trim() })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "🟢 Conexão SMTP Operacional!",
          description: `E-mail de teste enviado com sucesso para ${testTargetEmail}.`
        })
        setTestModalOpen(false)
        fetchHistory()
      } else {
        toast({
          title: "Falha no Teste SMTP",
          description: d.error || "Não foi possível validar a conexão SMTP.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro no teste", description: err.message, variant: "destructive" })
    } finally {
      setTestingSmtp(false)
    }
  }

  // Modelos Rápidos
  const applyTemplate = (tplKey: string) => {
    setFormTemplate(tplKey)
    if (tplKey === "portaria") {
      setFormRecipient(engineConfig.receptionEmail || "millerpessanha@gmail.com")
      setFormSubject("[AVISO PORTARIA] Autorização de Acesso • Flat CorpFlats")
      setFormBody("Prezada Recepção / Portaria,\n\nSolicitamos liberação de acesso para o hóspede titular referente ao Flat CorpFlats para a estadia informada.\n\nQualquer dúvida, estamos à inteira disposição!\nEquipe CorpFlats")
    } else if (tplKey === "garagem") {
      setFormRecipient(engineConfig.garageEmail || "millerpessanha@gmail.com")
      setFormSubject("[AUTORIZAÇÃO GARAGEM] Vaga Rotativa • Flat CorpFlats")
      setFormBody("Prezada Administração da Garagem / Estacionamento,\n\nSolicitamos cadastro e autorização de vaga de garagem para o veículo do hóspede referente ao Flat CorpFlats.\n\nAtenciosamente,\nEquipe CorpFlats")
    } else if (tplKey === "hospede_welcome") {
      setFormSubject("Bem-vindo(a) ao CorpFlats • Orientações da sua Estadia")
      setFormBody("Olá!\n\nConfirmamos as informações da sua estadia no CorpFlats. Lembramos que o horário de check-in inicia às 14:00.\n\nVocê pode preencher sua ficha digital e acompanhar sua reserva pelo link do portal do hóspede.\n\nTenha uma excelente estadia!\nEquipe CorpFlats")
    } else {
      setFormSubject("")
      setFormBody("")
    }
  }

  // Filtragem do Histórico
  const filteredHistory = history.filter(item => {
    const matchesSearch = !searchTerm || 
      (item.recipient && item.recipient.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.subject && item.subject.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.reservation_id && String(item.reservation_id).toLowerCase().includes(searchTerm.toLowerCase()))
    
    if (!matchesSearch) return false
    if (statusFilter === "sent") return item.status === "sent"
    if (statusFilter === "failed") return item.status === "failed"
    if (statusFilter === "pending") return item.status === "pending"
    return true
  })

  // Fila de Agendados Ativa
  const pendingQueue = queue.filter(q => q.status === "pending")

  return (
    <Shell>
      <div className="space-y-6 pb-12">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Gerenciador de E-mails
                </h1>
                <p className="text-xs text-muted-foreground">
                  Histórico de mensagens enviadas, controle de fila agendada e motor Zoho SMTP
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/jornada-reservas")}
              className="text-xs font-semibold gap-1.5 rounded-xl h-9 bg-amber-500/10 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 shadow-xs"
            >
              <Workflow className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Mapa da Jornada (Fluxograma)</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchHistory(); fetchQueue(); fetchConfig(); }}
              disabled={loadingHistory || loadingQueue}
              className="text-xs font-semibold gap-1.5 rounded-xl h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory || loadingQueue ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setTestModalOpen(true)}
              className="text-xs font-bold gap-1.5 rounded-xl h-9 bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Testar Disparo SMTP</span>
            </Button>
          </div>
        </div>

        {/* Card Master: Status do Motor de E-mail */}
        <Card className="rounded-3xl border shadow-xs overflow-hidden bg-card">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                  engineConfig.enabled 
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}>
                  {engineConfig.enabled ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base text-foreground">
                      Motor de E-mails Automáticos
                    </span>
                    <Badge className={`text-xs px-2 py-0.5 font-bold ${
                      engineConfig.enabled 
                        ? "bg-emerald-600 hover:bg-emerald-600 text-white" 
                        : "bg-amber-500 hover:bg-amber-500 text-white"
                    }`}>
                      {engineConfig.enabled ? "Ativo • Disparando" : "Pausado • Suspenso"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {engineConfig.enabled
                      ? "O sistema enviará e-mails de confirmação, liberação de portaria e check-out automaticamente."
                      : "Envios automáticos estão pausados. Novos disparos ficam retidos na fila até que você libere."}
                  </p>
                </div>
              </div>

              {/* Switch Master Liga/Desliga */}
              <div className="flex items-center gap-3 self-end sm:self-auto bg-muted/40 p-2.5 rounded-2xl border border-border">
                <div className="text-right">
                  <div className="text-xs font-bold text-foreground">
                    {engineConfig.enabled ? "Motor Ativado" : "Motor Pausado"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {engineConfig.enabled ? "Clique para pausar" : "Clique para ativar"}
                  </div>
                </div>
                <Switch
                  checked={engineConfig.enabled !== false}
                  disabled={togglingEngine}
                  onCheckedChange={handleToggleEngine}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            </div>

            {/* Sub-faixa com detalhes da conexão SMTP */}
            <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
              <div>
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground/80 block">Servidor SMTP</span>
                <span className="font-mono font-medium text-foreground">{engineConfig.host}:{engineConfig.port}</span>
              </div>
              <div>
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground/80 block">Conta Remetente</span>
                <span className="font-mono font-medium text-foreground truncate block">{engineConfig.user || "Não configurado"}</span>
              </div>
              <div>
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground/80 block">Portaria Padrão</span>
                <span className="text-foreground truncate block">{engineConfig.receptionEmail}</span>
              </div>
              <div>
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground/80 block">Fila Programada</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {pendingQueue.length} e-mail(s) agendado(s)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Abas Principais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/60 p-1 rounded-2xl h-auto grid grid-cols-3 sm:inline-flex gap-1">
            <TabsTrigger value="history" className="rounded-xl py-2 px-3.5 text-xs font-bold gap-1.5">
              <Mail className="w-3.5 h-3.5 text-primary" />
              <span>Histórico & Enviados ({history.length})</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="rounded-xl py-2 px-3.5 text-xs font-bold gap-1.5 relative">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Agendados & Fila</span>
              {pendingQueue.length > 0 && (
                <Badge className="ml-1 bg-amber-500 text-white text-[10px] h-4 px-1.5 py-0 font-bold">
                  {pendingQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="compose" className="rounded-xl py-2 px-3.5 text-xs font-bold gap-1.5">
              <Send className="w-3.5 h-3.5 text-sky-500" />
              <span>Novo Envio Manual</span>
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: HISTÓRICO DE ENVIADOS */}
          <TabsContent value="history" className="space-y-3 mt-0">
            {/* Barra de Filtros */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border shadow-2xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquise por destinatário, assunto ou código de reserva..."
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-xs rounded-xl w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="sent">Enviados (Sucesso)</SelectItem>
                    <SelectItem value="failed">Falhas / Erros</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Listagem do Histórico */}
            {loadingHistory ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-primary" />
                Carregando histórico de e-mails...
              </div>
            ) : filteredHistory.length === 0 ? (
              <Card className="rounded-3xl border border-dashed text-center p-12 text-muted-foreground text-xs">
                <Mail className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">Nenhum e-mail encontrado no histórico</p>
                <p className="text-[11px] mt-1">E-mails disparados via reservas, portaria ou testes aparecerão aqui.</p>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {filteredHistory.map((item: any) => {
                  const isSent = item.status === "sent"
                  const isFailed = item.status === "failed"
                  const isPending = item.status === "pending"

                  return (
                    <Card 
                      key={item.id} 
                      className={`rounded-2xl border transition-all text-xs overflow-hidden shadow-2xs hover:shadow-xs ${
                        isFailed 
                          ? "border-rose-300 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/10" 
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isSent 
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" 
                              : isFailed
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}>
                            {isSent ? <CheckCircle2 className="w-4 h-4" /> : isFailed ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground text-xs truncate max-w-[320px]">
                                {item.subject}
                              </span>
                              {isSent && (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold">
                                  ✓ Enviado
                                </Badge>
                              )}
                              {isFailed && (
                                <Badge variant="destructive" className="text-[9.5px] px-1.5 py-0 h-4 font-bold">
                                  Falha
                                </Badge>
                              )}
                              {isPending && (
                                <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-bold text-amber-600 border-amber-300">
                                  Pendente
                                </Badge>
                              )}
                              {item.reservation_id && item.reservation_id !== "0" && item.reservation_id !== "TEST" && (
                                <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border">
                                  #{item.reservation_id}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                              <span>Para: <strong className="text-foreground">{item.recipient}</strong></span>
                              <span>•</span>
                              <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                              {item.metadata?.trigger && (
                                <>
                                  <span>•</span>
                                  <span className="capitalize">Gatilho: {item.metadata.trigger}</span>
                                </>
                              )}
                            </div>

                            {isFailed && item.metadata?.error && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded-lg border border-rose-200 dark:border-rose-900">
                                Motivo: {item.metadata.error}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedMail(item); setPreviewOpen(true); }}
                            className="h-8 text-xs font-semibold gap-1 px-2.5 rounded-xl"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Visualizar</span>
                          </Button>
                          {isFailed && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={resendingCommId === item.id}
                              onClick={() => handleResendComm(item.id)}
                              className="h-8 text-xs font-bold gap-1 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${resendingCommId === item.id ? 'animate-spin' : ''}`} />
                              <span>Reenviar</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA 2: FILA & AGENDADOS */}
          <TabsContent value="queue" className="space-y-3 mt-0">
            {!engineConfig.enabled && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <Pause className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Atenção:</strong> O motor de e-mails automáticos está <u>pausado</u>. Os itens abaixo aguardam reativação do motor ou o clique no botão <strong>"Enviar Agora"</strong>.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleEngine(true)}
                  className="h-7 text-xs font-bold border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 shrink-0 rounded-xl"
                >
                  Ativar Motor
                </Button>
              </div>
            )}

            {loadingQueue ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-primary" />
                Carregando fila de e-mails...
              </div>
            ) : queue.length === 0 ? (
              <Card className="rounded-3xl border border-dashed text-center p-12 text-muted-foreground text-xs">
                <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">Fila de e-mails vazia no momento</p>
                <p className="text-[11px] mt-1">E-mails futuros de boas-vindas, check-in ou orientações aparecerão aqui.</p>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {queue.map((item: any) => {
                  const isPending = item.status === "pending"
                  const isSent = item.status === "sent"
                  const isCancelled = item.status === "cancelled"

                  return (
                    <Card 
                      key={item.id}
                      className={`rounded-2xl border transition-all text-xs overflow-hidden shadow-2xs ${
                        isPending 
                          ? "border-amber-200/80 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10" 
                          : isSent
                          ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10 dark:bg-emerald-950/10 opacity-75"
                          : "border-border bg-muted/20 opacity-50"
                      }`}
                    >
                      <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isPending 
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" 
                              : isSent
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            <Clock className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground text-xs truncate max-w-[320px]">
                                {item.subject}
                              </span>
                              {isPending && (
                                <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold">
                                  Agendado
                                </Badge>
                              )}
                              {isSent && (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold">
                                  ✓ Enviado
                                </Badge>
                              )}
                              {isCancelled && (
                                <Badge variant="secondary" className="text-[9.5px] px-1.5 py-0 h-4 font-bold">
                                  Cancelado
                                </Badge>
                              )}
                              {item.reservationCode && (
                                <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border">
                                  {item.reservationCode}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                              <span>Para: <strong className="text-foreground">{item.recipient}</strong></span>
                              <span>•</span>
                              <span>Previsão: <strong className="text-foreground">{new Date(item.scheduledFor).toLocaleString("pt-BR")}</strong></span>
                              {item.guestName && (
                                <>
                                  <span>•</span>
                                  <span>Hóspede: <strong>{item.guestName}</strong></span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Botão de Enviar Agora (Antecipar) */}
                        {isPending && (
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <Button
                              type="button"
                              size="sm"
                              disabled={dispatchingQueueId === item.id}
                              onClick={() => handleSendNow(item.id)}
                              className="h-8 text-xs font-bold gap-1 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-xs"
                            >
                              <Send className={`w-3.5 h-3.5 ${dispatchingQueueId === item.id ? 'animate-spin' : ''}`} />
                              <span>{dispatchingQueueId === item.id ? "Enviando..." : "Enviar Agora"}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelQueueItem(item.id)}
                              className="h-8 text-xs text-muted-foreground hover:text-destructive px-2 rounded-xl"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA 3: NOVO ENVIO MANUAL */}
          <TabsContent value="compose" className="mt-0">
            <Card className="rounded-3xl border shadow-xs bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  <span>Redigir E-mail Manual</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Envie e-mails com entrega imediata via servidor Zoho SMTP corporativo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendManual} className="space-y-4">
                  {/* Modelos rápidos */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-muted-foreground">Modelos Rápidos (Preenchimento Automático)</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant={formTemplate === "portaria" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyTemplate("portaria")}
                        className="text-xs h-8 rounded-xl font-bold"
                      >
                        🏢 Notificação Portaria
                      </Button>
                      <Button
                        type="button"
                        variant={formTemplate === "garagem" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyTemplate("garagem")}
                        className="text-xs h-8 rounded-xl font-bold"
                      >
                        🚗 Autorização Garagem
                      </Button>
                      <Button
                        type="button"
                        variant={formTemplate === "hospede_welcome" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyTemplate("hospede_welcome")}
                        className="text-xs h-8 rounded-xl font-bold"
                      >
                        👋 Boas-Vindas Hóspede
                      </Button>
                      <Button
                        type="button"
                        variant={formTemplate === "custom" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyTemplate("custom")}
                        className="text-xs h-8 rounded-xl font-bold"
                      >
                        ✍️ Mensagem Livre
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-foreground">Destinatário (E-mail) *</Label>
                      <Input
                        type="email"
                        required
                        value={formRecipient}
                        onChange={e => setFormRecipient(e.target.value)}
                        placeholder="ex: hospede@gmail.com ou millerpessanha@gmail.com"
                        className="text-xs h-9 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-muted-foreground">Com Cópia (CC Opcional)</Label>
                      <Input
                        type="email"
                        value={formCc}
                        onChange={e => setFormCc(e.target.value)}
                        placeholder="ex: admin@corpflats.com.br"
                        className="text-xs h-9 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-foreground">Assunto do E-mail *</Label>
                    <Input
                      required
                      value={formSubject}
                      onChange={e => setFormSubject(e.target.value)}
                      placeholder="ex: [CONFIRMAÇÃO] Orientação para sua estadia no Flat 113"
                      className="text-xs h-9 rounded-xl font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-foreground">Corpo da Mensagem *</Label>
                    <Textarea
                      required
                      rows={6}
                      value={formBody}
                      onChange={e => setFormBody(e.target.value)}
                      placeholder="Escreva a mensagem a ser enviada ao destinatário..."
                      className="text-xs rounded-xl"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={sendingManual || !formRecipient || !formSubject || !formBody}
                      className="h-9 px-4 text-xs font-bold gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-xs"
                    >
                      {sendingManual ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>{sendingManual ? "Enviando e-mail..." : "Enviar E-mail Agora"}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Preview do HTML do E-mail */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span>{selectedMail?.subject || "Visualização do E-mail"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Enviado para: <strong>{selectedMail?.recipient}</strong> em {selectedMail?.created_at && new Date(selectedMail.created_at).toLocaleString("pt-BR")}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 border-t border-b border-border my-1">
              {selectedMail?.body && selectedMail.body.includes("<") ? (
                <div 
                  className="prose prose-xs max-w-none text-xs bg-white text-slate-900 p-4 rounded-xl border border-border"
                  dangerouslySetInnerHTML={{ __html: selectedMail.body }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-xs font-mono p-3 bg-muted/40 rounded-xl">
                  {selectedMail?.body || "Sem conteúdo de corpo."}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(false)} className="rounded-xl text-xs">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Teste Rápido SMTP */}
        <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <span>Testar Disparo SMTP Zoho</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Enviaremos um e-mail transacional de validação para confirmar que as credenciais e o servidor estão operando perfeitamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">E-mail de Destino do Teste *</Label>
                <Input
                  type="email"
                  value={testTargetEmail}
                  onChange={e => setTestTargetEmail(e.target.value)}
                  placeholder="ex: seuemail@gmail.com"
                  className="text-xs h-9 rounded-xl"
                />
              </div>
              <div className="p-3 bg-muted/40 rounded-xl text-[11px] text-muted-foreground space-y-1">
                <div><strong>Host:</strong> {engineConfig.host}:{engineConfig.port}</div>
                <div><strong>Remetente:</strong> {engineConfig.fromName} ({engineConfig.fromEmail || engineConfig.user})</div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setTestModalOpen(false)} className="rounded-xl text-xs">
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={testingSmtp || !testTargetEmail}
                onClick={handleTestSmtp}
                className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1.5"
              >
                {testingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{testingSmtp ? "Validando..." : "Disparar E-mail de Teste"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
