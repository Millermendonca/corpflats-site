import { useState, useEffect, useCallback, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"

export type UnmetDemandCategory =
  | "efetivacao_reserva"
  | "cotacao_diarias"
  | "consulta_disponibilidade"
  | "geracao_pix"
  | "pre_reserva"
  | "cancelamento_reserva"
  | "alteracao_datas"
  | "enxoval_toalhas"
  | "chamado_manutencao"
  | "limpeza_avulsa"
  | "late_checkout"
  | "checkout_comunicacao"
  | "garagem_veiculo"
  | "emissao_nota_fiscal"
  | "troca_flat"
  | "cafe_quarto"
  | "operacoes_sistema_pausadas"
  | "outros"

export type DemandStatus = "aberta" | "pendente" | "em_analise" | "planejada" | "implementada" | "descartada"
export type DemandReason = "action_disabled" | "capability_missing" | "requires_operator"
export type DemandPriority = "alta" | "media" | "baixa"

export interface UnmetDemandItem {
  id: string
  category: UnmetDemandCategory
  demandTitle: string
  reason: DemandReason
  actionTarget?: string | null
  suggestedFeature?: string
  rawMessage: string
  variations: string[]
  senderPhone: string
  clientPhones: string[]
  senderName: string
  guestContext?: {
    flatNumber?: string | number | null
    stayStatus?: string | null
    guestName?: string | null
    checkinDate?: string | null
    checkoutDate?: string | null
    [key: string]: any
  } | null
  status: DemandStatus
  priority?: DemandPriority
  occurrencesCount: number
  adminNotes?: string
  firstDetectedAt?: string
  lastDetectedAt?: string
  createdAt?: string
  updatedAt?: string
  statusUpdatedAt?: string
}

export interface DemandStats {
  totalDemands: number
  openDemands: number
  inAnalysisDemands: number
  plannedDemands: number
  implementedDemands: number
  discardedDemands: number
  totalOccurrences: number
  totalUniquePhones: number
  actionDisabledCount: number
  capabilityMissingCount: number
  byCategory: Record<string, { count: number; occurrences: number; title: string }>
  byReason: Record<string, { count: number; occurrences: number }>
  topRequested: UnmetDemandItem[]
  categoriesCatalog: Record<string, { category: string; title: string; defaultSuggested: string }>
}

export interface CategoryMeta {
  label: string
  shortLabel: string
  iconName: string
  badgeClass: string
  colorClass: string
  isAction: boolean
  actionKey?: string
}

export const CATEGORY_META_MAP: Record<UnmetDemandCategory, CategoryMeta> = {
  efetivacao_reserva: {
    label: "Efetivação de Reserva no PMS",
    shortLabel: "Efetivar Reserva",
    iconName: "CheckCircle",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    colorClass: "text-emerald-600",
    isAction: true,
    actionKey: "commitReservation"
  },
  cotacao_diarias: {
    label: "Cálculo de Orçamento / Cotação",
    shortLabel: "Cotação Diárias",
    iconName: "Calculator",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
    colorClass: "text-blue-600",
    isAction: true,
    actionKey: "calculateQuote"
  },
  consulta_disponibilidade: {
    label: "Consulta de Vagas e Disponibilidade",
    shortLabel: "Disponibilidade",
    iconName: "Calendar",
    badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200",
    colorClass: "text-indigo-600",
    isAction: true,
    actionKey: "checkAvailability"
  },
  geracao_pix: {
    label: "Geração de Cobrança / PIX",
    shortLabel: "Cobrança PIX",
    iconName: "QrCode",
    badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200",
    colorClass: "text-teal-600",
    isAction: true,
    actionKey: "generatePayment"
  },
  pre_reserva: {
    label: "Criação de Pré-Reserva com Hold",
    shortLabel: "Pré-Reserva",
    iconName: "Clock",
    badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200",
    colorClass: "text-cyan-600",
    isAction: true,
    actionKey: "createPreReservation"
  },
  cancelamento_reserva: {
    label: "Cancelamento de Reserva",
    shortLabel: "Cancelamento",
    iconName: "XCircle",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200",
    colorClass: "text-rose-600",
    isAction: false
  },
  alteracao_datas: {
    label: "Alteração de Datas / Remarcação",
    shortLabel: "Alterar Datas",
    iconName: "CalendarRange",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200",
    colorClass: "text-purple-600",
    isAction: false
  },
  enxoval_toalhas: {
    label: "Enxoval / Toalhas Extras",
    shortLabel: "Enxoval / Toalhas",
    iconName: "BedDouble",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
    colorClass: "text-amber-600",
    isAction: false
  },
  chamado_manutencao: {
    label: "Chamado de Manutenção",
    shortLabel: "Manutenção",
    iconName: "Wrench",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200",
    colorClass: "text-orange-600",
    isAction: false
  },
  limpeza_avulsa: {
    label: "Solicitação de Limpeza Avulsa",
    shortLabel: "Limpeza Extra",
    iconName: "Sparkles",
    badgeClass: "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300 border-lime-200",
    colorClass: "text-lime-600",
    isAction: false
  },
  late_checkout: {
    label: "Late Check-out",
    shortLabel: "Late Check-out",
    iconName: "Hourglass",
    badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200",
    colorClass: "text-violet-600",
    isAction: false
  },
  checkout_comunicacao: {
    label: "Comunicação de Check-out via WhatsApp",
    shortLabel: "Aviso Check-out",
    iconName: "LogOut",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    colorClass: "text-emerald-600",
    isAction: true,
    actionKey: "informCheckout"
  },
  garagem_veiculo: {
    label: "Garagem e Placa de Veículo",
    shortLabel: "Garagem / Veículo",
    iconName: "Car",
    badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-950/60 dark:text-slate-300 border-slate-200",
    colorClass: "text-slate-600",
    isAction: false
  },
  emissao_nota_fiscal: {
    label: "Emissão de Nota Fiscal",
    shortLabel: "Nota Fiscal",
    iconName: "FileText",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200",
    colorClass: "text-sky-600",
    isAction: false
  },
  troca_flat: {
    label: "Solicitação de Troca de Quarto",
    shortLabel: "Troca de Quarto",
    iconName: "ArrowLeftRight",
    badgeClass: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border-fuchsia-200",
    colorClass: "text-fuchsia-600",
    isAction: false
  },
  cafe_quarto: {
    label: "Café no Quarto",
    shortLabel: "Café no Quarto",
    iconName: "Coffee",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300 border-yellow-200",
    colorClass: "text-yellow-600",
    isAction: false
  },
  operacoes_sistema_pausadas: {
    label: "Operações com Chave Mestra Pausada",
    shortLabel: "Mestra Pausada",
    iconName: "PauseCircle",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-200",
    colorClass: "text-red-600",
    isAction: true
  },
  outros: {
    label: "Demanda Não Mapeada com Transbordo",
    shortLabel: "Outras Demandas",
    iconName: "HelpCircle",
    badgeClass: "bg-gray-100 text-gray-800 dark:bg-gray-950/60 dark:text-gray-300 border-gray-200",
    colorClass: "text-gray-600",
    isAction: false
  }
}

export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return ""
  const clean = String(phone).replace(/\D/g, "")
  if (clean.length === 13 && clean.startsWith("55")) {
    return `+55 (${clean.substring(2, 4)}) ${clean.substring(4, 9)}-${clean.substring(9)}`
  }
  if (clean.length === 12 && clean.startsWith("55")) {
    return `+55 (${clean.substring(2, 4)}) ${clean.substring(4, 8)}-${clean.substring(8)}`
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`
  }
  return phone
}

export function useBotDemands(options?: { autoFetch?: boolean }) {
  const { autoFetch = true } = options || {}
  const { toast } = useToast()

  const [demands, setDemands] = useState<UnmetDemandItem[]>([])
  const [stats, setStats] = useState<DemandStats | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [reasonFilter, setReasonFilter] = useState<string>("all")
  const [sortOption, setSortOption] = useState<"occurrences" | "date" | "title">("occurrences")

  const fetchDemands = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const [demandsRes, statsRes] = await Promise.all([
        fetch("/api/bot-demands"),
        fetch("/api/bot-demands/stats")
      ])

      if (!demandsRes.ok) {
        throw new Error(`Falha ao buscar demandas não atendidas (${demandsRes.status})`)
      }

      const demandsData = await demandsRes.json()
      const statsData = statsRes.ok ? await statsRes.json() : null

      setDemands(Array.isArray(demandsData.demands) ? demandsData.demands : [])
      if (statsData && statsData.stats) {
        setStats(statsData.stats)
      }
    } catch (err: any) {
      const message = err.message || "Erro ao carregar oportunidades de automação."
      setError(message)
      toast({
        title: "Erro ao carregar demandas",
        description: message,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (autoFetch) {
      fetchDemands()
    }
  }, [autoFetch, fetchDemands])

  // Demandas filtradas localmente para agilidade
  const filteredDemands = useMemo(() => {
    let result = [...demands]

    if (categoryFilter !== "all") {
      result = result.filter(d => d.category === categoryFilter)
    }

    if (statusFilter !== "all") {
      if (statusFilter === "aberta") {
        result = result.filter(d => (d.status || "aberta") === "aberta" || (d.status as string) === "nova" || d.status === "pendente")
      } else if (statusFilter === "pendente") {
        result = result.filter(d => d.status === "pendente")
      } else {
        result = result.filter(d => (d.status || "aberta") === statusFilter)
      }
    }

    if (reasonFilter !== "all") {
      result = result.filter(d => d.reason === reasonFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(d =>
        (d.demandTitle || "").toLowerCase().includes(q) ||
        (d.rawMessage || "").toLowerCase().includes(q) ||
        (d.suggestedFeature || "").toLowerCase().includes(q) ||
        (d.senderName || "").toLowerCase().includes(q) ||
        (d.senderPhone || "").includes(q) ||
        (d.adminNotes || "").toLowerCase().includes(q) ||
        (Array.isArray(d.variations) && d.variations.some(v => v.toLowerCase().includes(q))) ||
        (Array.isArray(d.clientPhones) && d.clientPhones.some(p => p.includes(q)))
      )
    }

    if (sortOption === "date") {
      result.sort((a, b) => new Date(b.lastDetectedAt || b.createdAt || 0).getTime() - new Date(a.lastDetectedAt || a.createdAt || 0).getTime())
    } else if (sortOption === "title") {
      result.sort((a, b) => (a.demandTitle || "").localeCompare(b.demandTitle || ""))
    } else {
      result.sort((a, b) => (b.occurrencesCount || 1) - (a.occurrencesCount || 1))
    }

    return result
  }, [demands, categoryFilter, statusFilter, reasonFilter, search, sortOption])

  // Atualizar status e anotações
  const updateDemandStatus = useCallback(async (
    id: string,
    status: DemandStatus,
    adminNotes?: string,
    priority?: DemandPriority
  ): Promise<boolean> => {
    try {
      const payload: any = { status }
      if (adminNotes !== undefined) payload.adminNotes = adminNotes
      if (priority !== undefined) payload.priority = priority

      const res = await fetch(`/api/bot-demands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        throw new Error(`Falha ao atualizar demanda (${res.status})`)
      }

      const data = await res.json()
      if (data.demand) {
        setDemands(prev => prev.map(d => d.id === id ? { ...d, ...data.demand } : d))
      }

      toast({
        title: "Demanda atualizada",
        description: `Status alterado para "${status}".`,
      })
      return true
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar demanda",
        description: err.message,
        variant: "destructive"
      })
      return false
    }
  }, [toast])

  // Ativar ação vinculada diretamente no painel
  const activateActionLink = useCallback(async (id: string): Promise<{ success: boolean; activatedAction?: string; message?: string }> => {
    try {
      const res = await fetch(`/api/bot-demands/${id}/action-link`, {
        method: "POST"
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Falha ao ativar ação (${res.status})`)
      }

      if (data.demand) {
        setDemands(prev => prev.map(d => d.id === id ? { ...d, ...data.demand } : d))
      }

      toast({
        title: "Chave do Bot Ativada!",
        description: `A ação "${data.activatedAction}" foi habilitada no sistema e a demanda marcada como implementada.`,
      })

      return { success: true, activatedAction: data.activatedAction }
    } catch (err: any) {
      toast({
        title: "Erro ao ativar ação",
        description: err.message,
        variant: "destructive"
      })
      return { success: false, message: err.message }
    }
  }, [toast])

  // Remover demanda
  const deleteDemand = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/bot-demands/${id}`, {
        method: "DELETE"
      })

      if (!res.ok) {
        throw new Error(`Falha ao excluir demanda (${res.status})`)
      }

      setDemands(prev => prev.filter(d => d.id !== id))

      toast({
        title: "Demanda removida",
        description: "O registro foi excluído do backlog de oportunidades.",
      })
      return true
    } catch (err: any) {
      toast({
        title: "Erro ao excluir demanda",
        description: err.message,
        variant: "destructive"
      })
      return false
    }
  }, [toast])

  return {
    demands,
    filteredDemands,
    stats,
    loading,
    error,
    refresh: fetchDemands,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    reasonFilter,
    setReasonFilter,
    sortOption,
    setSortOption,
    updateDemandStatus,
    activateActionLink,
    deleteDemand
  }
}
