import { useState, useEffect, useMemo } from "react"
import { Shell } from "@/components/layout"
import { useGetMe } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Send,
  RefreshCw,
  Gift,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  ExternalLink,
  Copy,
  Check,
  Filter,
  Sparkles,
  Calendar,
  Clock,
  ShieldCheck,
  ChevronRight,
  Building2,
  FileSpreadsheet,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface StatementEntry {
  id: string
  userId: number
  cleaningRequestId?: string | null
  paymentId?: string | null
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
    createdAt?: string
  } | null
}

interface MaidStatementData {
  userId: number
  userName: string
  pixKey: string
  balance: number
  statement: StatementEntry[]
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  const parts = dateStr.substring(0, 10).split("-")
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

function formatTime(isoStr?: string) {
  if (!isoStr) return ""
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

export default function MaidStatementPage() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  const [statementData, setStatementData] = useState<MaidStatementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingWa, setSendingWa] = useState(false)
  const [copiedPix, setCopiedPix] = useState(false)

  // Admin cleaner selector
  const [cleanersList, setCleanersList] = useState<any[]>([])
  const [selectedCleanerId, setSelectedCleanerId] = useState<string>("")

  // Filter: "all" | "credits" | "debits"
  const [filterType, setFilterType] = useState<"all" | "credits" | "debits">("all")

  // Receipt Modal State
  const [selectedEntry, setSelectedEntry] = useState<StatementEntry | null>(null)
  const [copiedReceipt, setCopiedReceipt] = useState(false)

  // Pay / Advance Modal State (Admin)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payType, setPayType] = useState<"payment" | "advance">("payment")
  const [payAmount, setPayAmount] = useState("")
  const [payDescription, setPayDescription] = useState("")
  const [payingLoading, setPayingLoading] = useState(false)

