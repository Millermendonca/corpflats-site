import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Shell } from "@/components/layout"
import { useGetMe } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  RefreshCw,
  CheckCircle2,
  GripVertical,
  Pencil,
  X,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShoppingItem {
  id: string
  title: string
  quantity?: string
  category?: string
  categories?: string[]
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

function parseCategories(item: ShoppingItem): string[] {
  if (item.categories && Array.isArray(item.categories) && item.categories.length > 0) return item.categories
  if (!item.category) return ["Geral"]
  try { const p = JSON.parse(item.category); if (Array.isArray(p)) return p } catch {}
  return [item.category]
}

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentos":       "text-orange-700 bg-orange-500/10 border-orange-500/30",
  "Carnes":          "text-red-700 bg-red-500/10 border-red-500/30",
  "Frios":           "text-blue-700 bg-blue-500/10 border-blue-500/30",
  "Laticínios":      "text-sky-700 bg-sky-500/10 border-sky-500/30",
  "Padaria":         "text-amber-700 bg-amber-500/10 border-amber-500/30",
  "Bebidas":         "text-cyan-700 bg-cyan-500/10 border-cyan-500/30",
  "Secos & Grãos":   "text-yellow-700 bg-yellow-500/10 border-yellow-500/30",
  "Hortifrúti":      "text-green-700 bg-green-500/10 border-green-500/30",
  "Temperos":        "text-lime-700 bg-lime-500/10 border-lime-500/30",
  "Mercearia":       "text-teal-700 bg-teal-500/10 border-teal-500/30",
  "Conservas":       "text-indigo-700 bg-indigo-500/10 border-indigo-500/30",
  "Congelados":      "text-violet-700 bg-violet-500/10 border-violet-500/30",
  "Café da Manhã":   "text-amber-800 bg-amber-600/10 border-amber-600/30",
  "Limpeza":         "text-emerald-700 bg-emerald-500/10 border-emerald-500/30",
  "Higiene":         "text-pink-700 bg-pink-500/10 border-pink-500/30",
  "Governança":      "text-purple-700 bg-purple-500/10 border-purple-500/30",
  "Descartáveis":    "text-rose-700 bg-rose-500/10 border-rose-500/30",
  "Geral":           "text-slate-700 bg-slate-500/10 border-slate-500/30",
}

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? "text-slate-700 bg-slate-500/10 border-slate-500/30"
}

// ─── Inline Edit Row ──────────────────────────────────────────────────────────

interface EditRowProps {
  item: ShoppingItem
  onSave: (id: string, fields: Partial<Pick<ShoppingItem, "title" | "quantity" | "notes">>) => void
  onCancel: () => void
}

