import { useState } from "react"
import { 
  useFaq, 
  FaqItem, 
  FaqCategory, 
  FaqStatus, 
  FaqScope, 
  FAQ_CATEGORIES, 
  formatDisplayPhone,
  FaqSuggestionOption
} from "@/hooks/use-faq"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  HelpCircle, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Check, 
  Clock, 
  Sparkles, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  DoorOpen, 
  Wifi, 
  Coffee, 
  Car, 
  Home, 
  ShieldCheck, 
  Phone, 
  User, 
  LayoutGrid, 
  List, 
  X, 
  CheckCircle2,
  Wand2,
  Copy,
  ChevronDown,
  ChevronUp
} from "lucide-react"

// Mapeamento dinâmico de ícones Lucide
const CATEGORY_ICONS: Record<string, any> = {
  Calendar,
  DoorOpen,
  Wifi,
  Coffee,
  Car,
  Home,
  ShieldCheck,
  Sparkles,
  Clock
}

export function FaqKnowledgeBase() {
  const {
    filteredItems,
    loading,
    search,
    setSearch,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    selectedScope,
    setSelectedScope,
    viewMode,
    setViewMode,
    categoryStats,
    statusCounts,
    fetchFaq,
    createFaq,
    updateFaq,
    deleteFaq,
    approveFaq,
    toggleStatus,
    refineSuggestion,
    resetFilters
  } = useFaq()

  // Estado do Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<FaqItem | null>(null)
  const [formCategory, setFormCategory] = useState<FaqCategory>("estrutura_flat")
  const [formQuestion, setFormQuestion] = useState("")
  const [formAnswer, setFormAnswer] = useState("")
  const [formKeywords, setFormKeywords] = useState("")
  const [formVariations, setFormVariations] = useState("")
  const [formScope, setFormScope] = useState<FaqScope>("all")
  const [formPhones, setFormPhones] = useState<string[]>([])
  const [phoneInput, setPhoneInput] = useState("")
  const [bulkPhoneInput, setBulkPhoneInput] = useState("")
  const [showBulkPhones, setShowBulkPhones] = useState(false)
  const [formStatus, setFormStatus] = useState<FaqStatus>("ativo")
  const [savingForm, setSavingForm] = useState(false)
  const [approvingInModal, setApprovingInModal] = useState(false)

  // Estado do Dialog de Exclusão
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<FaqItem | null>(null)

  // Estados do Assistente de Refinamento com IA
  const [refiningItemId, setRefiningItemId] = useState<string | null>(null)
  const [cardDirective, setCardDirective] = useState("")
  const [cardAiLoading, setCardAiLoading] = useState(false)
  const [cardSuggestions, setCardSuggestions] = useState<Record<string, FaqSuggestionOption[]>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Assistente de IA no Modal
  const [modalAiOpen, setModalAiOpen] = useState(false)
  const [modalDirective, setModalDirective] = useState("")
  const [modalAiLoading, setModalAiLoading] = useState(false)
  const [modalSuggestions, setModalSuggestions] = useState<FaqSuggestionOption[]>([])

  const handleRefineForCard = async (item: FaqItem) => {
    setCardAiLoading(true)
    try {
      const res = await refineSuggestion({
        id: item.id,
        question: item.question,
        currentAnswer: item.suggestedAnswer || item.answer || "",
        instruction: cardDirective,
        category: item.category
      })
      if (res?.suggestions) {
        setCardSuggestions(prev => ({
          ...prev,
          [item.id]: res.suggestions
        }))
      }
    } finally {
      setCardAiLoading(false)
    }
  }

  const handleRefineForModal = async () => {
    setModalAiLoading(true)
    try {
      const res = await refineSuggestion({
        id: editingItem?.id,
        question: formQuestion,
        currentAnswer: formAnswer,
        instruction: modalDirective,
        category: formCategory
      })
      if (res?.suggestions) {
        setModalSuggestions(res.suggestions)
      }
    } finally {
      setModalAiLoading(false)
    }
  }

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Abrir Modal de Criação
  const handleOpenCreate = (preselectedCategory?: FaqCategory) => {
    setEditingItem(null)
    setFormCategory(preselectedCategory || (selectedCategory !== "all" ? selectedCategory : "estrutura_flat"))
    setFormQuestion("")
    setFormAnswer("")
    setFormKeywords("")
    setFormVariations("")
    setFormScope("all")
    setFormPhones([])
    setPhoneInput("")
    setBulkPhoneInput("")
    setShowBulkPhones(false)
    setFormStatus("ativo")
    setModalDirective("")
    setModalSuggestions([])
    setModalAiOpen(false)
    setModalOpen(true)
  }

  // Abrir Modal de Edição
  const handleOpenEdit = (item: FaqItem, openAi: boolean = false) => {
    setEditingItem(item)
    setFormCategory(item.category || "estrutura_flat")
    setFormQuestion(item.question || "")
    setFormAnswer(item.answer || item.suggestedAnswer || "")
    setFormKeywords(Array.isArray(item.keywords) ? item.keywords.join(", ") : "")
    setFormVariations(Array.isArray(item.variations) ? item.variations.join("\n") : "")
    setFormScope(item.scope || "all")
    setFormPhones(Array.isArray(item.clientPhones) ? [...item.clientPhones] : [])
    setPhoneInput("")
    setBulkPhoneInput("")
    setShowBulkPhones(false)
    setFormStatus(item.status || "ativo")
    setModalDirective("")
    setModalSuggestions([])
    setModalAiOpen(openAi)
    setModalOpen(true)
  }

  // Adicionar telefone individual
  const handleAddPhone = () => {
    const raw = phoneInput.replace(/\D/g, "")
    if (!raw) return
    const formatted = raw.length === 10 || raw.length === 11 ? `55${raw}` : raw
    if (!formPhones.includes(formatted)) {
      setFormPhones(prev => [...prev, formatted])
    }
    setPhoneInput("")
  }

  // Adicionar telefones em lote
  const handleAddBulkPhones = () => {
    const lines = bulkPhoneInput.split(/[\n,;]+/).map(s => s.replace(/\D/g, "")).filter(Boolean)
    const normalized = lines.map(p => (p.length === 10 || p.length === 11 ? `55${p}` : p))
    setFormPhones(prev => Array.from(new Set([...prev, ...normalized])))
    setBulkPhoneInput("")
    setShowBulkPhones(false)
  }

  // Remover telefone
  const handleRemovePhone = (phoneToRemove: string) => {
    setFormPhones(prev => prev.filter(p => p !== phoneToRemove))
  }

  // Salvar formulário
  const handleSaveForm = async () => {
    if (!formQuestion.trim()) {
      return
    }

    setSavingForm(true)
    try {
      const keywordsArray = formKeywords.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
      const variationsArray = formVariations.split(/\n+/).map(s => s.trim()).filter(Boolean)

      if (editingItem) {
        await updateFaq(editingItem.id, {
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          keywords: keywordsArray,
          variations: variationsArray,
          scope: formScope,
          clientPhones: formPhones,
          status: formStatus
        })
      } else {
        await createFaq({
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          keywords: keywordsArray,
          variations: variationsArray,
          scope: formScope,
          clientPhones: formPhones,
          status: formStatus
        })
      }
      setModalOpen(false)
    } finally {
      setSavingForm(false)
    }
  }

  // Aprovar diretamente do modal
  const handleApproveFromModal = async () => {
    if (!editingItem) return
    setApprovingInModal(true)
    try {
      await approveFaq(editingItem.id, {
        question: formQuestion.trim(),
        answer: formAnswer.trim(),
        category: formCategory
      })
      setModalOpen(false)
    } finally {
      setApprovingInModal(false)
    }
  }

  // Confirmar exclusão
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    await deleteFaq(itemToDelete.id)
    setDeleteConfirmOpen(false)
    setItemToDelete(null)
  }

  // Badges auxiliares
  const renderStatusBadge = (status: FaqStatus) => {
    switch (status) {
      case "ativo":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 font-semibold gap-1">
            <Check className="w-3 h-3 text-emerald-600" />
            Ativa
          </Badge>
        )
      case "pendente":
        return (
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 font-semibold gap-1 animate-pulse">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Dúvida Pendente
          </Badge>
        )
      case "aguardando_aprovacao":
        return (
          <Badge className="bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 font-semibold gap-1">
            <Sparkles className="w-3 h-3 text-purple-600" />
            Sugestão IA
          </Badge>
        )
      case "inativo":
        return (
          <Badge variant="secondary" className="text-slate-600 dark:text-slate-400 font-semibold">
            Pausada
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const renderScopeBadge = (scope: FaqScope, phonesCount: number) => {
    switch (scope) {
      case "all":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            🌐 Todos os Clientes
          </span>
        )
      case "exclude":
        return (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 text-[11px] gap-1">
            🚫 Exceto {phonesCount} cliente(s)
          </Badge>
        )
      case "include_only":
        return (
          <Badge variant="outline" className="text-blue-700 dark:text-blue-400 border-blue-300 text-[11px] gap-1">
            ⭐ Exclusivo ({phonesCount})
          </Badge>
        )
    }
  }

  // Inserir formatação WhatsApp no textarea
  const insertFormatting = (prefix: string, suffix: string) => {
    const textarea = document.getElementById("faq-answer-textarea") as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = formAnswer
    const selected = text.substring(start, end)
    const replacement = `${prefix}${selected || "texto"}${suffix}`
    const updated = text.substring(0, start) + replacement + text.substring(end)
    setFormAnswer(updated)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length)
    }, 50)
  }

  return (
    <div className="space-y-6">
      {/* ─── Top Header & Summary ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Base de Conhecimento & FAQ Dinâmico
            </h2>
            <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200">
              Sofia AI v2
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Gerencie as respostas oficiais do agente de IA, aprove dúvidas e sugestões capturadas em tempo real e personalize regras por cliente.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchFaq()}
            disabled={loading}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Pergunta / FAQ
          </Button>
        </div>
      </div>

      {/* ─── Metric Cards (4 Cards) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total */}
        <Card className="border-indigo-100 dark:border-indigo-950 shadow-xs bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total de FAQs</p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{statusCounts.todas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">9 categorias cobertas</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <HelpCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Ativas */}
        <Card className="border-emerald-100 dark:border-emerald-950 shadow-xs bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Ativas na IA</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{statusCounts.ativas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Respostas autônomas</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Pendentes */}
        <Card className={`border-amber-200 dark:border-amber-900 shadow-xs bg-white dark:bg-slate-900 ${statusCounts.pendentes > 0 ? "ring-2 ring-amber-400/50" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Dúvidas Pendentes</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{statusCounts.pendentes}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Sem resposta mapeada</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Sugestões IA */}
        <Card className={`border-purple-200 dark:border-purple-900 shadow-xs bg-white dark:bg-slate-900 ${statusCounts.sugestoes_ia > 0 ? "ring-2 ring-purple-500/60 animate-pulse" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Aprovar em 1 Clique</p>
              <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{statusCounts.sugestoes_ia}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Respostas de operador</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Category Cards Grid (9 Categorias) ─────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Categorias da Base de Conhecimento ({Object.keys(FAQ_CATEGORIES).length})
          </span>
          {selectedCategory !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className="text-xs h-7 text-indigo-600 dark:text-indigo-400"
            >
              Limpar filtro de categoria
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2 md:gap-2.5">
          {Object.entries(FAQ_CATEGORIES).map(([catKey, meta]) => {
            const catId = catKey as FaqCategory
            const isSelected = selectedCategory === catId
            const stats = categoryStats[catId]
            const IconComp = CATEGORY_ICONS[meta.iconName] || HelpCircle

            return (
              <button
                key={catId}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? "all" : catId)}
                className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-xs"
                    : "bg-card hover:bg-muted/50 border-border hover:border-muted-foreground/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.bgLightClass} ${meta.colorClass}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {stats?.count || 0}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-2 truncate">
                    {meta.shortLabel}
                  </p>
                </div>

                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/50 text-[10px]">
                  {stats?.awaitingApproval > 0 && (
                    <span className="px-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                      {stats.awaitingApproval} apr.
                    </span>
                  )}
                  {stats?.pending > 0 && (
                    <span className="px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                      {stats.pending} pend.
                    </span>
                  )}
                  {stats?.pending === 0 && stats?.awaitingApproval === 0 && (
                    <span className="text-muted-foreground font-medium">
                      {stats?.active || 0} ativas
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Toolbar: Filtros Rápidos, Busca e Modos de Exibição ──────────────── */}
      <Card className="border-border shadow-xs bg-card">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* 4 Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <Button
                variant={selectedStatus === "todas" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("todas")}
                className="h-8 text-xs font-bold rounded-lg"
              >
                Todas ({statusCounts.todas})
              </Button>

              <Button
                variant={selectedStatus === "ativas" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("ativas")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "ativas" ? "bg-emerald-600 hover:bg-emerald-700" : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                Ativas ({statusCounts.ativas})
              </Button>

              <Button
                variant={selectedStatus === "pendentes" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("pendentes")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "pendentes" ? "bg-amber-600 hover:bg-amber-700" : "text-amber-700 dark:text-amber-400"
                }`}
              >
                Perguntas Pendentes ({statusCounts.pendentes})
              </Button>

              <Button
                variant={selectedStatus === "sugestoes_ia" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("sugestoes_ia")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "sugestoes_ia" ? "bg-purple-600 hover:bg-purple-700" : "text-purple-700 dark:text-purple-400"
                }`}
              >
                Sugestões de IA ({statusCounts.sugestoes_ia})
              </Button>
            </div>

            {/* Alternador de Modo Tabela vs Cards */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg self-end md:self-auto">
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-7 px-2.5 text-xs font-bold"
              >
                <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                Cards
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-7 px-2.5 text-xs font-bold"
              >
                <List className="w-3.5 h-3.5 mr-1" />
                Tabela
              </Button>
            </div>
          </div>

          {/* Segunda linha da Toolbar: Campo de Busca e Filtro de Escopo */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-border/40">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por pergunta, resposta, palavras-chave, sinônimos ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={selectedScope} onValueChange={(val: any) => setSelectedScope(val)}>
                <SelectTrigger className="h-9 text-xs w-full sm:w-[200px]">
                  <SelectValue placeholder="Filtrar por Regra / Escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Escopos</SelectItem>
                  <SelectItem value="exclude">Exceção Negativa (exclude)</SelectItem>
                  <SelectItem value="include_only">Exceção Positiva (include_only)</SelectItem>
                </SelectContent>
              </Select>

              {(search || selectedCategory !== "all" || selectedStatus !== "todas" || selectedScope !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 text-xs text-muted-foreground whitespace-nowrap"
                >
                  Limpar Filtros
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Listagem de FAQs (Card View vs Table View) ──────────────────────── */}
      {filteredItems.length === 0 ? (
        <Card className="border-dashed p-8 text-center bg-card">
          <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Nenhuma pergunta encontrada
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Não encontramos nenhum item correspondente aos filtros selecionados. Tente ajustar os termos de busca ou crie uma nova pergunta.
          </p>
          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="gap-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar Nova Pergunta
          </Button>
        </Card>
      ) : viewMode === "cards" ? (
        /* Modo Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const catMeta = FAQ_CATEGORIES[item.category] || FAQ_CATEGORIES.estrutura_flat
            const IconComp = CATEGORY_ICONS[catMeta.iconName] || HelpCircle
            const isAwaitingApproval = item.status === "aguardando_aprovacao"
            const isPending = item.status === "pendente"

            return (
              <Card
                key={item.id}
                className={`flex flex-col justify-between shadow-xs transition-all ${
                  isAwaitingApproval
                    ? "border-purple-300 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10 ring-1 ring-purple-400/40"
                    : isPending
                    ? "border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
                    : "border-border bg-card"
                }`}
              >
                <CardHeader className="p-4 pb-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-[11px] gap-1 ${catMeta.badgeClass}`}>
                      <IconComp className="w-3 h-3" />
                      {catMeta.label}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {renderStatusBadge(item.status)}
                    </div>
                  </div>

                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-snug">
                    {item.question}
                  </h4>

                  {/* Informações de origem em dúvidas pendentes */}
                  {(item.sourceClientName || item.sourceClientPhone) && (
                    <div className="p-2 rounded-lg bg-muted/60 text-[11px] space-y-0.5 border border-border/50">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span className="font-semibold">{item.sourceClientName || "Cliente"}</span>
                        {item.sourceClientPhone && (
                          <span className="text-muted-foreground/80">({formatDisplayPhone(item.sourceClientPhone)})</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3 flex-1">
                  {/* Resposta Sugerida pelo Operador / Diretriz Destilada (se aguardando aprovação) */}
                  {isAwaitingApproval && (item.suggestedAnswer || item.distilledGuideline) && (
                    <div className="p-3 rounded-xl bg-purple-100/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          {item.answeredBy === "operador" ? "🧠 Aprendizado com Operador (Diretriz Viva):" : "Sugestão Inteligente da IA:"}
                        </span>
                        {item.distilledGuideline && (
                          <Badge className="bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200 text-[9px] font-bold border-0">
                            Diretriz Viva
                          </Badge>
                        )}
                      </div>

                      {item.operatorRawResponse && (
                        <div className="p-1.5 rounded-md bg-purple-200/50 dark:bg-purple-900/30 text-[11px] text-purple-950 dark:text-purple-200">
                          <span className="font-bold">Intervenção do operador no WhatsApp:</span> "{item.operatorRawResponse}"
                        </div>
                      )}

                      {item.distilledGuideline && (
                        <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-purple-200/60 dark:border-purple-800 text-xs">
                          <span className="font-bold text-purple-900 dark:text-purple-300 block mb-0.5">📌 Fato / Regra Conceitual Aprendida:</span>
                          <span className="text-slate-700 dark:text-slate-300">{item.distilledGuideline}</span>
                        </div>
                      )}

                      {item.suggestedAnswer && (
                        <div className="text-xs text-slate-800 dark:text-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Amostra Contextual Dinâmica:</span>
                          <p className="whitespace-pre-wrap leading-relaxed">{item.suggestedAnswer}</p>
                        </div>
                      )}

                      <Button
                        size="sm"
                        onClick={() => approveFaq(item.id)}
                        className="w-full text-xs font-black bg-purple-600 hover:bg-purple-700 text-white gap-1.5 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        ✓ Confirmar e Ativar Diretriz
                      </Button>
                    </div>
                  )}

                  {/* Resposta Oficial (se já respondida) */}
                  {item.answer && !isAwaitingApproval && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                      {item.answer}
                    </div>
                  )}

                  {/* Botão para alternar Painel de Refinamento / Novas Sugestões com IA */}
                  <div className="pt-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (refiningItemId === item.id) {
                          setRefiningItemId(null)
                        } else {
                          setRefiningItemId(item.id)
                          setCardDirective("")
                        }
                      }}
                      className={`w-full h-7 text-[11px] font-semibold gap-1.5 transition-all ${
                        refiningItemId === item.id
                          ? "bg-indigo-100 text-indigo-950 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200"
                          : "text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      }`}
                    >
                      <Wand2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      {refiningItemId === item.id ? "Fechar Assistente de IA" : "🪄 Ajustar / Novas Sugestões com IA"}
                    </Button>
                  </div>

                  {/* Painel Expansível de Refinamento com IA */}
                  {refiningItemId === item.id && (
                    <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
                            O que deve ser dito ou alterado?
                          </Label>
                          <span className="text-[10px] text-muted-foreground">Ex: "Dizer que tem micro-ondas"</span>
                        </div>
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="Instrução para a IA (ou deixe vazio para padrão)..."
                            value={cardDirective}
                            onChange={e => setCardDirective(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleRefineForCard(item)
                              }
                            }}
                            className="h-7 text-xs bg-white dark:bg-slate-900"
                          />
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => handleRefineForCard(item)}
                            disabled={cardAiLoading}
                            className="h-7 px-2.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 gap-1"
                          >
                            <Sparkles className={`w-3 h-3 ${cardAiLoading ? "animate-spin" : ""}`} />
                            {cardAiLoading ? "Gerando..." : "Gerar Opções"}
                          </Button>
                        </div>
                      </div>

                      {/* Opções Geradas */}
                      {cardSuggestions[item.id] && cardSuggestions[item.id].length > 0 && (
                        <div className="space-y-2 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 block">
                            Opções Formatadas para WhatsApp:
                          </span>
                          {cardSuggestions[item.id].map((sug, sIdx) => (
                            <div
                              key={sug.id || sIdx}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900 space-y-2 text-xs shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <Badge variant="secondary" className="text-[10px] font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950">
                                  {sug.label}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCopyText(sug.text, `${item.id}_${sIdx}`)}
                                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                    title="Copiar texto"
                                  >
                                    {copiedId === `${item.id}_${sIdx}` ? (
                                      <span className="text-emerald-600 font-bold text-[10px]">Copiado!</span>
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      handleOpenEdit(item)
                                      setFormAnswer(sug.text)
                                    }}
                                    className="h-6 px-1.5 text-[10px] font-bold text-indigo-700 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-800"
                                    title="Abrir no editor para personalizar"
                                  >
                                    <Edit3 className="w-2.5 h-2.5 mr-0.5" />
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={async () => {
                                      await approveFaq(item.id, { answer: sug.text })
                                      setRefiningItemId(null)
                                    }}
                                    className="h-6 px-2 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                  >
                                    <Check className="w-2.5 h-2.5" />
                                    Aprovar Esta
                                  </Button>
                                </div>
                              </div>
                              <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                                {sug.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Escopo de Clientes */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                    <span className="text-muted-foreground text-[11px]">Regra:</span>
                    {renderScopeBadge(item.scope, item.clientPhones?.length || 0)}
                  </div>

                  {/* Palavras-chave / Tags */}
                  {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {item.keywords.slice(0, 4).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-medium">
                          #{kw}
                        </span>
                      ))}
                      {item.keywords.length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{item.keywords.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>

                {/* Rodapé de Ações */}
                <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={item.status === "ativo"}
                      onCheckedChange={() => toggleStatus(item)}
                      aria-label="Ativar ou pausar resposta"
                    />
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {item.status === "ativo" ? "Ativa" : "Pausada"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isPending && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleOpenEdit(item)}
                        className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        Responder
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEdit(item)}
                      className="h-7 px-2 text-xs"
                      title="Editar Pergunta"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setItemToDelete(item)
                        setDeleteConfirmOpen(true)
                      }}
                      className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="Excluir FAQ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* Modo Tabela Detalhada */
        <Card className="border-border shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[140px]">Categoria</TableHead>
                <TableHead className="min-w-[200px]">Pergunta Principal</TableHead>
                <TableHead className="min-w-[250px]">Resposta / Sugestão</TableHead>
                <TableHead className="w-[160px]">Regra de Clientes</TableHead>
                <TableHead className="w-[140px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => {
                const catMeta = FAQ_CATEGORIES[item.category] || FAQ_CATEGORIES.estrutura_flat
                const IconComp = CATEGORY_ICONS[catMeta.iconName] || HelpCircle
                const isAwaitingApproval = item.status === "aguardando_aprovacao"

                return (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell>
                      {renderStatusBadge(item.status)}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] gap-1 ${catMeta.badgeClass}`}>
                        <IconComp className="w-3 h-3" />
                        {catMeta.shortLabel}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100 block">
                          {item.question}
                        </span>
                        {item.sourceClientName && (
                          <span className="text-[10px] text-muted-foreground block">
                            De: {item.sourceClientName} ({formatDisplayPhone(item.sourceClientPhone || "")})
                          </span>
                        )}
                        {Array.isArray(item.variations) && item.variations.length > 0 && (
                          <span className="text-[10px] text-muted-foreground block">
                            +{item.variations.length} variação(ões) mapeadas
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {isAwaitingApproval && (item.distilledGuideline || item.suggestedAnswer) ? (
                        <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 text-xs text-purple-950 dark:text-purple-200 space-y-1">
                          {item.distilledGuideline ? (
                            <div>
                              <span className="font-bold text-[10px] text-purple-700 block">🧠 Diretriz Viva:</span>
                              <span className="line-clamp-2">{item.distilledGuideline}</span>
                            </div>
                          ) : (
                            <div>
                              <span className="font-bold text-[10px] text-purple-700 block">Sugestão:</span>
                              <span className="line-clamp-2">{item.suggestedAnswer}</span>
                            </div>
                          )}
                          {item.operatorRawResponse && (
                            <span className="text-[10px] text-purple-600/90 block italic">WhatsApp: "{item.operatorRawResponse}"</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                          {item.answer || <span className="text-muted-foreground italic">Sem resposta ainda</span>}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {renderScopeBadge(item.scope, item.clientPhones?.length || 0)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAwaitingApproval && (
                          <Button
                            size="sm"
                            onClick={() => approveFaq(item.id)}
                            className="h-7 px-2 text-[11px] font-black bg-purple-600 hover:bg-purple-700 text-white gap-1"
                            title="Aprovar com 1 clique"
                          >
                            <Check className="w-3 h-3" />
                            Aprovar
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(item, true)}
                          className="h-7 w-7 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                          title="Ajustar / Gerar Sugestões com IA"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(item)}
                          className="h-7 w-7 p-0"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setItemToDelete(item)
                            setDeleteConfirmOpen(true)
                          }}
                          className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ─── Modal de Criação / Edição de FAQ ─────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              {editingItem ? "Editar Pergunta & Resposta do FAQ" : "Cadastrar Nova Pergunta no FAQ"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure a pergunta oficial, variações de busca, resposta formatada para WhatsApp e exceções por cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Categoria e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Categoria</Label>
                <Select value={formCategory} onValueChange={(val: any) => setFormCategory(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FAQ_CATEGORIES).map(([key, cat]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Status do Item</Label>
                <Select value={formStatus} onValueChange={(val: any) => setFormStatus(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo" className="text-xs text-emerald-600 font-bold">✓ Ativo na IA</SelectItem>
                    <SelectItem value="inativo" className="text-xs text-slate-600">Pausado / Inativo</SelectItem>
                    <SelectItem value="pendente" className="text-xs text-amber-600">Pendente de Resposta</SelectItem>
                    <SelectItem value="aguardando_aprovacao" className="text-xs text-purple-600">Aguardando Aprovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pergunta Principal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Pergunta Principal *</Label>
              <Input
                placeholder="Ex: Como funciona o café da manhã no quarto?"
                value={formQuestion}
                onChange={e => setFormQuestion(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Se houver resposta sugerida pelo operador */}
            {editingItem?.suggestedAnswer && (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    {editingItem.answeredBy === "operador" ? "Resposta Sugerida pelo Operador:" : "Sugestão Inteligente da IA:"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormAnswer(editingItem.suggestedAnswer || "")}
                    className="h-6 text-[10px] text-purple-700 border-purple-300"
                  >
                    Copiar para Resposta Oficial
                  </Button>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {editingItem.suggestedAnswer}
                </p>
              </div>
            )}

            {/* Assistente de Redação com IA no Modal */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  Assistente de Redação com IA
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModalAiOpen(!modalAiOpen)}
                  className="h-6 text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold"
                >
                  {modalAiOpen ? "Ocultar Assistente" : "🪄 Abrir Assistente de IA"}
                </Button>
              </div>

              {modalAiOpen && (
                <div className="space-y-2.5 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Instrução para a IA (o que dizer ou mudar):
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: 'Informar que todos os quartos contam com micro-ondas e cafeteira'"
                        value={modalDirective}
                        onChange={e => setModalDirective(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleRefineForModal()
                          }
                        }}
                        className="text-xs h-8 bg-white dark:bg-slate-900"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleRefineForModal}
                        disabled={modalAiLoading}
                        className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 gap-1.5"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${modalAiLoading ? "animate-spin" : ""}`} />
                        {modalAiLoading ? "Gerando..." : "Gerar Opções"}
                      </Button>
                    </div>
                  </div>

                  {modalSuggestions.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-indigo-200/50 dark:border-indigo-900">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 block">
                        Escolha uma opção para preencher a Resposta Oficial:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {modalSuggestions.map((sug, idx) => (
                          <div
                            key={sug.id || idx}
                            className="p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2 hover:border-indigo-500 transition-colors"
                          >
                            <div className="space-y-1">
                              <Badge variant="outline" className="text-[10px] font-bold text-indigo-700 border-indigo-300">
                                {sug.label}
                              </Badge>
                              <p className="text-[11px] text-slate-800 dark:text-slate-200 line-clamp-4 leading-relaxed whitespace-pre-wrap">
                                {sug.text}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 pt-1">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setFormAnswer(sug.text)
                                }}
                                className="flex-1 h-7 text-[10px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-900 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-200"
                              >
                                Usar Esta Resposta
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyText(sug.text, `modal_${idx}`)}
                                className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                                title="Copiar texto"
                              >
                                {copiedId === `modal_${idx}` ? (
                                  <span className="text-emerald-600 font-bold text-[10px]">Copiado!</span>
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Resposta Oficial Formatada WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">Resposta Oficial (Formatação WhatsApp)</Label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertFormatting("*", "*")}
                    className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-muted hover:bg-muted/80"
                    title="Negrito: *texto*"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("_", "_")}
                    className="px-1.5 py-0.5 rounded text-[11px] italic bg-muted hover:bg-muted/80"
                    title="Itálico: _texto_"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("~", "~")}
                    className="px-1.5 py-0.5 rounded text-[11px] line-through bg-muted hover:bg-muted/80"
                    title="Tachado: ~texto~"
                  >
                    S
                  </button>
                </div>
              </div>
              <Textarea
                id="faq-answer-textarea"
                rows={4}
                placeholder="Digite a resposta oficial. Suporta *negrito*, _itálico_, quebras de linha e emojis."
                value={formAnswer}
                onChange={e => setFormAnswer(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Dica: Respostas claras e cordiais melhoram o índice de satisfação do hóspede no atendimento automatizado.
              </p>
            </div>

            {/* Variações de Pergunta (Sinônimos de busca) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Variações da Pergunta (1 por linha)</Label>
              <Textarea
                rows={2}
                placeholder={"O café é servido no quarto?\nComo peço o café da manhã?\nTem café incluso?"}
                value={formVariations}
                onChange={e => setFormVariations(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Frases alternativas que os hóspedes costumam usar para fazer esta mesma pergunta.
              </p>
            </div>

            {/* Palavras-chave / Keywords */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Palavras-chave (Tags separadas por vírgula)</Label>
              <Input
                placeholder="cafe, quarto, bandeja, cardapio, horario"
                value={formKeywords}
                onChange={e => setFormKeywords(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* ─── Configuração de Exceções de Clientes (R4) ──────────────────── */}
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                  Regras de Exceção & Segmentação de Clientes (R4)
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Escopo da Regra</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormScope("all")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "all"
                        ? "bg-indigo-100/70 border-indigo-500 font-bold text-indigo-950 dark:bg-indigo-950 dark:text-indigo-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">🌐 Todos os Clientes</p>
                    <p className="text-[10px] opacity-80 mt-0.5">Regra padrão universal.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormScope("exclude")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "exclude"
                        ? "bg-amber-100/70 border-amber-500 font-bold text-amber-950 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">🚫 Exceção Negativa</p>
                    <p className="text-[10px] opacity-80 mt-0.5">NÃO vale para os números listados.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormScope("include_only")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "include_only"
                        ? "bg-blue-100/70 border-blue-500 font-bold text-blue-950 dark:bg-blue-950 dark:text-blue-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">⭐ Exceção Positiva</p>
                    <p className="text-[10px] opacity-80 mt-0.5">SÓ vale para os números listados.</p>
                  </button>
                </div>
              </div>

              {/* Gerenciador de telefones se exclude ou include_only */}
              {formScope !== "all" && (
                <div className="space-y-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-900">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">
                      {formScope === "exclude"
                        ? "Telefones Bloqueados (Sofia não responderá para estes)"
                        : "Telefones Exclusivos (Sofia responderá apenas a estes)"}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowBulkPhones(!showBulkPhones)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold"
                    >
                      {showBulkPhones ? "Adicionar individual" : "+ Colar lote de telefones"}
                    </button>
                  </div>

                  {showBulkPhones ? (
                    <div className="space-y-1.5">
                      <Textarea
                        rows={2}
                        placeholder="Cole números separados por vírgula ou linha (ex: 22998505276, 21988887777)"
                        value={bulkPhoneInput}
                        onChange={e => setBulkPhoneInput(e.target.value)}
                        className="text-xs font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddBulkPhones}
                        className="h-7 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        Adicionar Todos os Números
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="(22) 99850-5276 ou 5522998505276"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddPhone()
                          }
                        }}
                        className="text-xs h-8"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddPhone}
                        className="h-8 text-xs font-bold"
                      >
                        Adicionar
                      </Button>
                    </div>
                  )}

                  {/* Badges de Telefones Adicionados */}
                  {formPhones.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg bg-background border border-border">
                      {formPhones.map(phone => (
                        <span
                          key={phone}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted font-mono"
                        >
                          <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                          {formatDisplayPhone(phone)}
                          <button
                            type="button"
                            onClick={() => handleRemovePhone(phone)}
                            className="text-muted-foreground hover:text-rose-600 ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 italic">
                      Nenhum telefone adicionado. Adicione ao menos um número para ativar esta regra de exceção.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>

            {editingItem?.status === "aguardando_aprovacao" && (
              <Button
                type="button"
                size="sm"
                onClick={handleApproveFromModal}
                disabled={approvingInModal || savingForm}
                className="text-xs font-black bg-purple-600 hover:bg-purple-700 text-white gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                {approvingInModal ? "Aprovando..." : "✓ Aprovar & Ativar Agora"}
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleSaveForm}
              disabled={savingForm || approvingInModal || !formQuestion.trim()}
              className="text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingForm ? "Salvando..." : editingItem ? "Salvar Alterações" : "Cadastrar Pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AlertDialog de Confirmação de Exclusão ───────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-black text-rose-600 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Excluir pergunta da Base de Conhecimento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja excluir <strong>"{itemToDelete?.question}"</strong>? A Sofia deixará de responder esta dúvida imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              Sim, Excluir Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