  // Carrega lista de camareiras se for admin
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/maids/all-balances")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setCleanersList(data)
            if (data.length > 0 && !selectedCleanerId) {
              setSelectedCleanerId(String(data[0].id))
            }
          }
        })
        .catch(() => {})
    }
  }, [isAdmin])

  // Carrega extrato
  const fetchStatement = async (userId?: string) => {
    try {
      setLoading(true)
      const url = isAdmin && userId
        ? `/api/maids/${userId}/statement`
        : `/api/maids/statement/me`
      const res = await fetch(url)
      if (res.ok) {
        setStatementData(await res.json())
      }
    } catch (err: any) {
      toast({
        title: "Erro ao carregar extrato",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loadingUser) {
      if (isAdmin && selectedCleanerId) {
        fetchStatement(selectedCleanerId)
      } else if (!isAdmin) {
        fetchStatement()
      }
    }
  }, [loadingUser, isAdmin, selectedCleanerId])

  // Copiar chave PIX
  const handleCopyPixKey = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!statementData?.pixKey) return
    navigator.clipboard.writeText(statementData.pixKey)
    setCopiedPix(true)
    toast({
      title: "Chave PIX copiada!",
      description: statementData.pixKey,
    })
    setTimeout(() => setCopiedPix(false), 2500)
  }

  // Enviar extrato para WhatsApp
  const handleSendWhatsApp = async () => {
    try {
      setSendingWa(true)
      const targetUserId = statementData?.userId || user?.id
      const res = await fetch("/api/maids/statement/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId }),
      })
      const data = await res.json()
      if (res.ok && (data.success || data.simulated)) {
        toast({
          title: "✓ Extrato Enviado com Sucesso!",
          description: `O resumo financeiro detalhado foi enviado para o WhatsApp cadastrado (${data.phone || ""}).`,
        })
      } else {
        toast({
          title: "Falha no Envio",
          description: data.error || data.message || "Verifique se o WhatsApp está cadastrado.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setSendingWa(false)
    }
  }

  // Realizar pagamento ou vale (Admin)
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetId = statementData?.userId
    if (!targetId) return

    const amount = parseFloat(payAmount.replace(",", "."))
    if (!amount || amount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" })
      return
    }

    try {
      setPayingLoading(true)
      const res = await fetch(`/api/maids/${targetId}/pay`, {
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
        fetchStatement(String(targetId))
      } else {
        toast({ title: "Erro no pagamento", description: data.error || "Falha ao processar.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setPayingLoading(false)
    }
  }

  // Copiar dados do comprovante
  const handleCopyReceiptText = () => {
    if (!selectedEntry) return
    const isCredit = selectedEntry.entryType === "credit"
    const isAdvance = selectedEntry.payment?.type === "advance"
    const txType = isCredit ? "Crédito por Diária Concluída" : isAdvance ? "Vale Adiantamento" : "Pagamento PIX"
    
    const text = `🏨 *CorpFlats Soho — Comprovante de Lançamento*
----------------------------------------
*Tipo:* ${txType}
*Colaboradora:* ${statementData?.userName || "Camareira"}
*Chave PIX:* ${statementData?.pixKey || "Não cadastrada"}
*Data:* ${formatDate(selectedEntry.entryDate)} ${selectedEntry.createdAt && formatTime(selectedEntry.createdAt) ? `às ${formatTime(selectedEntry.createdAt)}` : ""}
*Descrição:* ${selectedEntry.description}
*Valor:* ${isCredit ? "+" : "−"} R$ ${Number(selectedEntry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
*Saldo Resultante:* R$ ${Number(selectedEntry.balanceAfter || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
${selectedEntry.payment?.interTxId ? `*TxID / Autenticação:* ${selectedEntry.payment.interTxId}\n*Banco:* Banco Inter S.A.` : "*Registro:* Auditado e registrado no sistema"}
----------------------------------------
Comprovante digital emitido em ${new Date().toLocaleDateString("pt-BR")}`

    navigator.clipboard.writeText(text)
    setCopiedReceipt(true)
    toast({
      title: "Comprovante copiado!",
      description: "Cole no WhatsApp para envio rápido.",
    })
    setTimeout(() => setCopiedReceipt(false), 2500)
  }

  const balance = statementData?.balance || 0
  const balancePositive = balance >= 0

  // Cálculo de estatísticas rápidas
  const rawList = statementData?.statement || []
  const creditEntries = useMemo(() => rawList.filter(e => e.entryType === "credit"), [rawList])
  const debitEntries = useMemo(() => rawList.filter(e => e.entryType === "debit"), [rawList])

  const totalEarned = useMemo(() => creditEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [creditEntries])
  const totalWithdrawn = useMemo(() => debitEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [debitEntries])

  // Filtragem da lista
  const filteredList = useMemo(() => {
    if (filterType === "credits") return creditEntries
    if (filterType === "debits") return debitEntries
    return rawList
  }, [filterType, rawList, creditEntries, debitEntries])

  return (
    <Shell>
      <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto px-3 sm:px-6 pt-2 sm:pt-4 pb-32 sm:pb-20">
        
        {/* Header Superior Mobile-Friendly */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border-primary/30 text-primary bg-primary/5">
                💰 Extrato & Diárias
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                Ao Vivo
              </Badge>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600 shrink-0" />
              <span>{isAdmin ? "Extrato Financeiro" : "Meu Extrato de Diárias"}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2 sm:line-clamp-none">
              Diárias de quartos limpos, pagamentos PIX e vales com saldo progressivo auditado.
            </p>
          </div>

          {/* Seletor de Camareira (Admin) & Botão Atualizar */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isAdmin && cleanersList.length > 0 && (
              <div className="flex-1 sm:w-72">
                <select
                  value={selectedCleanerId}
                  onChange={e => setSelectedCleanerId(e.target.value)}
                  className="w-full h-10 sm:h-11 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {cleanersList.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name || c.username} — Saldo: R$ {Number(c.balance || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStatement(isAdmin ? selectedCleanerId : undefined)}
              disabled={loading}
              className="h-10 sm:h-11 px-3.5 rounded-xl text-xs font-bold gap-1.5 shrink-0"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* 💳 Card Principal de Saldo Fintech (Estilo Nubank / Inter) */}
        <div className={`rounded-3xl p-5 sm:p-7 border shadow-md relative overflow-hidden transition-all ${
          balancePositive 
            ? "bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white border-emerald-500/40 shadow-emerald-950/20" 
            : "bg-gradient-to-br from-rose-600 via-rose-700 to-slate-900 text-white border-rose-500/40 shadow-rose-950/20"
        }`}>
          {/* Efeito decorativo de fundo */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-10 w-40 h-40 bg-black/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4">
            
            {/* Linha Superior do Card */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-100/90 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                {isAdmin ? `Saldo Disponível • ${statementData?.userName || "Camareira"}` : "Saldo a Receber"}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Tempo Real
              </span>
            </div>

            {/* Valor do Saldo em Destaque */}
            <div>
              <div className="text-3xl sm:text-5xl font-black tracking-tight drop-shadow-sm">
                R$ {balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>

              {/* Chave PIX com botão de copiar */}
              <div className="mt-2 flex items-center">
                {statementData?.pixKey ? (
                  <button
                    type="button"
                    onClick={handleCopyPixKey}
                    className="inline-flex items-center gap-1.5 bg-black/25 hover:bg-black/40 text-emerald-100 text-xs font-mono px-3 py-1.5 rounded-xl border border-white/15 backdrop-blur-sm active:scale-95 transition-all text-left"
                    title="Clique para copiar a chave PIX"
                  >
                    <span className="font-sans font-bold text-[10px] text-emerald-300 uppercase">PIX:</span>
                    <span className="truncate max-w-[180px] sm:max-w-xs">{statementData.pixKey}</span>
                    {copiedPix ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0 ml-1" />
                    ) : (
                      <Copy className="w-3 h-3 text-white/70 shrink-0 ml-1" />
                    )}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-200 bg-amber-950/40 px-2.5 py-1 rounded-xl border border-amber-500/30">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    Chave PIX não informada no cadastro
                  </span>
                )}
              </div>
            </div>

            {/* Botões de Ação na Tela (Otimizados para Toque com Polegar) */}
            <div className="pt-2 border-t border-white/15 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              
              {/* Botão de Enviar WhatsApp (Aparece para camareira e também para o admin) */}
              <Button
                onClick={handleSendWhatsApp}
                disabled={sendingWa}
                className="h-11 sm:h-12 rounded-2xl font-black text-xs gap-2 bg-[#25d366] hover:bg-[#20bd5a] text-white shadow-md shadow-black/20 transition-transform active:scale-[0.98] flex-1"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>{sendingWa ? "Enviando Extrato..." : "Enviar Extrato no WhatsApp"}</span>
              </Button>

              {/* Botões Administrativos: Pagar PIX e Dar Vale */}
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                  <Button
                    onClick={() => {
                      setPayType("payment")
                      setPayAmount(balance > 0 ? balance.toFixed(2) : "")
                      setPayDescription("")
                      setPayModalOpen(true)
                    }}
                    className="h-11 sm:h-12 px-4 rounded-2xl text-xs font-black gap-1.5 bg-white text-slate-900 hover:bg-slate-100 shadow-md transition-transform active:scale-[0.98]"
                  >
                    <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Pagar PIX</span>
                  </Button>

                  <Button
                    onClick={() => {
                      setPayType("advance")
                      setPayAmount("")
                      setPayDescription("")
                      setPayModalOpen(true)
                    }}
                    className="h-11 sm:h-12 px-4 rounded-2xl text-xs font-black gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md transition-transform active:scale-[0.98]"
                  >
                    <Gift className="w-4 h-4 text-amber-900 shrink-0" />
                    <span>Dar Vale</span>
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* 📊 Faixa de Resumo Financeiro Rápido (Entradas vs Saídas) */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          
          {/* Entradas / Diárias */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Diárias Realizadas
              </span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-base sm:text-xl font-black text-emerald-600 dark:text-emerald-400">
                + R$ {totalEarned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">
                {creditEntries.length} {creditEntries.length === 1 ? "quarto concluído" : "quartos concluídos"}
              </span>
            </div>
          </div>

          {/* Saídas / Pagamentos e Vales */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Pagos & Vales
              </span>
              <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-base sm:text-xl font-black text-rose-600 dark:text-rose-400">
                − R$ {totalWithdrawn.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">
                {debitEntries.length} {debitEntries.length === 1 ? "saída registrada" : "saídas registradas"}
              </span>
            </div>
          </div>

        </div>

        {/* 📑 Barra de Filtros Rápidos (Fintech Standard) */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                filterType === "all"
                  ? "bg-foreground text-background shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas ({rawList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("credits")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                filterType === "credits"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-emerald-600"
              }`}
            >
              <ArrowUpRight className="w-3 h-3" />
              Diárias ({creditEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("debits")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                filterType === "debits"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-rose-600"
              }`}
            >
              <ArrowDownLeft className="w-3 h-3" />
              Pagamentos & Vales ({debitEntries.length})
            </button>
          </div>

          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Toque em um item para ver o comprovante
          </span>
        </div>

        {/* 📱 1. VISÃO MOBILE: Feed em Cartões Otimizados (md:hidden) */}
        <div className="block md:hidden space-y-2">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">
              Carregando movimentações...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-card">
              <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs font-bold text-foreground">Nenhuma movimentação nesta visualização</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {filterType !== "all" ? "Tente alterar o filtro acima." : "Nenhuma diária ou pagamento registrado ainda."}
              </p>
            </div>
          ) : (
            filteredList.map(entry => {
              const isCredit = entry.entryType === "credit"
              const isAdvance = entry.payment?.type === "advance"

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="p-3.5 bg-card border border-border/80 hover:border-primary/50 active:scale-[0.99] rounded-2xl shadow-2xs flex items-center justify-between gap-3 transition-all cursor-pointer"
                >
                  {/* Ícone Indicador */}
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    isCredit 
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                      : isAdvance 
                        ? "bg-amber-500/15 text-amber-600" 
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  }`}>
                    {isCredit ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : isAdvance ? (
                      <Gift className="w-5 h-5" />
                    ) : (
                      <Banknote className="w-5 h-5" />
                    )}
                  </div>

                  {/* Informações Centrais */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-foreground truncate">
                        {entry.description}
                      </span>
                      {isAdvance && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          Vale
                        </span>
                      )}
                      {entry.payment?.interSimulated && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                          Simulado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span>{formatDate(entry.entryDate)}</span>
                      {entry.createdAt && formatTime(entry.createdAt) && (
                        <>
                          <span>•</span>
                          <span>{formatTime(entry.createdAt)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="font-semibold text-foreground/80">
                        Saldo: R$ {Number(entry.balanceAfter || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Valor e Ação */}
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-black tracking-tight ${
                      isCredit 
                        ? "text-emerald-600 dark:text-emerald-400" 
                        : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {isCredit ? "+" : "−"} R$ {Number(entry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-semibold flex items-center justify-end gap-0.5 mt-0.5">
                      Recibo <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 💻 2. VISÃO DESKTOP: Tabela Completa Auditável (hidden md:block) */}
        <Card className="hidden md:block rounded-3xl border border-border shadow-xs overflow-hidden">
          <CardHeader className="p-5 bg-muted/20 border-b border-border flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                Histórico de Movimentações Financeiras
              </CardTitle>
              <CardDescription className="text-xs">
                (+) Crédito por diária concluída | (−) Débito por pagamento via PIX ou vale concedido
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-xs text-muted-foreground">Carregando movimentações...</div>
            ) : filteredList.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                Nenhuma movimentação encontrada com o filtro selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Tipo</th>
                      <th className="p-3.5">Data & Hora</th>
                      <th className="p-3.5">Descrição</th>
                      <th className="p-3.5 text-center">TxID / Autenticação</th>
                      <th className="p-3.5 text-right">Valor</th>
                      <th className="p-3.5 text-right">Saldo Após</th>
                      <th className="p-3.5 text-center">Comprovante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredList.map(entry => {
                      const isCredit = entry.entryType === "credit"
                      const isAdvance = entry.payment?.type === "advance"

                      return (
                        <tr 
                          key={entry.id} 
                          onClick={() => setSelectedEntry(entry)}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                isCredit ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                              }`}>
                                {isCredit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                              </div>
                              <span className={`font-bold ${isCredit ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                                {isCredit ? "Crédito Diária" : isAdvance ? "Vale Adiantado" : "Pagamento PIX"}
                              </span>
                            </div>
                          </td>

                          <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                            <span className="font-semibold text-foreground">{formatDate(entry.entryDate)}</span>
                            {entry.createdAt && (
                              <span className="text-[11px] block text-muted-foreground/80">{formatTime(entry.createdAt)}</span>
                            )}
                          </td>

                          <td className="p-3.5 font-medium text-foreground">
                            {entry.description}
                          </td>

                          <td className="p-3.5 text-center">
                            {entry.payment?.interTxId ? (
                              <div className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted px-2 py-0.5 rounded-lg">
                                <span>{entry.payment.interTxId.substring(0, 14)}…</span>
                                {entry.payment.interSimulated && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">Simulado</Badge>
                                )}
                              </div>
                            ) : isAdvance ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border-amber-500/20">
                                Vale Local
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Auditado</span>
                            )}
                          </td>

                          <td className={`p-3.5 text-right font-black text-sm ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
                            {isCredit ? "+" : "−"} R$ {Number(entry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>

                          <td className="p-3.5 text-right font-bold text-foreground">
                            R$ {Number(entry.balanceAfter || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>

                          <td className="p-3.5 text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs font-bold gap-1 rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedEntry(entry)
                              }}
                            >
                              <Share2 className="w-3 h-3" />
                              Ver
                            </Button>
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

        {/* 🧾 MODAL DE COMPROVANTE DIGITAL DA TRANSAÇÃO */}
        <Dialog open={!!selectedEntry} onOpenChange={open => !open && setSelectedEntry(null)}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-2xl">
            {selectedEntry && (
              <>
                <DialogHeader className="text-center sm:text-center pb-2 border-b border-border/80">
                  <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-2 ${
                    selectedEntry.entryType === "credit"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : selectedEntry.payment?.type === "advance"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-rose-500/15 text-rose-600"
                  }`}>
                    {selectedEntry.entryType === "credit" ? (
                      <ArrowUpRight className="w-6 h-6" />
                    ) : selectedEntry.payment?.type === "advance" ? (
                      <Gift className="w-6 h-6" />
                    ) : (
                      <Banknote className="w-6 h-6" />
                    )}
                  </div>
                  
                  <DialogTitle className="text-base font-black text-center">
                    Comprovante de Lançamento
                  </DialogTitle>
                  <DialogDescription className="text-xs text-center">
                    {selectedEntry.entryType === "credit" 
                      ? "Crédito por Conclusão de Faxina" 
                      : selectedEntry.payment?.type === "advance" 
                        ? "Vale / Adiantamento Financeiro" 
                        : "Pagamento de Diárias via PIX"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-2 text-xs">
                  
                  {/* Valor Principal em Destaque */}
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Valor do Lançamento
                    </span>
                    <div className={`text-2xl sm:text-3xl font-black mt-0.5 ${
                      selectedEntry.entryType === "credit" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {selectedEntry.entryType === "credit" ? "+" : "−"} R$ {Number(selectedEntry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium block mt-1">
                      Saldo restante após este item: <strong>R$ {Number(selectedEntry.balanceAfter || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                    </span>
                  </div>

                  {/* Dados Detalhados */}
                  <div className="space-y-2 rounded-2xl p-3.5 bg-card border border-border">
                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Descrição:</span>
                      <strong className="text-foreground text-right">{selectedEntry.description}</strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Colaboradora:</span>
                      <strong className="text-foreground">{statementData?.userName || "Camareira"}</strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Data da Operação:</span>
                      <strong className="text-foreground">
                        {formatDate(selectedEntry.entryDate)} {selectedEntry.createdAt && formatTime(selectedEntry.createdAt) ? `às ${formatTime(selectedEntry.createdAt)}` : ""}
                      </strong>
                    </div>

                    {statementData?.pixKey && (
                      <div className="flex justify-between items-center py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Chave PIX:</span>
                        <span className="font-mono font-bold text-foreground text-[11px]">{statementData.pixKey}</span>
                      </div>
                    )}

                    {selectedEntry.payment?.interTxId && (
                      <div className="py-1">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Autenticação Bancária:</span>
                          <Badge variant="outline" className="font-mono text-[9px] text-primary">
                            Banco Inter
                          </Badge>
                        </div>
                        <div className="mt-1 p-2 bg-muted rounded-xl font-mono text-[10px] break-all select-all text-muted-foreground border border-border">
                          {selectedEntry.payment.interTxId}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2 pt-2 flex flex-col sm:flex-row">
                  <Button
                    type="button"
                    onClick={handleCopyReceiptText}
                    className="w-full sm:flex-1 rounded-xl h-10 font-bold text-xs gap-1.5 bg-[#25d366] hover:bg-[#20bd5a] text-white shadow-md shadow-[#25d366]/20"
                  >
                    {copiedReceipt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedReceipt ? "Copiado com Sucesso!" : "Copiar Dados p/ WhatsApp"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedEntry(null)}
                    className="w-full sm:w-auto rounded-xl h-10 text-xs font-bold"
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* 💵 MODAL PAGAR / VALE (ADMIN) */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                {payType === "advance"
                  ? <><Gift className="w-5 h-5 text-amber-500" /> Dar Vale (Adiantamento)</>
                  : <><Banknote className="w-5 h-5 text-emerald-600" /> Pagar Camareira via PIX</>}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {statementData?.userName} — Saldo a pagar: <strong>R$ {balance.toFixed(2)}</strong>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handlePay} className="space-y-4 pt-2">
              {/* Seletor Tipo: Pagamento vs Vale */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayType("payment")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                    payType === "payment" 
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20" 
                      : "bg-card border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Pagamento PIX
                </button>
                <button
                  type="button"
                  onClick={() => setPayType("advance")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                    payType === "advance" 
                      ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20" 
                      : "bg-card border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Gift className="w-4 h-4" /> Vale (Adiantamento)
                </button>
              </div>

              {/* Campo Valor com Atalhos Rápidos */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="rounded-xl h-12 text-2xl font-black text-center"
                  required
                  autoFocus
                />

                {/* Chips de Valor Rápido */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {balance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(balance.toFixed(2))}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      Saldo total: R$ {balance.toFixed(2)}
                    </button>
                  )}
                  {[50, 100, 150, 200].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPayAmount(val.toFixed(2))}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 border border-border transition-colors"
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo Descrição */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição (opcional)</Label>
                <Input
                  placeholder={payType === "advance" ? "ex: Vale adiantamento compras" : "ex: Pagamento diárias semana"}
                  value={payDescription}
                  onChange={e => setPayDescription(e.target.value)}
                  className="rounded-xl h-10 text-xs font-medium"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 flex flex-col sm:flex-row">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setPayModalOpen(false)} 
                  className="rounded-xl h-10 text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={payingLoading || !payAmount}
                  className={`rounded-xl h-10 text-xs font-black gap-1.5 shadow-md flex-1 ${
                    payType === "advance" 
                      ? "bg-amber-500 hover:bg-amber-600 text-white" 
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                >
                  {payingLoading 
                    ? "Processando..." 
                    : payType === "advance" 
                      ? "Registrar Vale Agora" 
                      : "Confirmar Pagamento PIX"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  )
}
