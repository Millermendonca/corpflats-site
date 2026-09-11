import { useState, useEffect, useRef } from "react"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { 
  MessageSquare, 
  Send, 
  Clock, 
  CheckCheck, 
  Phone, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  Zap, 
  User, 
  Calendar, 
  Sparkles, 
  Coins, 
  Receipt, 
  ExternalLink, 
  BellRing, 
  Users, 
  History, 
  Play, 
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Hourglass,
  Sliders,
  DollarSign,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  AlertTriangle,
  Banknote,
  Gift,
} from "lucide-react"
import { AccessDenied } from "@/components/access-denied"

interface MaidTrigger {
  id: string
  name: string
  description: string
  enabled: boolean
  timing: "overtime" | "daily_time" | "quinzena_closing"
  thresholdMinutes?: number
  scheduledTime?: string
  lastExecutedDate?: string | null
  template: string
}

interface Cleaner {
  id: number
  username: string
  name: string
  role: string
  whatsapp: string
  phone: string
  pixKey: string
  active: boolean
}

interface HistoryItem {
  id: string
  userId: number
  userName: string
  phone: string
  triggerId: string
  triggerName: string
  message: string
  status: "sent" | "failed"
  method: string
  error?: string | null
  sentAt: string
}

interface MaidBalance {
  id: number
  username: string
  name: string
  pixKey: string
  whatsapp: string
  active: boolean
  balance: number
}

interface StatementEntry {
  id: string
  userId: number
  entryType: "credit" | "debit"
  amount: number
  description: string
  entryDate: string
  createdAt: string
  balanceAfter: number
  payment: {
    id: string
    type: string
    interTxId: string | null
    interStatus: string | null
    interSimulated: boolean
    paidAt: string | null
  } | null
}

interface MaidStatement {
  userId: number
  userName: string
  pixKey: string
  balance: number
  statement: StatementEntry[]
}


// Formatador visual de texto estilo WhatsApp (*bold*, _italic_, \n)
function WhatsAppMessageBubble({ text, time = "18:00" }: { text: string; time?: string }) {
  const renderFormattedText = (raw: string) => {
    if (!raw) return null
    return raw.split("\n").map((line, lineIdx) => {
      // Formatação simples de negrito (*texto*) e itálico (_texto_)
      const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g)
      return (
        <span key={lineIdx} className="block min-h-[1.2em]">
          {parts.map((part, partIdx) => {
            if (part.startsWith("*") && part.endsWith("*")) {
              return <strong key={partIdx} className="font-bold">{part.slice(1, -1)}</strong>
            }
            if (part.startsWith("_") && part.endsWith("_")) {
              return <em key={partIdx} className="italic text-muted-foreground">{part.slice(1, -1)}</em>
            }
            return part
          })}
        </span>
      )
    })
  }

  return (
    <div className="rounded-2xl p-4 bg-[#EFEAE2] dark:bg-zinc-950 border border-border/80 shadow-inner relative overflow-hidden font-sans">
      <div className="max-w-[92%] ml-auto bg-[#d9fdd3] dark:bg-[#005c4b] text-foreground dark:text-zinc-100 rounded-2xl rounded-tr-xs p-3.5 shadow-sm text-xs leading-relaxed space-y-1 relative">
        <div className="whitespace-pre-wrap select-text">
          {renderFormattedText(text)}
        </div>
        <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-muted-foreground dark:text-zinc-300">
          <span>{time}</span>
          <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline" />
        </div>
      </div>
    </div>
  )
}