function EditRow({ item, onSave, onCancel }: EditRowProps) {
  const [title, setTitle] = useState(item.title)
  const [quantity, setQuantity] = useState(item.quantity ?? "")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave(item.id, { title, quantity })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-1.5 w-full">
      <Input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
        className="h-8 text-xs rounded-lg flex-1 min-w-0" required />
      <Input value={quantity} onChange={e => setQuantity(e.target.value)}
        placeholder="Qtd" className="h-8 text-xs rounded-lg w-20 shrink-0" />
      <Button type="submit" size="sm" className="h-8 px-3 text-xs rounded-lg shrink-0">Salvar</Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg shrink-0" onClick={onCancel}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </form>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShoppingListPage() {
  const { data: user } = useGetMe()
  const { toast } = useToast()

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  // ── Quick-add state ────────────────────────────────────────────────────────
  const [newTitle, setNewTitle] = useState("")
  const [newQuantity, setNewQuantity] = useState("")
  const [showQtyField, setShowQtyField] = useState(false)
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
      if (res.ok) { const d = await res.json(); setItems(Array.isArray(d) ? d : []) }
    } catch {
      toast({ title: "Erro ao carregar lista", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping-list/catalog")
      if (res.ok) { const d = await res.json(); setCatalog(Array.isArray(d) ? d : []) }
    } catch {}
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([fetch("/api/shopping-list"), fetch("/api/shopping-list/catalog")])
      if (r1.ok) { const d = await r1.json(); setItems(Array.isArray(d) ? d : []) }
      if (r2.ok) { const d = await r2.json(); setCatalog(Array.isArray(d) ? d : []) }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [])

  // ── Suggestions (autocomplete) ─────────────────────────────────────────────

  const suggestions = useMemo(() => {
    const q = normalizeText(newTitle)
    if (!q || q.length < 1) return []
    return catalog.filter(e => normalizeText(e.name).includes(q)).slice(0, 8)
  }, [newTitle, catalog])

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async (overrideTitle?: string) => {
    const itemTitle = (overrideTitle ?? newTitle).trim()
    if (!itemTitle) return

    setNewTitle("")
    setSuggestionIdx(-1)
    setShowSuggestions(false)
    inputRef.current?.focus()

    const tempId = `temp_${Date.now()}`
    const optimistic: ShoppingItem = {
      id: tempId, title: itemTitle, quantity: newQuantity.trim() || undefined,
      categories: ["Geral"], completed: false, sortOrder: -999,
      createdBy: { id: user?.id || 1, name: user?.username || "Colaborador", role: user?.role || "camareira" },
      createdAt: new Date().toISOString(), completedBy: null, completedAt: null,
    }
    setItems(prev => [optimistic, ...prev])
    const savedQty = newQuantity
    setNewQuantity("")
    setShowQtyField(false)

    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: itemTitle, quantity: savedQty.trim() || undefined }),
      })
      if (res.ok) {
        const saved: ShoppingItem = await res.json()
        setItems(prev => prev.map(it => it.id === tempId ? saved : it))
        fetchCatalog()
      } else {
        setItems(prev => prev.filter(it => it.id !== tempId))
      }
    } catch {
      setItems(prev => prev.filter(it => it.id !== tempId))
    }
  }

  // ── Toggle (marcar/desmarcar) ──────────────────────────────────────────────

  const handleToggle = async (item: ShoppingItem) => {
    const next = !item.completed
    if (next) {
      // Comprado: move para o fim
      setItems(prev => [...prev.filter(i => i.id !== item.id), { ...item, completed: true, completedAt: new Date().toISOString(), completedBy: { id: user?.id || 1, name: user?.username || "Admin", role: user?.role || "admin" } }])
    } else {
      // Desmarcar: volta para o topo dos pendentes
      setItems(prev => [{ ...item, completed: false, completedAt: null, completedBy: null }, ...prev.filter(i => i.id !== item.id)])
    }
    try {
      const res = await fetch(`/api/shopping-list/${item.id}/toggle`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      })
      if (res.ok) { const updated: ShoppingItem = await res.json(); setItems(prev => prev.map(i => i.id === item.id ? updated : i)) }
      else refresh()
    } catch { refresh() }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  const handleSaveEdit = async (id: string, fields: Partial<Pick<ShoppingItem, "title" | "quantity" | "notes">>) => {
    setEditingId(null)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
    try {
      const res = await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
      if (res.ok) { const updated: ShoppingItem = await res.json(); setItems(prev => prev.map(i => i.id === id ? updated : i)) }
      else refresh()
    } catch { refresh() }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remover "${title}" da lista?`)) return
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const res = await fetch(`/api/shopping-list/${id}`, { method: "DELETE" })
      if (!res.ok) refresh()
    } catch { refresh() }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => { dragItem.current = id; e.dataTransfer.effectAllowed = "move" }
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); dragOver.current = id }
  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = dragItem.current
    if (!sourceId || sourceId === targetId) return
    const pending = items.filter(i => !i.completed)
    const si = pending.findIndex(i => i.id === sourceId)
    const ti = pending.findIndex(i => i.id === targetId)
    if (si === -1 || ti === -1) return
    const reordered = [...pending]
    const [moved] = reordered.splice(si, 1)
    reordered.splice(ti, 0, moved)
    const withOrder = reordered.map((item, idx) => ({ ...item, sortOrder: idx * 10 }))
    setItems(prev => [...withOrder, ...prev.filter(i => i.completed)])
    dragItem.current = null; dragOver.current = null
    try {
      await fetch("/api/shopping-list/reorder", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: withOrder.map(i => ({ id: i.id, sortOrder: i.sortOrder })) }),
      })
    } catch {}
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSuggestionIdx(p => Math.min(p + 1, suggestions.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSuggestionIdx(p => Math.max(p - 1, 0)); return }
      if (e.key === "Escape") { setShowSuggestions(false); return }
      if (e.key === "Enter" && suggestionIdx >= 0) { e.preventDefault(); handleCreate(suggestions[suggestionIdx].name); return }
    }
    if (e.key === "Enter") { e.preventDefault(); handleCreate() }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const pendingItems = useMemo(() => items.filter(i => !i.completed), [items])
  const completedItems = useMemo(() => items.filter(i => i.completed), [items])

  const availableCategories = useMemo(() => {
    const counts: Record<string, number> = {}
    pendingItems.forEach(item => parseCategories(item).filter(c => c !== "Alimentos").forEach(cat => { counts[cat] = (counts[cat] || 0) + 1 }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  }, [pendingItems])

  const displayedItems = useMemo(() => {
    const base = activeTab === "pending" ? pendingItems : completedItems
    if (!categoryFilter) return base
    return base.filter(item => parseCategories(item).includes(categoryFilter))
  }, [activeTab, pendingItems, completedItems, categoryFilter])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Shell>
      <div className="space-y-4 max-w-2xl mx-auto pb-20 overflow-x-hidden w-full">

        {/* Header compacto */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Lista de Compras
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-amber-600 font-bold">{pendingItems.length}</span> pendentes
              {completedItems.length > 0 && <> · <span className="text-emerald-600 font-bold">{completedItems.length}</span> comprados</>}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Campo de adicionar (estilo Google Keep) ── */}
        <div className="relative">
          {/* Input row */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-2xl px-3.5 py-2 border border-transparent focus-within:border-primary/40 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-xs">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => { setNewTitle(e.target.value); setShowSuggestions(true); setSuggestionIdx(-1) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Adicionar item..."
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            {newTitle && (
              <button onClick={() => { setNewTitle(""); setShowSuggestions(false); inputRef.current?.focus() }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowQtyField(v => !v)}
              className={`p-1.5 rounded-xl transition-colors shrink-0 ${showQtyField || newQuantity ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
              title="Quantidade"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleCreate()}
              disabled={!newTitle.trim()}
              className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-90 hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Campo de quantidade expandível */}
          {showQtyField && (
            <div className="mt-2 px-1">
              <Input
                value={newQuantity}
                onChange={e => setNewQuantity(e.target.value)}
                placeholder="Quantidade (ex: 2 litros, 1 caixa...)"
                className="h-8 text-xs rounded-xl bg-muted/40 border-border/60"
              />
            </div>
          )}

          {/* Dropdown de autocomplete — FORA do contexto overflow */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                Sugestões
              </div>
              {suggestions.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleCreate(s.name) }}
                  className={`w-full px-3.5 py-2.5 text-left text-sm font-medium flex items-center gap-2.5 transition-colors ${idx === suggestionIdx ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
                >
                  <Sparkles className={`w-3.5 h-3.5 shrink-0 ${idx === suggestionIdx ? "text-primary-foreground/70" : "text-amber-500"}`} />
                  <span className="flex-1">{s.name}</span>
                  {s.useCount > 1 && (
                    <span className={`text-[10px] ${idx === suggestionIdx ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {s.useCount}×
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Atalhos rápidos — itens comuns */}
        {catalog.length > 0 && (
          <div className="w-full overflow-x-auto no-scrollbar -mt-1">
            <div className="flex items-center gap-1.5 pb-0.5 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground shrink-0">Comuns:</span>
              {catalog.slice(0, 16).map(item => (
                <button
                  key={item.id}
                  onClick={() => handleCreate(item.name)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/60 hover:bg-primary/10 hover:text-primary border border-border/60 transition-all"
                >
                  + {item.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs Pendentes / Comprados */}
        <div className="flex gap-1 p-1 bg-muted/60 rounded-xl border border-border/40">
          {(["pending", "completed"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setCategoryFilter(null) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "pending" ? `Pendentes (${pendingItems.length})` : `Comprados (${completedItems.length})`}
            </button>
          ))}
        </div>

        {/* Filtros de categoria — linha horizontal compacta */}
        {activeTab === "pending" && availableCategories.length > 0 && (
          <div className="w-full overflow-x-auto no-scrollbar -mt-1">
            <div className="flex gap-1.5 pb-0.5">
              <button
                onClick={() => setCategoryFilter(null)}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all ${
                  !categoryFilter
                    ? "bg-foreground text-background border-foreground"
                    : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {availableCategories.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => setCategoryFilter(categoryFilter === name ? null : name)}
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all ${
                    categoryFilter === name
                      ? getCategoryColor(name) + " ring-1 ring-current"
                      : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {name} <span className="opacity-60">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de itens */}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Carregando lista...</div>
        ) : displayedItems.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {categoryFilter ? `Nenhum item em "${categoryFilter}"` : activeTab === "pending" ? "Lista vazia! Adicione itens acima." : "Nenhum item comprado ainda."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeTab === "pending" && (
              <p className="text-[11px] text-muted-foreground px-1 -mb-0.5">
                Segure <GripVertical className="w-3 h-3 inline" /> e arraste para reordenar
              </p>
            )}
            {displayedItems.map(item => {
              const cats = parseCategories(item).filter(c => c !== "Alimentos")
              const isEditing = editingId === item.id
              const isDraggable = activeTab === "pending"

              return (
                <div
                  key={item.id}
                  draggable={isDraggable && !isEditing}
                  onDragStart={isDraggable ? e => handleDragStart(e, item.id) : undefined}
                  onDragOver={isDraggable ? e => handleDragOver(e, item.id) : undefined}
                  onDrop={isDraggable ? e => handleDrop(e, item.id) : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all group ${
                    item.completed
                      ? "bg-muted/30 border-border/30 opacity-70"
                      : "bg-card border-border/60 hover:border-border hover:shadow-xs"
                  }`}
                >
                  {/* Drag handle */}
                  {isDraggable && !isEditing && (
                    <GripVertical className="w-4 h-4 text-muted-foreground/25 group-hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing shrink-0 transition-colors" />
                  )}

                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(item)}
                    className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all active:scale-90 ${
                      item.completed
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-muted-foreground/40 hover:border-primary"
                    }`}
                    title={item.completed ? "Reabrir (volta para pendentes)" : "Marcar como comprado"}
                  >
                    {item.completed && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <EditRow item={item} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                    ) : (
                      <>
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span
                            className={`text-sm font-semibold leading-snug cursor-pointer ${
                              item.completed ? "line-through text-muted-foreground" : "text-foreground hover:text-primary"
                            }`}
                            onClick={() => !item.completed && setEditingId(item.id)}
                            title="Clique para editar"
                          >
                            {item.title}
                          </span>
                          {item.quantity && (
                            <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded leading-none">
                              {item.quantity}
                            </span>
                          )}
                        </div>
                        {/* Tags de categoria — pequenas, abaixo do título */}
                        {!item.completed && cats.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {cats.slice(0, 3).map(cat => (
                              <button
                                key={cat}
                                onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                                className={`text-[9px] font-bold px-1.5 py-0 rounded border leading-[18px] transition-all ${getCategoryColor(cat)} ${categoryFilter === cat ? "ring-1 ring-current" : ""}`}
                                title={`Filtrar por ${cat}`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                        {item.completed && item.completedBy && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            {item.completedBy.name}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Ações */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!item.completed && (
                        <button
                          onClick={() => setEditingId(item.id)}
                          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-primary rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id, item.title)}
                        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] text-muted-foreground">Sincronização em tempo real</span>
        </div>

      </div>
    </Shell>
  )
}
