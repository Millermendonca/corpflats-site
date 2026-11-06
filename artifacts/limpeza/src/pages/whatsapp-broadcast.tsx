import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Send,
  Filter,
  RotateCcw,
  Users,
  Search,
  Plus,
  Check,
  X,
  Clock,
  Calendar,
  MapPin,
  Building2,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Square,
  History,
  Eye,
  Phone,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ShieldCheck,
  RefreshCw,
  Layers,
  Info
} from "lucide-react"

interface BroadcastGuest {
  guestKey: string
  guestId?: number | string | null
  reservationId?: number | string | null
  reservationCode?: string | null
  name: string
  firstName: string
  fullName: string
  phone: string
  formattedPhone: string
  isValidWhatsapp: boolean
  document?: string
  email?: string
  city: string
  state: string
  localityKey: string
  localityLabel: string
  channel: string
  channelLabel: string
  flatNumber: string
  unitsLabel: string
  checkinDate: string
  checkinTime: string
  checkoutDate: string
  checkoutTime: string
  moment: "pre_checkin" | "in_house" | "post_checkout"
  checkinStatus: "completed" | "pending"
  totalStays: number
  recurrence: "first_stay" | "recurring"
  companyName?: string
  deduplicatedCount?: number
  groupedReservationCodes?: string[]
  originType: "filter" | "manual"
}

interface LocalityOption {
  key: string
  city: string
  state: string
  label: string
  count: number
}

interface StateOption {
  state: string
  count: number
}

interface ChannelOption {
  id: string
  label: string
  count: number
}

interface FlatOption {
  id: number | string
  number: string
  label: string
  colName?: string
}

interface BroadcastCampaignRecipient extends BroadcastGuest {
  status: "pending" | "sending" | "sent" | "failed"
  sentAt?: string | null
  processedAt?: string | null
  error?: string | null
  renderedMessage?: string
}

interface BroadcastCampaign {
  id: string
  name: string
  messageTemplate: string
  minDelaySeconds: number
  maxDelaySeconds: number
  status: "running" | "paused" | "completed" | "cancelled"
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  totalCount: number
  sentCount: number
  failedCount: number
  pendingCount: number
  filtersSnapshot?: {
    filteredCount: number
    excludedCount: number
    manualCount: number
    finalCount: number
  }
  recipients?: BroadcastCampaignRecipient[]
}

interface BroadcastFilters {
  moments: string[]
  // Pré-check-in
  preCheckinMode: "all" | "next_hours" | "next_days" | "custom_dates"
  preCheckinHours: number
  preCheckinDays: number
  preCheckinStartDate: string
  preCheckinEndDate: string
  // In-house
  inHouseMode: "all" | "entered_last_hours" | "entered_last_days" | "leaving_next_hours" | "leaving_next_days"
  inHouseHours: number
  inHouseDays: number
  inHouseLeavingHours: number
  inHouseLeavingDays: number
  // Pós-check-out
  postCheckoutMode: "all" | "last_hours" | "last_days" | "custom_dates"
  postCheckoutHours: number
  postCheckoutDays: number
  postCheckoutStartDate: string
  postCheckoutEndDate: string
  // Categorias adicionais
  channels: string[]
  cities: string[]
  states: string[]
  flats: string[]
  checkinStatus: "all" | "completed" | "pending"
  recurrence: "all" | "first_stay" | "recurring"
  onlyValidWhatsapp: boolean
}

const DEFAULT_FILTERS: BroadcastFilters = {
  moments: ["in_house"],
  preCheckinMode: "all",
  preCheckinHours: 24,
  preCheckinDays: 7,
  preCheckinStartDate: "",
  preCheckinEndDate: "",
  inHouseMode: "all",
  inHouseHours: 24,
  inHouseDays: 3,
  inHouseLeavingHours: 24,
  inHouseLeavingDays: 3,
  postCheckoutMode: "last_days",
  postCheckoutHours: 24,
  postCheckoutDays: 30,
  postCheckoutStartDate: "",
  postCheckoutEndDate: "",
  channels: [],
  cities: [],
  states: [],
  flats: [],
  checkinStatus: "all",
  recurrence: "all",
  onlyValidWhatsapp: true
}

const DYNAMIC_VARIABLES = [
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome", sample: "Carlos" },
  { tag: "{{nome_completo}}", label: "Nome Completo", sample: "Carlos Eduardo Mendes" },
  { tag: "{{unidade}}", label: "Unidade / Flat", sample: "509" },
  { tag: "{{data_checkin}}", label: "Data Check-in", sample: "10/11/2026" },
  { tag: "{{data_checkout}}", label: "Data Check-out", sample: "14/11/2026" },
  { tag: "{{canal}}", label: "Canal de Origem", sample: "Site Próprio" }
]

const QUICK_BROADCAST_TEMPLATES = [
  {
    id: "aviso_manutencao",
    label: "🔧 Aviso Operacional / Manutenção no Condomínio",
    text: `Olá, *{{primeiro_nome}}*! Tudo bem?\n\nPassando para informar um aviso operacional importante referente à sua estadia no *Flat {{unidade}}*:\n\n📍 *[Descreva aqui o aviso ou manutenção programada]*\n\nQualquer dúvida ou necessidade, nossa equipe está à disposição por aqui!`
  },
  {
    id: "pre_checkin_boas_vindas",
    label: "🔑 Boas-vindas & Preparação de Chegada (Pré-Check-in)",
    text: `Olá, *{{primeiro_nome}}*! Estamos ansiosos para receber você na *CorpFlats*!\n\nSua reserva para o *Flat {{unidade}}* com entrada em *{{data_checkin}}* e saída em *{{data_checkout}}* (via *{{canal}}*) já está sendo preparada com todo carinho.\n\nCaso precise de alguma orientação para a chegada, basta responder esta mensagem!`
  },
  {
    id: "pos_checkout_satisfacao",
    label: "⭐ Pós-Check-out: Agradecimento & Itens Esquecidos",
    text: `Olá, *{{primeiro_nome}}*! Foi um prazer receber você no *Flat {{unidade}}* até *{{data_checkout}}*.\n\nEsperamos que tenha feito uma excelente viagem de retorno! Passando para saber se correu tudo bem na sua estadia e se ficou algum pertence no apartamento.\n\nSerá uma alegria receber você novamente em breve!`
  },
  {
    id: "remarketing_retorno",
    label: "🎁 Remarketing / Condição Especial de Retorno",
    text: `Olá, *{{primeiro_nome}}*! Tudo bem?\n\nSentimos sua falta aqui na *CorpFlats*! Vimos que sua última hospedagem conosco foi no *Flat {{unidade}}* e preparamos uma condição especial para sua próxima vinda a Campos dos Goytacazes.\n\nSe já tiver novas datas planejadas, me chame aqui para garantirmos sua tarifa direta exclusiva!`
  }
]

function formatDateBrShort(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || ""
  const [y, m, d] = isoDate.split("-")
  return `${d}/${m}/${y}`
}

function renderClientPreview(templateText: string, guest: BroadcastGuest | null): string {
  if (!templateText) return ""
  const g = guest || {
    firstName: "Carlos",
    fullName: "Carlos Eduardo Mendes",
    name: "Carlos Eduardo Mendes",
    unitsLabel: "509",
    flatNumber: "509",
    checkinDate: new Date().toISOString().slice(0, 10),
    checkoutDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    channelLabel: "Site Próprio"
  }
  const firstName = g.firstName || (g.name || "Hóspede").split(" ")[0] || "Hóspede"
  const fullName = g.fullName || g.name || "Hóspede"
  const unit = g.unitsLabel || g.flatNumber || ""
  const checkin = formatDateBrShort(g.checkinDate)
  const checkout = formatDateBrShort(g.checkoutDate)
  const canal = g.channelLabel || "Site Próprio"

  return templateText
    .split("{{primeiro_nome}}").join(firstName)
    .split("{{nome_completo}}").join(fullName)
    .split("{{unidade}}").join(unit)
    .split("{{quarto}}").join(unit)
    .split("{{data_checkin}}").join(checkin)
    .split("{{data_checkout}}").join(checkout)
    .split("{{canal}}").join(canal)
    .split("{{canal_reserva}}").join(canal)
}

