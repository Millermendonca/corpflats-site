import { useState, useEffect, useCallback, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"

export type FaqCategory =
  | "reservas"
  | "checkin_acesso"
  | "wifi_tecnologia"
  | "cafe_manha"
  | "garagem"
  | "estrutura_flat"
  | "regras_visitas_pets"
  | "lazer_condominio"
  | "checkout"

export type FaqStatus = "ativo" | "inativo" | "pendente" | "aguardando_aprovacao"
export type FaqScope = "all" | "exclude" | "include_only"
export type FaqStatusFilter = "todas" | "ativas" | "pendentes" | "sugestoes_ia"

export interface FaqItem {
  id: string
  question: string
  answer: string
  category: FaqCategory
  keywords: string[]
  variations: string[]
  status: FaqStatus
  scope: FaqScope
  clientPhones: string[]
  suggestedAnswer?: string
  sourceClientPhone?: string
  sourceClientName?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
}

export interface CreateFaqInput {
  question: string
  answer?: string
  category?: FaqCategory
  keywords?: string[] | string
  variations?: string[] | string
  scope?: FaqScope
  clientPhones?: string[] | string
  status?: FaqStatus
  suggestedAnswer?: string
  sourceClientPhone?: string
  sourceClientName?: string
}

export interface UpdateFaqInput {
  question?: string
  answer?: string
  category?: FaqCategory
  keywords?: string[] | string
  variations?: string[] | string
  scope?: FaqScope
  clientPhones?: string[] | string
  status?: FaqStatus
  suggestedAnswer?: string
}

export interface ApproveFaqInput {
  answer?: string
  category?: FaqCategory
  question?: string
}

export interface FaqCategoryMeta {
  id: FaqCategory
  label: string
  shortLabel: string
  description: string
  iconName: string
  colorClass: string
  badgeClass: string
  borderClass: string
  bgLightClass: string
}

export const FAQ_CATEGORIES: Record<FaqCategory, FaqCategoryMeta> = {
  reservas: {
    id: "reservas",
    label: "Reservas",
    shortLabel: "Reservas",
    description: "Período, diárias, forma de pagamento, confirmação e cancelamento",
    iconName: "Calendar",
    colorClass: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
    borderClass: "border-blue-200 dark:border-blue-900",
    bgLightClass: "bg-blue-50/50 dark:bg-blue-950/20"
  },
  checkin_acesso: {
    id: "checkin_acesso",
    label: "Check-in & Acesso",
    shortLabel: "Check-in",
    description: "Horário 14h, early check-in, portaria 24h, fechadura e identificação",
    iconName: "DoorOpen",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    borderClass: "border-emerald-200 dark:border-emerald-900",
    bgLightClass: "bg-emerald-50/50 dark:bg-emerald-950/20"
  },
  wifi_tecnologia: {
    id: "wifi_tecnologia",
    label: "Wi-Fi & Tecnologia",
    shortLabel: "Wi-Fi",
    description: "Rede CorpFlats-Hospedes, senha corpflats2026, 500MB e Smart TV",
    iconName: "Wifi",
    colorClass: "text-cyan-600 dark:text-cyan-400",
    badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200",
    borderClass: "border-cyan-200 dark:border-cyan-900",
    bgLightClass: "bg-cyan-50/50 dark:bg-cyan-950/20"
  },
  cafe_manha: {
    id: "cafe_manha",
    label: "Café da Manhã",
    shortLabel: "Café",
    description: "Servido exclusivamente na bandeja no quarto, cardápio e horários",
    iconName: "Coffee",
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
    borderClass: "border-amber-200 dark:border-amber-900",
    bgLightClass: "bg-amber-50/50 dark:bg-amber-950/20"
  },
  garagem: {
    id: "garagem",
    label: "Garagem",
    shortLabel: "Garagem",
    description: "Vagas rotativas e cobertas, controle de acesso e regras",
    iconName: "Car",
    colorClass: "text-slate-600 dark:text-slate-400",
    badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-300 border-slate-200",
    borderClass: "border-slate-200 dark:border-slate-800",
    bgLightClass: "bg-slate-50/50 dark:bg-slate-900/20"
  },
  estrutura_flat: {
    id: "estrutura_flat",
    label: "Estrutura do Flat",
    shortLabel: "Estrutura",
    description: "Cozinha completa, ar condicionado, frigobar, secador e enxoval",
    iconName: "Home",
    colorClass: "text-violet-600 dark:text-violet-400",
    badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200",
    borderClass: "border-violet-200 dark:border-violet-900",
    bgLightClass: "bg-violet-50/50 dark:bg-violet-950/20"
  },
  regras_visitas_pets: {
    id: "regras_visitas_pets",
    label: "Regras, Visitas & Pets",
    shortLabel: "Regras/Pets",
    description: "Visitantes na portaria, pets de pequeno porte e lei do silêncio",
    iconName: "ShieldCheck",
    colorClass: "text-rose-600 dark:text-rose-400",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200",
    borderClass: "border-rose-200 dark:border-rose-900",
    bgLightClass: "bg-rose-50/50 dark:bg-rose-950/20"
  },
  lazer_condominio: {
    id: "lazer_condominio",
    label: "Lazer & Condomínio",
    shortLabel: "Lazer",
    description: "Piscina, sauna, academia, rooftop e regras das áreas comuns",
    iconName: "Sparkles",
    colorClass: "text-teal-600 dark:text-teal-400",
    badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200",
    borderClass: "border-teal-200 dark:border-teal-900",
    bgLightClass: "bg-teal-50/50 dark:bg-teal-950/20"
  },
  checkout: {
    id: "checkout",
    label: "Check-out",
    shortLabel: "Check-out",
    description: "Horário 12h, late check-out, louças e devolução de cartão na portaria",
    iconName: "Clock",
    colorClass: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200",
    borderClass: "border-purple-200 dark:border-purple-900",
    bgLightClass: "bg-purple-50/50 dark:bg-purple-950/20"
  }
}

export function formatDisplayPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return phone || ""
  let clean = digits
  if (clean.startsWith("55") && clean.length >= 12) {
    clean = clean.substring(2)
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`
  }
  if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`
  }
  return phone
}

