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
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  X,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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

  const inputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(false)

  // Input states
  const [title, setTitle] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
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
      // background retry
    } finally {
      setLoading(false)
    }
  }

  // Foco no input ao abrir
  useEffect(() => {
    if (open) {
      fetchItems()
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [open])

  // Busca inicial para o contador no atalho inferior
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

    // 1. Limpa o input e mantém foco imediato
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
      category: "Limpeza",
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

    // 3. Salva no backend em background
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
      // mantém otimista
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
      <DialogContent className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-full rounded-none border-0 p-0 gap-0 bg-background flex flex-col overflow-hidden sm:inset-auto sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-[88dvh] sm:max-h-[820px] sm:max-w-lg sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl [&>button.absolute]:hidden">
        {/* 1. Header Fixo Superior com Safe-Area */}
        <div className="shrink-0 pt-[max(env(safe-area-inset-top,0px),12px)] px-4 pb-3 border-b border-border/60 bg-background flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                Lista de Compras
              </DialogTitle>
              {pendingItems.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {pendingItems.length}
                </span>
              )}
            </div>
            <DialogDescription className="sr-only">
              Gerencie a lista de compras da governança
            </DialogDescription>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchItems}
              disabled={loading}
              className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Link
              href="/lista-compras"
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Abrir página completa"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 2. Campo de Entrada & Atalhos Rápidos (shrink-0) */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/50 bg-background">
          {/* Input Moderno com Fundo Neutro Suave */}
          <div className="relative">
            <div className="relative flex items-center bg-slate-100 dark:bg-slate-800/70 rounded-2xl px-3.5 py-1.5 border border-transparent focus-within:border-primary/40 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-2xs">
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
                placeholder="Adicionar item..."
                className="w-full bg-transparent py-1.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />

              {title.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle("")
                    setShowSuggestions(false)
                    inputRef.current?.focus()
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-full transition-colors mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className={`p-1.5 rounded-xl transition-colors mr-1 ${
                  showDetails || quantity || notes
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Qtd / Observações"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => handleAddItem(title)}
                className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 transition-all hover:bg-primary/90 disabled:opacity-30 disabled:pointer-events-none active:scale-90 shadow-2xs"
                title="Adicionar item"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Dropdown de Autocomplete Flutuante */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover/95 backdrop-blur-md border border-border rounded-2xl shadow-xl overflow-hidden py-1 divide-y divide-border/40 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Itens Frequentes</span>
                  <span className="text-[9px] font-normal lowercase">toque para adicionar</span>
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
                      className={`w-full px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition-colors ${
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
                        className={`text-[10px] ${
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

          {/* Detalhes Expansíveis Opcionais (Qtd / Obs) */}
          {showDetails && (
            <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-border/40 animate-in slide-in-from-top-1 duration-150">
              <div className="col-span-5">
                <Input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Qtd (ex: 2 galões)"
                  className="rounded-xl h-8 text-xs bg-slate-100 dark:bg-slate-800/70 border-transparent focus:border-primary/40"
                />
              </div>
              <div className="col-span-7">
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Obs / Quarto (ex: Flat 201)"
                  className="rounded-xl h-8 text-xs bg-slate-100 dark:bg-slate-800/70 border-transparent focus:border-primary/40"
                />
              </div>
            </div>
          )}

          {/* Atalhos Rápidos com Rolagem Horizontal Suave */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2.5 pb-1">
            <span className="text-[11px] font-semibold text-muted-foreground shrink-0 pr-0.5">
              Comuns:
            </span>
            {COMMON_SHOPPING_ITEMS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddItem(item)}
                className="shrink-0 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-primary/10 hover:text-primary active:scale-95 transition-all border border-slate-200/50 dark:border-slate-700/50"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Conteúdo Central: Lista com Rolagem Vertical Independente */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1">
          {loading && items.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              Carregando itens da lista...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <ShoppingCart className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-sm font-semibold text-foreground">Sua lista está vazia</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Digite um item acima ou toque em qualquer atalho comum para começar.
              </p>
            </div>
          ) : (
            <>
              {/* Itens Ativos (Pendentes) */}
              <div className="space-y-1">
                {pendingItems.length === 0 && completedItems.length > 0 && (
                  <div className="py-6 text-center text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Todos os itens da lista já foram comprados!</span>
                  </div>
                )}

                {pendingItems.map(item => (
                  <div
                    key={item.id}
                    className="group flex items-center gap-3 py-2 px-2.5 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Checkbox Estilizado com Animação */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      className="w-5 h-5 rounded-md border-2 border-slate-300 dark:border-slate-600 hover:border-primary flex items-center justify-center shrink-0 transition-all bg-background active:scale-90"
                      title="Marcar como comprado"
                    >
                      <Check className="w-3.5 h-3.5 text-transparent" />
                    </button>

                    {/* Conteúdo do Item */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.title}
                      </span>
                      {item.quantity && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                          {item.quantity}
                        </span>
                      )}
                      {item.notes && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          • {item.notes}
                        </span>
                      )}
                    </div>

                    {/* Botão de Exclusão Rápido */}
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors opacity-70 group-hover:opacity-100 shrink-0 active:scale-90"
                      title="Excluir item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Itens Marcados (Comprados) - Recolhível */}
              {completedItems.length > 0 && (
                <div className="pt-3 border-t border-border/50 mt-4 mb-2">
                  <button
                    type="button"
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {showCompleted ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span>
                        {completedItems.length}{" "}
                        {completedItems.length === 1 ? "item comprado" : "itens comprados"}
                      </span>
                    </div>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {showCompleted ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>

                  {showCompleted && (
                    <div className="space-y-1 mt-1 pl-1 animate-in fade-in-50 duration-150">
                      {completedItems.map(item => (
                        <div
                          key={item.id}
                          className="group flex items-center gap-3 py-2 px-2.5 rounded-xl opacity-60 hover:opacity-100 transition-opacity"
                        >
                          {/* Checkbox Marcado */}
                          <button
                            type="button"
                            onClick={() => handleToggle(item)}
                            className="w-5 h-5 rounded-md bg-emerald-600 border-2 border-emerald-600 flex items-center justify-center shrink-0 text-white active:scale-90 animate-in zoom-in-75 duration-150"
                            title="Reabrir item"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>

                          {/* Texto Riscado */}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-sm font-normal text-muted-foreground line-through truncate">
                              {item.title}
                            </span>
                            {item.quantity && (
                              <span className="text-[10px] line-through text-muted-foreground/70 shrink-0">
                                {item.quantity}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors opacity-70 group-hover:opacity-100 shrink-0 active:scale-90"
                            title="Excluir item"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* 4. Rodapé Fixo com Safe Area Inset */}
        <div className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-xs px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom,0px),12px)] flex items-center justify-between text-xs text-muted-foreground z-10">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Sincronização em tempo real
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs font-semibold px-3 rounded-xl hover:bg-muted active:scale-95"
          >
            Concluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
