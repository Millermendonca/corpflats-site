import { useState, useEffect } from "react"
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

interface MaidStatementData {
  userId: number
  userName: string
  pixKey: string
  balance: number
  statement: StatementEntry[]
}

export default function MaidStatementPage() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  const [statementData, setStatementData] = useState<MaidStatementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingWa, setSendingWa] = useState(false)

  // Admin cleaner selector
  const [cleanersList, setCleanersList] = useState<any[]>([])
  const [selectedCleanerId, setSelectedCleanerId] = useState<string>("")

  // Pay Modal State
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
          description: `O resumo financeiro detalhado foi enviado para o WhatsApp cadastrado (${data.phone}).`,
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

  const balance = statementData?.balance || 0
  const balancePositive = balance >= 0

  return (
    <Shell>
      <div className="space-y-6 max-w-6xl mx-auto pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-bold tracking-wide uppercase px-2.5 py-0.5 border-primary/30 text-primary bg-primary/5">
                💰 Financeiro & Governança
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold">
                Extrato em Tempo Real
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <Wallet className="w-7 h-7 text-emerald-600" />
              {isAdmin ? "Extrato Financeiro das Camareiras" : "Meu Extrato de Diárias"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
              Acompanhe todas as diárias de quartos limpos, pagamentos PIX recebidos e vales realizados, com saldo progressivo e comprovantes bancários.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Seletor de Camareira para o Admin */}
            {isAdmin && cleanersList.length > 0 && (
              <select
                value={selectedCleanerId}
                onChange={e => setSelectedCleanerId(e.target.value)}
                className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground"
              >
                {cleanersList.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name || c.username} — Saldo: R$ {Number(c.balance || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStatement(isAdmin ? selectedCleanerId : undefined)}
              disabled={loading}
              className="rounded-xl text-xs font-bold gap-1.5 h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Saldo e Botões de Ação */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card Saldo em Destaque */}
          <Card className={`rounded-3xl border shadow-sm p-6 lg:col-span-2 ${balancePositive ? "bg-emerald-500/5 border-emerald-500/30" : "bg-rose-500/5 border-rose-500/30"}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  {isAdmin ? `Saldo Atual — ${statementData?.userName || "Camareira"}` : "Meu Saldo a Receber"}
                </p>
                <div className={`text-4xl sm:text-5xl font-black ${balancePositive ? "text-emerald-600" : "text-rose-600"}`}>
                  R$ {balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
                  {statementData?.pixKey ? (
                    <Badge variant="secondary" className="font-mono text-[11px] gap-1 px-2.5 py-1">
                      🔑 Chave PIX: {statementData.pixKey}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[11px] gap-1">
                      ⚠️ Chave PIX não cadastrada
                    </Badge>
                  )}
                </div>
              </div>

              {/* Botão WhatsApp */}
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  onClick={handleSendWhatsApp}
                  disabled={sendingWa}
                  className="h-12 px-5 rounded-2xl font-black text-xs gap-2 bg-[#25d366] hover:bg-[#20bd5a] text-white shadow-md shadow-[#25d366]/20 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{sendingWa ? "Enviando..." : "Enviar Extrato p/ WhatsApp"}</span>
                </Button>

                {isAdmin && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setPayType("payment")
                        setPayAmount(String(Math.max(0, balance).toFixed(2)))
                        setPayDescription("")
                        setPayModalOpen(true)
                      }}
                      className="h-9 rounded-xl text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      Pagar PIX
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPayType("advance")
                        setPayAmount("")
                        setPayDescription("")
                        setPayModalOpen(true)
                      }}
                      className="h-9 rounded-xl text-xs font-bold gap-1 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      Dar Vale
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Card Resumo Rápido */}
          <Card className="rounded-3xl border border-border shadow-xs p-6 bg-card flex flex-col justify-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Demonstrativo Auditável</p>
                <p className="text-[11px] text-muted-foreground">Atualizado a cada quarto finalizado</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/60">
              <div className="flex justify-between">
                <span>Diárias Realizadas:</span>
                <strong className="text-foreground">{statementData?.statement?.filter(s => s.entryType === "credit").length || 0}</strong>
              </div>
              <div className="flex justify-between">
                <span>Pagamentos & Vales:</span>
                <strong className="text-foreground">{statementData?.statement?.filter(s => s.entryType === "debit").length || 0}</strong>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabela de Extrato de Movimentações */}
        <Card className="rounded-3xl border border-border shadow-xs overflow-hidden">
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
            ) : !statementData?.statement?.length ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                Nenhuma movimentação registrada no extrato até o momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Tipo</th>
                      <th className="p-3.5">Data</th>
                      <th className="p-3.5">Descrição</th>
                      <th className="p-3.5 text-center">TxID / Comprovante</th>
                      <th className="p-3.5 text-right">Valor</th>
                      <th className="p-3.5 text-right">Saldo Após</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {statementData.statement.map(entry => {
                      const isCredit = entry.entryType === "credit"
                      const isAdvance = entry.payment?.type === "advance"
                      return (
                        <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isCredit ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                                {isCredit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                              </div>
                              <span className={`font-bold ${isCredit ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                                {isCredit ? "Crédito Diária" : isAdvance ? "Vale Adiantado" : "Pagamento PIX"}
                              </span>
                            </div>
                          </td>

                          <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                            {entry.entryDate ? entry.entryDate.split("-").reverse().join("/") : "—"}
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal Pagar / Vale (Admin) */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                {payType === "advance"
                  ? <><Gift className="w-5 h-5 text-amber-500" /> Dar Vale</>
                  : <><Banknote className="w-5 h-5 text-emerald-600" /> Pagar Camareira</>}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {statementData?.userName} — Saldo a pagar: <strong>R$ {balance.toFixed(2)}</strong>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handlePay} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayType("payment")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${payType === "payment" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border/60 text-muted-foreground"}`}
                >
                  <Banknote className="w-4 h-4" /> Pagamento PIX
                </button>
                <button
                  type="button"
                  onClick={() => setPayType("advance")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${payType === "advance" ? "bg-amber-500 text-white border-amber-500" : "bg-card border-border/60 text-muted-foreground"}`}
                >
                  <Gift className="w-4 h-4" /> Vale (adiantamento)
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="rounded-xl h-11 text-lg font-black text-center"
                  required
                />
                {payType === "payment" && balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmount(balance.toFixed(2))}
                    className="text-[10px] text-primary underline font-bold"
                  >
                    Usar saldo completo (R$ {balance.toFixed(2)})
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição (opcional)</Label>
                <Input
                  placeholder={payType === "advance" ? "ex: Vale para compras" : "ex: Pagamento quinzena"}
                  value={payDescription}
                  onChange={e => setPayDescription(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
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
      </div>
    </Shell>
  )
}