export default function MaidWhatsappAutomation() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("triggers")

  const [configEnabled, setConfigEnabled] = useState(true)
  const [triggers, setTriggers] = useState<MaidTrigger[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [zapiStatus, setZapiStatus] = useState<any>({ configured: false, enabled: false })
  const [serverTime, setServerTime] = useState<any>(null)

  // Modal de Teste de Disparo
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [activeTestTrigger, setActiveTestTrigger] = useState<MaidTrigger | null>(null)
  const [testSelectedMaidId, setTestSelectedMaidId] = useState<string>("")
  const [testCustomPhone, setTestCustomPhone] = useState<string>("")
  const [testPreviewText, setTestPreviewText] = useState<string>("")
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // Modal de Edição de Camareira
  const [editCleanerModalOpen, setEditCleanerModalOpen] = useState(false)
  const [editingCleaner, setEditingCleaner] = useState<Cleaner | null>(null)
  const [editName, setEditName] = useState("")
  const [editWhatsapp, setEditWhatsapp] = useState("")
  const [editPixKey, setEditPixKey] = useState("")
  const [editActive, setEditActive] = useState(true)
  const [savingCleaner, setSavingCleaner] = useState(false)

  // Modal de Detalhes da Mensagem do Histórico
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null)

  // ── Estados de Pagamento ──────────────────────────────────────────────────
  const [maidBalances, setMaidBalances] = useState<MaidBalance[]>([])
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [selectedMaidStatement, setSelectedMaidStatement] = useState<MaidStatement | null>(null)
  const [statementModalOpen, setStatementModalOpen] = useState(false)
  const [loadingStatement, setLoadingStatement] = useState(false)
  const [interStatus, setInterStatus] = useState<{ configured: boolean; env: string; message: string } | null>(null)

  // Modal de Pagamento
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payingMaid, setPayingMaid] = useState<MaidBalance | null>(null)
  const [payType, setPayType] = useState<"payment" | "advance">("payment")
  const [payAmount, setPayAmount] = useState("")
  const [payDescription, setPayDescription] = useState("")
  const [payingLoading, setPayingLoading] = useState(false)

  // Refs de Textarea para inserir tags no cursor
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Carrega configurações
  const fetchAllData = async () => {
    try {
      setLoading(true)
      const [resCfg, resHist] = await Promise.all([
        fetch("/api/maid-automation/config"),
        fetch("/api/maid-automation/history")
      ])

      if (resCfg.ok) {
        const data = await resCfg.json()
        setConfigEnabled(data.config?.enabled !== false)
        setTriggers(data.config?.triggers || [])
        setCleaners(data.cleaners || [])
        setZapiStatus(data.zapiStatus || {})
        setServerTime(data.serverTime || null)

        if (data.cleaners?.length > 0 && !testSelectedMaidId) {
          setTestSelectedMaidId(String(data.cleaners[0].id))
        }
      }

      if (resHist.ok) {
        const hData = await resHist.json()
        setHistory(Array.isArray(hData) ? hData : [])
      }
    } catch (err: any) {
      toast({
        title: "Erro ao carregar automações",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // Carrega saldos e status Inter
  const fetchBalances = async () => {
    try {
      setLoadingBalances(true)
      const [resBalances, resInter] = await Promise.all([
        fetch("/api/maids/all-balances"),
        fetch("/api/maids/inter-status"),
      ])
      if (resBalances.ok) setMaidBalances(await resBalances.json())
      if (resInter.ok) setInterStatus(await resInter.json())
    } catch (err: any) {
      console.error("Erro ao carregar saldos:", err.message)
    } finally {
      setLoadingBalances(false)
    }
  }

  // Abre extrato de uma camareira
  const openStatement = async (maid: MaidBalance) => {
    try {
      setLoadingStatement(true)
      setStatementModalOpen(true)
      const res = await fetch(`/api/maids/${maid.id}/statement`)
      if (res.ok) {
        setSelectedMaidStatement(await res.json())
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar extrato", description: err.message, variant: "destructive" })
    } finally {
      setLoadingStatement(false)
    }
  }

  // Abre modal de pagamento
  const openPayModal = (maid: MaidBalance, type: "payment" | "advance") => {
    setPayingMaid(maid)
    setPayType(type)
    setPayAmount(type === "payment" ? String(Math.max(0, maid.balance).toFixed(2)) : "")
    setPayDescription("")
    setPayModalOpen(true)
  }

  // Executa pagamento / vale
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payingMaid) return
    const amount = parseFloat(payAmount.replace(",", "."))
    if (!amount || amount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" })
      return
    }
    try {
      setPayingLoading(true)
      const res = await fetch(`/api/maids/${payingMaid.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          type: payType,
          description: payDescription.trim() || undefined,
          sendWhatsApp: true,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: payType === "advance" ? "✓ Vale Registrado!" : "✓ Pagamento Realizado!",
          description: data.message,
        })
        setPayModalOpen(false)
        fetchBalances()
        // Recarrega extrato se estiver aberto
        if (selectedMaidStatement?.userId === payingMaid.id) {
          openStatement(payingMaid)
        }
      } else {
        toast({ title: "Erro no pagamento", description: data.error || "Falha ao processar.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setPayingLoading(false)
    }
  }

  // Salva alterações de templates e gatilhos
  const handleSaveConfig = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/maid-automation/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: configEnabled,
          triggers
        })
      })

      if (res.ok) {
        toast({
          title: "✓ Configurações Salvas",
          description: "Gatilhos e modelos de mensagens atualizados com sucesso!"
        })
      } else {
        const d = await res.json()
        throw new Error(d.error || "Falha ao salvar.")
      }
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  // Atualiza um trigger específico no estado local
  const updateTriggerField = (id: string, field: keyof MaidTrigger, value: any) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  // Insere uma tag na posição atual do cursor no textarea
  const insertTagAtCursor = (triggerId: string, tag: string) => {
    const el = textareaRefs.current[triggerId]
    const targetTrigger = triggers.find(t => t.id === triggerId)
    if (!targetTrigger) return

    if (!el) {
      updateTriggerField(triggerId, "template", (targetTrigger.template || "") + " " + tag)
      return
    }

    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const text = targetTrigger.template || ""
    const newText = text.substring(0, start) + tag + text.substring(end)

    updateTriggerField(triggerId, "template", newText)

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    }, 50)
  }

  // Abre modal de teste
  const handleOpenTestModal = async (trigger: MaidTrigger, cleanerId?: number) => {
    setActiveTestTrigger(trigger)
    const targetId = cleanerId ? String(cleanerId) : (testSelectedMaidId || (cleaners[0] ? String(cleaners[0].id) : ""))
    setTestSelectedMaidId(targetId)
    setTestResult(null)

    // Pré-visualização com dados reais
    try {
      const res = await fetch("/api/maid-automation/test-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerId: trigger.id,
          maidUserId: Number(targetId),
          previewOnly: true
        })
      })
      if (res.ok) {
        const d = await res.json()
        setTestPreviewText(d.message || trigger.template)
      }
    } catch {
      setTestPreviewText(trigger.template)
    }

    setTestModalOpen(true)
  }

  // Dispara teste real/simulado
  const handleExecuteTestDispatch = async () => {
    if (!activeTestTrigger) return
    try {
      setSendingTest(true)
      setTestResult(null)

      const res = await fetch("/api/maid-automation/test-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerId: activeTestTrigger.id,
          maidUserId: Number(testSelectedMaidId),
          customPhone: testCustomPhone.trim() || undefined,
          previewOnly: false
        })
      })

      const data = await res.json()
      setTestResult(data)

      if (data.success) {
        toast({
          title: data.simulated ? "✓ Teste Simulado com Sucesso!" : "✓ Mensagem Enviada com Sucesso!",
          description: data.simulated 
            ? `Disparo para ${data.phone} simulado. Para envio real, conecte a Z-API.`
            : `Mensagem entregue para ${data.phone} via WhatsApp!`
        })
        // Atualiza histórico
        const resHist = await fetch("/api/maid-automation/history")
        if (resHist.ok) setHistory(await resHist.json())
      } else {
        toast({
          title: "Falha no envio de teste",
          description: data.error || data.result?.error || "Erro ao disparar WhatsApp.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro na requisição de teste",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setSendingTest(false)
    }
  }

  // Disparo manual imediato para todas as camareiras ativas
  const handleDispatchToAll = async (triggerId: string) => {
    const trigger = triggers.find(t => t.id === triggerId)
    if (!trigger) return

    if (!confirm(`Deseja disparar agora a mensagem "${trigger.name}" para TODAS as camareiras ativas com WhatsApp cadastrado?`)) {
      return
    }

    try {
      setSaving(true)
      const res = await fetch("/api/maid-automation/dispatch-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerId })
      })
      const data = await res.json()

      if (res.ok) {
        toast({
          title: "✓ Disparo Concluído!",
          description: `Mensagem enviada com sucesso para ${data.count} camareiras.`
        })
        // Atualiza histórico
        const resHist = await fetch("/api/maid-automation/history")
        if (resHist.ok) setHistory(await resHist.json())
      } else {
        alert(data.error || "Erro ao realizar disparo em massa.")
      }
    } catch (err: any) {
      alert("Erro de conexão ao realizar disparo.")
    } finally {
      setSaving(false)
    }
  }

  // Abre modal de edição da camareira
  const handleOpenEditCleaner = (c: Cleaner) => {
    setEditingCleaner(c)
    setEditName(c.name || c.username)
    setEditWhatsapp(c.whatsapp || c.phone || "")
    setEditPixKey(c.pixKey || "")
    setEditActive(c.active !== false)
    setEditCleanerModalOpen(true)
  }

  // Salva edição da camareira
  const handleSaveCleaner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCleaner) return

    try {
      setSavingCleaner(true)
      const res = await fetch(`/api/admin/users/${editingCleaner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          whatsapp: editWhatsapp.trim(),
          phone: editWhatsapp.trim(),
          pixKey: editPixKey.trim(),
          active: editActive
        })
      })

      if (res.ok) {
        toast({
          title: "✓ Cadastro Atualizado",
          description: `WhatsApp e dados de ${editName} salvos com sucesso!`
        })
        setEditCleanerModalOpen(false)
        fetchAllData()
      } else {
        const d = await res.json()
        alert(d.error || "Erro ao atualizar camareira.")
      }
    } catch (err: any) {
      alert("Erro ao conectar com o servidor: " + err.message)
    } finally {
      setSavingCleaner(false)
    }
  }

  // Limpa histórico
  const handleClearHistory = async () => {
    if (!confirm("Tem certeza que deseja apagar o histórico de mensagens enviadas às camareiras?")) return
    try {
      const res = await fetch("/api/maid-automation/history", { method: "DELETE" })
      if (res.ok) {
        setHistory([])
        toast({ title: "Histórico limpo com sucesso!" })
      }
    } catch {
      alert("Erro ao limpar histórico.")
    }
  }

  if (loadingUser) {
    return (
      <Shell>
        <div className="p-8 text-center text-xs text-muted-foreground">Carregando permissões...</div>
      </Shell>
    )
  }

  if (user?.role !== "admin") {
    return <AccessDenied />
  }

  const overtimeTrigger = triggers.find(t => t.id === "trigger_overtime_cleaning")
  const dailyTrigger = triggers.find(t => t.id === "trigger_daily_summary")
  const closingTrigger = triggers.find(t => t.id === "trigger_quinzena_closing")

  const configuredCleanersCount = cleaners.filter(c => c.whatsapp || c.phone).length

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-bold tracking-wide uppercase px-2.5 py-0.5 border-primary/30 text-primary bg-primary/5">
                🧹 Governança & Camareiras
              </Badge>
              {zapiStatus.configured ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Z-API Conectada
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-bold gap-1 text-amber-600 bg-amber-500/10 border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Modo Simulação Ativo
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <MessageSquare className="w-7 h-7 text-primary" />
              Automação WhatsApp das Camareiras
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-3xl">
              Dispare alertas quando quartos passarem de 40 min em limpeza, envie o resumo diário de serviços às 18:00 e emita o demonstrativo oficial de fechamento quinzenal no WhatsApp das colaboradoras.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllData}
              disabled={loading}
              className="rounded-xl text-xs font-bold gap-1.5 h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </Button>

            <Button
              size="sm"
              onClick={handleSaveConfig}
              disabled={saving}
              className="rounded-xl text-xs font-bold gap-1.5 h-9 bg-primary text-primary-foreground shadow-sm hover:brightness-110"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? "Salvando..." : "Salvar Alterações"}</span>
            </Button>
          </div>
        </div>

        {/* Status & Quick Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Camareiras Ativas</p>
                <p className="text-xl font-black text-foreground">{cleaners.length}</p>
                <p className="text-[10px] text-emerald-600 font-medium">{configuredCleanersCount} com WhatsApp cadastrado</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Hourglass className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Alerta Tempo Limpeza</p>
                <p className="text-xl font-black text-foreground">&gt; {overtimeTrigger?.thresholdMinutes || 40} min</p>
                <p className="text-[10px] text-muted-foreground">{overtimeTrigger?.enabled ? "✓ Ativo e monitorando" : "Inativo"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Resumo Diário</p>
                <p className="text-xl font-black text-foreground">{dailyTrigger?.scheduledTime || "18:00"}</p>
                <p className="text-[10px] text-muted-foreground">Todo dia para quem limpou</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Fechamento Quinzena</p>
                <p className="text-xl font-black text-foreground">15 e Fim do Mês</p>
                <p className="text-[10px] text-muted-foreground">Disparo pontual às {closingTrigger?.scheduledTime || "18:00"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Master Switch Alert */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${configEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Motor de Disparos de Governança</p>
              <p className="text-[11px] text-muted-foreground">Quando desativado, nenhum alerta em segundo plano é enviado às camareiras.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold">{configEnabled ? "Ativo" : "Pausado"}</span>
            <Switch checked={configEnabled} onCheckedChange={setConfigEnabled} />
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "payments") fetchBalances(); }} className="space-y-6">
          <TabsList className="bg-muted/60 p-1 rounded-2xl border border-border/60">
            <TabsTrigger value="triggers" className="rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Gatilhos & Mensagens</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span>Pagamentos</span>
            </TabsTrigger>
            <TabsTrigger value="cleaners" className="rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Users className="w-4 h-4 text-primary" />
              <span>Camareiras & WhatsApp</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {cleaners.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <History className="w-4 h-4 text-emerald-500" />
              <span>Histórico de Envios</span>
              {history.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {history.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>


          {/* ══════════════════════════════════════════════════════════════════════
              ABA: PAGAMENTOS
              ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="payments" className="space-y-5">

            {/* Status Inter PIX */}
            {interStatus && (
              <div className={`flex items-center gap-3 p-3.5 rounded-2xl text-xs font-medium border ${interStatus.configured ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700" : "bg-amber-500/5 border-amber-500/20 text-amber-700"}`}>
                {interStatus.configured
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{interStatus.message}</span>
              </div>
            )}

            {/* Header da aba */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  Controle Financeiro das Camareiras
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pague diárias, registre vales e veja o extrato completo de cada colaboradora.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBalances}
                disabled={loadingBalances}
                className="rounded-xl text-xs font-bold gap-1.5 h-9"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBalances ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            {/* Cards de Saldo por Camareira */}
            {loadingBalances ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Carregando saldos...</div>
            ) : maidBalances.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>Nenhuma camareira encontrada.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {maidBalances.map((maid) => (
                  <Card key={maid.id} className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
                    <CardContent className="p-5 space-y-4">
                      {/* Header da camareira */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                            {(maid.name || maid.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-sm text-foreground">{maid.name || maid.username}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {maid.pixKey ? `PIX: ${maid.pixKey.substring(0, 20)}${maid.pixKey.length > 20 ? "…" : ""}` : "⚠️ Sem chave PIX"}
                            </p>
                          </div>
                        </div>
                        {!maid.active && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                      </div>

                      {/* Saldo */}
                      <div className={`p-3.5 rounded-2xl ${maid.balance >= 0 ? "bg-emerald-500/8 border border-emerald-500/20" : "bg-rose-500/8 border border-rose-500/20"}`}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Saldo a Pagar</p>
                        <p className={`text-2xl font-black ${maid.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {maid.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Diárias − pagamentos/vales</p>
                      </div>

                      {/* Botões */}
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          onClick={() => openPayModal(maid, "payment")}
                          disabled={!maid.active}
                          className="h-9 rounded-xl text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white col-span-1"
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          Pagar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayModal(maid, "advance")}
                          disabled={!maid.active}
                          className="h-9 rounded-xl text-xs font-bold gap-1 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 col-span-1"
                        >
                          <Gift className="w-3.5 h-3.5" />
                          Vale
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openStatement(maid)}
                          className="h-9 rounded-xl text-xs font-bold gap-1 col-span-1"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Extrato
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 1: GATILHOS & MENSAGENS
              ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="triggers" className="space-y-6">

            {/* ── CARD GATILHO 1: ALERTA DE QUARTO PROLONGADO (>40 MIN) ── */}
            {overtimeTrigger && (
              <Card className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="bg-amber-500/5 border-b border-border/60 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <Hourglass className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-black text-foreground">
                            {overtimeTrigger.name}
                          </CardTitle>
                          <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-[10px] font-bold">
                            Tempo Real
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-0.5">
                          {overtimeTrigger.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTestModal(overtimeTrigger)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Testar Disparo</span>
                      </Button>

                      <div className="flex items-center gap-2 pl-2 border-l border-border">
                        <Label className="text-xs font-bold cursor-pointer">
                          {overtimeTrigger.enabled ? "Ativo" : "Pausado"}
                        </Label>
                        <Switch
                          checked={overtimeTrigger.enabled}
                          onCheckedChange={checked => updateTriggerField(overtimeTrigger.id, "enabled", checked)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* Configuração de Parâmetros */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-2xl bg-muted/30 border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-foreground">Tempo Limite em Limpeza (minutos)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={10}
                          max={180}
                          value={overtimeTrigger.thresholdMinutes || 40}
                          onChange={e => updateTriggerField(overtimeTrigger.id, "thresholdMinutes", Number(e.target.value) || 40)}
                          className="text-xs font-bold rounded-xl h-9 w-28 font-mono"
                        />
                        <span className="text-xs text-muted-foreground font-medium">minutos (padrão: 40)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">O sistema dispara quando o quarto completar esse tempo em higienização.</p>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-foreground">Destinatário Automático</Label>
                      <p className="text-xs text-muted-foreground">
                        A mensagem é enviada diretamente ao WhatsApp da camareira que iniciou ou foi atribuída à higienização daquele quarto. Dispara apenas 1 vez por quarto para não gerar spam.
                      </p>
                    </div>
                  </div>

                  {/* Editor e Preview lado a lado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Coluna 1: Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground">Modelo da Mensagem</Label>
                        <span className="text-[10px] text-muted-foreground">Clique nas variáveis para inserir no texto</span>
                      </div>

                      {/* Tags clicáveis */}
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/40 border border-border/60">
                        {[
                          { tag: "{{nome_camareira}}", label: "Nome Camareira" },
                          { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
                          { tag: "{{quarto}}", label: "Número do Quarto" },
                          { tag: "{{tempo_limpeza}}", label: "Minutos em Limpeza" },
                          { tag: "{{nome_hotel}}", label: "Nome do Hotel" },
                        ].map(t => (
                          <button
                            key={t.tag}
                            type="button"
                            onClick={() => insertTagAtCursor(overtimeTrigger.id, t.tag)}
                            className="px-2 py-1 rounded-lg bg-background hover:bg-primary/10 hover:text-primary text-[11px] font-mono font-medium border border-border/80 transition-colors"
                            title={`Inserir ${t.tag}`}
                          >
                            + {t.label}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        ref={el => { textareaRefs.current[overtimeTrigger.id] = el }}
                        rows={10}
                        value={overtimeTrigger.template}
                        onChange={e => updateTriggerField(overtimeTrigger.id, "template", e.target.value)}
                        className="text-xs font-mono leading-relaxed rounded-2xl p-3.5 border-border focus-visible:ring-1"
                        placeholder="Digite o texto da mensagem..."
                      />
                    </div>

                    {/* Coluna 2: Preview WhatsApp */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Pré-visualização no WhatsApp</span>
                        </Label>
                        <span className="text-[10px] text-emerald-600 font-semibold">Exemplo com Quarto 211</span>
                      </div>

                      <WhatsAppMessageBubble
                        text={overtimeTrigger.template
                          .replace(/\{\{nome_camareira\}\}/g, "Cris")
                          .replace(/\{\{primeiro_nome\}\}/g, "Cris")
                          .replace(/\{\{quarto\}\}/g, "211")
                          .replace(/\{\{tempo_limpeza\}\}/g, String(overtimeTrigger.thresholdMinutes || 40))
                          .replace(/\{\{nome_hotel\}\}/g, "CorpFlats")
                        }
                        time="14:40"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── CARD GATILHO 2: RESUMO DIÁRIO DE PRODUTIVIDADE (18:00) ── */}
            {dailyTrigger && (
              <Card className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="bg-sky-500/5 border-b border-border/60 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-black text-foreground">
                            {dailyTrigger.name}
                          </CardTitle>
                          <Badge className="bg-sky-500/10 text-sky-700 border-sky-500/20 text-[10px] font-bold">
                            Diário Pontual
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-0.5">
                          {dailyTrigger.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDispatchToAll(dailyTrigger.id)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-sky-500/30 text-sky-700 hover:bg-sky-500/10"
                        title="Enviar agora para todas as camareiras ativas"
                      >
                        <Play className="w-3 h-3" />
                        <span>Disparar P/ Todas</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTestModal(dailyTrigger)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-sky-500/30 text-sky-700 hover:bg-sky-500/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Testar</span>
                      </Button>

                      <div className="flex items-center gap-2 pl-2 border-l border-border">
                        <Label className="text-xs font-bold cursor-pointer">
                          {dailyTrigger.enabled ? "Ativo" : "Pausado"}
                        </Label>
                        <Switch
                          checked={dailyTrigger.enabled}
                          onCheckedChange={checked => updateTriggerField(dailyTrigger.id, "enabled", checked)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* Configuração de Parâmetros */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-2xl bg-muted/30 border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-foreground">Horário de Disparo Diário</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={dailyTrigger.scheduledTime || "18:00"}
                          onChange={e => updateTriggerField(dailyTrigger.id, "scheduledTime", e.target.value)}
                          className="text-xs font-bold rounded-xl h-9 w-32 font-mono"
                        />
                        <span className="text-xs text-muted-foreground font-medium">(Horário de Brasília)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Dispara automaticamente todos os dias nesse horário.</p>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-foreground">Critério de Envio</Label>
                      <p className="text-xs text-muted-foreground">
                        Envia para cada camareira ativa com WhatsApp que tenha realizado limpezas no dia ou possua diárias acumuladas na quinzena atual, trazendo o fechamento do dia dela com total transparência.
                      </p>
                    </div>
                  </div>

                  {/* Editor e Preview lado a lado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Coluna 1: Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground">Modelo da Mensagem</Label>
                        <span className="text-[10px] text-muted-foreground">Clique nas variáveis para inserir no texto</span>
                      </div>

                      {/* Tags clicáveis */}
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/40 border border-border/60">
                        {[
                          { tag: "{{nome_camareira}}", label: "Nome Camareira" },
                          { tag: "{{data_hoje}}", label: "Data de Hoje" },
                          { tag: "{{qtd_quartos_hoje}}", label: "Qtd. Quartos Hoje" },
                          { tag: "{{lista_quartos_hoje}}", label: "Lista de Quartos" },
                          { tag: "{{tempo_medio_hoje}}", label: "Tempo Médio" },
                          { tag: "{{periodo_quinzena}}", label: "Período Quinzena" },
                          { tag: "{{total_quartos_quinzena}}", label: "Total Quinzena" },
                          { tag: "{{total_valor_quinzena}}", label: "Total a Receber" },
                        ].map(t => (
                          <button
                            key={t.tag}
                            type="button"
                            onClick={() => insertTagAtCursor(dailyTrigger.id, t.tag)}
                            className="px-2 py-1 rounded-lg bg-background hover:bg-sky-500/10 hover:text-sky-600 text-[11px] font-mono font-medium border border-border/80 transition-colors"
                            title={`Inserir ${t.tag}`}
                          >
                            + {t.label}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        ref={el => { textareaRefs.current[dailyTrigger.id] = el }}
                        rows={12}
                        value={dailyTrigger.template}
                        onChange={e => updateTriggerField(dailyTrigger.id, "template", e.target.value)}
                        className="text-xs font-mono leading-relaxed rounded-2xl p-3.5 border-border focus-visible:ring-1"
                        placeholder="Digite o texto da mensagem..."
                      />
                    </div>

                    {/* Coluna 2: Preview WhatsApp */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Pré-visualização no WhatsApp</span>
                        </Label>
                        <span className="text-[10px] text-emerald-600 font-semibold">Exemplo com Dados do Dia</span>
                      </div>

                      <WhatsAppMessageBubble
                        text={dailyTrigger.template
                          .replace(/\{\{nome_camareira\}\}/g, "Grazi")
                          .replace(/\{\{data_hoje\}\}/g, serverTime ? `${serverTime.date.split("-")[2]}/${serverTime.date.split("-")[1]}/${serverTime.date.split("-")[0]}` : "09/09/2026")
                          .replace(/\{\{qtd_quartos_hoje\}\}/g, "4")
                          .replace(/\{\{lista_quartos_hoje\}\}/g, "113, 211, 509, 712")
                          .replace(/\{\{tempo_medio_hoje\}\}/g, "32")
                          .replace(/\{\{periodo_quinzena\}\}/g, "1ª Quinzena (01 a 15/09/2026)")
                          .replace(/\{\{total_quartos_quinzena\}\}/g, "18")
                          .replace(/\{\{total_valor_quinzena\}\}/g, "R$ 405,00")
                          .replace(/\{\{nome_hotel\}\}/g, "CorpFlats")
                        }
                        time={dailyTrigger.scheduledTime || "18:00"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── CARD GATILHO 3: RELATÓRIO DE FECHAMENTO DE QUINZENA ── */}
            {closingTrigger && (
              <Card className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="bg-emerald-500/5 border-b border-border/60 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-black text-foreground">
                            {closingTrigger.name}
                          </CardTitle>
                          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px] font-bold">
                            Oficial Quinzenal
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-0.5">
                          {closingTrigger.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDispatchToAll(closingTrigger.id)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
                        title="Enviar agora para todas as camareiras ativas"
                      >
                        <Play className="w-3 h-3" />
                        <span>Disparar Fechamento</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTestModal(closingTrigger)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Testar</span>
                      </Button>

                      <div className="flex items-center gap-2 pl-2 border-l border-border">
                        <Label className="text-xs font-bold cursor-pointer">
                          {closingTrigger.enabled ? "Ativo" : "Pausado"}
                        </Label>
                        <Switch
                          checked={closingTrigger.enabled}
                          onCheckedChange={checked => updateTriggerField(closingTrigger.id, "enabled", checked)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* Configuração de Parâmetros */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-2xl bg-muted/30 border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-foreground">Horário nos Dias 15 e Fim do Mês</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={closingTrigger.scheduledTime || "18:00"}
                          onChange={e => updateTriggerField(closingTrigger.id, "scheduledTime", e.target.value)}
                          className="text-xs font-bold rounded-xl h-9 w-32 font-mono"
                        />
                        <span className="text-xs text-muted-foreground font-medium">às 18:00</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Dispara no dia 15 (1ª quinzena) e no último dia do mês (2ª quinzena).</p>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-foreground">Relatório Detalhado</Label>
                      <p className="text-xs text-muted-foreground">
                        Calcula o demonstrativo oficial de fechamento: total de quartos limpos, taxa contratual por quarto, valor líquido acumulado a receber, chave PIX e relação dia a dia com números dos flats.
                      </p>
                    </div>
                  </div>

                  {/* Editor e Preview lado a lado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Coluna 1: Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground">Modelo da Mensagem</Label>
                        <span className="text-[10px] text-muted-foreground">Clique nas variáveis para inserir no texto</span>
                      </div>

                      {/* Tags clicáveis */}
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/40 border border-border/60">
                        {[
                          { tag: "{{nome_camareira}}", label: "Nome Camareira" },
                          { tag: "{{periodo_quinzena}}", label: "Período Quinzena" },
                          { tag: "{{total_quartos_quinzena}}", label: "Total de Quartos" },
                          { tag: "{{valor_por_quarto}}", label: "Valor p/ Quarto" },
                          { tag: "{{total_valor_quinzena}}", label: "Total a Receber" },
                          { tag: "{{chave_pix}}", label: "Chave PIX" },
                          { tag: "{{detalhamento_dias}}", label: "Detalhamento por Dia" },
                        ].map(t => (
                          <button
                            key={t.tag}
                            type="button"
                            onClick={() => insertTagAtCursor(closingTrigger.id, t.tag)}
                            className="px-2 py-1 rounded-lg bg-background hover:bg-emerald-500/10 hover:text-emerald-600 text-[11px] font-mono font-medium border border-border/80 transition-colors"
                            title={`Inserir ${t.tag}`}
                          >
                            + {t.label}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        ref={el => { textareaRefs.current[closingTrigger.id] = el }}
                        rows={14}
                        value={closingTrigger.template}
                        onChange={e => updateTriggerField(closingTrigger.id, "template", e.target.value)}
                        className="text-xs font-mono leading-relaxed rounded-2xl p-3.5 border-border focus-visible:ring-1"
                        placeholder="Digite o texto da mensagem..."
                      />
                    </div>

                    {/* Coluna 2: Preview WhatsApp */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Pré-visualização no WhatsApp</span>
                        </Label>
                        <span className="text-[10px] text-emerald-600 font-semibold">Exemplo com Fechamento Quinzenal</span>
                      </div>

                      <WhatsAppMessageBubble
                        text={closingTrigger.template
                          .replace(/\{\{nome_camareira\}\}/g, "Cris")
                          .replace(/\{\{periodo_quinzena\}\}/g, "1ª Quinzena (01 a 15/09/2026)")
                          .replace(/\{\{total_quartos_quinzena\}\}/g, "24")
                          .replace(/\{\{valor_por_quarto\}\}/g, "R$ 22,50")
                          .replace(/\{\{total_valor_quinzena\}\}/g, "R$ 540,00")
                          .replace(/\{\{chave_pix\}\}/g, "22997124021 (Celular)")
                          .replace(/\{\{detalhamento_dias\}\}/g, `• *01/09:* Flats 113, 211, 313 (3 quartos)\n• *02/09:* Flats 114, 212, 712, 904 (4 quartos)\n• *03/09:* Flats 116, 408, 511 (3 quartos)\n• *04/09:* Flats 512, 605, 905, 1004 (4 quartos)`)
                          .replace(/\{\{nome_hotel\}\}/g, "CorpFlats")
                        }
                        time={closingTrigger.scheduledTime || "18:00"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bottom Save Bar */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                onClick={handleSaveConfig}
                disabled={saving}
                className="rounded-2xl text-xs font-bold gap-2 px-6 h-10 bg-primary text-primary-foreground shadow-sm hover:brightness-110"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? "Salvando Alterações..." : "Salvar Todas as Configurações"}</span>
              </Button>
            </div>

          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 2: CAMAREIRAS & WHATSAPP
              ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="cleaners" className="space-y-4">
            <Card className="rounded-3xl border border-border/80 shadow-xs bg-card">
              <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Camareiras Cadastradas & Telefones WhatsApp
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Cadastre o número de WhatsApp e a chave PIX de cada colaboradora para que recebam os alertas e fechamentos automáticos.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {cleaners.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">
                    Nenhuma camareira encontrada no sistema.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-4">Colaboradora</th>
                          <th className="p-4">Perfil</th>
                          <th className="p-4">WhatsApp / Celular</th>
                          <th className="p-4">Chave PIX</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {cleaners.map(c => {
                          const hasPhone = Boolean(c.whatsapp || c.phone)
                          const phoneDisplay = c.whatsapp || c.phone || ""
                          return (
                            <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                              <td className="p-4">
                                <div className="flex items-center gap-3 font-bold text-foreground">
                                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                                    {(c.name || c.username).substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-bold text-foreground">{c.name || c.username}</p>
                                    <p className="text-[11px] text-muted-foreground font-normal">Login: @{c.username}</p>
                                  </div>
                                </div>
                              </td>

                              <td className="p-4">
                                <Badge variant={c.role === "admin" ? "default" : "outline"} className="text-[10px] font-bold">
                                  {c.role === "admin" ? "Administrador" : "Camareira"}
                                </Badge>
                              </td>

                              <td className="p-4">
                                {hasPhone ? (
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={`https://wa.me/${phoneDisplay.replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono text-emerald-600 font-bold hover:underline flex items-center gap-1"
                                      title="Conversar no WhatsApp"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      <span>{phoneDisplay}</span>
                                    </a>
                                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[9px] font-bold">
                                      Cadastrado
                                    </Badge>
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/5 text-[10px] font-bold">
                                    ⚠️ Não Cadastrado
                                  </Badge>
                                )}
                              </td>

                              <td className="p-4">
                                {c.pixKey ? (
                                  <span className="font-mono text-muted-foreground">{c.pixKey}</span>
                                ) : (
                                  <span className="text-muted-foreground italic text-[11px]">—</span>
                                )}
                              </td>

                              <td className="p-4">
                                <Badge variant={c.active !== false ? "outline" : "secondary"} className="text-[10px]">
                                  {c.active !== false ? "✓ Ativa" : "Inativa"}
                                </Badge>
                              </td>

                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {hasPhone && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenTestModal(triggers[0] || overtimeTrigger, c.id)}
                                      className="h-8 px-2.5 text-[11px] font-bold rounded-xl text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/10"
                                      title="Enviar mensagem de teste para esta camareira"
                                    >
                                      <Send className="w-3 h-3 mr-1" />
                                      <span>Testar</span>
                                    </Button>
                                  )}

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenEditCleaner(c)}
                                    className="h-8 px-2.5 text-[11px] font-bold rounded-xl text-primary hover:bg-primary/10"
                                  >
                                    <Edit3 className="w-3 h-3 mr-1" />
                                    <span>Editar WhatsApp</span>
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 3: HISTÓRICO DE ENVIOS
              ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="history" className="space-y-4">
            <Card className="rounded-3xl border border-border/80 shadow-xs bg-card">
              <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-600" />
                    Histórico & Registro de Disparos às Camareiras
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Log detalhado de todos os alertas, resumos e fechamentos disparados pelo sistema.
                  </CardDescription>
                </div>

                {history.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearHistory}
                    className="rounded-xl text-xs font-bold gap-1.5 h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Histórico</span>
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">
                    Nenhuma mensagem registrada no histórico ainda. Dispare um teste ou aguarde os gatilhos automáticos.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-4">Data/Hora</th>
                          <th className="p-4">Destinatária</th>
                          <th className="p-4">Telefone</th>
                          <th className="p-4">Gatilho</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Mensagem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {history.map(item => (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-4 text-muted-foreground font-mono whitespace-nowrap">
                              {new Date(item.sentAt).toLocaleString("pt-BR")}
                            </td>
                            <td className="p-4 font-bold text-foreground">
                              {item.userName || "Camareira"}
                            </td>
                            <td className="p-4 font-mono text-muted-foreground">
                              {item.phone}
                            </td>
                            <td className="p-4">
                              <Badge variant="outline" className="text-[10px] font-bold">
                                {item.triggerName || item.triggerId}
                              </Badge>
                            </td>
                            <td className="p-4">
                              {item.status === "sent" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px] font-bold gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>{item.method === "simulado" ? "Simulado (Dev)" : "Entregue"}</span>
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] font-bold gap-1" title={item.error || ""}>
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Falha</span>
                                </Badge>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedHistoryItem(item)
                                  setHistoryModalOpen(true)
                                }}
                                className="h-7 px-2.5 text-[11px] font-bold rounded-xl text-primary hover:bg-primary/10"
                              >
                                Ver Texto
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL: TESTAR DISPARO DE MENSAGEM
            ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
          <DialogContent className="sm:max-w-xl bg-card border border-border rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Testar Disparo de WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                {activeTestTrigger?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Enviar para a Camareira:</Label>
                  <Select value={testSelectedMaidId} onValueChange={setTestSelectedMaidId}>
                    <SelectTrigger className="h-9 text-xs rounded-xl">
                      <SelectValue placeholder="Selecione a camareira..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cleaners.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          🧹 {c.name || c.username} {c.whatsapp ? `(${c.whatsapp})` : "(Sem WhatsApp)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Ou Telefone de Teste (opcional):</Label>
                  <Input
                    placeholder="Ex: 22997124021"
                    value={testCustomPhone}
                    onChange={e => setTestCustomPhone(e.target.value)}
                    className="h-9 text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Pré-visualização do Texto Renderizado:</Label>
                <WhatsAppMessageBubble text={testPreviewText} time="18:00" />
              </div>

              {testResult && (
                <div className={`p-3 rounded-2xl text-xs font-medium border ${testResult.success ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-rose-500/10 text-rose-700 border-rose-500/20"}`}>
                  {testResult.success ? (
                    <p className="flex items-center gap-1.5 font-bold">
                      <Check className="w-4 h-4" />
                      {testResult.simulated 
                        ? `Disparo simulado com sucesso para ${testResult.phone} (Modo desenvolvimento)!`
                        : `Mensagem entregue via Z-API para ${testResult.phone}!`}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 font-bold">
                      <AlertCircle className="w-4 h-4" />
                      {testResult.error || "Falha ao enviar mensagem."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTestModalOpen(false)}
                className="rounded-xl h-9 text-xs font-bold"
              >
                Fechar
              </Button>
              <Button
                onClick={handleExecuteTestDispatch}
                disabled={sendingTest}
                className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingTest ? "Disparando..." : "Enviar Mensagem Agora"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL: EDITAR CAMAREIRA (WHATSAPP & CHAVE PIX)
            ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={editCleanerModalOpen} onOpenChange={setEditCleanerModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-primary" />
                Editar Dados da Colaboradora
              </DialogTitle>
              <DialogDescription className="text-xs">
                Atualize o WhatsApp e a Chave PIX para envio automático dos demonstrativos e alertas.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveCleaner} className="space-y-3.5 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome Completo</Label>
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                  placeholder="Ex: Cristiane Silva"
                  className="text-xs rounded-xl h-9"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold flex items-center justify-between">
                  <span>WhatsApp / Celular *</span>
                  <span className="text-[10px] text-emerald-600 font-normal">Ex: 22 99850-5276</span>
                </Label>
                <Input
                  value={editWhatsapp}
                  onChange={e => setEditWhatsapp(e.target.value)}
                  placeholder="(22) 99850-5276 ou 22998505276"
                  required
                  className="text-xs rounded-xl h-9 font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  O sistema padroniza automaticamente com o DDI do Brasil (55) ao salvar.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Chave PIX (Para o Fechamento Quinzenal)</Label>
                <Input
                  value={editPixKey}
                  onChange={e => setEditPixKey(e.target.value)}
                  placeholder="Ex: CPF, Telefone ou E-mail da colaboradora"
                  className="text-xs rounded-xl h-9 font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Aparecerá no relatório de fechamento de quinzena enviado no WhatsApp dela.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <Label className="text-xs font-bold cursor-pointer">Colaboradora Ativa</Label>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditCleanerModalOpen(false)}
                  className="rounded-xl h-9 text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingCleaner}
                  className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground"
                >
                  {savingCleaner ? "Salvando..." : "Salvar Dados"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL: VER TEXTO DO HISTÓRICO
            ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
          <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Mensagem Enviada
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedHistoryItem?.userName} • {selectedHistoryItem?.phone} • {selectedHistoryItem?.sentAt ? new Date(selectedHistoryItem.sentAt).toLocaleString("pt-BR") : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="pt-2">
              <WhatsAppMessageBubble
                text={selectedHistoryItem?.message || ""}
                time={selectedHistoryItem?.sentAt ? new Date(selectedHistoryItem.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "18:00"}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setHistoryModalOpen(false)}
                className="rounded-xl h-9 text-xs font-bold"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL: PAGAR / VALE
            ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                {payType === "advance"
                  ? <><Gift className="w-5 h-5 text-amber-500" /> Dar Vale</>
                  : <><Banknote className="w-5 h-5 text-emerald-600" /> Pagar Camareira</>}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {payingMaid?.name || payingMaid?.username} — Saldo atual: {" "}
                <strong>{payingMaid?.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handlePay} className="space-y-4 pt-2">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayType("payment")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${payType === "payment" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border/60 text-muted-foreground hover:border-emerald-500/40"}`}
                >
                  <Banknote className="w-4 h-4" /> Pagamento PIX
                </button>
                <button
                  type="button"
                  onClick={() => setPayType("advance")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${payType === "advance" ? "bg-amber-500 text-white border-amber-500" : "bg-card border-border/60 text-muted-foreground hover:border-amber-500/40"}`}
                >
                  <Gift className="w-4 h-4" /> Vale (adiantamento)
                </button>
              </div>

              {payType === "payment" && !payingMaid?.pixKey && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-500/8 border border-amber-500/20 text-amber-700 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Esta camareira não tem chave PIX cadastrada. O pagamento será registrado sem envio bancário.
                </div>
              )}

              {/* Valor */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Valor (R\$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="rounded-xl h-11 text-lg font-black text-center"
                  required
                />
                {payType === "payment" && payingMaid && payingMaid.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmount(payingMaid.balance.toFixed(2))}
                    className="text-[10px] text-primary underline font-bold"
                  >
                    Usar saldo completo ({payingMaid.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
                  </button>
                )}
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição (opcional)</Label>
                <Input
                  placeholder={payType === "advance" ? "ex: Vale para compras" : "ex: Pagamento 1ª quinzena de setembro"}
                  value={payDescription}
                  onChange={(e) => setPayDescription(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>

              <div className="text-[10px] text-muted-foreground p-2.5 rounded-xl bg-muted/40 border border-border/40">
                {payType === "payment"
                  ? "✅ O PIX será enviado automaticamente para a chave cadastrada da camareira, e ela receberá uma notificação no WhatsApp."
                  : "🎫 O vale será descontado do próximo pagamento e registrado no extrato. A camareira será notificada no WhatsApp."}
              </div>

              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={payingLoading || !payAmount}
                  className={`rounded-xl h-9 text-xs font-bold gap-1.5 ${payType === "advance" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"} text-white`}
                >
                  {payingLoading ? "Processando..." : payType === "advance" ? "Registrar Vale" : "Pagar Agora"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL: EXTRATO DA CAMAREIRA
            ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={statementModalOpen} onOpenChange={setStatementModalOpen}>
          <DialogContent className="sm:max-w-2xl bg-card border border-border rounded-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Extrato — {selectedMaidStatement?.userName}
              </DialogTitle>
              <DialogDescription className="text-xs flex items-center gap-4">
                <span>
                  Saldo atual: <strong className={selectedMaidStatement && selectedMaidStatement.balance >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {selectedMaidStatement?.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—"}
                  </strong>
                </span>
                {selectedMaidStatement?.pixKey && (
                  <span>PIX: <code className="text-[10px] bg-muted px-1 rounded">{selectedMaidStatement.pixKey}</code></span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 -mx-2 px-2">
              {loadingStatement ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Carregando extrato...</div>
              ) : !selectedMaidStatement?.statement?.length ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma movimentação ainda.</div>
              ) : (
                <div className="space-y-2 py-2">
                  {selectedMaidStatement.statement.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${entry.entryType === "credit" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}
                    >
                      {/* Ícone */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${entry.entryType === "credit" ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                        {entry.entryType === "credit"
                          ? <ArrowUpRight className="w-4 h-4" />
                          : <ArrowDownLeft className="w-4 h-4" />}
                      </div>

                      {/* Descrição */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {entry.entryDate ? entry.entryDate.split("-").reverse().join("/") : "—"}
                          </span>
                          {entry.payment?.interTxId && (
                            <span className="text-[10px] text-primary font-mono">
                              TxID: {entry.payment.interTxId.substring(0, 16)}…
                            </span>
                          )}
                          {entry.payment?.interSimulated && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">Simulado</Badge>
                          )}
                          {entry.payment?.type === "advance" && (
                            <Badge className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/15 text-amber-700 border-amber-500/20">Vale</Badge>
                          )}
                        </div>
                      </div>

                      {/* Valor */}
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${entry.entryType === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                          {entry.entryType === "credit" ? "+" : "−"}{Number(entry.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Saldo: {Number(entry.balanceAfter).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 border-t border-border/60 flex-row justify-between items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!selectedMaidStatement) return
                  try {
                    const res = await fetch("/api/maids/statement/send-whatsapp", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: selectedMaidStatement.userId }),
                    })
                    const data = await res.json()
                    toast({
                      title: data.success ? "✓ Extrato Enviado!" : "Falha no envio",
                      description: data.message || data.error,
                      variant: data.success ? "default" : "destructive",
                    })
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" })
                  }
                }}
                className="rounded-xl text-xs font-bold gap-1.5 h-9"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar p/ WhatsApp
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStatementModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  )
}
