import React, { useState, useEffect, useRef } from "react"
import { Link } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle2,
  Sparkles,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export interface ShoppingItem {
  id: string
  title: string
  quantity?: string
  category?: string
  notes?: string
  completed: boolean
  createdBy: {
    id: number
    name: string
    role: string
  }
  createdAt: string
  completedBy?: {
    id: number
    name: string
    role: string
  } | null
  completedAt?: string | null
}

const CATEGORIES = [
  { label: "Limpeza", color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20" },
  { label: "Cama & Banho", color: "text-indigo-700 bg-indigo-500/10 border-indigo-500/20" },
  { label: "Manutenção", color: "text-amber-700 bg-amber-500/10 border-amber-500/20" },
  { label: "Cozinha", color: "text-pink-700 bg-pink-500/10 border-pink-500/20" },
  { label: "Geral", color: "text-slate-700 bg-slate-500/10 border-slate-500/20" },
]

function formatDateBr(isoStr?: string | null): string {
  if (!isoStr) return ""
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoStr.substring(0, 10)
  }
}

interface QuickShoppingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPendingCountChange?: (count: number) => void
}

export function QuickShoppingModal({
  open,
  onOpenChange,
  onPendingCountChange,
}: QuickShoppingModalProps) {
  const { data: user } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  const inputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending")

  // Form states
  const [title, setTitle] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [category, setCategory] = useState("Limpeza")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/shopping-list")
      if (res.ok) {
        const data = await res.json()
        const itemList: ShoppingItem[] = Array.isArray(data) ? data : []
        setItems(itemList)
        const pendingCount = itemList.filter(i => !i.completed).length
        onPendingCountChange?.(pendingCount)
      }
    } catch {
      // Falha silenciosa ou reconexão em background
    } finally {
      setLoading(false)
    }
  }

  // Busca sempre que abrir a modal
  useEffect(() => {
    if (open) {
      fetchItems()
      // Auto-foco com pequeno delay para garantir que o DOM do dialog foi montado
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [open])

  // Busca inicial apenas para atualizar a contagem de pendências no ícone inferior
  useEffect(() => {
    fetch("/api/shopping-list")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          const count = d.filter((i: any) => !i.completed).length
          onPendingCountChange?.(count)
        }
      })
      .catch(() => {})
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          quantity: quantity.trim(),
          category: category.trim() || "Limpeza",
          notes: notes.trim(),
        }),
      })

      if (res.ok) {
        const created: ShoppingItem = await res.json()
        setItems(prev => [created, ...prev])
        onPendingCountChange?.(items.filter(i => !i.completed).length + 1)
        setTitle("")
        setQuantity("")
        setNotes("")
        setCategory("Limpeza")
        toast({
          title: "✓ Adicionado à Lista!",
          description: `"${created.title}" foi inserido com sucesso.`,
        })
        inputRef.current?.focus()
      } else {
        const err = await res.json()
        toast({
          title: "Erro ao adicionar",
          description: err.error || "Tente novamente.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggle = async (item: ShoppingItem) => {
    const nextState = !item.completed

    // Otimista
    setItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? {
              ...i,
              completed: nextState,
              completedAt: nextState ? new Date().toISOString() : null,
              completedBy: nextState
                ? {
                    id: user?.id || 1,
                    name: user?.name || user?.username || "Colaborador",
                    role: user?.role || "camareira",
                  }
                : null,
            }
          : i
      )
    )

    try {
      const res = await fetch(`/api/shopping-list/${item.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextState }),
      })

      if (res.ok) {
        toast({
          title: nextState ? "✓ Baixa Registrada!" : "Item Reaberto",
          description: nextState
            ? `"${item.title}" marcado como comprado.`
            : `"${item.title}" voltou para os pendentes.`,
        })
        fetchItems()
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  const handleDelete = async (item: ShoppingItem) => {
    if (!confirm(`Remover "${item.title}" da lista de compras?`)) return

    setItems(prev => prev.filter(i => i.id !== item.id))
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Item Removido" })
        fetchItems()
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  const pendingItems = items.filter(i => !i.completed)
  const completedItems = items.filter(i => i.completed)
  const displayedItems = activeTab === "pending" ? pendingItems : completedItems

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border-border bg-card shadow-2xl">
        {/* Header com estilo mobile */}
        <div className="p-4 sm:p-5 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                Lista de Compras
                {pendingItems.length > 0 && (
                  <span className="bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {pendingItems.length} {pendingItems.length === 1 ? "pendente" : "pendentes"}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Peça produtos faltantes ou confira o que já está na lista.
              </DialogDescription>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchItems}
            disabled={loading}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Formulário de Adição Rápida (Sempre no topo e direto no input) */}
        <div className="p-4 border-b border-border bg-muted/20">
          <form onSubmit={handleCreate} className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                O que está faltando comprar?
              </label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Detergente neutro, Cloro, Pano de chão..."
                  className="rounded-xl h-11 text-sm font-semibold bg-background border-border pl-3 pr-24 shadow-xs focus:ring-2 focus:ring-primary"
                  required
                />
                <Button
                  type="submit"
                  disabled={!title.trim() || isSubmitting}
                  size="sm"
                  className="absolute right-1.5 top-1.5 bottom-1.5 h-8 px-3 rounded-lg text-xs font-bold gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  {isSubmitting ? "..." : "Adicionar"}
                </Button>
              </div>
            </div>

            {/* Linha compacta opcional: Quantidade, Categoria e Observação */}
            <div className="grid grid-cols-12 gap-2 pt-0.5">
              <div className="col-span-5">
                <Input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Qtd (ex: 2 galões)"
                  className="rounded-xl h-8 text-xs bg-background/80 border-border"
                />
              </div>
              <div className="col-span-7">
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Obs / Quarto (ex: Flat 201)"
                  className="rounded-xl h-8 text-xs bg-background/80 border-border"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Tabs de alternância: Pendentes vs Comprados */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/60 bg-card">
          <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "pending"
                  ? "bg-card text-foreground shadow-xs font-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pendentes</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
                {pendingItems.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("completed")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "completed"
                  ? "bg-card text-foreground shadow-xs font-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Já Comprados</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
                {completedItems.length}
              </Badge>
            </button>
          </div>

          <Link
            href="/lista-compras"
            onClick={() => onOpenChange(false)}
            className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            <span>Tela Completa</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* Lista de Itens com Scroll Suave */}
        <div className="p-3 sm:p-4 overflow-y-auto max-h-[42dvh] sm:max-h-[46dvh] space-y-2">
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
              Carregando lista de compras...
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                {activeTab === "pending" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : (
                  <ShoppingCart className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs font-bold text-foreground">
                {activeTab === "pending"
                  ? "Nenhum item pendente no momento!"
                  : "Nenhum item com baixa registrada ainda."}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                {activeTab === "pending"
                  ? "Use o campo acima para solicitar qualquer produto ou material que esteja faltando."
                  : "Itens marcados como comprados aparecerão arquivados aqui."}
              </p>
            </div>
          ) : (
            displayedItems.map(item => {
              const catObj = CATEGORIES.find(
                c => c.label.toLowerCase() === (item.category || "").toLowerCase()
              ) || { color: "text-slate-700 bg-slate-500/10 border-slate-500/20" }

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                    item.completed
                      ? "bg-muted/30 border-border/50 opacity-75"
                      : "bg-card border-border hover:border-primary/40 shadow-xs"
                  }`}
                >
                  {/* Botão de marcar como comprado (baixa) */}
                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    className={`mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                      item.completed
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary"
                    }`}
                    title={item.completed ? "Reabrir item" : "Marcar como comprado"}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>

                  {/* Detalhes do item */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs font-bold text-foreground block truncate ${
                          item.completed ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.quantity && (
                        <span className="text-[10px] font-black bg-primary/10 text-primary px-1.5 py-0.2 rounded-md">
                          {item.quantity}
                        </span>
                      )}
                      {item.category && item.category !== "Limpeza" && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md border ${catObj.color}`}
                        >
                          {item.category}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        💬 {item.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>
                        Por <strong>{item.createdBy?.name || "Colaborador"}</strong>
                      </span>
                      <span>•</span>
                      <span>{formatDateBr(item.createdAt)}</span>
                      {item.completed && item.completedBy && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold">
                            Baixa por {item.completedBy.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ação de exclusão */}
                  {(isAdmin || user?.id === item.createdBy?.id) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded-lg transition-colors shrink-0"
                      title="Excluir item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground font-medium">
            💡 <span className="hidden sm:inline">Camareiras e Adm visualizam em </span>tempo real
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs font-bold rounded-xl"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
