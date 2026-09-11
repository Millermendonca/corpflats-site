import React, { useState, useEffect, useMemo } from "react"
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
  AlertCircle,
  Search,
  Filter,
  Package,
  Layers,
  Sparkles,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface ShoppingItem {
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

export default function ShoppingListPage() {
  const { data: user } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "all">("pending")
  const [selectedCat, setSelectedCat] = useState<string>("all")

  // Quick Add form state
  const [newTitle, setNewTitle] = useState("")
  const [newQuantity, setNewQuantity] = useState("")
  const [newCategory, setNewCategory] = useState("Limpeza")
  const [newNotes, setNewNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/shopping-list")
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      }
    } catch (err: any) {
      toast({
        title: "Erro ao carregar lista",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  // Toggle baixa (completed)
  const handleToggle = async (item: ShoppingItem) => {
    const nextCompleted = !item.completed

    // Otimista
    setItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? {
              ...i,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : null,
              completedBy: nextCompleted
                ? { id: user?.id || 1, name: user?.name || user?.username || "Admin", role: user?.role || "admin" }
                : null,
            }
          : i
      )
    )

    try {
      const res = await fetch(`/api/shopping-list/${item.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      })
      if (res.ok) {
        toast({
          title: nextCompleted ? "✓ Baixa Confirmada!" : "Item Reaberto",
          description: nextCompleted
            ? `"${item.title}" foi marcado como comprado.`
            : `"${item.title}" voltou para a lista de pendentes.`,
        })
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  // Criar novo item
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          quantity: isAdmin ? newQuantity.trim() : "",
          category: isAdmin ? newCategory : "Limpeza",
          notes: newNotes.trim(),
        }),
      })
      if (res.ok) {
        toast({
          title: "✓ Item Adicionado",
          description: `"${newTitle.trim()}" foi incluído na lista de compras.`,
        })
        setNewTitle("")
        setNewQuantity("")
        setNewNotes("")
        setNewCategory("Limpeza")
        fetchItems()
      } else {
        const d = await res.json()
        toast({ title: "Erro", description: d.error || "Não foi possível adicionar.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  // Deletar item
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remover "${title}" da lista de compras?`)) return

    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const res = await fetch(`/api/shopping-list/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Item Removido" })
      } else {
        fetchItems()
      }
    } catch {
      fetchItems()
    }
  }

  const pendingCount = useMemo(() => items.filter(i => !i.completed).length, [items])
  const completedCount = useMemo(() => items.filter(i => i.completed).length, [items])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status
      if (activeTab === "pending" && item.completed) return false
      if (activeTab === "completed" && !item.completed) return false

      // Category
      if (selectedCat !== "all" && (item.category || "").toLowerCase() !== selectedCat.toLowerCase()) {
        return false
      }

      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchQty = (item.quantity || "").toLowerCase().includes(q)
        const matchNotes = (item.notes || "").toLowerCase().includes(q)
        const matchAuthor = (item.createdBy?.name || "").toLowerCase().includes(q)
        return matchTitle || matchQty || matchNotes || matchAuthor
      }

      return true
    })
  }, [items, activeTab, selectedCat, search])

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-bold tracking-wide uppercase px-2.5 py-0.5 border-primary/30 text-primary bg-primary/5">
                🧹 Governança & Suprimentos
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold">
                Lista Compartilhada
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <ShoppingCart className="w-7 h-7 text-primary" />
              Lista de Compras da Governança
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-3xl">
              Lista única e em tempo real para reposição de produtos de limpeza, insumos dos flats e itens solicitados pelas camareiras ou pela administração. Dê baixa nos itens comprados com um clique.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchItems}
              disabled={loading}
              className="rounded-xl text-xs font-bold gap-1.5 h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Itens Pendentes</p>
                <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
                <p className="text-[10px] text-muted-foreground">Aguardando compra / reposição</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Comprados / Baixa Dada</p>
                <p className="text-2xl font-black text-emerald-600">{completedCount}</p>
                <p className="text-[10px] text-muted-foreground">Itens já adquiridos</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total de Registros</p>
                <p className="text-2xl font-black text-foreground">{items.length}</p>
                <p className="text-[10px] text-muted-foreground">No histórico de compras</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Add Form Card */}
        <Card className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-border/60 p-4 sm:p-5">
            <CardTitle className="text-sm sm:text-base font-black flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              {isAdmin ? "Adicionar Novo Item para Compra" : "Pedir Produto de Limpeza"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isAdmin
                ? "Qualquer colaboradora ou administrador verá este pedido imediatamente no painel e no app mobile."
                : "Informe o produto que está faltando na governança. A administração definirá a quantidade e providenciará a compra."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              {isAdmin ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Title */}
                  <div className="sm:col-span-5 space-y-1">
                    <Label className="text-xs font-bold">Item a Comprar *</Label>
                    <Input
                      placeholder="Ex: Detergente Neutro 5L, Papel Toalha..."
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="rounded-xl h-10 text-xs font-semibold"
                      required
                    />
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs font-bold">Qtd / Medida</Label>
                    <Input
                      placeholder="Ex: 4 galões, 10 un"
                      value={newQuantity}
                      onChange={e => setNewQuantity(e.target.value)}
                      className="rounded-xl h-10 text-xs font-semibold"
                    />
                  </div>

                  {/* Category */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs font-bold">Categoria</Label>
                    <select
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.label} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-xs font-bold">Observações (opcional)</Label>
                    <Input
                      placeholder="Ex: Urgente para o flat 212"
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      className="rounded-xl h-10 text-xs font-semibold"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Title */}
                  <div className="sm:col-span-7 space-y-1">
                    <Label className="text-xs font-bold">O que está faltando na limpeza? *</Label>
                    <Input
                      placeholder="Ex: Detergente Neutro, Esponja, Água Sanitária, Sabonete líquido..."
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="rounded-xl h-10 text-xs font-semibold"
                      required
                    />
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-5 space-y-1">
                    <Label className="text-xs font-bold">Observações / Detalhes (opcional)</Label>
                    <Input
                      placeholder="Ex: Acabou na rouparia do 5º andar"
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      className="rounded-xl h-10 text-xs font-semibold"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submitting || !newTitle.trim()}
                  className="rounded-xl h-9 text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm hover:brightness-110 px-5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? "Adicionando..." : isAdmin ? "Adicionar à Lista de Compras" : "Pedir Produto de Limpeza"}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/60">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "pending" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pendentes ({pendingCount})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "completed" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Comprados ({completedCount})
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Todos ({items.length})
            </button>
          </div>

          {/* Search + Category Filter */}
          <div className="flex items-center gap-2">
            {/* Category selector */}
            <select
              value={selectedCat}
              onChange={e => setSelectedCat(e.target.value)}
              className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground"
            >
              <option value="all">Todas as Categorias</option>
              {CATEGORIES.map(c => (
                <option key={c.label} value={c.label}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar item ou solicitante..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Items List */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Carregando lista de compras...</div>
        ) : filteredItems.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border p-12 text-center">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-20 text-muted-foreground" />
            <p className="font-bold text-foreground">Nenhum item encontrado.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTab === "pending"
                ? "Todos os itens solicitados já foram comprados!"
                : "Utilize o formulário acima para solicitar novos suprimentos."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filteredItems.map(item => {
              const catObj = CATEGORIES.find(c => c.label.toLowerCase() === (item.category || "").toLowerCase()) || CATEGORIES[0]
              return (
                <Card
                  key={item.id}
                  className={`rounded-2xl border transition-all ${item.completed ? "bg-card/50 border-border/60 opacity-80" : "bg-card border-border/80 shadow-xs hover:border-primary/40"}`}
                >
                  <CardContent className="p-4 flex items-start gap-3.5">
                    {/* Checkbox Dar Baixa */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${item.completed ? "bg-emerald-600 border-emerald-600 text-white" : "border-muted-foreground/40 hover:border-primary"}`}
                      title={item.completed ? "Reabrir item" : "Dar baixa (marcar como comprado)"}
                    >
                      {item.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-bold ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
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
                        <p className="text-xs text-muted-foreground mt-1">
                          📝 {item.notes}
                        </p>
                      )}

                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>
                          Solicitado por: <strong>{item.createdBy?.name || "Colaborador"}</strong> ({formatDateBr(item.createdAt)})
                        </span>

                        {item.completed && (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Comprado por {item.completedBy?.name || "Admin"} em {formatDateBr(item.completedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