export function useFaq(options?: { autoFetch?: boolean }) {
  const { autoFetch = true } = options || {}
  const { toast } = useToast()

  const [items, setItems] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory | "all">("all")
  const [selectedStatus, setSelectedStatus] = useState<FaqStatusFilter>("todas")
  const [selectedScope, setSelectedScope] = useState<FaqScope | "all">("all")
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards")

  const fetchFaq = useCallback(async (): Promise<FaqItem[]> => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/whatsapp/faq")
      if (!res.ok) {
        throw new Error(`Falha ao buscar base de FAQ (Status ${res.status})`)
      }
      const data = await res.json()
      const fetchedItems: FaqItem[] = Array.isArray(data.items) ? data.items : []
      setItems(fetchedItems)
      return fetchedItems
    } catch (err: any) {
      const message = err.message || "Erro de conexão ao carregar FAQ."
      setError(message)
      toast({
        title: "Erro ao carregar Base de FAQ",
        description: message,
        variant: "destructive"
      })
      return []
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (autoFetch) {
      fetchFaq()
    }
  }, [autoFetch, fetchFaq])

  // Contadores e estatísticas
  const statusCounts = useMemo(() => {
    let todas = items.length
    let ativas = 0
    let pendentes = 0
    let sugestoes_ia = 0
    for (const item of items) {
      if (item.status === "ativo") ativas++
      else if (item.status === "pendente") pendentes++
      else if (item.status === "aguardando_aprovacao") sugestoes_ia++
    }
    return { todas, ativas, pendentes, sugestoes_ia }
  }, [items])

  const categoryStats = useMemo(() => {
    const stats: Record<FaqCategory, { count: number; active: number; pending: number; awaitingApproval: number }> = {
      reservas: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      checkin_acesso: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      wifi_tecnologia: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      cafe_manha: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      garagem: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      estrutura_flat: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      regras_visitas_pets: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      lazer_condominio: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      checkout: { count: 0, active: 0, pending: 0, awaitingApproval: 0 }
    }

    for (const item of items) {
      if (stats[item.category]) {
        stats[item.category].count++
        if (item.status === "ativo") stats[item.category].active++
        if (item.status === "pendente") stats[item.category].pending++
        if (item.status === "aguardando_aprovacao") stats[item.category].awaitingApproval++
      }
    }
    return stats
  }, [items])

  // Lista filtrada
  const filteredItems = useMemo(() => {
    let result = [...items]

    // 1. Filtro por status
    if (selectedStatus === "ativas") {
      result = result.filter(i => i.status === "ativo")
    } else if (selectedStatus === "pendentes") {
      result = result.filter(i => i.status === "pendente")
    } else if (selectedStatus === "sugestoes_ia") {
      result = result.filter(i => i.status === "aguardando_aprovacao")
    }

    // 2. Filtro por categoria
    if (selectedCategory !== "all") {
      result = result.filter(i => i.category === selectedCategory)
    }

    // 3. Filtro por escopo
    if (selectedScope !== "all") {
      result = result.filter(i => i.scope === selectedScope)
    }

    // 4. Filtro por busca
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(i => {
        const questionMatch = i.question && i.question.toLowerCase().includes(q)
        const answerMatch = i.answer && i.answer.toLowerCase().includes(q)
        const suggestedMatch = i.suggestedAnswer && i.suggestedAnswer.toLowerCase().includes(q)
        const keywordsMatch = Array.isArray(i.keywords) && i.keywords.some(k => String(k).toLowerCase().includes(q))
        const variationsMatch = Array.isArray(i.variations) && i.variations.some(v => String(v).toLowerCase().includes(q))
        const phonesMatch = Array.isArray(i.clientPhones) && i.clientPhones.some(p => String(p).includes(q))
        const authorMatch = i.sourceClientName && i.sourceClientName.toLowerCase().includes(q)
        return questionMatch || answerMatch || suggestedMatch || keywordsMatch || variationsMatch || phonesMatch || authorMatch
      })
    }

    // Ordenação: sugestões de aprovação e pendentes no topo, seguidos por mais recentes
    return result.sort((a, b) => {
      const priorityOrder: Record<FaqStatus, number> = {
        aguardando_aprovacao: 1,
        pendente: 2,
        ativo: 3,
        inativo: 4
      }
      const orderA = priorityOrder[a.status] || 99
      const orderB = priorityOrder[b.status] || 99
      if (orderA !== orderB) return orderA - orderB

      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return dateB - dateA
    })
  }, [items, selectedStatus, selectedCategory, selectedScope, search])

  // Ações CRUD
  const createFaq = async (input: CreateFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch("/api/whatsapp/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar pergunta no FAQ.")
      }
      const createdItem: FaqItem = data.item
      setItems(prev => [createdItem, ...prev.filter(i => i.id !== createdItem.id)])
      toast({
        title: "✓ FAQ Criado com Sucesso!",
        description: `"${createdItem.question}" foi adicionado à base.`
      })
      return createdItem
    } catch (err: any) {
      toast({
        title: "Erro ao criar FAQ",
        description: err.message || "Não foi possível cadastrar a pergunta.",
        variant: "destructive"
      })
      return null
    }
  }

  const updateFaq = async (id: string, input: UpdateFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao atualizar item do FAQ.")
      }
      const updatedItem: FaqItem = data.item
      setItems(prev => prev.map(i => (i.id === id ? updatedItem : i)))
      toast({
        title: "✓ FAQ Atualizado!",
        description: `Alterações em "${updatedItem.question}" foram salvas.`
      })
      return updatedItem
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar FAQ",
        description: err.message || "Não foi possível atualizar o registro.",
        variant: "destructive"
      })
      return null
    }
  }

  const deleteFaq = async (id: string): Promise<boolean> => {
    try {
      const target = items.find(i => i.id === id)
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}`, {
        method: "DELETE"
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao excluir item do FAQ.")
      }
      setItems(prev => prev.filter(i => i.id !== id))
      toast({
        title: "✓ Item Excluído",
        description: target ? `"${target.question}" foi removido da base.` : "Item removido com sucesso."
      })
      return true
    } catch (err: any) {
      toast({
        title: "Erro ao excluir item",
        description: err.message || "Não foi possível excluir o item.",
        variant: "destructive"
      })
      return false
    }
  }

  const approveFaq = async (id: string, overrides?: ApproveFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides || {})
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao aprovar sugestão de resposta.")
      }
      const approvedItem: FaqItem = data.item
      setItems(prev => prev.map(i => (i.id === id ? approvedItem : i)))
      toast({
        title: "⚡ Resposta Aprovada em 1 Clique!",
        description: `"${approvedItem.question}" agora é uma resposta ativa oficial da Sofia.`
      })
      return approvedItem
    } catch (err: any) {
      toast({
        title: "Falha na Aprovação",
        description: err.message || "Não foi possível aprovar a sugestão.",
        variant: "destructive"
      })
      return null
    }
  }

  const toggleStatus = async (item: FaqItem): Promise<FaqItem | null> => {
    const nextStatus: FaqStatus = item.status === "ativo" ? "inativo" : "ativo"
    return updateFaq(item.id, { status: nextStatus })
  }

  const resetFilters = () => {
    setSearch("")
    setSelectedCategory("all")
    setSelectedStatus("todas")
    setSelectedScope("all")
  }

  return {
    items,
    filteredItems,
    loading,
    error,
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
    resetFilters
  }
}
