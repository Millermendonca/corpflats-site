import { useState, useEffect } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { 
  ScrollText, 
  RefreshCw, 
  Download, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info, 
  CreditCard, 
  CalendarDays, 
  Sparkles, 
  KeyRound, 
  Laptop, 
  Copy, 
  Check, 
  Activity
} from "lucide-react"

interface AuditLog {
  id: number
  timestamp: string
  level: "info" | "success" | "warning" | "error" | "critical"
  category: "reservation" | "payment" | "cleaning" | "auth" | "site" | "integration" | "system"
  action: string
  actor: {
    id?: number
    name?: string
    role?: string
    email?: string
    phone?: string
    ip?: string
  }
  details: Record<string, any>
  source?: string
  ip?: string
  userAgent?: string
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLevel, setSelectedLevel] = useState<string>("all")
  
  // Modal de Detalhes
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedCategory !== "all") params.append("category", selectedCategory)
      if (selectedLevel !== "all") params.append("level", selectedLevel)
      if (searchTerm.trim()) params.append("search", searchTerm.trim())
      params.append("limit", "150")

      const res = await fetch(`/api/audit-logs?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setStats(data.stats || null)
      }
    } catch (err) {
      console.error("Erro ao buscar logs:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [selectedCategory, selectedLevel])

  // Polling em tempo real se auto-refresh ativo
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchLogs()
    }, 6000)
    return () => clearInterval(interval)
  }, [autoRefresh, selectedCategory, selectedLevel, searchTerm])

  const handleCopyJson = () => {
    if (!selectedLog) return
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportCsv = () => {
    window.open("/api/audit-logs/export", "_blank")
  }

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            SUCESSO
          </span>
        )
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            ALERTA
          </span>
        )
      case "error":
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse">
            <XCircle className="w-3 h-3 text-rose-600" />
            ERRO
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <Info className="w-3 h-3 text-sky-600" />
            INFO
          </span>
        )
    }
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "reservation":
        return <CalendarDays className="w-3.5 h-3.5 text-sky-600" />
      case "payment":
        return <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
      case "cleaning":
        return <Sparkles className="w-3.5 h-3.5 text-amber-600" />
      case "auth":
        return <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
      case "system":
        return <Laptop className="w-3.5 h-3.5 text-slate-600" />
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-500" />
    }
  }

  const formatLogDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " • " + d.toLocaleDateString("pt-BR")
    } catch {
      return dateStr
    }
  }

  const filteredLogs = logs.filter(log => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    const matchAction = log.action?.toLowerCase().includes(term)
    const matchActor = JSON.stringify(log.actor || {}).toLowerCase().includes(term)
    const matchDetails = JSON.stringify(log.details || {}).toLowerCase().includes(term)
    const matchIp = log.ip?.toLowerCase().includes(term)
    return matchAction || matchActor || matchDetails || matchIp
  })

  return (
    <Shell>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 pb-28">
        {/* Cabeçalho Principal */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold shadow-xs">
                <ScrollText className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Logs & Auditoria do Sistema
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge className="bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 font-bold text-[10px]">
                    🛡️ Fail-Safe Audit Trail (PostgreSQL + JSONL)
                  </Badge>
                  <span className="text-[11px] text-slate-400">
                    {filteredLogs.length} eventos carregados
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 h-9 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                autoRefresh
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:border-slate-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-500 animate-ping" : "bg-slate-400"}`} />
              <span>{autoRefresh ? "Ao Vivo (6s)" : "Pausado"}</span>
            </button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </Button>

            <Button
              size="sm"
              onClick={handleExportCsv}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 h-9 px-4 rounded-xl shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </Button>
          </div>
        </div>

        {/* 4 Cards de Métricas em Tempo Real */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-500" />
              Total de Eventos (24h)
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {stats?.last24hCount ?? stats?.total ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">Transações e ações auditadas</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
              Pagamentos Registrados
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {stats?.paymentsCount ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">PIX Inter & Cartão Mercado Pago</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Governança & Limpezas
            </span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {stats?.cleaningsCount ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">Check-ins, vistorias e quartos</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              Erros & Alertas
            </span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {stats?.errorsCount ?? 0}
            </div>
            <p className="text-[10px] text-slate-400">Falhas capturadas automaticamente</p>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Campo de Busca Rápida */}
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por reserva, hóspede, flat, IP ou ação..."
                  className="pl-9 text-xs h-10 rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>

              {/* Filtro por Categoria */}
              <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                {[
                  { id: "all", label: "Todas Categorias" },
                  { id: "reservation", label: "📅 Reservas" },
                  { id: "payment", label: "💳 Pagamentos" },
                  { id: "cleaning", label: "🧹 Governança" },
                  { id: "auth", label: "🔑 Segurança" },
                  { id: "system", label: "⚙️ Sistema" },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedCategory === cat.id
                        ? "bg-sky-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Filtro por Nível */}
              <div className="flex items-center gap-1 w-full md:w-auto">
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(e.target.value)}
                  className="h-10 px-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Todos os Níveis</option>
                  <option value="success">✓ Sucesso</option>
                  <option value="info">ℹ️ Informativo</option>
                  <option value="warning">⚠️ Alertas</option>
                  <option value="error">❌ Erros / Falhas</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela Feed de Logs */}
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Nível</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Ação / Evento</th>
                  <th className="py-3 px-4">Ator / Usuário</th>
                  <th className="py-3 px-4">Resumo dos Dados</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <span>Nenhum registro de log encontrado para os filtros selecionados.</span>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatLogDate(log.timestamp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getLevelBadge(log.level)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {getCategoryIcon(log.category)}
                          <span className="capitalize">{log.category}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-[11px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="font-bold">{log.actor?.name || "Sistema"}</span>
                        {log.actor?.role && (
                          <span className="text-[10px] text-slate-400 block">({log.actor.role})</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-[11px] max-w-xs truncate font-mono">
                        {JSON.stringify(log.details || {}).replace(/["{}]/g, " ").trim()}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-bold text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg"
                        >
                          Ver JSON
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Modal de Inspeção Detalhada do Log */}
        <Dialog open={Boolean(selectedLog)} onOpenChange={open => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-black flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-sky-600" />
                  <span>Detalhes do Evento #{selectedLog?.id}</span>
                </DialogTitle>
                {selectedLog && getLevelBadge(selectedLog.level)}
              </div>
              <DialogDescription className="text-xs text-slate-500">
                Registrado em {selectedLog ? formatLogDate(selectedLog.timestamp) : ""}
              </DialogDescription>
            </DialogHeader>

            {selectedLog && (
              <div className="space-y-3 text-xs">
                {/* Meta info bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Categoria</span>
                    <span className="font-bold capitalize">{selectedLog.category}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Ação</span>
                    <span className="font-mono font-bold">{selectedLog.action}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Ator</span>
                    <span className="font-bold">{selectedLog.actor?.name || "Sistema"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Origem</span>
                    <span className="font-mono text-slate-500">{selectedLog.source || "server"}</span>
                  </div>
                </div>

                {/* IP / User Agent */}
                {(selectedLog.ip || selectedLog.userAgent) && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-0.5">
                    {selectedLog.ip && <div><strong>IP:</strong> {selectedLog.ip}</div>}
                    {selectedLog.userAgent && <div className="truncate"><strong>Agente:</strong> {selectedLog.userAgent}</div>}
                  </div>
                )}

                {/* JSON Body */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Payload Completo (JSON)</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyJson}
                      className="h-7 text-xs font-bold gap-1 text-slate-600 hover:text-slate-900"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copiado!" : "Copiar"}</span>
                    </Button>
                  </div>
                  <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-80 border border-slate-800 leading-relaxed">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                className="w-full rounded-xl text-xs font-bold"
                onClick={() => setSelectedLog(null)}
              >
                Fechar Detalhes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
