import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
const _APP_V = "2026.09.30.1"  // força novo hash de build
import { Shell } from "@/components/layout"
import { useGetMe } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  GripVertical,
  Pencil,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShoppingItem {
  id: string
  title: string
  quantity?: string
  category?: string
  notes?: string
  completed: boolean
  sortOrder: number
  createdBy: { id: number; name: string; role: string }
  createdAt: string
  completedBy?: { id: number; name: string; role: string } | null
  completedAt?: string | null
}

interface CatalogEntry {
  id: number
  name: string
  useCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

function formatDateBr(isoStr?: string | null): string {
  if (!isoStr) return ""
  try {
    return new Date(isoStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return isoStr.substring(0, 10)
  }
}

const CATEGORIES = [
  { label: "Limpeza",     color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20" },
  { label: "Cama & Banho", color: "text-indigo-700 bg-indigo-500/10 border-indigo-500/20" },
  { label: "Manutenção",  color: "text-amber-700 bg-amber-500/10 border-amber-500/20" },
  { label: "Cozinha",     color: "text-pink-700 bg-pink-500/10 border-pink-500/20" },
  { label: "Geral",       color: "text-slate-700 bg-slate-500/10 border-slate-500/20" },
]

// ─── Inline Edit Row ──────────────────────────────────────────────────────────

interface EditRowProps {
  item: ShoppingItem
  isAdmin: boolean
  onSave: (id: string, fields: Partial<Pick<ShoppingItem, "title" | "quantity" | "notes" | "category">>) => void
  onCancel: () => void
}

function EditRow({ item, isAdmin, onSave, onCancel }: EditRowProps) {
  const [title, setTitle] = useState(item.title)
  const [quantity, setQuantity] = useState(item.quantity ?? "")
  const [notes, setNotes] = useState(item.notes ?? "")
  const [category, setCategory] = useState(item.category ?? "Limpeza")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave(item.id, { title, quantity, notes, category })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="h-8 text-xs rounded-xl flex-1 min-w-0"
          required
        />
        <Input
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          placeholder="Qtd"
          className="h-8 text-xs rounded-xl w-20 shrink-0"
        />
        {isAdmin && (
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="h-8 rounded-xl border border-border bg-background px-2 text-xs font-semibold shrink-0"
          >
            {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
          </select>
        )}
        <Input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Obs"
          className="h-8 text-xs rounded-xl flex-1 min-w-0"
        />
        <Button type="submit" size="sm" className="h-8 px-3 text-xs rounded-xl shrink-0">Salvar</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs rounded-xl shrink-0" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </form>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShoppingListPage() {
  const { data: user } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending")
  const [editingId, setEditingId] = useState<string | null>(null)

  // ── Quick-add state ────────────────────────────────────────────────────────
  const [newTitle, setNewTitle] = useState("")
  const [newQuantity, setNewQuantity] = useState("")
  const [newCategory, setNewCategory] = useState("Limpeza")
  const [newNotes, setNewNotes] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIdx, setSuggestionIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Drag state ─────────────────────────────────────────────────────────────
  const dragItem = useRef<string | null>(null)
  const dragOver = useRef<string | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/shopping-list")
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      }
    } catch {
      toast({ title: "Erro ao carregar lista", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping-list/catalog")
      if (res.ok) {
        const data = await res.json()
        setCatalog(Array.isArray(data) ? data : [])
      }
    } catch {}
  }, [])

  useEffect(() => { fetchItems(); fetchCatalog() }, [])

  // ── Suggestions ────────────────────────────────────────────────────────────

  const suggestions = useMemo(() => {
    const q = normalizeText(newTitle)
    if (!q || q.length < 1) return []
    return catalog
      .filter(e => normalizeText(e.name).includes(q))
      .slice(0, 8)
  }, [newTitle, catalog])

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async (overrideTitle?: string) => {
    const itemTitle = (overrideTitle ?? newTitle).trim()
    if (!itemTitle) return

    const tempId = `temp_${Date.now()}`
    const tempItem: ShoppingItem = {
      id: tempId,
      title: itemTitle,
      quantity: isAdmin ? newQuantity.trim() : "",
      category: isAdmin ? newCategory : "Limpeza",
      notes: newNotes.trim(),
      completed: false,
      sortOrder: -99999,
      createdBy: {
        id: user?.id || 1,
        name: user?.name || user?.username || "Admin",
        role: user?.role || "admin",
      },
      createdAt: new Date().toISOString(),
    }

    setItems(prev => [tempItem, ...prev])
    setNewTitle("")
    setNewQuantity("")
    setNewNotes("")
    setShowSuggestions(false)
    setSuggestionIdx(-1)
    inputRef.current?.focus()

    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: itemTitle,
          quantity: tempItem.quantity,
          category: tempItem.category,
          notes: tempItem.notes,
        }),
      })
      if (res.ok) {
        const saved = await res.json()
        setItems(prev => prev.map(i => (i.id === tempId ? saved : i)))
        // Refresh catalog so new item appears immediately in autocomplete
        fetchCatalog()
        toast({ title: "✓ Item adicionado", description: `"${itemTitle}" foi incluído.` })
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const handleToggle = async (item: ShoppingItem) => {
    const nextCompleted = !item.completed

    // Optimistic: completed items go to bottom, uncompleted items to top
    setItems(prev => {
      const updated = prev.map(i =>
        i.id === item.id
          ? { ...i, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null, completedBy: nextCompleted ? { id: user?.id || 1, name: user?.name || "Admin", role: user?.role || "admin" } : null }
          : i
      )
      // Move unchecked items to top
      if (!nextCompleted) {
        const me = updated.find(i => i.id === item.id)!
        return [me, ...updated.filter(i => i.id !== item.id)]
      }
      return updated
    })

    try {
      const res = await fetch(`/api/shopping-list/${item.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      })
      if (res.ok) {
        const updated = await res.json()
        setItems(prev => {
          const mapped = prev.map(i => (i.id === item.id ? updated : i))
          if (!nextCompleted) {
            return [mapped.find(i => i.id === item.id)!, ...mapped.filter(i => i.id !== item.id)]
          }
          return mapped
        })
        toast({
          title: nextCompleted ? "✓ Baixa Confirmada!" : "↩ Item Reaberto",
          description: nextCompleted
            ? `"${item.title}" marcado como comprado.`
            : `"${item.title}" voltou para pendentes.`,
        })
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  const handleSaveEdit = async (id: string, fields: Partial<Pick<ShoppingItem, "title" | "quantity" | "notes" | "category">>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
    setEditingId(null)

    try {
      const res = await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
      if (!res.ok) fetchItems()
      else {
        const updated = await res.json()
        setItems(prev => prev.map(i => i.id === id ? updated : i))
        fetchCatalog()
        toast({ title: "Item atualizado" })
      }
    } catch {
      fetchItems()
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remover "${title}" da lista?`)) return
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const res = await fetch(`/api/shopping-list/${id}`, { method: "DELETE" })
      if (res.ok) toast({ title: "Item removido" })
      else fetchItems()
    } catch {
      fetchItems()
    }
  }

  // ── Drag-and-drop (touch + mouse) ──────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragItem.current = id
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    dragOver.current = id
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = dragItem.current
    if (!sourceId || sourceId === targetId) return

    const pendingOnly = items.filter(i => !i.completed)
    const srcIdx = pendingOnly.findIndex(i => i.id === sourceId)
    const tgtIdx = pendingOnly.findIndex(i => i.id === targetId)
    if (srcIdx === -1 || tgtIdx === -1) return

    const reordered = [...pendingOnly]
    const [moved] = reordered.splice(srcIdx, 1)
    reordered.splice(tgtIdx, 0, moved)

    // Assign new sortOrder values
    const withOrder = reordered.map((item, idx) => ({ ...item, sortOrder: idx * 10 }))

    setItems(prev => {
      const completed = prev.filter(i => i.completed)
      return [...withOrder, ...completed]
    })

    dragItem.current = null
    dragOver.current = null

    try {
      await fetch("/api/shopping-list/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: withOrder.map(i => ({ id: i.id, sortOrder: i.sortOrder })),
        }),
      })
    } catch {}
  }

  // ── Keyboard handler for autocomplete ──────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSuggestionIdx(p => Math.min(p + 1, suggestions.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSuggestionIdx(p => Math.max(p - 1, 0)); return }
      if (e.key === "Escape") { setShowSuggestions(false); return }
      if (e.key === "Enter" && suggestionIdx >= 0) {
        e.preventDefault()
        handleCreate(suggestions[suggestionIdx].name)
        return
      }
    }
    if (e.key === "Enter") { e.preventDefault(); handleCreate() }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const pendingItems = useMemo(() => items.filter(i => !i.completed), [items])
  const completedItems = useMemo(() => items.filter(i => i.completed), [items])
  const displayedItems = activeTab === "pending" ? pendingItems : completedItems

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Shell>
      <div className="space-y-6 max-w-3xl mx-auto pb-16">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <ShoppingCart className="w-7 h-7 text-primary" />
              Lista de Compras
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Lista compartilhada em tempo real. Arraste para reordenar, toque para editar.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchItems(); fetchCatalog() }} disabled={loading} className="rounded-xl text-xs font-bold gap-1.5 h-9">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-2xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pendentes</p>
                <p className="text-xl font-black text-amber-600">{pendingItems.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Comprados</p>
                <p className="text-xl font-black text-emerald-600">{completedItems.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Add */}
        <Card className="rounded-3xl border border-border/80 shadow-xs overflow-visible">
          <CardHeader className="bg-primary/5 border-b border-border/60 p-4">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Adicionar Item
            </CardTitle>
            <CardDescription className="text-xs">
              Digite e pressione Enter. O item entra automaticamente no cadastro de sugestões.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3 overflow-visible">
            {/* Main input with autocomplete */}
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Input
                    ref={inputRef}
                    value={newTitle}
                    onChange={e => { setNewTitle(e.target.value); setShowSuggestions(true); setSuggestionIdx(-1) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nome do item..."
                    className="rounded-xl h-10 text-sm font-semibold pr-8"
                  />
                  {newTitle && (
                    <button
                      type="button"
                      onClick={() => { setNewTitle(""); setShowSuggestions(false); inputRef.current?.focus() }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button
                  onClick={() => handleCreate()}
                  disabled={!newTitle.trim()}
                  className="rounded-xl h-10 text-xs font-bold gap-1.5 px-4 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Adicionar
                </Button>
                {/* Qtd + Categoria em linha separada em mobile */}
                <div className="flex gap-2 w-full">
                  <Input
                    value={newQuantity}
                    onChange={e => setNewQuantity(e.target.value)}
                    placeholder="Quantidade (opcional)"
                    className="rounded-xl h-9 text-xs flex-1"
                  />
                  {isAdmin && (
                    <select
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="h-9 rounded-xl border border-border bg-background px-2 text-xs font-semibold shrink-0"
                    >
                      {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden py-1 max-h-56 overflow-y-auto">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sugestões
                  </div>
                  {suggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); handleCreate(s.name) }}
                      className={`w-full px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                        idx === suggestionIdx ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span>{s.name}</span>
                      {s.useCount > 1 && (
                        <span className={`text-[10px] ${idx === suggestionIdx ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {s.useCount}× usado
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notes field */}
            <Input
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Observações (opcional) — ex: urgente, flat 212..."
              className="rounded-xl h-9 text-xs"
            />

            {/* Common items shortcuts */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              <span className="text-[11px] font-bold text-muted-foreground shrink-0">Comuns:</span>
              {catalog.slice(0, 12).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCreate(item.name)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-muted/60 hover:bg-primary/10 hover:text-primary border border-border/80 transition-all flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5 text-primary" />
                  {item.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/60">
          {(["pending", "completed"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "pending" ? `Pendentes (${pendingItems.length})` : `Comprados (${completedItems.length})`}
            </button>
          ))}
        </div>

        {/* Items List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">Carregando lista...</div>
        ) : displayedItems.length === 0 ? (
          <Card className="rounded-3xl border border-dashed p-12 text-center">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20 text-muted-foreground" />
            <p className="font-bold">
              {activeTab === "pending" ? "Nenhum item pendente!" : "Nenhum item comprado ainda."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeTab === "pending" && (
              <p className="text-[11px] text-muted-foreground px-1">
                💡 Segure e arraste o ícone <GripVertical className="w-3 h-3 inline" /> para reordenar
              </p>
            )}
            {displayedItems.map(item => {
              const catObj = CATEGORIES.find(c => c.label.toLowerCase() === (item.category || "").toLowerCase()) || CATEGORIES[0]
              const isEditing = editingId === item.id
              const isDraggable = activeTab === "pending"

              return (
                <Card
                  key={item.id}
                  draggable={isDraggable}
                  onDragStart={isDraggable ? e => handleDragStart(e, item.id) : undefined}
                  onDragOver={isDraggable ? e => handleDragOver(e, item.id) : undefined}
                  onDrop={isDraggable ? e => handleDrop(e, item.id) : undefined}
                  className={`rounded-2xl border transition-all ${
                    item.completed
                      ? "bg-card/50 border-border/50 opacity-75"
                      : "bg-card border-border/80 shadow-xs hover:border-primary/30"
                  } ${isDraggable ? "cursor-default" : ""}`}
                >
                  <CardContent className="p-3.5 flex items-start gap-3">
                    {/* Drag handle (pending only) */}
                    {isDraggable && !isEditing && (
                      <div className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}

                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        item.completed
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-muted-foreground/40 hover:border-primary"
                      }`}
                      title={item.completed ? "Reabrir item (volta para pendentes)" : "Marcar como comprado"}
                    >
                      {item.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <EditRow
                          item={item}
                          isAdmin={isAdmin}
                          onSave={handleSaveEdit}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-bold cursor-pointer ${
                                item.completed ? "line-through text-muted-foreground" : "text-foreground hover:text-primary"
                              }`}
                              onClick={() => !item.completed && setEditingId(item.id)}
                              title="Clique para editar"
                            >
                              {item.title}
                            </span>
                            {item.quantity && (
                              <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0 h-5">
                                {item.quantity}
                              </Badge>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${catObj.color}`}>
                              {item.category || "Limpeza"}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-1">📝 {item.notes}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                            <span>Por <strong>{item.createdBy?.name || "Colaborador"}</strong> · {formatDateBr(item.createdAt)}</span>
                            {item.completed && (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Comprado por {item.completedBy?.name || "Admin"} · {formatDateBr(item.completedAt)}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!item.completed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(item.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary rounded-xl"
                            title="Editar item"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id, item.title)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-xl"
                          title="Remover da lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">Sincronização em tempo real</span>
        </div>
      </div>
    </Shell>
  )
}
