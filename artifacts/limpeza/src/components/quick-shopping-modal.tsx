import React, { useState, useEffect, useRef, useMemo } from "react"
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
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
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

export const COMMON_SHOPPING_ITEMS = [
  "Papel higiênico",
  "Cif",
  "X14",
  "Saco Lixo",
  "Vassoura",
  "Pá",
  "Esponja",
  "Bombril",
  "Limpa inox",
  "Detergente",
  "Cloro",
  "Alcool",
  "Cheirinho",
  "Pano de chão",
  "Lâmpada Banheiro Pequena",
  "Lâmpada banheiro grande",
  "Lâmpada teto",
  "Lâmpada abajur",
]

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

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

  // Google Keep Fast Entry state
  const [title, setTitle] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [category, setCategory] = useState("Limpeza")
  const [showDetails, setShowDetails] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  // Autocomplete suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)

  const filteredSuggestions = useMemo(() => {
    const q = normalizeText(title)
    if (!q) return []
    return COMMON_SHOPPING_ITEMS.filter(item => normalizeText(item).includes(q))
  }, [title])

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
      // Background retry
    } finally {
      setLoading(false)
    }
  }

  // Busca sempre que abrir o modal e foca o cursor
  useEffect(() => {
    if (open) {
      fetchItems()
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
      return () => clearTimeout(t)
    }
  }, [open])

  // Busca inicial apenas para contagem de pendências no ícone inferior
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

  // Google Keep Flow: Adição instantânea com Enter contínuo
  const handleAddItem = async (itemTitle: string) => {
    const trimmed = itemTitle.trim()
    if (!trimmed) return

    // 1. Limpa o input imediatamente e mantém foco (Google Keep style)
    setTitle("")
    setSelectedSuggestionIndex(-1)
    setShowSuggestions(false)
    inputRef.current?.focus()

    // 2. Adição Otimista Instantânea na interface
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const optimisticItem: ShoppingItem = {
      id: tempId,
      title: trimmed,
      quantity: quantity.trim(),
      category: category.trim() || "Limpeza",
      notes: notes.trim(),
      completed: false,
      createdBy: {
        id: user?.id || 1,
        name: user?.name || user?.username || "Colaborador",
        role: user?.role || "camareira",
      },
      createdAt: new Date().toISOString(),
      completedBy: null,
      completedAt: null,
    }

    setItems(prev => [optimisticItem, ...prev])
    onPendingCountChange?.(items.filter(i => !i.completed).length + 1)
    setQuantity("")
    setNotes("")
    setShowDetails(false)

    // 3. Persiste no servidor em background sem travar o próximo item
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          quantity: optimisticItem.quantity,
          category: optimisticItem.category,
          notes: optimisticItem.notes,
        }),
      })

      if (res.ok) {
        const saved: ShoppingItem = await res.json()
        setItems(prev => prev.map(it => (it.id === tempId ? saved : it)))
      }
    } catch {
      // Mantém item otimista
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        )
        return
      }
      if (e.key === "Escape") {
        setShowSuggestions(false)
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
          handleAddItem(filteredSuggestions[selectedSuggestionIndex])
          return
        }
      }
    }

    if (e.key === "Enter") {
      e.preventDefault()
      handleAddItem(title)
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
        const updated = await res.json()
        setItems(prev => prev.map(i => (i.id === item.id ? updated : i)))
        const pCount = items.filter(i => (i.id === item.id ? !nextState : !i.completed)).length
        onPendingCountChange?.(pCount)
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  const handleDelete = async (item: ShoppingItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    try {
      const res = await fetch(`/api/shopping-list/${item.id}`, { method: "DELETE" })
      if (!res.ok) fetchItems()
    } catch {
      fetchItems()
    }
  }

  const pendingItems = items.filter(i => !i.completed)
  const completedItems = items.filter(i => i.completed)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border-border bg-card shadow-2xl">
        {/* Header estilo Google Keep */}
        <div className="p-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black tracking-tight text-foreground flex items-center gap-2">
                Lista de Compras
                {pendingItems.length > 0 && (
                  <span className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {pendingItems.length} {pendingItems.length === 1 ? "item" : "itens"}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Digite o item e tecle Enter para o próximo
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchItems}
              disabled={loading}
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Link
              href="/lista-compras"
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-muted-foreground hover:text-primary rounded-lg transition-colors"
              title="Abrir tela cheia"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Input Google Keep: Digite e dê Enter */}
        <div className="p-3.5 border-b border-border bg-muted/20 relative">
          <div className="relative">
            <div className="flex items-center gap-2 bg-background border border-border rounded-2xl p-1.5 pl-3 shadow-xs focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={title}
                onChange={e => {
                  setTitle(e.target.value)
                  setShowSuggestions(true)
                  setSelectedSuggestionIndex(-1)
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Item da lista (ex: Papel higiênico, Cif, Detergente...)"
                className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />

              {title.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle("")
                    setShowSuggestions(false)
                    inputRef.current?.focus()
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className={`p-1.5 rounded-xl transition-colors ${
                  showDetails || quantity || notes
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="Qtd e Observações adicionais"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <Button
                type="button"
                size="sm"
                disabled={!title.trim()}
                onClick={() => handleAddItem(title)}
                className="h-8 px-3 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-1 shadow-xs"
              >
                <span>Enter ↵</span>
              </Button>
            </div>

            {/* Dropdown de Autocomplete Flutuante */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden py-1 divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-100 max-h-56 overflow-y-auto">
                <div className="px-3 py-1 bg-muted/40 text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Itens Frequentes</span>
                  <span className="text-[9px] font-normal lowercase">toque ou use setas + enter</span>
                </div>
                {filteredSuggestions.map((sug, idx) => {
                  const isSelected = idx === selectedSuggestionIndex
                  return (
                    <button
                      key={sug}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault()
                        handleAddItem(sug)
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className={`w-3.5 h-3.5 ${
                            isSelected ? "text-primary-foreground" : "text-amber-500"
                          }`}
                        />
                        <span>{sug}</span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        + Adicionar
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Campos Opcionais Expansíveis (Qtd / Obs) */}
          {showDetails && (
            <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-border/40 animate-in slide-in-from-top-1 duration-150">
              <div className="col-span-5">
                <Input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Qtd (ex: 4 galões, 10 un)"
                  className="rounded-xl h-8 text-xs bg-background border-border"
                />
              </div>
              <div className="col-span-7">
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Obs / Quarto (ex: Urgente flat 201)"
                  className="rounded-xl h-8 text-xs bg-background border-border"
                />
              </div>
            </div>
          )}

          {/* Pílulas de Atalho Rápido para Itens Frequentes */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-0.5 no-scrollbar">
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">Comuns:</span>
            {COMMON_SHOPPING_ITEMS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddItem(item)}
                className="shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-background border border-border/80 hover:border-primary/60 hover:bg-primary/5 text-foreground transition-all flex items-center gap-1 shadow-2xs active:scale-95"
              >
                <Plus className="w-2.5 h-2.5 text-primary" />
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lista Checklist Google Keep */}
        <div className="p-3 sm:p-4 overflow-y-auto max-h-[50dvh] space-y-1">
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
              Carregando lista...
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                <ShoppingCart className="w-6 h-6 text-muted-foreground/60" />
              </div>
              <p className="text-xs font-bold text-foreground">Sua lista está vazia</p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                Digite um produto acima e tecle Enter para montar a lista rapidamente.
              </p>
            </div>
          ) : (
            <>
              {/* 1. Itens Ativos (Pendentes de Compra) */}
              <div className="space-y-1">
                {pendingItems.length === 0 && completedItems.length > 0 && (
                  <div className="py-4 text-center text-xs text-emerald-600 font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Todos os itens da lista já foram comprados!</span>
                  </div>
                )}

                {pendingItems.map(item => (
                  <div
                    key={item.id}
                    className="group flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 transition-colors border border-transparent hover:border-border/60"
                  >
                    {/* Checkbox Google Keep */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      className="w-5 h-5 rounded-md border-2 border-muted-foreground/40 hover:border-primary flex items-center justify-center shrink-0 transition-all text-transparent hover:text-primary active:scale-90"
                      title="Marcar como comprado"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>

                    {/* Texto do Item */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground truncate">
                        {item.title}
                      </span>
                      {item.quantity && (
                        <span className="text-[10px] font-black bg-primary/10 text-primary px-1.5 py-0.2 rounded-md shrink-0">
                          {item.quantity}
                        </span>
                      )}
                      {item.notes && (
                        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                          ({item.notes})
                        </span>
                      )}
                    </div>

                    {/* Autor / Horário discreto */}
                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                      {item.createdBy?.name || "Colaborador"}
                    </span>

                    {/* Botão de Excluir discreto */}
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="opacity-60 group-hover:opacity-100 hover:text-destructive p-1 rounded-md transition-all text-muted-foreground shrink-0"
                      title="Remover item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* 2. Seção Itens Marcados (Google Keep style collapsible) */}
              {completedItems.length > 0 && (
                <div className="pt-3 border-t border-border/50 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {showCompleted ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                      <span>
                        {completedItems.length}{" "}
                        {completedItems.length === 1 ? "item comprado" : "itens comprados"}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {showCompleted ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>

                  {showCompleted && (
                    <div className="space-y-1 mt-1 pl-1 animate-in fade-in-50 duration-150">
                      {completedItems.map(item => (
                        <div
                          key={item.id}
                          className="group flex items-center gap-2.5 p-2 rounded-xl opacity-60 hover:opacity-100 transition-opacity"
                        >
                          {/* Checkbox Marcado */}
                          <button
                            type="button"
                            onClick={() => handleToggle(item)}
                            className="w-5 h-5 rounded-md bg-emerald-600 border-2 border-emerald-600 flex items-center justify-center shrink-0 text-white active:scale-90"
                            title="Reabrir item"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </button>

                          {/* Texto Riscado */}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground line-through truncate">
                              {item.title}
                            </span>
                            {item.quantity && (
                              <span className="text-[10px] line-through text-muted-foreground/70">
                                {item.quantity}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded-md opacity-50 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Remover definitivamente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé Google Keep */}
        <div className="p-2.5 px-4 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span className="font-semibold text-[11px]">Sincronização em tempo real</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-7 text-xs font-bold rounded-lg"
          >
            Concluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
