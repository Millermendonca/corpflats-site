import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  CreditCard, Plus, Trash2, CheckCircle2, Sliders, AlertCircle, RefreshCw, Landmark, Percent, DollarSign
} from "lucide-react"

export interface PaymentMethod {
  id: string
  name: string
  gatewayFeeRate: number
  gatewayFeeFixed?: number
  commissionRate: number
  description?: string
  channelDefault?: string | null
  active: boolean
  isSystem?: boolean
}

interface PaymentMethodsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (methods: PaymentMethod[]) => void
  onSelectMethod?: (methodId: string) => void
  initialNewName?: string
}

export function PaymentMethodsModal({ 
  open, 
  onOpenChange, 
  onSaved,
  onSelectMethod,
  initialNewName = ""
}: PaymentMethodsModalProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  // Novo método formulário rápido
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newGatewayRate, setNewGatewayRate] = useState("0")
  const [newGatewayFixed, setNewGatewayFixed] = useState("0")
  const [newCommissionRate, setNewCommissionRate] = useState("0")
  const [newDescription, setNewDescription] = useState("")

  const fetchMethods = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await fetch("/api/finance/payment-methods", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setMethods(data)
          if (onSaved) onSaved(data)
        }
      }
    } catch (e: any) {
      console.error("Erro ao carregar formas de pagamento:", e)
      setErrorMsg("Falha ao carregar formas de pagamento.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchMethods()
      setSuccessMsg("")
      setErrorMsg("")
      if (initialNewName.trim()) {
        setNewName(initialNewName.trim())
        setIsAddingNew(true)
      }
    }
  }, [open, initialNewName])

  const handleUpdateMethod = (id: string, field: keyof PaymentMethod, value: any) => {
    setMethods(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value }
      }
      return m
    }))
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setErrorMsg("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/finance/fee-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethods: methods }),
        credentials: "include"
      })
      if (res.ok) {
        const data = await res.json()
        setSuccessMsg("Taxas e configurações salvas com sucesso! O histórico e relatórios foram recalculados.")
        if (Array.isArray(data.paymentMethods)) {
          setMethods(data.paymentMethods)
          if (onSaved) onSaved(data.paymentMethods)
        }
        setTimeout(() => setSuccessMsg(""), 3500)
      } else {
        setErrorMsg("Erro ao salvar configurações.")
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao salvar configurações.")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setErrorMsg("")
    try {
      const cleanId = newName.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_")
      const payload = {
        id: cleanId,
        name: newName.trim(),
        gatewayFeeRate: Number(newGatewayRate) || 0,
        gatewayFeeFixed: Number(newGatewayFixed) || 0,
        commissionRate: Number(newCommissionRate) || 0,
        description: newDescription.trim() || `Forma de pagamento ${newName.trim()}`,
        active: true
      }

      const res = await fetch("/api/finance/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      })

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.paymentMethods)) {
          setMethods(data.paymentMethods)
          if (onSaved) onSaved(data.paymentMethods)
        }
        if (onSelectMethod) {
          onSelectMethod(cleanId)
        }
        setSuccessMsg(`Forma de pagamento "${newName.trim()}" cadastrada com sucesso!`)
        setNewName("")
        setNewGatewayRate("0")
        setNewGatewayFixed("0")
        setNewCommissionRate("0")
        setNewDescription("")
        setIsAddingNew(false)
        setTimeout(() => setSuccessMsg(""), 3500)
      } else {
        setErrorMsg("Erro ao criar nova forma de pagamento.")
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao criar nova forma de pagamento.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover a forma de pagamento "${name}"?`)) return
    try {
      const res = await fetch(`/api/finance/payment-methods/${id}`, {
        method: "DELETE",
        credentials: "include"
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.paymentMethods)) {
          setMethods(data.paymentMethods)
          if (onSaved) onSaved(data.paymentMethods)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  Configuração de Formas de Pagamento & Taxas
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Ajuste comissões, taxas de gateways e valores aplicados no cálculo financeiro.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsAddingNew(v => !v)}
              className="text-xs h-8 font-semibold gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAddingNew ? "Fechar Cadastro" : "Nova Forma"}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-xl text-xs text-red-800 dark:text-red-200 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulário de Adicionar Nova Forma de Pagamento */}
          {isAddingNew && (
            <form onSubmit={handleCreateNew} className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Cadastrar Nova Forma de Pagamento
                </span>
                <span className="text-[10px] text-muted-foreground">Será adicionada ao dropdown de reservas</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px] font-semibold">Nome da Forma de Pagamento *</Label>
                  <Input 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    placeholder="Ex: Mercado Pago, Transferência TED, Cartão de Débito, Faturamento..." 
                    className="h-8 text-xs font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold flex items-center gap-1">
                    <Percent className="w-3 h-3 text-amber-600" /> Taxa Intermediador / Gateway (%)
                  </Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={newGatewayRate} 
                    onChange={e => setNewGatewayRate(e.target.value)} 
                    placeholder="0.00" 
                    className="h-8 text-xs font-semibold"
                  />
                  <span className="text-[10px] text-muted-foreground">Ex: Mercado Pago 3.99%, Cartão 3.5%, Pix 0%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold flex items-center gap-1">
                    <Percent className="w-3 h-3 text-indigo-600" /> Comissão de Canal / OTA (%)
                  </Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={newCommissionRate} 
                    onChange={e => setNewCommissionRate(e.target.value)} 
                    placeholder="0.00" 
                    className="h-8 text-xs font-semibold"
                  />
                  <span className="text-[10px] text-muted-foreground">Ex: Booking 13% ou 15%, Airbnb 3%, Venda Direta 0%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-slate-600" /> Taxa Fixa por Transação (R$)
                  </Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={newGatewayFixed} 
                    onChange={e => setNewGatewayFixed(e.target.value)} 
                    placeholder="0.00" 
                    className="h-8 text-xs font-semibold"
                  />
                  <span className="text-[10px] text-muted-foreground">Opcional (Ex: R$ 0,50 por boleto/pix)</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Descrição / Observações</Label>
                  <Input 
                    value={newDescription} 
                    onChange={e => setNewDescription(e.target.value)} 
                    placeholder="Ex: Taxa padrão cobrada pela maquininha ou intermediador" 
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsAddingNew(false)}
                  className="h-7 text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={saving || !newName.trim()}
                  className="h-7 text-xs font-bold gap-1"
                >
                  {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Cadastrar & Habilitar
                </Button>
              </div>
            </form>
          )}

          {/* Lista de Formas de Pagamento Existentes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
              <span>Formas Cadastradas ({methods.length})</span>
              <span>Comissão Canal | Taxa Gateway</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                Carregando formas de pagamento...
              </div>
            ) : (
              methods.map(m => {
                const isBooking = m.id === "booking"
                const isAirbnb = m.id === "airbnb"
                const isPix = m.id.includes("pix")
                const isCard = m.id.includes("cartao") || m.id.includes("card") || m.id.includes("mercadopago")

                return (
                  <div 
                    key={m.id}
                    className="p-3 bg-card border border-border/70 rounded-xl space-y-2 hover:border-primary/40 transition-colors text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {isBooking ? "🔵" : (isAirbnb ? "🔴" : (isPix ? "⚡" : (isCard ? "💳" : "💵")))}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span>{m.name}</span>
                            {m.isSystem && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 bg-muted/40 font-normal">
                                Padrão
                              </Badge>
                            )}
                            {m.channelDefault && (
                              <Badge className="text-[9px] py-0 px-1 font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                Padrão Canal {m.channelDefault}
                              </Badge>
                            )}
                          </div>
                          {m.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{m.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!m.isSystem && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(m.id, m.name)}
                            className="h-7 w-7 text-muted-foreground hover:text-red-600 cursor-pointer"
                            title="Excluir forma de pagamento customizada"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-border/40">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] font-semibold text-muted-foreground">Comissão Canal (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={m.commissionRate}
                          onChange={e => handleUpdateMethod(m.id, "commissionRate", Number(e.target.value) || 0)}
                          className="h-7 text-xs font-bold text-indigo-700 dark:text-indigo-300"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <Label className="text-[10px] font-semibold text-muted-foreground">Taxa Gateway / Maquininha (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={m.gatewayFeeRate}
                          onChange={e => handleUpdateMethod(m.id, "gatewayFeeRate", Number(e.target.value) || 0)}
                          className="h-7 text-xs font-bold text-amber-700 dark:text-amber-300"
                        />
                      </div>

                      <div className="space-y-0.5 col-span-2 sm:col-span-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">Taxa Fixa (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={m.gatewayFeeFixed || 0}
                          onChange={e => handleUpdateMethod(m.id, "gatewayFeeFixed", Number(e.target.value) || 0)}
                          className="h-7 text-xs font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="p-3 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8"
          >
            Fechar
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={handleSaveAll}
            className="text-xs h-8 font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-xs"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Salvar Configurações de Taxas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