export default function WhatsappBroadcastPage() {
  const { toast } = useToast()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Metadados carregados do backend (Cidades DISTINCT, Estados, Canais, Flats)
  const [localities, setLocalities] = useState<LocalityOption[]>([])
  const [states, setStates] = useState<StateOption[]>([])
  const [channelsMeta, setChannelsMeta] = useState<ChannelOption[]>([
    { id: "b2b", label: "B2B / Corporativo", count: 0 },
    { id: "airbnb", label: "Airbnb", count: 0 },
    { id: "booking", label: "Booking.com", count: 0 },
    { id: "whatsapp", label: "WhatsApp", count: 0 },
    { id: "site_proprio", label: "Site Próprio (Reserva Direta)", count: 0 },
    { id: "outros", label: "Balcão / Outros", count: 0 }
  ])
  const [flatsMeta, setFlatsMeta] = useState<FlatOption[]>([])
  const [zapiConfigured, setZapiConfigured] = useState<boolean>(false)
  const [testModeOnly, setTestModeOnly] = useState<boolean>(false)

  // Estado dos Filtros Combináveis
  const [filters, setFilters] = useState<BroadcastFilters>(DEFAULT_FILTERS)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    moment: true,
    channels: true,
    locality: true,
    operational: true
  })
  const [citySearchQuery, setCitySearchQuery] = useState<string>("")

  // Gerenciamento de Estado da Lista Final (Regra das 3 Coleções Reativas)
  const [filteredGuests, setFilteredGuests] = useState<BroadcastGuest[]>([])
  const [excludedGuestIds, setExcludedGuestIds] = useState<Set<string>>(new Set())
  const [manuallyAddedGuests, setManuallyAddedGuests] = useState<BroadcastGuest[]>([])
  const [isLoadingSegment, setIsLoadingSegment] = useState<boolean>(false)
  const [showExcludedInTable, setShowExcludedInTable] = useState<boolean>(true)
  const [recipientListSearch, setRecipientListSearch] = useState<string>("")

  // Autocomplete de Inclusão Manual (Fora do Filtro)
  const [manualSearchQuery, setManualSearchQuery] = useState<string>("")
  const [manualSearchResults, setManualSearchResults] = useState<BroadcastGuest[]>([])
  const [isSearchingManual, setIsSearchingManual] = useState<boolean>(false)
  const [manualDropdownOpen, setManualDropdownOpen] = useState<boolean>(false)
  const manualSearchContainerRef = useRef<HTMLDivElement | null>(null)

  // Compositor, Preview e Fila de Disparo
  const [campaignName, setCampaignName] = useState<string>("")
  const [messageTemplate, setMessageTemplate] = useState<string>(QUICK_BROADCAST_TEMPLATES[0].text)
  const [selectedPreviewGuestKey, setSelectedPreviewGuestKey] = useState<string | null>(null)
  const [serverPreviewText, setServerPreviewText] = useState<string | null>(null)
  const [minDelaySeconds, setMinDelaySeconds] = useState<number>(3)
  const [maxDelaySeconds, setMaxDelaySeconds] = useState<number>(8)
  const [minDelayInput, setMinDelayInput] = useState<string>("3")
  const [maxDelayInput, setMaxDelayInput] = useState<string>("8")
  const [filterDrafts, setFilterDrafts] = useState<Record<string, string>>({})
  const [confirmSendOpen, setConfirmSendOpen] = useState<boolean>(false)
  const [isStartingCampaign, setIsStartingCampaign] = useState<boolean>(false)

  // Teste individual
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false)
  const [testPhoneInput, setTestPhoneInput] = useState<string>("")
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false)

  // Campanha em Execução, Histórico e Log Detalhado por Destinatário
  const [activeCampaign, setActiveCampaign] = useState<BroadcastCampaign | null>(null)
  const [campaignsHistory, setCampaignsHistory] = useState<BroadcastCampaign[]>([])
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false)
  const [inspectedCampaign, setInspectedCampaign] = useState<BroadcastCampaign | null>(null)
  const [campaignDetailModalOpen, setCampaignDetailModalOpen] = useState<boolean>(false)

  // Carrega metadados iniciais
  const fetchMetadata = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/broadcast/metadata")
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.localities)) setLocalities(data.localities)
      if (Array.isArray(data.states)) setStates(data.states)
      if (Array.isArray(data.channels)) setChannelsMeta(data.channels)
      if (Array.isArray(data.flats)) setFlatsMeta(data.flats)
      setZapiConfigured(Boolean(data.zapiConfigured))
      setTestModeOnly(Boolean(data.testModeOnly))
      if (data.activeCampaign) {
        setActiveCampaign(data.activeCampaign)
      }
    } catch (err) {
      console.error("Erro ao carregar metadados de broadcast:", err)
    }
  }, [])

  useEffect(() => {
    fetchMetadata()
  }, [fetchMetadata])

  // Reação em tempo real aos filtros (com debounce de 250ms)
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsLoadingSegment(true)
      try {
        const res = await fetch("/api/whatsapp/broadcast/segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters })
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data.guests)) {
          setFilteredGuests(data.guests)
        }
      } catch (err) {
        console.error("Erro ao segmentar hóspedes:", err)
      } finally {
        if (!cancelled) setIsLoadingSegment(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filters])

  // Busca com debounce para Adicionar Hóspede Manualmente (Fora do filtro)
  useEffect(() => {
    if (!manualDropdownOpen) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearchingManual(true)
      try {
        const res = await fetch(`/api/whatsapp/broadcast/search-guests?q=${encodeURIComponent(manualSearchQuery)}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data.guests)) {
          setManualSearchResults(data.guests)
        }
      } catch {} finally {
        if (!cancelled) setIsSearchingManual(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [manualSearchQuery, manualDropdownOpen])

  // Fecha dropdown manual ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (manualSearchContainerRef.current && !manualSearchContainerRef.current.contains(e.target as Node)) {
        setManualDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Polling da campanha ativa em background (a cada 1.5s enquanto running/paused)
  useEffect(() => {
    if (!activeCampaign || (activeCampaign.status !== "running" && activeCampaign.status !== "paused")) {
      return
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/broadcast/campaigns/${activeCampaign.id}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.campaign) {
          setActiveCampaign(data.campaign)
          setInspectedCampaign(prev => (prev && prev.id === data.campaign.id ? data.campaign : prev))
          if (data.campaign.status === "completed") {
            toast({
              title: "Disparo concluído!",
              description: `${data.campaign.sentCount} mensagens enviadas com sucesso (${data.campaign.failedCount} falhas).`
            })
          }
        }
      } catch {}
    }, 1500)
    return () => clearInterval(interval)
  }, [activeCampaign?.id, activeCampaign?.status, toast])

  // Cálculos Matemáticos da Lista Final:
  // Total filtrado (X) - Excluídos manualmente (Y) + Incluídos manualmente (Z) = Total para envio (W)
  const {
    totalFilteredCount,
    activeExcludedCount,
    effectiveManualGuests,
    finalRecipients,
    displayTableRows
  } = useMemo(() => {
    const filteredKeysSet = new Set(filteredGuests.map(g => g.guestKey))
    const filteredPhonesSet = new Set(filteredGuests.map(g => g.phone).filter(Boolean))

    // Quantos dos hóspedes ATUALMENTE retornados pelo filtro estão desmarcados em excludedGuestIds
    const activeExcluded = filteredGuests.filter(g => excludedGuestIds.has(g.guestKey))

    // Hóspedes do filtro que estão marcados para envio
    const activeFiltered = filteredGuests.filter(g => !excludedGuestIds.has(g.guestKey))

    // Hóspedes incluídos manualmente que não estão duplicados nos filtrados ativos
    const manualUnique = manuallyAddedGuests.filter(
      m => !filteredKeysSet.has(m.guestKey) && (!m.phone || !filteredPhonesSet.has(m.phone))
    )

    // Lista final deduplicada para envio (W)
    const finalSendList: BroadcastGuest[] = [...manualUnique, ...activeFiltered]

    // Linhas exibidas na tabela central
    const rows: Array<{ guest: BroadcastGuest; isIncluded: boolean; isExcludedFromFilter: boolean }> = [
      ...manualUnique.map(g => ({
        guest: { ...g, originType: "manual" as const },
        isIncluded: true,
        isExcludedFromFilter: false
      })),
      ...filteredGuests.map(g => {
        const isExcl = excludedGuestIds.has(g.guestKey)
        return {
          guest: { ...g, originType: "filter" as const },
          isIncluded: !isExcl,
          isExcludedFromFilter: isExcl
        }
      })
    ]

    const filteredRows = rows.filter(r => {
      if (!showExcludedInTable && r.isExcludedFromFilter) return false
      if (!recipientListSearch.trim()) return true
      const q = recipientListSearch.toLowerCase().trim()
      return (
        r.guest.name.toLowerCase().includes(q) ||
        r.guest.phone.includes(q) ||
        r.guest.formattedPhone.toLowerCase().includes(q) ||
        r.guest.city.toLowerCase().includes(q) ||
        r.guest.flatNumber.toLowerCase().includes(q) ||
        r.guest.channelLabel.toLowerCase().includes(q)
      )
    })

    return {
      totalFilteredCount: filteredGuests.length,
      activeExcludedCount: activeExcluded.length,
      effectiveManualGuests: manualUnique,
      finalRecipients: finalSendList,
      displayTableRows: filteredRows
    }
  }, [filteredGuests, excludedGuestIds, manuallyAddedGuests, showExcludedInTable, recipientListSearch])

  // Hóspede selecionado para o Preview real da mensagem (padrão: 1º hóspede da lista final)
  const previewGuest = useMemo(() => {
    if (selectedPreviewGuestKey) {
      const found = finalRecipients.find(g => g.guestKey === selectedPreviewGuestKey) ||
                    filteredGuests.find(g => g.guestKey === selectedPreviewGuestKey)
      if (found) return found
    }
    return finalRecipients[0] || filteredGuests[0] || null
  }, [selectedPreviewGuestKey, finalRecipients, filteredGuests])

  const localPreviewText = useMemo(
    () => renderClientPreview(messageTemplate, previewGuest),
    [messageTemplate, previewGuest]
  )

  // Se ainda restar alguma tag {{...}} do sistema após o preview local, resolve no backend com debounce
  useEffect(() => {
    if (!localPreviewText.includes("{{")) {
      setServerPreviewText(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/whatsapp/broadcast/preview-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageTemplate,
            recipient: previewGuest
          })
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data.renderedMessage === "string") {
          setServerPreviewText(data.renderedMessage)
        }
      } catch {}
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [localPreviewText, messageTemplate, previewGuest])

  const renderedPreviewText = serverPreviewText ?? localPreviewText

  // Cidades filtradas pela busca rápida e/ou UFs no dropdown
  const visibleLocalities = useMemo(() => {
    const q = citySearchQuery.toLowerCase().trim()
    return localities.filter(loc => {
      if (!q) return true
      return loc.label.toLowerCase().includes(q) || loc.city.toLowerCase().includes(q) || loc.state.toLowerCase().includes(q)
    })
  }, [localities, citySearchQuery])

  // Manipuladores de Filtro
  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleMoment = (momentId: string) => {
    setFilters(prev => {
      const exists = prev.moments.includes(momentId)
      const next = exists ? prev.moments.filter(m => m !== momentId) : [...prev.moments, momentId]
      return { ...prev, moments: next }
    })
  }

  const toggleArrayFilter = (field: "channels" | "cities" | "states" | "flats", value: string) => {
    setFilters(prev => {
      const arr = prev[field]
      const exists = arr.includes(value)
      const next = exists ? arr.filter(v => v !== value) : [...arr, value]
      return { ...prev, [field]: next }
    })
  }

  const setNumericFilterPreset = (field: keyof BroadcastFilters, value: number) => {
    setFilterDrafts(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const handleNumericFilterChange = (field: keyof BroadcastFilters, rawValue: string, maxVal: number) => {
    const raw = rawValue.replace(/\D/g, "")
    setFilterDrafts(prev => ({ ...prev, [field]: raw }))
    const parsed = parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      setFilters(prev => ({ ...prev, [field]: Math.min(maxVal, parsed) }))
    }
  }

  const handleNumericFilterBlur = (field: keyof BroadcastFilters, defaultVal: number, maxVal: number) => {
    const draft = filterDrafts[field]
    const parsed = draft !== undefined ? parseInt(draft.trim(), 10) : Number(filters[field])
    const safeVal = Number.isFinite(parsed) && parsed >= 1 ? Math.min(maxVal, parsed) : defaultVal
    setFilters(prev => ({ ...prev, [field]: safeVal }))
    setFilterDrafts(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleResetFilters = () => {
    setFilters({
      ...DEFAULT_FILTERS,
      moments: []
    })
    setFilterDrafts({})
    setCitySearchQuery("")
    toast({
      title: "Filtros limpos",
      description: "Todos os filtros foram redefinidos. As exceções manuais foram preservadas."
    })
  }

  // Manipuladores de Inclusão / Exclusão Manual
  const toggleRecipientCheckbox = (guest: BroadcastGuest) => {
    if (guest.originType === "manual") {
      setManuallyAddedGuests(prev =>
        prev.filter(g => g.guestKey !== guest.guestKey && (!guest.phone || g.phone !== guest.phone))
      )
      return
    }
    setExcludedGuestIds(prev => {
      const next = new Set(prev)
      if (next.has(guest.guestKey)) {
        next.delete(guest.guestKey)
      } else {
        next.add(guest.guestKey)
        // Se o hóspede também havia sido adicionado manualmente antes de entrar no filtro, remove de manuallyAddedGuests
        setManuallyAddedGuests(mPrev =>
          mPrev.filter(g => g.guestKey !== guest.guestKey && (!guest.phone || g.phone !== guest.phone))
        )
      }
      return next
    })
  }

  const handleAddManualGuest = (guest: BroadcastGuest) => {
    if (!guest.isValidWhatsapp || !guest.phone || guest.phone.length < 10) {
      toast({
        title: "Sem WhatsApp válido",
        description: `${guest.name} não possui um número de celular WhatsApp válido cadastrado para receber disparos.`,
        variant: "destructive"
      })
      return
    }

    const isCurrentlyInFiltered = filteredGuests.some(g => g.guestKey === guest.guestKey)
    // Se o hóspede estava na lista de excluídos do filtro, remove a exclusão
    if (excludedGuestIds.has(guest.guestKey)) {
      setExcludedGuestIds(prev => {
        const next = new Set(prev)
        next.delete(guest.guestKey)
        return next
      })
      if (isCurrentlyInFiltered) {
        setManualDropdownOpen(false)
        setManualSearchQuery("")
        toast({
          title: "Hóspede reativado na lista",
          description: `${guest.name} estava desmarcado como exceção e foi reativado.`
        })
        return
      }
    }

    // Verifica se já está nos destinatários finais
    const alreadyInFinal = finalRecipients.some(
      r => r.guestKey === guest.guestKey || (r.phone && guest.phone && r.phone === guest.phone)
    )
    if (alreadyInFinal) {
      toast({
        title: "Hóspede já está na lista",
        description: `${guest.name} (${guest.formattedPhone}) já faz parte dos destinatários para envio.`
      })
      setManualDropdownOpen(false)
      return
    }

    setManuallyAddedGuests(prev => [{ ...guest, originType: "manual" }, ...prev])
    setManualDropdownOpen(false)
    setManualSearchQuery("")
    toast({
      title: "Incluído manualmente",
      description: `${guest.name} foi adicionado à lista final de envio.`
    })
  }

  const handleClearExceptions = () => {
    setExcludedGuestIds(new Set())
    toast({
      title: "Exceções restauradas",
      description: "Todos os hóspedes desmarcados manualmente voltaram a ficar ativos no filtro."
    })
  }

  const handleExcludeAllFiltered = () => {
    setExcludedGuestIds(prev => {
      const next = new Set(prev)
      filteredGuests.forEach(g => next.add(g.guestKey))
      return next
    })
  }

  // Inserção de variável dinâmica na posição do cursor no Textarea
  const insertVariableAtCursor = (tag: string) => {
    const el = textareaRef.current
    if (!el) {
      setMessageTemplate(prev => `${prev}${tag}`)
      return
    }
    const start = el.selectionStart ?? messageTemplate.length
    const end = el.selectionEnd ?? messageTemplate.length
    const nextText = messageTemplate.slice(0, start) + tag + messageTemplate.slice(end)
    setMessageTemplate(nextText)
    setTimeout(() => {
      el.focus()
      const cursor = start + tag.length
      el.setSelectionRange(cursor, cursor)
    }, 10)
  }

  // Envio de Teste
  const handleSendTest = async () => {
    if (!messageTemplate.trim()) {
      toast({ title: "Mensagem vazia", description: "Escreva a mensagem antes de enviar um teste.", variant: "destructive" })
      return
    }
    setIsSendingTest(true)
    try {
      const res = await fetch("/api/whatsapp/broadcast/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testPhone: testPhoneInput.trim() || undefined,
          messageTemplate,
          sampleRecipient: previewGuest
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Teste enviado com sucesso!",
          description: `Mensagem de teste disparada para ${data.phone}${data.simulated ? " (Simulado)" : ""}.`
        })
        setTestModalOpen(false)
      } else {
        toast({
          title: "Falha ao enviar teste",
          description: data.error || "Não foi possível enviar a mensagem de teste.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de comunicação", description: err.message, variant: "destructive" })
    } finally {
      setIsSendingTest(false)
    }
  }

  const normalizeDelayInputs = () => {
    const parsedMin = parseInt(minDelayInput.trim(), 10)
    const rawMin = Number.isFinite(parsedMin) && parsedMin >= 1 ? Math.min(3600, parsedMin) : 3
    const parsedMax = parseInt(maxDelayInput.trim(), 10)
    const rawMax = Number.isFinite(parsedMax) && parsedMax >= 1 ? Math.min(3600, parsedMax) : Math.max(rawMin, 8)
    const safeMin = Math.min(rawMin, rawMax)
    const safeMax = Math.max(rawMin, rawMax)
    setMinDelaySeconds(safeMin)
    setMaxDelaySeconds(safeMax)
    setMinDelayInput(String(safeMin))
    setMaxDelayInput(String(safeMax))
    return { safeMin, safeMax }
  }

  // Iniciar Disparo em Fila Background
  const handleStartBroadcast = async () => {
    if (finalRecipients.length === 0) {
      toast({ title: "Sem destinatários", description: "Selecione ao menos 1 hóspede para enviar.", variant: "destructive" })
      return
    }
    if (!messageTemplate.trim()) {
      toast({ title: "Mensagem vazia", description: "Digite a mensagem a ser enviada.", variant: "destructive" })
      return
    }

    const { safeMin, safeMax } = normalizeDelayInputs()
    setIsStartingCampaign(true)
    try {
      const res = await fetch("/api/whatsapp/broadcast/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim() || undefined,
          messageTemplate,
          minDelaySeconds: safeMin,
          maxDelaySeconds: safeMax,
          recipients: finalRecipients,
          filtersSnapshot: {
            filteredCount: totalFilteredCount,
            excludedCount: activeExcludedCount,
            manualCount: effectiveManualGuests.length,
            finalCount: finalRecipients.length
          }
        })
      })
      const data = await res.json()
      if (res.ok && data.campaign) {
        setActiveCampaign(data.campaign)
        setConfirmSendOpen(false)
        toast({
          title: "Fila de disparo iniciada!",
          description: `Processando ${data.campaign.totalCount} envios em background com delay de ${safeMin}s a ${safeMax}s.`
        })
      } else {
        toast({
          title: "Erro ao iniciar disparo",
          description: data.error || "Falha ao criar campanha.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" })
    } finally {
      setIsStartingCampaign(false)
    }
  }

  // Controles de Pausa / Retomada / Cancelamento da Campanha
  const handleControlCampaign = async (action: "pause" | "resume" | "cancel") => {
    if (!activeCampaign) return
    try {
      const res = await fetch(`/api/whatsapp/broadcast/campaigns/${activeCampaign.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })
      const data = await res.json()
      if (res.ok && data.campaign) {
        setActiveCampaign(data.campaign)
        const labels = {
          pause: "Disparo pausado.",
          resume: "Disparo retomado!",
          cancel: "Disparo cancelado."
        }
        toast({ title: labels[action] })
      }
    } catch {}
  }

  const openCampaignsHistory = async () => {
    setHistoryModalOpen(true)
    try {
      const res = await fetch("/api/whatsapp/broadcast/campaigns")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.campaigns)) setCampaignsHistory(data.campaigns)
      }
    } catch {}
  }

  const openCampaignDetails = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/broadcast/campaigns/${campaignId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.campaign) {
          setInspectedCampaign(data.campaign)
          setCampaignDetailModalOpen(true)
        }
      }
    } catch {}
  }

  // Contagem de filtros ativos para feedback visual
  const activeFilterBadgesCount = useMemo(() => {
    let count = 0
    if (filters.moments.length > 0) count++
    if (filters.channels.length > 0) count++
    if (filters.cities.length > 0 || filters.states.length > 0) count++
    if (filters.flats.length > 0) count++
    if (filters.checkinStatus !== "all") count++
    if (filters.recurrence !== "all") count++
    return count
  }, [filters])

  const estimatedDurationLabel = useMemo(() => {
    const count = finalRecipients.length
    if (count <= 1) return "Envio imediato"
    const avgDelay = (minDelaySeconds + maxDelaySeconds) / 2
    const totalSec = Math.round(count * avgDelay)
    if (totalSec < 60) return `~${totalSec} seg`
    const mins = Math.ceil(totalSec / 60)
    return `~${mins} min`
  }, [finalRecipients.length, minDelaySeconds, maxDelaySeconds])

  return (
    <Shell>
      <div className="flex flex-col min-h-[calc(100dvh-2rem)] p-3 md:p-5 gap-4 max-w-[1920px] mx-auto">
        {/* Cabeçalho do Módulo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-start md:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-black tracking-tight text-foreground">
                  Disparo Inteligente de Mensagens (Broadcast & Segmentação)
                </h1>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] font-bold">
                  CRM + PMS em Tempo Real
                </Badge>
                {testModeOnly && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[11px] font-bold">
                    Modo Sandbox Ativo
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Combine filtros operacionais e de CRM (AND entre categorias • OR na mesma categoria), gerencie exceções manuais e dispare com fila anti-bloqueio.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={openCampaignsHistory}
              className="h-9 gap-1.5 text-xs font-bold rounded-xl"
            >
              <History className="w-4 h-4" />
              Histórico de Disparos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTestModalOpen(true)}
              className="h-9 gap-1.5 text-xs font-bold rounded-xl border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
            >
              <Phone className="w-3.5 h-3.5" />
              Testar Mensagem
            </Button>
          </div>
        </div>

        {/* Barra de Progresso ao Vivo se houver campanha em andamento/pausada */}
        {activeCampaign && (
          <Card className="border-emerald-500/40 bg-emerald-950/5 dark:bg-emerald-950/20 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      {activeCampaign.status === "running" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {activeCampaign.status === "running"
                        ? "Disparo em Execução (Background)"
                        : activeCampaign.status === "paused"
                        ? "Disparo Pausado"
                        : activeCampaign.status === "completed"
                        ? "Disparo Concluído"
                        : "Disparo Cancelado"}
                    </span>
                    <span className="text-xs font-bold text-foreground">• {activeCampaign.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      Delay: {activeCampaign.minDelaySeconds}s a {activeCampaign.maxDelaySeconds}s
                    </Badge>
                  </div>

                  {/* Barra de progresso */}
                  <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-600 transition-all duration-500"
                      style={{
                        width: `${activeCampaign.totalCount > 0 ? (activeCampaign.sentCount / activeCampaign.totalCount) * 100 : 0}%`
                      }}
                    />
                    <div
                      className="bg-rose-500 transition-all duration-500"
                      style={{
                        width: `${activeCampaign.totalCount > 0 ? (activeCampaign.failedCount / activeCampaign.totalCount) * 100 : 0}%`
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs pt-0.5 flex-wrap">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ Enviados: {activeCampaign.sentCount}
                    </span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      ✕ Falhas: {activeCampaign.failedCount}
                    </span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      ⏳ Pendentes: {activeCampaign.pendingCount}
                    </span>
                    <span className="text-muted-foreground">
                      Total: {activeCampaign.totalCount} destinatários
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCampaignDetails(activeCampaign.id)}
                    className="h-8 gap-1.5 text-xs font-bold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver Log de Envios
                  </Button>
                  {activeCampaign.status === "running" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleControlCampaign("pause")}
                      className="h-8 gap-1.5 text-xs font-bold border-amber-500/40 text-amber-600"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pausar
                    </Button>
                  )}
                  {activeCampaign.status === "paused" && (
                    <Button
                      size="sm"
                      onClick={() => handleControlCampaign("resume")}
                      className="h-8 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Retomar Fila
                    </Button>
                  )}
                  {(activeCampaign.status === "running" || activeCampaign.status === "paused") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleControlCampaign("cancel")}
                      className="h-8 gap-1.5 text-xs font-bold"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Cancelar
                    </Button>
                  )}
                  {(activeCampaign.status === "completed" || activeCampaign.status === "cancelled") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveCampaign(null)}
                      className="h-8 text-xs"
                    >
                      Fechar Barra
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Layout Principal em 3 Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* ══════════════════════════════════════════════════════════════════
              COLUNA 1 (ESQUERDA): CONSTRUTOR DE FILTROS COMBINÁVEIS (3 cols)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <span className="font-black text-xs uppercase tracking-wider text-foreground">
                  1. Construtor de Filtros
                </span>
                {activeFilterBadgesCount > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] font-black bg-primary text-primary-foreground">
                    {activeFilterBadgesCount}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Limpar filtros
              </Button>
            </div>

            <div className="divide-y divide-border max-h-[calc(100dvh-12rem)] overflow-y-auto">
              {/* 1.1. Status da Reserva / Momento do Hóspede */}
              <div className="p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection("moment")}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs text-foreground">
                      Momento do Hóspede
                    </span>
                  </div>
                  {openSections.moment ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {openSections.moment && (
                  <div className="space-y-2.5 pt-1">
                    {/* Opção A: Vão entrar (Pré-check-in) */}
                    <div className={`rounded-xl border p-2.5 transition-all ${filters.moments.includes("pre_checkin") ? "border-sky-500/50 bg-sky-500/5" : "border-border bg-background/50"}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.moments.includes("pre_checkin")}
                          onChange={() => toggleMoment("pre_checkin")}
                          className="rounded border-border text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-bold text-foreground block">
                            Vão entrar (Pré-check-in)
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Reservas confirmadas com entrada futura ou hoje
                          </span>
                        </div>
                      </label>

                      {filters.moments.includes("pre_checkin") && (
                        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { id: "all", label: "Todas futuras" },
                              { id: "next_hours", label: "Próximas X horas" },
                              { id: "next_days", label: "Próximos X dias" },
                              { id: "custom_dates", label: "Período exato" }
                            ].map(opt => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setFilters(prev => ({ ...prev, preCheckinMode: opt.id as any }))}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border text-left transition-all ${
                                  filters.preCheckinMode === opt.id
                                    ? "bg-sky-600 text-white border-sky-600"
                                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {filters.preCheckinMode === "next_hours" && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                Entram nas próximas horas:
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {[6, 12, 24, 48].map(h => (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => setNumericFilterPreset("preCheckinHours", h)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      filters.preCheckinHours === h && filterDrafts.preCheckinHours === undefined
                                        ? "bg-sky-600 text-white border-sky-600"
                                        : "bg-background border-border text-muted-foreground"
                                    }`}
                                  >
                                    {h}h
                                  </button>
                                ))}
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={filterDrafts.preCheckinHours ?? String(filters.preCheckinHours)}
                                  onChange={e => handleNumericFilterChange("preCheckinHours", e.target.value, 720)}
                                  onBlur={() => handleNumericFilterBlur("preCheckinHours", 24, 720)}
                                  className="h-6 w-16 text-[11px] px-1.5"
                                />
                                <span className="text-[10px] text-muted-foreground">horas</span>
                              </div>
                            </div>
                          )}

                          {filters.preCheckinMode === "next_days" && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                Entram nos próximos dias:
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {[3, 7, 15, 30].map(d => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setNumericFilterPreset("preCheckinDays", d)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      filters.preCheckinDays === d && filterDrafts.preCheckinDays === undefined
                                        ? "bg-sky-600 text-white border-sky-600"
                                        : "bg-background border-border text-muted-foreground"
                                    }`}
                                  >
                                    {d}d
                                  </button>
                                ))}
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={filterDrafts.preCheckinDays ?? String(filters.preCheckinDays)}
                                  onChange={e => handleNumericFilterChange("preCheckinDays", e.target.value, 365)}
                                  onBlur={() => handleNumericFilterBlur("preCheckinDays", 7, 365)}
                                  className="h-6 w-16 text-[11px] px-1.5"
                                />
                                <span className="text-[10px] text-muted-foreground">dias</span>
                              </div>
                            </div>
                          )}

                          {filters.preCheckinMode === "custom_dates" && (
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              <div>
                                <Label className="text-[10px] text-muted-foreground">De (Check-in)</Label>
                                <Input
                                  type="date"
                                  value={filters.preCheckinStartDate}
                                  onChange={e => setFilters(prev => ({ ...prev, preCheckinStartDate: e.target.value }))}
                                  className="h-7 text-[11px] px-1.5"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Até (Check-in)</Label>
                                <Input
                                  type="date"
                                  value={filters.preCheckinEndDate}
                                  onChange={e => setFilters(prev => ({ ...prev, preCheckinEndDate: e.target.value }))}
                                  className="h-7 text-[11px] px-1.5"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Opção B: Já entraram (In-house / Hospedados no momento) */}
                    <div className={`rounded-xl border p-2.5 transition-all ${filters.moments.includes("in_house") ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-background/50"}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.moments.includes("in_house")}
                          onChange={() => toggleMoment("in_house")}
                          className="rounded border-border text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-bold text-foreground block">
                            Já entraram (In-house / Hospedados)
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Hóspedes com check-in ativo no momento
                          </span>
                        </div>
                      </label>

                      {filters.moments.includes("in_house") && (
                        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-2 text-xs">
                          <div className="grid grid-cols-1 gap-1">
                            {[
                              { id: "all", label: "Todos hospedados agora" },
                              { id: "entered_last_hours", label: "Entraram nas últimas X horas" },
                              { id: "entered_last_days", label: "Entraram nos últimos X dias" },
                              { id: "leaving_next_hours", label: "Saem nas próximas X horas" },
                              { id: "leaving_next_days", label: "Saem nos próximos X dias" }
                            ].map(opt => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setFilters(prev => ({ ...prev, inHouseMode: opt.id as any }))}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border text-left transition-all ${
                                  filters.inHouseMode === opt.id
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {filters.inHouseMode === "entered_last_hours" && (
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                              {[6, 12, 24, 48].map(h => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setNumericFilterPreset("inHouseHours", h)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                    filters.inHouseHours === h && filterDrafts.inHouseHours === undefined ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border text-muted-foreground"
                                  }`}
                                >
                                  {h}h
                                </button>
                              ))}
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={filterDrafts.inHouseHours ?? String(filters.inHouseHours)}
                                onChange={e => handleNumericFilterChange("inHouseHours", e.target.value, 720)}
                                onBlur={() => handleNumericFilterBlur("inHouseHours", 24, 720)}
                                className="h-6 w-16 text-[11px] px-1.5"
                              />
                              <span className="text-[10px] text-muted-foreground">horas</span>
                            </div>
                          )}

                          {filters.inHouseMode === "entered_last_days" && (
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                              {[1, 3, 7, 15].map(d => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setNumericFilterPreset("inHouseDays", d)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                    filters.inHouseDays === d && filterDrafts.inHouseDays === undefined ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border text-muted-foreground"
                                  }`}
                                >
                                  {d}d
                                </button>
                              ))}
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={filterDrafts.inHouseDays ?? String(filters.inHouseDays)}
                                onChange={e => handleNumericFilterChange("inHouseDays", e.target.value, 180)}
                                onBlur={() => handleNumericFilterBlur("inHouseDays", 3, 180)}
                                className="h-6 w-16 text-[11px] px-1.5"
                              />
                              <span className="text-[10px] text-muted-foreground">dias</span>
                            </div>
                          )}

                          {filters.inHouseMode === "leaving_next_hours" && (
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                              {[6, 12, 24, 48].map(h => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setNumericFilterPreset("inHouseLeavingHours", h)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                    filters.inHouseLeavingHours === h && filterDrafts.inHouseLeavingHours === undefined ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border text-muted-foreground"
                                  }`}
                                >
                                  {h}h
                                </button>
                              ))}
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={filterDrafts.inHouseLeavingHours ?? String(filters.inHouseLeavingHours)}
                                onChange={e => handleNumericFilterChange("inHouseLeavingHours", e.target.value, 720)}
                                onBlur={() => handleNumericFilterBlur("inHouseLeavingHours", 24, 720)}
                                className="h-6 w-16 text-[11px] px-1.5"
                              />
                              <span className="text-[10px] text-muted-foreground">horas</span>
                            </div>
                          )}

                          {filters.inHouseMode === "leaving_next_days" && (
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                              {[1, 2, 3, 7].map(d => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setNumericFilterPreset("inHouseLeavingDays", d)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                    filters.inHouseLeavingDays === d && filterDrafts.inHouseLeavingDays === undefined ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border text-muted-foreground"
                                  }`}
                                >
                                  {d}d
                                </button>
                              ))}
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={filterDrafts.inHouseLeavingDays ?? String(filters.inHouseLeavingDays)}
                                onChange={e => handleNumericFilterChange("inHouseLeavingDays", e.target.value, 180)}
                                onBlur={() => handleNumericFilterBlur("inHouseLeavingDays", 3, 180)}
                                className="h-6 w-16 text-[11px] px-1.5"
                              />
                              <span className="text-[10px] text-muted-foreground">dias</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Opção C: Já saíram (Pós-check-out) */}
                    <div className={`rounded-xl border p-2.5 transition-all ${filters.moments.includes("post_checkout") ? "border-violet-500/50 bg-violet-500/5" : "border-border bg-background/50"}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.moments.includes("post_checkout")}
                          onChange={() => toggleMoment("post_checkout")}
                          className="rounded border-border text-violet-600 focus:ring-violet-500 w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-bold text-foreground block">
                            Já saíram (Pós-check-out)
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Pesquisa de satisfação, achados ou remarketing
                          </span>
                        </div>
                      </label>

                      {filters.moments.includes("post_checkout") && (
                        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { id: "last_hours", label: "Últimas X horas" },
                              { id: "last_days", label: "Últimos X dias" },
                              { id: "custom_dates", label: "Período exato" },
                              { id: "all", label: "Todo o histórico" }
                            ].map(opt => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setFilters(prev => ({ ...prev, postCheckoutMode: opt.id as any }))}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border text-left transition-all ${
                                  filters.postCheckoutMode === opt.id
                                    ? "bg-violet-600 text-white border-violet-600"
                                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {filters.postCheckoutMode === "last_hours" && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                Saíram nas últimas horas:
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {[2, 6, 12, 24].map(h => (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => setNumericFilterPreset("postCheckoutHours", h)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      filters.postCheckoutHours === h && filterDrafts.postCheckoutHours === undefined ? "bg-violet-600 text-white border-violet-600" : "bg-background border-border text-muted-foreground"
                                    }`}
                                  >
                                    {h}h
                                  </button>
                                ))}
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={filterDrafts.postCheckoutHours ?? String(filters.postCheckoutHours)}
                                  onChange={e => handleNumericFilterChange("postCheckoutHours", e.target.value, 720)}
                                  onBlur={() => handleNumericFilterBlur("postCheckoutHours", 24, 720)}
                                  className="h-6 w-16 text-[11px] px-1.5"
                                />
                                <span className="text-[10px] text-muted-foreground">horas</span>
                              </div>
                            </div>
                          )}

                          {filters.postCheckoutMode === "last_days" && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-muted-foreground block">
                                Saíram nos últimos dias:
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {[7, 30, 90, 180].map(d => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setNumericFilterPreset("postCheckoutDays", d)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      filters.postCheckoutDays === d && filterDrafts.postCheckoutDays === undefined ? "bg-violet-600 text-white border-violet-600" : "bg-background border-border text-muted-foreground"
                                    }`}
                                  >
                                    {d}d
                                  </button>
                                ))}
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={filterDrafts.postCheckoutDays ?? String(filters.postCheckoutDays)}
                                  onChange={e => handleNumericFilterChange("postCheckoutDays", e.target.value, 1095)}
                                  onBlur={() => handleNumericFilterBlur("postCheckoutDays", 30, 1095)}
                                  className="h-6 w-16 text-[11px] px-1.5"
                                />
                                <span className="text-[10px] text-muted-foreground">dias</span>
                              </div>
                            </div>
                          )}

                          {filters.postCheckoutMode === "custom_dates" && (
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              <div>
                                <Label className="text-[10px] text-muted-foreground">De (Check-out)</Label>
                                <Input
                                  type="date"
                                  value={filters.postCheckoutStartDate}
                                  onChange={e => setFilters(prev => ({ ...prev, postCheckoutStartDate: e.target.value }))}
                                  className="h-7 text-[11px] px-1.5"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Até (Check-out)</Label>
                                <Input
                                  type="date"
                                  value={filters.postCheckoutEndDate}
                                  onChange={e => setFilters(prev => ({ ...prev, postCheckoutEndDate: e.target.value }))}
                                  className="h-7 text-[11px] px-1.5"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 1.2. Canal de Origem (Multi-select) */}
              <div className="p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection("channels")}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-foreground">
                      Canal de Origem
                    </span>
                    {filters.channels.length > 0 && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {filters.channels.length}
                      </Badge>
                    )}
                  </div>
                  {openSections.channels ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {openSections.channels && (
                  <div className="space-y-1.5 pt-1">
                    {channelsMeta.map(ch => {
                      const checked = filters.channels.includes(ch.id)
                      return (
                        <label
                          key={ch.id}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            checked ? "border-indigo-500/50 bg-indigo-500/10 font-bold" : "border-border/60 hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleArrayFilter("channels", ch.id)}
                              className="rounded border-border text-indigo-600 w-3.5 h-3.5"
                            />
                            <span>{ch.label}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {ch.count}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 1.3. Localidade do Hóspede (Multi-select dinâmico com busca) */}
              <div className="p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection("locality")}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-xs text-foreground">
                      Localidade (Cidade / UF)
                    </span>
                    {(filters.cities.length + filters.states.length) > 0 && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {filters.cities.length + filters.states.length}
                      </Badge>
                    )}
                  </div>
                  {openSections.locality ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {openSections.locality && (
                  <div className="space-y-2.5 pt-1">
                    {/* Filtro rápido por UF / Estado */}
                    {states.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Filtro Rápido por UF
                          </span>
                          {(filters.states.length > 0 || filters.cities.length > 0) && (
                            <button
                              type="button"
                              onClick={() => setFilters(prev => ({ ...prev, states: [], cities: [] }))}
                              className="text-[10px] text-primary hover:underline font-semibold"
                            >
                              Limpar localidade
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {states.map(st => {
                            const active = filters.states.includes(st.state)
                            return (
                              <button
                                key={st.state}
                                type="button"
                                onClick={() => toggleArrayFilter("states", st.state)}
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all ${
                                  active
                                    ? "bg-amber-600 text-white border-amber-600"
                                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {st.state} <span className="opacity-70 text-[9px]">({st.count})</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Busca rápida de Cidades (SELECT DISTINCT do CRM) */}
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <Input
                          placeholder="Buscar cidade no CRM..."
                          value={citySearchQuery}
                          onChange={e => setCitySearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs rounded-xl"
                        />
                      </div>

                      <div className="max-h-44 overflow-y-auto border border-border/70 rounded-xl p-1.5 space-y-1 bg-background/40">
                        {visibleLocalities.length === 0 ? (
                          <div className="text-center py-4 text-[11px] text-muted-foreground">
                            Nenhuma cidade encontrada para "{citySearchQuery}".
                          </div>
                        ) : (
                          visibleLocalities.map(loc => {
                            const checked = filters.cities.includes(loc.key)
                            return (
                              <label
                                key={loc.key}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                  checked ? "bg-amber-500/15 font-bold text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleArrayFilter("cities", loc.key)}
                                    className="rounded border-border text-amber-600 w-3.5 h-3.5 shrink-0"
                                  />
                                  <span className="truncate">{loc.label}</span>
                                </div>
                                <span className="text-[10px] font-mono opacity-75 shrink-0 ml-1">
                                  {loc.count}
                                </span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 1.4. Filtros Operacionais e de CRM Adicionais */}
              <div className="p-3.5 space-y-3">
                <button
                  type="button"
                  onClick={() => toggleSection("operational")}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <span className="font-bold text-xs text-foreground">
                      Operacional & CRM
                    </span>
                  </div>
                  {openSections.operational ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {openSections.operational && (
                  <div className="space-y-3 pt-1">
                    {/* Unidades / Flats Multi-select */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          Unidade / Flat ({filters.flats.length > 0 ? `${filters.flats.length} selecionados` : "Todos"})
                        </Label>
                        {filters.flats.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, flats: [] }))}
                            className="text-[10px] text-primary hover:underline font-semibold"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {flatsMeta.map(f => {
                          const selected = filters.flats.includes(f.number)
                          return (
                            <button
                              key={f.number}
                              type="button"
                              onClick={() => toggleArrayFilter("flats", f.number)}
                              className={`py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                                  : "bg-background text-muted-foreground border-border hover:text-foreground"
                              }`}
                            >
                              {f.number}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Status de Check-in / Cadastro */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-foreground">
                        Status de Check-in / Cadastro
                      </Label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: "all", label: "Todos" },
                          { id: "completed", label: "Concluído" },
                          { id: "pending", label: "Pendente" }
                        ].map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, checkinStatus: st.id as any }))}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                              filters.checkinStatus === st.id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:text-foreground"
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Recorrência no CRM */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-foreground">
                        Recorrência no Histórico
                      </Label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: "all", label: "Todos" },
                          { id: "first_stay", label: "1ª Estadia" },
                          { id: "recurring", label: "Recorrentes" }
                        ].map(rec => (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, recurrence: rec.id as any }))}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                              filters.recurrence === rec.id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:text-foreground"
                            }`}
                          >
                            {rec.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Toggle Apenas com WhatsApp válido */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/60">
                      <div>
                        <span className="text-xs font-bold text-foreground block">
                          Apenas com WhatsApp válido
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Oculta cadastros sem telefone celular
                        </span>
                      </div>
                      <Switch
                        checked={filters.onlyValidWhatsapp}
                        onCheckedChange={val => setFilters(prev => ({ ...prev, onlyValidWhatsapp: val }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              COLUNA 2 (CENTRAL): PREVIEW EM TEMPO REAL E EXCEÇÕES (5 cols)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 bg-card border border-border rounded-2xl shadow-xs flex flex-col overflow-hidden">
            {/* Cabeçalho Central + Equação de Destinatários */}
            <div className="p-3.5 border-b border-border space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span className="font-black text-xs uppercase tracking-wider text-foreground">
                    2. Destinatários em Tempo Real & Exceções
                  </span>
                  {isLoadingSegment && (
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {excludedGuestIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearExceptions}
                      className="h-7 px-2 text-[11px] font-bold text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      Restaurar {excludedGuestIds.size} exceç{excludedGuestIds.size === 1 ? "ão" : "ões"}
                    </Button>
                  )}
                  {filteredGuests.length > 0 && activeExcludedCount < filteredGuests.length && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExcludeAllFiltered}
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Desmarcar todos
                    </Button>
                  )}
                </div>
              </div>

              {/* Contador Matemático Obrigatório:
                  Total filtrado (X) - Excluídos manualmente (Y) + Incluídos manualmente (Z) = Total para envio (W) */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5 bg-background border border-border rounded-xl p-2 text-center">
                  <div className="p-1.5 rounded-lg bg-muted/40">
                    <span className="text-[10px] font-semibold text-muted-foreground block">
                      Total filtrado
                    </span>
                    <span className="text-sm font-black text-foreground">
                      {totalFilteredCount}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 block">
                      - Excluídos man.
                    </span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {activeExcludedCount}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 block">
                      + Incluídos man.
                    </span>
                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                      {effectiveManualGuests.length}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 block">
                      = Total p/ Envio
                    </span>
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                      {finalRecipients.length}
                    </span>
                  </div>
                </div>
                <div className="px-2 py-1 rounded-lg bg-muted/40 border border-border/60 text-[10px] text-center font-semibold text-muted-foreground">
                  Total filtrado (<strong className="text-foreground">{totalFilteredCount}</strong>) - Excluídos manualmente (<strong className="text-rose-600 dark:text-rose-400">{activeExcludedCount}</strong>) + Incluídos manualmente (<strong className="text-indigo-600 dark:text-indigo-400">{effectiveManualGuests.length}</strong>) = Total para envio (<strong className="text-emerald-600 dark:text-emerald-400">{finalRecipients.length}</strong>)
                </div>
              </div>

              {/* Busca "Adicionar hóspede manualmente (Fora do filtro)" com Autocomplete */}
              <div className="relative" ref={manualSearchContainerRef}>
                <div className="relative">
                  <UserPlus className="w-3.5 h-3.5 text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Adicionar hóspede manualmente (Fora do filtro): nome, telefone, CPF ou flat..."
                    value={manualSearchQuery}
                    onFocus={() => setManualDropdownOpen(true)}
                    onChange={e => {
                      setManualSearchQuery(e.target.value)
                      setManualDropdownOpen(true)
                    }}
                    className="h-9 pl-8 pr-8 text-xs rounded-xl border-indigo-500/30 focus-visible:ring-indigo-500"
                  />
                  {manualSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setManualSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {manualDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto divide-y divide-border/60">
                    <div className="px-3 py-1.5 bg-muted/50 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                      <span>Busca em toda a base do CRM (Inclusão de Exceção)</span>
                      {isSearchingManual && <RefreshCw className="w-3 h-3 animate-spin" />}
                    </div>
                    {manualSearchResults.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        Nenhum hóspede encontrado no CRM.
                      </div>
                    ) : (
                      manualSearchResults.map(candidate => {
                        const alreadyIncluded = finalRecipients.some(
                          r => r.guestKey === candidate.guestKey || (r.phone && candidate.phone && r.phone === candidate.phone)
                        )
                        const hasValidPhone = Boolean(candidate.isValidWhatsapp && candidate.phone && candidate.phone.length >= 10)
                        return (
                          <div
                            key={candidate.guestKey}
                            onClick={() => handleAddManualGuest(candidate)}
                            className={`px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                              hasValidPhone ? "hover:bg-muted/60 cursor-pointer" : "opacity-60 cursor-not-allowed bg-muted/20"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-foreground truncate">{candidate.name}</span>
                                {candidate.flatNumber && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    Flat {candidate.flatNumber}
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                  {candidate.channelLabel}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span className={!hasValidPhone ? "text-rose-600 font-semibold" : ""}>
                                  {candidate.formattedPhone || "Sem WhatsApp válido"}
                                </span>
                                {candidate.localityLabel && <span>• {candidate.localityLabel}</span>}
                                {candidate.checkinDate && (
                                  <span>• {formatDateBrShort(candidate.checkinDate)} a {formatDateBrShort(candidate.checkoutDate)}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              disabled={!hasValidPhone}
                              variant={alreadyIncluded ? "secondary" : !hasValidPhone ? "outline" : "default"}
                              className="h-7 px-2.5 text-[11px] font-bold shrink-0"
                            >
                              {!hasValidPhone ? "Sem WhatsApp" : alreadyIncluded ? "Já na lista" : "+ Incluir"}
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Barra secundária de filtro local na tabela e toggle de desmarcados */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Filtrar rapidamente na listagem abaixo..."
                    value={recipientListSearch}
                    onChange={e => setRecipientListSearch(e.target.value)}
                    className="h-7 pl-8 text-[11px] rounded-lg bg-background"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={showExcludedInTable}
                    onChange={e => setShowExcludedInTable(e.target.checked)}
                    className="rounded border-border w-3.5 h-3.5"
                  />
                  Mostrar desmarcados ({activeExcludedCount})
                </label>
              </div>
            </div>

            {/* Listagem Reativa de Destinatários */}
            <div className="divide-y divide-border max-h-[calc(100dvh-23rem)] overflow-y-auto">
              {displayTableRows.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Users className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm font-bold text-foreground">
                    Nenhum hóspede encontrado para a combinação atual de filtros
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Ajuste os filtros no painel esquerdo ou utilize a busca acima para adicionar hóspedes manualmente fora do filtro.
                  </p>
                </div>
              ) : (
                displayTableRows.map(({ guest, isIncluded, isExcludedFromFilter }) => {
                  const isPreviewSelected = previewGuest?.guestKey === guest.guestKey
                  const momentBadge =
                    guest.moment === "in_house"
                      ? { label: "Hospedado", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" }
                      : guest.moment === "pre_checkin"
                      ? { label: "Vão entrar", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" }
                      : { label: "Pós-check-out", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" }

                  return (
                    <div
                      key={guest.guestKey}
                      className={`p-3 transition-all flex items-start gap-2.5 ${
                        !isIncluded
                          ? "bg-muted/30 opacity-60"
                          : isPreviewSelected
                          ? "bg-emerald-500/5 border-l-2 border-l-emerald-600"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => toggleRecipientCheckbox(guest)}
                        title={isIncluded ? "Desmarcar destinatário (adicionar às exceções)" : "Remarcar destinatário"}
                        className="mt-1 rounded border-border text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                      />

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className={`text-xs font-black truncate ${!isIncluded ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {guest.name}
                            </span>

                            {/* Badge de Origem: Filtro vs Inclusão Manual */}
                            {guest.originType === "manual" ? (
                              <Badge className="h-4 px-1.5 text-[9px] font-black bg-indigo-600 text-white">
                                Inclusão Manual
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-bold border-border text-muted-foreground">
                                Filtro
                              </Badge>
                            )}

                            {isExcludedFromFilter && (
                              <Badge variant="destructive" className="h-4 px-1.5 text-[9px] font-bold">
                                Exceção (Desmarcado)
                              </Badge>
                            )}

                            {guest.deduplicatedCount && guest.deduplicatedCount > 1 && (
                              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold" title={`Agrupado automaticamente a partir de ${guest.deduplicatedCount} reservas no mesmo telefone`}>
                                {guest.deduplicatedCount} reservas agrupadas
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedPreviewGuestKey(guest.guestKey)}
                              title="Visualizar preview da mensagem com os dados deste hóspede"
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 transition-colors ${
                                isPreviewSelected
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-background border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Eye className="w-3 h-3" />
                              Preview
                            </button>
                          </div>
                        </div>

                        {/* Linha 2: Telefone, Cidade/UF, Canal e Flat */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground/90 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            {guest.formattedPhone || "Sem WhatsApp"}
                          </span>

                          {guest.unitsLabel && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-bold bg-primary/5 border-primary/20 text-foreground">
                              Flat {guest.unitsLabel}
                            </Badge>
                          )}

                          <Badge variant="outline" className={`h-4 px-1.5 text-[10px] font-bold ${momentBadge.cls}`}>
                            {momentBadge.label}
                          </Badge>

                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
                            {guest.channelLabel}
                          </Badge>

                          {guest.localityLabel && (
                            <span className="flex items-center gap-0.5 text-[10px]">
                              <MapPin className="w-3 h-3 text-amber-600" />
                              {guest.localityLabel}
                            </span>
                          )}
                        </div>

                        {/* Linha 3: Datas e horários de Check-in e Check-out + Recorrência */}
                        <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground pt-0.5">
                          {guest.checkinDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-sky-600" />
                              <strong>Entrada:</strong> {formatDateBrShort(guest.checkinDate)} às {guest.checkinTime || "14:00"}
                            </span>
                          )}
                          {guest.checkoutDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-violet-600" />
                              <strong>Saída:</strong> {formatDateBrShort(guest.checkoutDate)} às {guest.checkoutTime || "12:00"}
                            </span>
                          )}
                          <span>
                            • {guest.totalStays > 1 ? `Recorrente (${guest.totalStays} estadias)` : "1ª estadia"}
                          </span>
                          <span>
                            • Cadastro: {guest.checkinStatus === "completed" ? "Concluído ✓" : "Pendente"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              COLUNA 3 (DIREITA): COMPOSITOR DE MENSAGEM E DISPARO (4 cols)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 bg-card border border-border rounded-2xl shadow-xs flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span className="font-black text-xs uppercase tracking-wider text-foreground">
                  3. Compositor & Disparo em Fila
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold">
                {finalRecipients.length} destinatário{finalRecipients.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="p-3.5 space-y-3.5">
              {/* Nome da Campanha e Modelos Rápidos */}
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <Label className="text-[11px] font-bold text-foreground">
                    Identificação do Disparo / Campanha (Opcional)
                  </Label>
                  <Input
                    placeholder="Ex: Aviso Manutenção Hidráulica • Flats Hospedados"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    className="h-8 text-xs mt-1 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-bold text-foreground">
                    Modelos Prontos de Mensagem
                  </Label>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {QUICK_BROADCAST_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setMessageTemplate(tpl.text)}
                        className="px-2 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 text-[10px] font-bold text-left truncate transition-colors"
                        title={tpl.label}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Atalhos de Variáveis Dinâmicas */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Inserir Variável Dinâmica no Cursor
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    Clique para inserir
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {DYNAMIC_VARIABLES.map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => insertVariableAtCursor(v.tag)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold transition-all"
                      title={`Insere ${v.tag} (Ex: ${v.sample})`}
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor da Mensagem */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-foreground">
                    Mensagem do WhatsApp
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    {messageTemplate.length} caracteres
                  </span>
                </div>
                <Textarea
                  ref={textareaRef}
                  rows={6}
                  value={messageTemplate}
                  onChange={e => setMessageTemplate(e.target.value)}
                  placeholder="Digite sua mensagem aqui usando {{primeiro_nome}}, {{unidade}}, {{data_checkin}}..."
                  className="text-xs font-sans leading-relaxed rounded-xl resize-y"
                />
              </div>

              {/* Preview Real da Mensagem (Bolha estilo WhatsApp) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    Preview Real da Mensagem
                  </span>
                  {previewGuest ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[210px]">
                      Dados de: {previewGuest.name} {previewGuest.flatNumber ? `(Flat ${previewGuest.flatNumber})` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Dados de exemplo
                    </span>
                  )}
                </div>

                <div className="rounded-2xl bg-[#efeae2] dark:bg-slate-900 border border-border p-3 shadow-inner">
                  <div className="bg-[#d9fdd3] dark:bg-emerald-950/80 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tr-xs p-3 text-xs whitespace-pre-wrap leading-relaxed shadow-xs border border-emerald-500/20">
                    {renderedPreviewText || <span className="italic opacity-60">A pré-visualização aparecerá aqui...</span>}
                    <div className="text-[9px] text-right text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuração de Intervalo Anti-Bloqueio (Delay) */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Fila Segura Anti-Bloqueio (Delay Aleatório)
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    Tempo est.: {estimatedDurationLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Intervalo Mínimo (seg)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="3"
                      value={minDelayInput}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "")
                        setMinDelayInput(raw)
                        const parsed = parseInt(raw, 10)
                        if (Number.isFinite(parsed) && parsed >= 1) {
                          setMinDelaySeconds(Math.min(3600, parsed))
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseInt(minDelayInput.trim(), 10)
                        const safeMin = Number.isFinite(parsed) && parsed >= 1 ? Math.min(3600, parsed) : 3
                        setMinDelaySeconds(safeMin)
                        setMinDelayInput(String(safeMin))
                      }}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Intervalo Máximo (seg)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="8"
                      value={maxDelayInput}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "")
                        setMaxDelayInput(raw)
                        const parsed = parseInt(raw, 10)
                        if (Number.isFinite(parsed) && parsed >= 1) {
                          setMaxDelaySeconds(Math.min(3600, parsed))
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseInt(maxDelayInput.trim(), 10)
                        const safeMax = Number.isFinite(parsed) && parsed >= 1 ? Math.min(3600, parsed) : 8
                        setMaxDelaySeconds(safeMax)
                        setMaxDelayInput(String(safeMax))
                      }}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Botão Principal de Disparo */}
              <Button
                size="lg"
                disabled={finalRecipients.length === 0 || !messageTemplate.trim() || activeCampaign?.status === "running"}
                onClick={() => {
                  normalizeDelayInputs()
                  setConfirmSendOpen(true)
                }}
                className="w-full h-11 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-2"
              >
                <Send className="w-4 h-4" />
                {activeCampaign?.status === "running"
                  ? "Disparo em Andamento..."
                  : `Disparar para ${finalRecipients.length} Hóspede${finalRecipients.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Disparo em Lote */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <Send className="w-5 h-5 text-emerald-600" />
              Confirmar Disparo Inteligente via WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Revise o resumo matemático da segmentação e o preview antes de iniciar a fila de envio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-muted/50 border border-border text-center">
              <div>
                <span className="text-[10px] text-muted-foreground block">Filtrados</span>
                <strong className="text-sm">{totalFilteredCount}</strong>
              </div>
              <div>
                <span className="text-[10px] text-rose-600 block">Excluídos</span>
                <strong className="text-sm text-rose-600">-{activeExcludedCount}</strong>
              </div>
              <div>
                <span className="text-[10px] text-indigo-600 block">Manuais</span>
                <strong className="text-sm text-indigo-600">+{effectiveManualGuests.length}</strong>
              </div>
              <div className="bg-emerald-500/10 rounded-lg py-0.5">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold block">Total Final</span>
                <strong className="text-sm text-emerald-600">{finalRecipients.length}</strong>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-background space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Exemplo renderizado ({previewGuest?.name || "1º Destinatário"}):
              </span>
              <p className="text-xs whitespace-pre-wrap text-foreground leading-relaxed">
                {renderedPreviewText}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                O envio será processado em background com intervalo aleatório de <strong>{minDelaySeconds}s a {maxDelaySeconds}s</strong> entre cada mensagem ({estimatedDurationLabel}) e ficará registrado no histórico e no chat.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmSendOpen(false)}>
              Voltar e Revisar
            </Button>
            <Button
              size="sm"
              disabled={isStartingCampaign}
              onClick={handleStartBroadcast}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {isStartingCampaign ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Confirmar e Iniciar Fila ({finalRecipients.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Envio de Teste */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Phone className="w-4 h-4 text-indigo-600" />
              Enviar Mensagem de Teste
            </DialogTitle>
            <DialogDescription className="text-xs">
              Envie uma prévia renderizada com os dados do hóspede atual ({previewGuest?.name || "Exemplo"}) para validar a formatação no seu WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-bold">WhatsApp de Destino do Teste</Label>
              <Input
                placeholder="Ex: (22) 99712-4021 (vazio = WhatsApp da Administração)"
                value={testPhoneInput}
                onChange={e => setTestPhoneInput(e.target.value)}
                className="h-9 text-xs mt-1"
              />
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs whitespace-pre-wrap">
              {renderedPreviewText}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTestModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={isSendingTest}
              onClick={handleSendTest}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5"
            >
              {isSendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Disparar Teste Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Histórico de Campanhas */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico de Campanhas & Disparos Inteligentes
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registro auditável dos lotes enviados, métricas de entrega e status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {campaignsHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma campanha de disparo inteligente registrada até o momento.
              </div>
            ) : (
              campaignsHistory.map(camp => (
                <div
                  key={camp.id}
                  className="p-3 rounded-xl border border-border bg-background/60 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-black text-foreground">{camp.name}</span>
                      <span className="text-[10px] text-muted-foreground block">
                        Criado por {camp.createdBy} em {new Date(camp.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={camp.status === "completed" ? "default" : camp.status === "running" ? "secondary" : "outline"}
                        className="text-[10px] font-bold"
                      >
                        {camp.status === "completed"
                          ? "Concluído"
                          : camp.status === "running"
                          ? "Em andamento"
                          : camp.status === "paused"
                          ? "Pausado"
                          : "Cancelado"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px] font-bold gap-1"
                        onClick={() => openCampaignDetails(camp.id)}
                      >
                        <Eye className="w-3 h-3" />
                        Ver Detalhes & Log
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-emerald-600 font-bold">Enviados: {camp.sentCount}</span>
                    <span className="text-rose-600 font-bold">Falhas: {camp.failedCount}</span>
                    <span className="text-amber-600 font-bold">Pendentes: {camp.pendingCount}</span>
                    <span className="text-muted-foreground">Total: {camp.totalCount}</span>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 bg-muted/40 p-2 rounded-lg font-mono">
                    {camp.messageTemplate}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes e Log Individual de Envios da Campanha */}
      <Dialog open={campaignDetailModalOpen} onOpenChange={setCampaignDetailModalOpen}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Log Detalhado de Disparo • {inspectedCampaign?.name || "Campanha"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Auditoria individual por destinatário, status de entrega na Z-API, horário de processamento e mensagem personalizada enviada.
            </DialogDescription>
          </DialogHeader>

          {inspectedCampaign && (
            <div className="space-y-3 py-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-muted/40 border border-border text-center">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Total na Fila</span>
                  <strong className="text-sm">{inspectedCampaign.totalCount}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 block">✓ Enviados</span>
                  <strong className="text-sm text-emerald-600">{inspectedCampaign.sentCount}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 block">✕ Falhas</span>
                  <strong className="text-sm text-rose-600">{inspectedCampaign.failedCount}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 block">⏳ Pendentes</span>
                  <strong className="text-sm text-amber-600">{inspectedCampaign.pendingCount}</strong>
                </div>
              </div>

              {inspectedCampaign.filtersSnapshot && (
                <div className="px-3 py-1.5 rounded-xl bg-background border border-border text-[11px] flex items-center justify-between flex-wrap gap-2">
                  <span className="text-muted-foreground">
                    Equação registrada no disparo:{" "}
                    <strong>Total filtrado ({inspectedCampaign.filtersSnapshot.filteredCount})</strong>{" "}
                    - <span className="text-rose-600 font-bold">Excluídos ({inspectedCampaign.filtersSnapshot.excludedCount})</span>{" "}
                    + <span className="text-indigo-600 font-bold">Manuais ({inspectedCampaign.filtersSnapshot.manualCount})</span>{" "}
                    = <span className="text-emerald-600 font-black">Total ({inspectedCampaign.filtersSnapshot.finalCount})</span>
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Delay: {inspectedCampaign.minDelaySeconds}s–{inspectedCampaign.maxDelaySeconds}s
                  </Badge>
                </div>
              )}

              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-[48vh] overflow-y-auto">
                {(inspectedCampaign.recipients || []).length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    Nenhum destinatário registrado nesta campanha.
                  </div>
                ) : (
                  (inspectedCampaign.recipients || []).map((rec, idx) => {
                    const statusBadge =
                      rec.status === "sent"
                        ? { label: "✓ Enviado", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" }
                        : rec.status === "failed"
                        ? { label: "✕ Falha", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" }
                        : rec.status === "sending"
                        ? { label: "🔄 Enviando...", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" }
                        : { label: "⏳ Na fila", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" }

                    return (
                      <div key={rec.guestKey || idx} className="p-2.5 bg-background/60 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-foreground">{rec.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              ({rec.formattedPhone || rec.phone})
                            </span>
                            {rec.flatNumber && (
                              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                Flat {rec.flatNumber}
                              </Badge>
                            )}
                            {rec.originType === "manual" ? (
                              <Badge className="h-4 px-1.5 text-[9px] bg-indigo-600 text-white">
                                Inclusão Manual
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-muted-foreground">
                                Filtro
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {rec.sentAt && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(rec.sentAt).toLocaleTimeString("pt-BR")}
                              </span>
                            )}
                            <Badge variant="outline" className={`h-5 px-2 text-[10px] font-bold ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </Badge>
                          </div>
                        </div>

                        {rec.error && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{rec.error}</span>
                          </div>
                        )}

                        {rec.renderedMessage && (
                          <details className="text-[11px] text-muted-foreground pt-0.5">
                            <summary className="cursor-pointer hover:text-foreground font-semibold select-none">
                              Ver mensagem personalizada enviada
                            </summary>
                            <div className="mt-1 p-2 rounded-lg bg-muted/50 border border-border/60 whitespace-pre-wrap text-foreground font-sans">
                              {rec.renderedMessage}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCampaignDetailModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
