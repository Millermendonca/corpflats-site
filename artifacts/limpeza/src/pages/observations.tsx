import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useListFlats,
  useGetMe,
  getListObservationsQueryKey,
} from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { compressImage } from "@/lib/image-compression"
import {
  Plus, CheckCircle2, AlertTriangle, Wrench, HelpCircle,
  Clock, Check, Search, Package, ArrowRight, Camera, X,
  ShieldAlert, DollarSign, Send, Settings, Copy, ExternalLink,
  Unlock, Eye, Sparkles, Calendar, UserCheck, RefreshCw, Ban, Trash2
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Link } from "wouter"

export const SPECIALTY_META: Record<string, { label: string; emoji: string; badgeClass: string }> = {
  hidraulica: { label: "Hidráulica / Vazamento", emoji: "💧", badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  eletrica: { label: "Elétrica / Iluminação", emoji: "⚡", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  marcenaria: { label: "Marcenaria / Móveis", emoji: "🪚", badgeClass: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  ar_condicionado: { label: "Ar-Condicionado", emoji: "❄️", badgeClass: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  fechadura: { label: "Fechadura / Porta", emoji: "🔐", badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  eletrodomesticos: { label: "TV / Frigobar / Micro-ondas", emoji: "📺", badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  pintura_alvenaria: { label: "Pintura / Alvenaria / Piso", emoji: "🧱", badgeClass: "bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/30" },
  geral: { label: "Reparo Geral", emoji: "🔧", badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30" },
}

export const OPERATIONAL_SCENARIOS_META = [
  { key: "vago_limpo", label: "Vago e Limpo", icon: "🟢", desc: "Sem hóspede e já higienizado (sem check-in hoje)" },
  { key: "vago_sujo", label: "Vago e Sujo", icon: "🔴", desc: "Desocupado aguardando limpeza (sem check-in hoje)" },
  { key: "checkin_hoje_limpo", label: "Check-in Hoje (Limpo)", icon: "🟡", desc: "Hóspede entra hoje, quarto já limpo" },
  { key: "checkin_hoje_sujo", label: "Check-in Hoje (Sujo)", icon: "🟠", desc: "Hóspede entra hoje, quarto ainda sujo" },
  { key: "em_limpeza", label: "Em Limpeza Agora", icon: "🧹", desc: "Camareira limpando o quarto neste momento" },
  { key: "stayover", label: "Ocupado (Stayover)", icon: "🛌", desc: "Hóspede hospedado em permanência" },
  { key: "checkout_pendente", label: "Ocupado (Saída Hoje)", icon: "⏳", desc: "Hóspede ainda no quarto com saída hoje" },
]

const WORKFLOW_STAGE_META: Record<string, { label: string; badgeClass: string }> = {
  ai_suggestion: { label: "🤖 Sugestão da IA (Avaliar)", badgeClass: "bg-purple-600 text-white" },
  reported: { label: "🆕 Aguardando Triagem", badgeClass: "bg-amber-500 text-white" },
  assigned_waiting_quote: { label: "⏳ Aguardando Orçamento (Faz-Tudo)", badgeClass: "bg-sky-600 text-white" },
  inspection_requested: { label: "🔍 Vistoria Solicitada pelo Faz-Tudo", badgeClass: "bg-purple-600 text-white" },
  quote_submitted: { label: "💰 Orçamento Recebido — Aprovar!", badgeClass: "bg-amber-600 text-white animate-pulse" },
  approved_waiting_room: { label: "✅ Aprovado (Aguardando Início)", badgeClass: "bg-indigo-600 text-white" },
  in_progress: { label: "🔨 Faz-Tudo em Execução no Flat", badgeClass: "bg-blue-600 text-white animate-pulse" },
  resolved: { label: "✓ Concluído / Resolvido", badgeClass: "bg-emerald-600 text-white" },
}

function formatDateTimePt(iso?: string | null) {
  if (!iso) return "—"
  try {
    return format(parseISO(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return String(iso)
  }
}

export default function Observations({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: user } = useGetMe()
  const isAdmin = user?.role === "admin" || user?.role === "dev"
  const qc = useQueryClient()
  const { toast } = useToast()

  // Filtros
  const [filterStage, setFilterStage] = useState<string>("open_all")
  const [filterFlat, setFilterFlat] = useState<string>("all")
  const [filterSpecialty, setFilterSpecialty] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch observations with live status
  const { data: observations = [], isLoading, refetch: refetchObservations } = useQuery<any[]>({
    queryKey: ["/api/observations"],
    queryFn: async () => {
      const res = await fetch("/api/observations", { credentials: "include" })
      if (!res.ok) throw new Error("Falha ao carregar manutenções")
      return res.json()
    },
    refetchInterval: 15000,
  })

  // Fetch Handyman Settings (Admin)
  const { data: handymanSettings, refetch: refetchHandyman } = useQuery<any>({
    queryKey: ["/api/handyman/settings"],
    queryFn: async () => {
      const res = await fetch("/api/handyman/settings", { credentials: "include" })
      if (!res.ok) return null
      return res.json()
    },
    enabled: Boolean(isAdmin),
  })

  const { data: flats } = useListFlats()

  // Lightbox de foto
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null)

  // Modal Nova Demanda (Camareira & Admin)
  const [newObsOpen, setNewObsOpen] = useState(false)
  const [newFlatId, setNewFlatId] = useState<string>("")
  const [newSpecialty, setNewSpecialty] = useState<string>("hidraulica")
  const [newCategory, setNewCategory] = useState<string>("manutencao")
  const [newText, setNewText] = useState<string>("")
  const [newPhotos, setNewPhotos] = useState<string[]>([])
  const [compressingNewPhoto, setCompressingNewPhoto] = useState(false)
  const [newIsRentalBlocker, setNewIsRentalBlocker] = useState(false)
  const [newAssignHandymanNow, setNewAssignHandymanNow] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Modal Triagem & Gestão (Admin)
  const [triageObs, setTriageObs] = useState<any | null>(null)
  const [triageText, setTriageText] = useState<string>("")
  const [triageBlocker, setTriageBlocker] = useState<boolean>(false)
  const [triageAssignedTo, setTriageAssignedTo] = useState<"handyman" | "admin">("handyman")
  const [triageSpecialty, setTriageSpecialty] = useState<string>("geral")
  const [triageAllowedStatuses, setTriageAllowedStatuses] = useState<string[]>([
    "vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"
  ])
  const [triageRequireQuote, setTriageRequireQuote] = useState<boolean>(true)
  const [triagePreApprovedAmount, setTriagePreApprovedAmount] = useState<string>("")
  const [triageEstimatedFinishAt, setTriageEstimatedFinishAt] = useState<string>("")
  const [triageAdminNotes, setTriageAdminNotes] = useState<string>("")
  const [triageSendWhatsApp, setTriageSendWhatsApp] = useState<boolean>(true)
  const [isSavingTriage, setIsSavingTriage] = useState(false)

  // Modal Rejeitar / Pedir Revisão de Orçamento
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectInput, setShowRejectInput] = useState(false)

  // Modal Resolver Ocorrência
  const [resolveObs, setResolveObs] = useState<any | null>(null)
  const [resolveNote, setResolveNote] = useState("")
  const [isResolving, setIsResolving] = useState(false)

  // Modal Configurar Faz-Tudo Padrão
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hmName, setHmName] = useState("")
  const [hmPhone, setHmPhone] = useState("")
  const [hmDoc, setHmDoc] = useState("")
  const [hmNeedGarage, setHmNeedGarage] = useState(false)
  const [hmCarModel, setHmCarModel] = useState("")
  const [hmCarPlate, setHmCarPlate] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    if (handymanSettings) {
      setHmName(handymanSettings.name || "Faz-Tudo Geral")
      setHmPhone(handymanSettings.phone || "")
      setHmDoc(handymanSettings.document || "")
      setHmNeedGarage(Boolean(handymanSettings.needGarage))
      setHmCarModel(handymanSettings.carModel || "")
      setHmCarPlate(handymanSettings.carPlate || "")
    }
  }, [handymanSettings])

  // Auto-open ticket from WhatsApp deep-link (?ticket=ID)
  useEffect(() => {
    if (!observations || observations.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const ticketId = params.get("ticket")
    if (ticketId) {
      const target = observations.find((o: any) => String(o.id) === String(ticketId))
      if (target) {
        openTriageModal(target)
        // Limpa query param sem recarregar
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, "", cleanUrl)
      }
    }
  }, [observations])

  const openTriageModal = (obs: any) => {
    setTriageObs(obs)
    setTriageText(obs.text || "")
    setTriageBlocker(Boolean(obs.isRentalBlocker))
    setTriageAssignedTo(obs.assignedTo === "admin" ? "admin" : "handyman")
    setTriageSpecialty(obs.specialty || "geral")
    setTriageAllowedStatuses(
      Array.isArray(obs.allowedRoomStatuses) && obs.allowedRoomStatuses.length > 0
        ? obs.allowedRoomStatuses
        : ["vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"]
    )
    setTriageRequireQuote(obs.requireQuote !== undefined ? Boolean(obs.requireQuote) : true)
    setTriagePreApprovedAmount(obs.quoteAmount !== null && obs.quoteAmount !== undefined ? String(obs.quoteAmount) : "")
    setTriageEstimatedFinishAt(obs.estimatedFinishAt ? String(obs.estimatedFinishAt).slice(0, 16) : "")
    setTriageAdminNotes(obs.adminNotes || "")
    setTriageSendWhatsApp(true)
    setShowRejectInput(false)
    setRejectReason("")
  }

  const refreshAll = () => {
    refetchObservations()
    qc.invalidateQueries({ queryKey: getListObservationsQueryKey() })
    qc.invalidateQueries({ queryKey: ["/api/pms/calendar"] })
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setCompressingNewPhoto(true)
    try {
      for (const file of files.slice(0, 4 - newPhotos.length)) {
        const compressed = await compressImage(file, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.82,
          preferredFormat: "image/webp",
        })
        setNewPhotos(prev => [...prev, compressed.base64])
      }
    } catch {
      toast({ title: "Erro ao processar foto", description: "Tente novamente.", variant: "destructive" })
    } finally {
      setCompressingNewPhoto(false)
      e.target.value = ""
    }
  }

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFlatId || !newText.trim()) return
    setIsCreating(true)
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flatId: parseInt(newFlatId),
          category: newCategory,
          specialty: newSpecialty,
          text: newText.trim(),
          photos: newPhotos,
          isRentalBlocker: isAdmin ? newIsRentalBlocker : false,
          assignedTo: isAdmin && newAssignHandymanNow ? "handyman" : "unassigned",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao registrar demanda")

      // Se o admin já marcou para acionar o Faz-Tudo na criação, dispara a triagem automática
      if (isAdmin && newAssignHandymanNow && data.id) {
        await fetch(`/api/observations/${data.id}/triage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            isRentalBlocker: newIsRentalBlocker,
            assignedTo: "handyman",
            specialty: newSpecialty,
            allowedRoomStatuses: ["vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"],
            requireQuote: true,
            sendWhatsAppToHandyman: true,
          }),
        })
      }

      toast({
        title: "🔧 Demanda de Manutenção Registrada!",
        description: isAdmin
          ? (newAssignHandymanNow ? "Demanda criada e enviada para o WhatsApp do Faz-Tudo!" : "Demanda registrada com sucesso.")
          : "A gerência recebeu um alerta no WhatsApp com a foto e descrição do problema.",
      })
      setNewObsOpen(false)
      setNewFlatId("")
      setNewText("")
      setNewPhotos([])
      setNewIsRentalBlocker(false)
      setNewAssignHandymanNow(false)
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveTriage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!triageObs) return
    setIsSavingTriage(true)
    try {
      const res = await fetch(`/api/observations/${triageObs.id}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: triageText.trim() || triageObs.text,
          isRentalBlocker: triageBlocker,
          assignedTo: triageAssignedTo,
          specialty: triageSpecialty,
          allowedRoomStatuses: triageAllowedStatuses,
          requireQuote: triageAssignedTo === "handyman" ? triageRequireQuote : false,
          quoteAmount: !triageRequireQuote && triagePreApprovedAmount !== "" ? Number(triagePreApprovedAmount) : undefined,
          estimatedFinishAt: triageEstimatedFinishAt || undefined,
          adminNotes: triageAdminNotes.trim(),
          sendWhatsAppToHandyman: triageAssignedTo === "handyman" && triageSendWhatsApp,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar triagem")

      toast({
        title: "✓ Triagem Salva!",
        description:
          triageAssignedTo === "handyman" && triageSendWhatsApp
            ? "O Faz-Tudo foi notificado no WhatsApp com o link do serviço."
            : "Configurações de bloqueio e atendimento atualizadas.",
      })
      setTriageObs(null)
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setIsSavingTriage(false)
    }
  }

  const handleApproveQuote = async (obsId: number, customAmount?: number) => {
    try {
      const res = await fetch(`/api/observations/${obsId}/approve-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(customAmount !== undefined ? { quoteAmount: customAmount } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao aprovar orçamento")
      toast({
        title: "✅ Orçamento Aprovado!",
        description: "O Faz-Tudo recebeu confirmação no WhatsApp e o serviço foi liberado conforme os filtros do flat.",
      })
      if (triageObs?.id === obsId) setTriageObs(null)
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    }
  }

  const handleRejectQuote = async (obsId: number) => {
    try {
      const res = await fetch(`/api/observations/${obsId}/reject-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason.trim() || "Favor revisar o valor ou prazo informado." }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar revisão")
      toast({
        title: "🔄 Revisão Solicitada",
        description: "O Faz-Tudo foi avisado no WhatsApp para revisar o orçamento no link.",
      })
      setShowRejectInput(false)
      setRejectReason("")
      if (triageObs?.id === obsId) setTriageObs(null)
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    }
  }

  const handleForceRelease = async (obsId: number) => {
    try {
      const res = await fetch(`/api/observations/${obsId}/force-release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (!res.ok) throw new Error("Falha ao liberar entrada")
      toast({
        title: "🔓 Entrada Liberada Manualmente!",
        description: "O Faz-Tudo foi avisado no WhatsApp que pode iniciar o reparo imediatamente.",
      })
      if (triageObs?.id === obsId) setTriageObs(null)
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    }
  }

  const handleTogglePaid = async (obs: any) => {
    const nextStatus = obs.paymentStatus === "paid" ? "pending" : "paid"
    try {
      const res = await fetch(`/api/observations/${obs.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentStatus: nextStatus }),
      })
      if (!res.ok) throw new Error("Falha ao atualizar pagamento")
      toast({
        title: nextStatus === "paid" ? "💸 Marcado como Pago!" : "Marcado como A Pagar",
        description: `Serviço do Flat ${obs.flatNumber} atualizado no controle financeiro do Faz-Tudo.`,
      })
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    }
  }

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolveObs) return
    setIsResolving(true)
    try {
      const res = await fetch(`/api/observations/${resolveObs.id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolvedNote: resolveNote.trim() }),
      })
      if (!res.ok) throw new Error("Falha ao concluir manutenção")
      toast({
        title: "✅ Manutenção Concluída!",
        description: `O Flat ${resolveObs.flatNumber} foi desbloqueado no calendário e registrado no Diário 360º.`,
      })
      setResolveObs(null)
      setResolveNote("")
      refreshAll()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setIsResolving(false)
    }
  }

  const handleDeleteObs = async (obsId: number) => {
    if (!confirm("Deseja realmente excluir este chamado de manutenção? Eventuais bloqueios no calendário serão removidos.")) return
    try {
      await fetch(`/api/observations/${obsId}`, { method: "DELETE", credentials: "include" })
      toast({ title: "Chamado excluído" })
      if (triageObs?.id === obsId) setTriageObs(null)
      refreshAll()
    } catch {}
  }

  const handleDismissAiSuggestion = async (obsId: number) => {
    try {
      await fetch(`/api/observations/${obsId}`, { method: "DELETE", credentials: "include" })
      toast({
        title: "🗑️ Sugestão Descartada",
        description: "A sugestão da IA foi arquivada e não será exibida novamente.",
      })
      if (triageObs?.id === obsId) setTriageObs(null)
      refreshAll()
    } catch {}
  }

  const handleSaveHandymanSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await fetch("/api/handyman/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: hmName.trim() || "Faz-Tudo Geral",
          phone: hmPhone.trim(),
          document: hmDoc.trim(),
          needGarage: hmNeedGarage,
          carModel: hmCarModel.trim(),
          carPlate: hmCarPlate.trim(),
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar configurações")
      toast({
        title: "⚙️ Faz-Tudo Padrão Atualizado!",
        description: "Os novos acionamentos serão enviados automaticamente para este contato.",
      })
      setSettingsOpen(false)
      refetchHandyman()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSavingSettings(false)
    }
  }

  const copyPortalLink = () => {
    if (!handymanSettings?.portalToken) return
    const url = `${window.location.origin}/manutencao/${handymanSettings.portalToken}`
    navigator.clipboard.writeText(url)
    toast({
      title: "🔗 Link Copiado!",
      description: "Envie este link único para o seu Faz-Tudo acompanhar todos os reparos.",
    })
  }

  // Contadores Operacionais e Financeiros
  const openList = observations.filter(o => o.status === "aberta")
  const aiSuggestionsList = observations.filter(o => o.status === "sugestao_ia")
  const triagePendingCount = openList.filter(o => (o.workflowStage || "reported") === "reported").length
  const waitingQuoteCount = openList.filter(o => o.workflowStage === "assigned_waiting_quote" || o.workflowStage === "inspection_requested" || o.workflowStage === "awaiting_quote" || o.workflowStage === "awaiting_inspection").length
  const quoteToApproveCount = openList.filter(o => o.workflowStage === "quote_submitted").length
  const activeExecutionCount = openList.filter(o => o.workflowStage === "approved_waiting_room" || o.workflowStage === "in_progress").length
  const resolvedCount = observations.filter(o => o.status === "resolvida").length

  const totalToPayResolved = observations
    .filter(o => o.status === "resolvida" && Number(o.quoteAmount) > 0 && o.paymentStatus !== "paid")
    .reduce((acc, o) => acc + Number(o.quoteAmount || 0), 0)

  const totalApprovedInOpen = openList
    .filter(o => (o.quoteStatus === "approved" || o.quoteApproved) && Number(o.quoteAmount) > 0)
    .reduce((acc, o) => acc + Number(o.quoteAmount || 0), 0)

  const totalPaid = observations
    .filter(o => Number(o.quoteAmount) > 0 && o.paymentStatus === "paid")
    .reduce((acc, o) => acc + Number(o.quoteAmount || 0), 0)

  // Filtragem
  const filteredObservations = observations.filter(obs => {
    const stage = obs.workflowStage || (obs.status === "resolvida" ? "resolved" : obs.status === "sugestao_ia" ? "ai_suggestion" : "reported")
    if (filterStage === "open_all" && obs.status !== "aberta") return false
    if (filterStage === "ai_suggestions" && obs.status !== "sugestao_ia") return false
    if (filterStage === "triage" && (obs.status !== "aberta" || stage !== "reported")) return false
    if (filterStage === "waiting_quote" && (obs.status !== "aberta" || (stage !== "assigned_waiting_quote" && stage !== "inspection_requested" && stage !== "awaiting_quote" && stage !== "awaiting_inspection"))) return false
    if (filterStage === "approve_quote" && (obs.status !== "aberta" || stage !== "quote_submitted")) return false
    if (filterStage === "in_execution" && (obs.status !== "aberta" || (stage !== "approved_waiting_room" && stage !== "in_progress"))) return false
    if (filterStage === "resolved" && obs.status !== "resolvida") return false

    if (filterFlat !== "all" && String(obs.flatId) !== filterFlat) return false
    if (filterSpecialty !== "all" && (obs.specialty || "geral") !== filterSpecialty) return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        (obs.text || "").toLowerCase().includes(q) ||
        String(obs.flatNumber || "").toLowerCase().includes(q) ||
        (obs.authorUsername || "").toLowerCase().includes(q) ||
        (obs.handymanName || "").toLowerCase().includes(q)
      )
    }
    return true
  })

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : Shell

  return (
    <Wrapper>
      <div className={`flex-1 ${embedded ? "p-0" : "p-4 md:p-8 pb-28"} max-w-6xl mx-auto w-full min-w-0 space-y-5 overflow-x-hidden`}>
        {/* Header Principal */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-card border border-border p-4 sm:p-5 rounded-3xl shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight flex flex-wrap items-center gap-2">
                <span>Central de Manutenções & Faz-Tudo</span>
                {openList.length > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px]">
                    {openList.length} em aberto
                  </Badge>
                )}
                {quoteToApproveCount > 0 && (
                  <Badge className="bg-rose-600 text-white text-[10px] animate-bounce">
                    🔔 {quoteToApproveCount} orçamento(s) para aprovar
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Reporte de avarias com foto, acionamento automático do Faz-Tudo via WhatsApp, aprovação de orçamento e bloqueio inteligente no mapa
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {isAdmin && handymanSettings?.portalToken && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyPortalLink}
                  className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  title="Copiar link único do Portal do Faz-Tudo"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Link Faz-Tudo</span>
                </Button>
                <a
                  href={`/manutencao/${handymanSettings.portalToken}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
                    title="Abrir Portal do Faz-Tudo em nova aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Ver Portal</span>
                  </Button>
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Faz-Tudo ({handymanSettings.name?.split(" ")[0] || "Config"})</span>
                </Button>
              </>
            )}

            <Button
              onClick={() => setNewObsOpen(true)}
              className="flex-1 sm:flex-initial h-10 px-4 rounded-2xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Relatar Defeito / Manutenção</span>
            </Button>
          </div>
        </div>

        {/* Barra Financeira & Funil Operacional (Visível para Admin) */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                  💸 A Pagar ao Faz-Tudo (Concluídos)
                </span>
                <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                  R$ {totalToPayResolved.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Serviços finalizados aguardando acerto
                </span>
              </div>
              <DollarSign className="w-8 h-8 text-amber-500/50 shrink-0" />
            </Card>

            <Card className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 block">
                  🔨 Orçamentos Aprovados (Em Aberto)
                </span>
                <span className="text-xl font-black text-indigo-700 dark:text-indigo-300">
                  R$ {totalApprovedInOpen.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Em execução ou aguardando liberação do flat
                </span>
              </div>
              <Wrench className="w-8 h-8 text-indigo-500/50 shrink-0" />
            </Card>

            <Card className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                  ✅ Total Já Pago ao Faz-Tudo
                </span>
                <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                  R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Histórico quitado de manutenções
                </span>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-500/50 shrink-0" />
            </Card>
          </div>
        )}

        {/* Abas Rápidas de Estágio do Fluxo */}
        <div className="flex flex-wrap items-center gap-1.5 bg-card border border-border p-2 rounded-2xl shadow-2xs">
          <button
            type="button"
            onClick={() => setFilterStage("open_all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "open_all" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>Em Aberto ({openList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("triage")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "triage" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>🆕 Triagem ({triagePendingCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("approve_quote")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "approve_quote"
                ? "bg-rose-600 text-white shadow-xs"
                : quoteToApproveCount > 0
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 animate-pulse"
                  : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>💰 Aprovar Orçamento ({quoteToApproveCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("waiting_quote")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "waiting_quote" ? "bg-sky-600 text-white shadow-xs" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>⏳ Aguardando Orçamento ({waitingQuoteCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("in_execution")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "in_execution" ? "bg-indigo-600 text-white shadow-xs" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>🔨 Liberadas / Em Execução ({activeExecutionCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("resolved")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "resolved" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>✓ Resolvidas ({resolvedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStage("ai_suggestions")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterStage === "ai_suggestions"
                ? "bg-purple-600 text-white shadow-xs"
                : aiSuggestionsList.length > 0
                  ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                  : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>🤖 Sugestões da IA ({aiSuggestionsList.length})</span>
          </button>
        </div>

        {/* Filtros de Busca, Especialidade e Flat */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 p-3.5 bg-card border border-border rounded-3xl shadow-2xs">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição, flat, camareira ou prestador..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9.5 rounded-xl bg-background"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
              <SelectTrigger className="w-full sm:w-44 h-9.5 text-xs rounded-xl">
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Especialidades</SelectItem>
                {Object.entries(SPECIALTY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterFlat} onValueChange={setFilterFlat}>
              <SelectTrigger className="w-full sm:w-36 h-9.5 text-xs rounded-xl">
                <SelectValue placeholder="Apartamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Flats</SelectItem>
                {(flats ?? []).map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>Flat {f.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista de Demandas de Manutenção */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-3xl" />)}
          </div>
        ) : filteredObservations.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border p-12 text-center">
            <Wrench className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-black text-sm text-foreground">Nenhuma demanda encontrada</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Nenhum reparo ou manutenção neste filtro. Use o botão "Relatar Defeito / Manutenção" para abrir um chamado.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredObservations.map(obs => {
              const spec = SPECIALTY_META[obs.specialty || "geral"] || SPECIALTY_META.geral
              const stageKey = obs.workflowStage || (obs.status === "resolvida" ? "resolved" : "reported")
              const stageMeta = WORKFLOW_STAGE_META[stageKey] || WORKFLOW_STAGE_META.reported
              const photos: string[] = Array.isArray(obs.photos) ? obs.photos : []

              return (
                <Card
                  key={obs.id}
                  className={`rounded-3xl border shadow-2xs overflow-hidden transition-all ${
                    obs.status === "resolvida"
                      ? "bg-muted/15 border-border opacity-85"
                      : obs.isRentalBlocker
                        ? "bg-rose-500/[0.03] border-rose-500/40"
                        : stageKey === "quote_submitted"
                          ? "bg-amber-500/[0.04] border-amber-500/50"
                          : "bg-card border-border"
                  }`}
                >
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    {/* Topo do Card */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-base text-foreground bg-muted px-2.5 py-1 rounded-xl">
                          Flat {obs.flatNumber}
                        </span>
                        <Badge variant="outline" className={`text-[11px] font-bold ${spec.badgeClass}`}>
                          {spec.emoji} {spec.label}
                        </Badge>
                        <Badge className={`text-[10.5px] font-bold ${stageMeta.badgeClass}`}>
                          {stageMeta.label}
                        </Badge>
                        {obs.status === "aberta" && (
                          obs.isRentalBlocker ? (
                            <Badge className="bg-rose-600 text-white text-[10px] font-black gap-1">
                              🚫 Impeditivo (Flat Bloqueado)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                              🟢 Não Impeditivo (Flat Livre)
                            </Badge>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>#{obs.id}</span>
                        <span>•</span>
                        <span>{formatDateTimePt(obs.createdAt)}</span>
                      </div>
                    </div>

                    {/* Descrição + Fotos */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 space-y-2">
                        <p className="text-xs sm:text-sm text-foreground leading-relaxed bg-muted/40 p-3 rounded-2xl border border-border/60 whitespace-pre-wrap break-words font-medium">
                          {obs.text}
                        </p>

                        {/* Citação Exata do Hóspede (quando gerada pela IA de Sentimento / NPS / Avaliação) */}
                        {obs.guestQuote && (
                          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-purple-800 dark:text-purple-300">
                              <span>💬 Relato Exato do Hóspede ({obs.guestName || "Hóspede"}):</span>
                              {obs.sourceLabel && (
                                <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-700 dark:text-purple-300">
                                  Fonte: {obs.sourceLabel}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs italic text-foreground">
                              "{obs.guestQuote}"
                            </p>
                          </div>
                        )}

                        {/* Status ao vivo do Flat e regras do Faz-Tudo */}
                        {obs.status === "aberta" && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted border border-border font-semibold">
                              <span>Estado Atual do Flat:</span>
                              <strong>{obs.operationalScenarioIcon} {obs.operationalScenarioLabel}</strong>
                            </span>

                            {obs.assignedTo === "handyman" && (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold border ${
                                obs.canStartNow
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30"
                              }`}>
                                {obs.canStartNow
                                  ? `✓ Entrada Liberada p/ ${obs.handymanName || "Faz-Tudo"}`
                                  : `🔒 Aguardando liberação (${obs.blockReason || "Filtro de Quarto"})`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Miniaturas das Fotos */}
                      {photos.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1">
                          {photos.map((photoUrl, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setZoomPhotoUrl(photoUrl)}
                              className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-border hover:border-primary transition-all group shrink-0"
                              title="Clique para ampliar foto"
                            >
                              <img src={photoUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Box de Orçamento / Previsão do Faz-Tudo */}
                    {(obs.quoteAmount !== null && obs.quoteAmount !== undefined || obs.plannedStartAt || obs.estimatedFinishAt || obs.inspectionRequested) && (
                      <div className={`p-3 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        obs.quoteStatus === "submitted"
                          ? "bg-amber-500/10 border-amber-500/40"
                          : obs.quoteStatus === "approved"
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : "bg-muted/40 border-border"
                      }`}>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {obs.quoteAmount !== null && obs.quoteAmount !== undefined && (
                              <span className="font-black text-sm text-foreground">
                                💰 Valor: R$ {Number(obs.quoteAmount).toFixed(2)}
                              </span>
                            )}
                            {obs.quoteStatus === "submitted" && (
                              <Badge className="bg-amber-600 text-white text-[10px]">Aguardando sua Aprovação</Badge>
                            )}
                            {obs.quoteStatus === "approved" && (
                              <Badge className="bg-emerald-600 text-white text-[10px]">Orçamento Aprovado</Badge>
                            )}
                            {obs.inspectionRequested && obs.quoteStatus !== "submitted" && obs.quoteStatus !== "approved" && (
                              <Badge className="bg-purple-600 text-white text-[10px]">🔍 Faz-Tudo pediu vistoria presencial antes de orçar</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {obs.plannedStartAt && (
                              <span>🚀 Início previsto: <strong>{formatDateTimePt(obs.plannedStartAt)}</strong></span>
                            )}
                            {obs.estimatedFinishAt && (
                              <span>🏁 Conclusão prevista: <strong>{formatDateTimePt(obs.estimatedFinishAt)}</strong></span>
                            )}
                            {obs.quoteNotes && (
                              <span>📝 Obs. Faz-Tudo: <strong>"{obs.quoteNotes}"</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Botões Diretos de Aprovação de Orçamento */}
                        {isAdmin && obs.status === "aberta" && obs.quoteStatus === "submitted" && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => handleApproveQuote(obs.id)}
                              className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aprovar R$ {Number(obs.quoteAmount || 0).toFixed(2)}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openTriageModal(obs)}
                              className="h-8 px-3 rounded-xl text-xs font-bold border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                            >
                              Revisar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rodapé do Card: Autor e Botões de Ação */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Relatado por: <strong>{obs.authorUsername || "Equipe"}</strong></span>
                        {obs.assignedTo === "handyman" && (
                          <span>• Prestador: <strong>{obs.handymanName || "Faz-Tudo"}</strong></span>
                        )}
                        {obs.status === "resolvida" && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            • ✓ Concluído por <strong>{obs.resolvedByUsername || obs.handymanName || "Equipe"}</strong>
                            {obs.resolvedNote ? ` ("${obs.resolvedNote}")` : ""}
                          </span>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {obs.status === "sugestao_ia" ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => openTriageModal(obs)}
                                className="h-8 px-3 rounded-xl text-xs font-bold gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-2xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Converter em Manutenção / Acionar Faz-Tudo</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDismissAiSuggestion(obs.id)}
                                className="h-8 px-3 rounded-xl text-xs font-bold gap-1 border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Descartar</span>
                              </Button>
                            </>
                          ) : obs.status === "aberta" ? (
                            <>
                              <Button
                                size="sm"
                                variant={stageKey === "reported" ? "default" : "outline"}
                                onClick={() => openTriageModal(obs)}
                                className={`h-8 px-3 rounded-xl text-xs font-bold gap-1 ${
                                  stageKey === "reported" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                                }`}
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                <span>{stageKey === "reported" ? "Triagem / Acionar Faz-Tudo" : "Gerenciar / Filtros"}</span>
                              </Button>

                              {obs.assignedTo === "handyman" && !obs.canStartNow && !obs.forceReleasedByAdmin && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleForceRelease(obs.id)}
                                  className="h-8 px-2.5 rounded-xl text-xs font-bold gap-1 border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10"
                                  title="Liberar entrada no quarto agora mesmo fora do filtro"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Liberar Entrada Agora</span>
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setResolveObs(obs)
                                  setResolveNote("")
                                }}
                                className="h-8 px-3 rounded-xl text-xs font-bold gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Dar Baixa</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              {Number(obs.quoteAmount) > 0 && (
                                <Button
                                  size="sm"
                                  variant={obs.paymentStatus === "paid" ? "outline" : "default"}
                                  onClick={() => handleTogglePaid(obs)}
                                  className={`h-8 px-3 rounded-xl text-xs font-bold gap-1 ${
                                    obs.paymentStatus === "paid"
                                      ? "border-emerald-500/40 text-emerald-700"
                                      : "bg-amber-600 hover:bg-amber-700 text-white"
                                  }`}
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>
                                    {obs.paymentStatus === "paid"
                                      ? `✓ Pago (R$ ${Number(obs.quoteAmount).toFixed(2)})`
                                      : `Marcar Pago (R$ ${Number(obs.quoteAmount).toFixed(2)})`}
                                  </span>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* ── MODAL 1: RELATAR DEFEITO / NOVA MANUTENÇÃO (Camareira & Admin) ── */}
        <Dialog open={newObsOpen} onOpenChange={setNewObsOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg bg-card border border-border rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-500" />
                <span>Relatar Defeito / Nova Manutenção</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informe o apartamento, descreva o problema e anexe foto se necessário. A gerência recebe alerta imediato no WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateObservation} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Apartamento *</Label>
                  <Select value={newFlatId} onValueChange={setNewFlatId} required>
                    <SelectTrigger className="h-10 text-xs rounded-xl">
                      <SelectValue placeholder="Selecione o flat" />
                    </SelectTrigger>
                    <SelectContent>
                      {(flats ?? []).map(f => (
                        <SelectItem key={f.id} value={String(f.id)}>Flat {f.number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Área / Especialidade *</Label>
                  <Select value={newSpecialty} onValueChange={setNewSpecialty}>
                    <SelectTrigger className="h-10 text-xs rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SPECIALTY_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição do Problema *</Label>
                <Textarea
                  placeholder="Ex: Torneira da pia do banheiro está pingando bastante, gaveta do armário soltou o trilho..."
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  required
                  rows={3}
                  className="text-xs rounded-xl"
                />
              </div>

              {/* Upload de Fotos (Câmera ou Galeria) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-600" />
                    <span>Fotos do Problema (Opcional — até 4 fotos)</span>
                  </Label>
                  {compressingNewPhoto && (
                    <span className="text-[11px] text-amber-600 font-semibold animate-pulse">Otimizando foto...</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {newPhotos.map((p, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-border">
                      <img src={p} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {newPhotos.length < 4 && (
                    <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-amber-500/40 hover:border-amber-500 bg-amber-500/5 flex flex-col items-center justify-center gap-1 cursor-pointer text-amber-700 dark:text-amber-300 text-[10px] font-bold transition-colors">
                      <Camera className="w-5 h-5" />
                      <span>Tirar Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Opções Rápidas Exclusivas do Admin já no lançamento */}
              {isAdmin && (
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2.5 text-xs">
                  <span className="font-black text-[11px] uppercase tracking-wider text-muted-foreground block">
                    Opções Rápidas da Gerência
                  </span>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newIsRentalBlocker}
                      onChange={e => setNewIsRentalBlocker(e.target.checked)}
                      className="rounded border-border w-4 h-4 accent-rose-600"
                    />
                    <span className="font-bold text-rose-700 dark:text-rose-400">
                      🚫 Problema Impeditivo para Locação (Bloquear flat no calendário imediatamente)
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAssignHandymanNow}
                      onChange={e => setNewAssignHandymanNow(e.target.checked)}
                      className="rounded border-border w-4 h-4 accent-amber-600"
                    />
                    <span className="font-bold text-foreground">
                      📲 Já acionar o Faz-Tudo ({handymanSettings?.name || "Padrão"}) no WhatsApp agora
                    </span>
                  </label>
                </div>
              )}

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setNewObsOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isCreating || compressingNewPhoto} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {isCreating ? "Enviando..." : "Registrar Manutenção"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL 2: TRIAGEM, BLOQUEIO, FILTROS & ORÇAMENTO (Admin — Link do WhatsApp) ── */}
        <Dialog open={Boolean(triageObs)} onOpenChange={open => { if (!open) setTriageObs(null) }}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl bg-card border border-border rounded-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            {triageObs && (
              <>
                <DialogHeader className="border-b border-border pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <DialogTitle className="text-base sm:text-lg font-black text-foreground flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-amber-500" />
                      <span>Triagem & Gestão — Flat {triageObs.flatNumber} (Chamado #{triageObs.id})</span>
                    </DialogTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteObs(triageObs.id)}
                      className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-500/10 rounded-lg"
                      title="Excluir chamado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <DialogDescription className="text-xs">
                    Defina se o defeito bloqueia o flat, quem vai executar e em quais situações do quarto o Faz-Tudo pode entrar.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSaveTriage} className="space-y-4 pt-2 text-xs">
                  {/* Resumo do Problema, Edição Rápida e Fotos */}
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-foreground">
                        Relatado por {triageObs.authorUsername || "Camareira"} em {formatDateTimePt(triageObs.createdAt)}
                      </span>
                      <Badge variant="outline" className="font-bold text-[11px]">
                        Situação Atual: {triageObs.operationalScenarioIcon} {triageObs.operationalScenarioLabel}
                      </Badge>
                    </div>

                    {triageObs.guestQuote && (
                      <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-[11px] space-y-0.5">
                        <span className="font-bold text-purple-800 dark:text-purple-300 block">
                          💬 Mensagem original do hóspede ({triageObs.guestName || "Hóspede"}):
                        </span>
                        <p className="italic text-foreground">"{triageObs.guestQuote}"</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-[11px] font-bold">Descrição Técnica do Serviço (enviada ao Faz-Tudo)</Label>
                        <Input
                          value={triageText}
                          onChange={e => setTriageText(e.target.value)}
                          className="h-9 text-xs font-semibold bg-background rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Especialidade</Label>
                        <Select value={triageSpecialty} onValueChange={setTriageSpecialty}>
                          <SelectTrigger className="h-9 text-xs bg-background rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SPECIALTY_META).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {Array.isArray(triageObs.photos) && triageObs.photos.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                        {triageObs.photos.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt="Foto avaria"
                            onClick={() => setZoomPhotoUrl(url)}
                            className="w-20 h-20 rounded-xl object-cover border cursor-pointer hover:opacity-90"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Aprovação de Orçamento Pendente (Se o Faz-Tudo já enviou valor) */}
                  {triageObs.quoteStatus === "submitted" && (
                    <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                          🔔 Orçamento Enviado pelo Faz-Tudo ({triageObs.handymanName})
                        </span>
                        <span className="font-black text-base text-emerald-700 dark:text-emerald-300 bg-background px-2.5 py-1 rounded-xl border">
                          R$ {Number(triageObs.quoteAmount || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-background/80 p-2.5 rounded-xl">
                        <div>
                          <span className="text-muted-foreground block">Quando poderá iniciar:</span>
                          <strong>{formatDateTimePt(triageObs.plannedStartAt)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Prazo de conclusão informado:</span>
                          <strong>{formatDateTimePt(triageObs.estimatedFinishAt)}</strong>
                        </div>
                        {triageObs.quoteNotes && (
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground block">Observações do Faz-Tudo:</span>
                            <strong>"{triageObs.quoteNotes}"</strong>
                          </div>
                        )}
                      </div>

                      {!showRejectInput ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => handleApproveQuote(triageObs.id)}
                            className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Aprovar Orçamento (R$ {Number(triageObs.quoteAmount || 0).toFixed(2)}) e Liberar</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowRejectInput(true)}
                            className="h-9 rounded-xl border-rose-500/40 text-rose-600 font-bold text-xs"
                          >
                            Pedir Revisão
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <Input
                            placeholder="Motivo da revisão (ex: Valor ficou alto, ou precisamos concluir antes das 14h)..."
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            className="text-xs h-9 rounded-xl bg-background"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleRejectQuote(triageObs.id)}
                              className="h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                            >
                              Enviar Pedido de Revisão no WhatsApp
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRejectInput(false)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 1. É Impeditivo para Locação? */}
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-wider text-foreground">
                      1. Este problema impede a locação do Flat {triageObs.flatNumber}?
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTriageBlocker(false)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          !triageBlocker
                            ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-black text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <span>🟢 Não Impeditivo (Flat Segue Livre)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          O flat continua disponível para reservas e só bloqueia durante a janela em que o Faz-Tudo estiver executando.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTriageBlocker(true)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          triageBlocker
                            ? "border-rose-600 bg-rose-500/10 ring-2 ring-rose-500/30"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-black text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                          <span>🚫 Impeditivo (Bloquear Flat Agora)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Bloqueia o flat imediatamente no Mapa de Reservas até que o conserto seja finalizado (por você ou pelo Faz-Tudo).
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 2. Quem vai resolver? */}
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-wider text-foreground">
                      2. Quem irá resolver esta demanda?
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTriageAssignedTo("handyman")}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          triageAssignedTo === "handyman"
                            ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-black text-xs text-amber-700 dark:text-amber-300">
                          👷 Acionar Faz-Tudo ({handymanSettings?.name || "Prestador"})
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Envia WhatsApp com link para orçamento, prazo e início controlado por filtros do quarto.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTriageAssignedTo("admin")}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          triageAssignedTo === "admin"
                            ? "border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-black text-xs text-indigo-700 dark:text-indigo-300">
                          👤 Resolver Eu Mesmo / Equipe Interna
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Não envia para o Faz-Tudo. Você mesmo acompanha e dá baixa quando concluir.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 3. Configurações do Faz-Tudo (Filtros de Quarto + Regra de Orçamento) */}
                  {triageAssignedTo === "handyman" && (
                    <div className="space-y-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/30">
                      {/* Filtros de Situação do Flat */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="text-xs font-black text-foreground">
                            3. Em quais situações do Flat o Faz-Tudo está autorizado a entrar?
                          </Label>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setTriageAllowedStatuses(["vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"])}
                              className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-bold"
                            >
                              Qualquer Vago
                            </button>
                            <button
                              type="button"
                              onClick={() => setTriageAllowedStatuses(["vago_sujo", "checkin_hoje_sujo"])}
                              className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-bold"
                            >
                              Só Flat Sujo
                            </button>
                            <button
                              type="button"
                              onClick={() => setTriageAllowedStatuses(["vago_limpo", "vago_sujo"])}
                              className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-bold"
                            >
                              Vagos s/ Check-in Hoje
                            </button>
                            <button
                              type="button"
                              onClick={() => setTriageAllowedStatuses(OPERATIONAL_SCENARIOS_META.map(s => s.key))}
                              className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-bold"
                            >
                              Todos (Inclusive Stayover)
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {OPERATIONAL_SCENARIOS_META.map(sc => {
                            const checked = triageAllowedStatuses.includes(sc.key)
                            const isCurrent = triageObs.operationalScenario === sc.key
                            return (
                              <label
                                key={sc.key}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                  checked
                                    ? "bg-background border-amber-500/60 shadow-2xs"
                                    : "bg-muted/20 border-border opacity-70"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setTriageAllowedStatuses(prev => [...prev, sc.key])
                                    } else {
                                      setTriageAllowedStatuses(prev => prev.filter(k => k !== sc.key))
                                    }
                                  }}
                                  className="mt-0.5 rounded accent-amber-600"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-xs flex items-center justify-between gap-1">
                                    <span>{sc.icon} {sc.label}</span>
                                    {isCurrent && (
                                      <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0">
                                        Atual
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[10.5px] text-muted-foreground block leading-tight mt-0.5">
                                    {sc.desc}
                                  </span>
                                </div>
                              </label>
                            )
                          })}
                        </div>

                        <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                          💡 Se o flat não estiver em uma situação marcada agora, o Faz-Tudo verá o motivo no link e <strong>receberá um WhatsApp automático assim que o flat entrar na situação permitida!</strong>
                        </p>
                      </div>

                      {/* Regra de Orçamento */}
                      <div className="space-y-2 pt-2 border-t border-amber-500/20">
                        <Label className="text-xs font-black text-foreground">
                          4. Orçamento e Aprovação de Valor
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                            triageRequireQuote ? "bg-background border-amber-500" : "bg-muted/20 border-border"
                          }`}>
                            <input
                              type="radio"
                              checked={triageRequireQuote}
                              onChange={() => setTriageRequireQuote(true)}
                              className="mt-0.5 accent-amber-600"
                            />
                            <div>
                              <span className="font-bold block">💰 Exigir Orçamento no Link</span>
                              <span className="text-[10.5px] text-muted-foreground">
                                O Faz-Tudo informa valor, início e prazo no link (ou pede vistoria) e você aprova antes de liberar.
                              </span>
                            </div>
                          </label>

                          <label className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                            !triageRequireQuote ? "bg-background border-emerald-500" : "bg-muted/20 border-border"
                          }`}>
                            <input
                              type="radio"
                              checked={!triageRequireQuote}
                              onChange={() => setTriageRequireQuote(false)}
                              className="mt-0.5 accent-emerald-600"
                            />
                            <div>
                              <span className="font-bold block">⚡ Já Aprovar Direto</span>
                              <span className="text-[10.5px] text-muted-foreground">
                                Pular etapa de orçamento (ou definir valor já combinado) para ele iniciar assim que o quarto liberar.
                              </span>
                            </div>
                          </label>
                        </div>

                        {!triageRequireQuote && (
                          <div className="pt-1">
                            <Label className="text-[11px] font-bold">Valor Combinado (R$ — Opcional)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex: 80.00"
                              value={triagePreApprovedAmount}
                              onChange={e => setTriagePreApprovedAmount(e.target.value)}
                              className="h-9 text-xs rounded-xl bg-background mt-1 max-w-xs"
                            />
                          </div>
                        )}
                      </div>

                      {/* Instruções para o Faz-Tudo */}
                      <div className="space-y-1.5 pt-2 border-t border-amber-500/20">
                        <Label className="text-xs font-bold">Instruções / Recado para o Faz-Tudo (Opcional)</Label>
                        <Input
                          placeholder="Ex: A chave reserva está na recepção, levar fita veda-rosca..."
                          value={triageAdminNotes}
                          onChange={e => setTriageAdminNotes(e.target.value)}
                          className="h-9 text-xs rounded-xl bg-background"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={triageSendWhatsApp}
                          onChange={e => setTriageSendWhatsApp(e.target.checked)}
                          className="rounded w-4 h-4 accent-emerald-600"
                        />
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          📲 Enviar notificação no WhatsApp do Faz-Tudo ({handymanSettings?.phone || "configurado"}) ao salvar
                        </span>
                      </label>
                    </div>
                  )}

                  <DialogFooter className="gap-2 pt-3 border-t border-border">
                    <Button type="button" variant="outline" onClick={() => setTriageObs(null)} className="rounded-xl h-9 text-xs font-bold">
                      Fechar
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSavingTriage}
                      className="rounded-xl h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSavingTriage
                          ? "Salvando..."
                          : triageAssignedTo === "handyman" && triageSendWhatsApp
                            ? "Salvar e Acionar Faz-Tudo no WhatsApp"
                            : "Salvar Configurações"}
                      </span>
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ── MODAL 3: DAR BAIXA / RESOLVER MANUTENÇÃO ── */}
        <Dialog open={Boolean(resolveObs)} onOpenChange={open => { if (!open) setResolveObs(null) }}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Dar Baixa na Manutenção — Flat {resolveObs?.flatNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                O bloqueio do calendário (se ativo) será removido imediatamente e o reparo será gravado no Diário 360º do flat.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmResolve} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">O que foi feito? (Nota de Resolução)</Label>
                <Textarea
                  placeholder="Ex: Reparo concluído, peça substituída e testada..."
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  rows={3}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setResolveObs(null)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isResolving} className="rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isResolving ? "Concluindo..." : "Confirmar Conclusão"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL 4: CONFIGURAR FAZ-TUDO PADRÃO ── */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-500" />
                <span>Configurar Faz-Tudo Padrão</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre os dados do prestador que faz seus reparos gerais para acioná-lo em 1 clique com link único no WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveHandymanSettings} className="space-y-3.5 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome do Faz-Tudo *</Label>
                <Input value={hmName} onChange={e => setHmName(e.target.value)} required className="h-9 text-xs rounded-xl" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">WhatsApp (com DDD) *</Label>
                  <Input
                    placeholder="Ex: 22999999999"
                    value={hmPhone}
                    onChange={e => setHmPhone(e.target.value)}
                    required
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">CPF / Documento</Label>
                  <Input
                    placeholder="Para liberação na portaria"
                    value={hmDoc}
                    onChange={e => setHmDoc(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={hmNeedGarage}
                  onChange={e => setHmNeedGarage(e.target.checked)}
                  className="rounded w-4 h-4 accent-amber-600"
                />
                <span className="font-bold">Costuma utilizar vaga de garagem (Carro / Moto)</span>
              </label>

              {hmNeedGarage && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Modelo / Cor</Label>
                    <Input value={hmCarModel} onChange={e => setHmCarModel(e.target.value)} className="h-9 text-xs rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Placa</Label>
                    <Input value={hmCarPlate} onChange={e => setHmCarPlate(e.target.value)} className="h-9 text-xs rounded-xl" />
                  </div>
                </div>
              )}

              {handymanSettings?.portalToken && (
                <div className="p-3 rounded-2xl bg-muted/50 border border-border space-y-1.5">
                  <span className="font-bold text-[11px] block">Link Único do Portal do Faz-Tudo:</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      readOnly
                      value={`${window.location.origin}/manutencao/${handymanSettings.portalToken}`}
                      className="h-8 text-[11px] font-mono bg-background"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={copyPortalLink} className="h-8 px-2.5">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingSettings} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingSettings ? "Salvando..." : "Salvar Faz-Tudo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL LIGHTBOX FOTO AMPLIADA ── */}
        <Dialog open={Boolean(zoomPhotoUrl)} onOpenChange={open => { if (!open) setZoomPhotoUrl(null) }}>
          <DialogContent className="sm:max-w-2xl bg-black/95 border-slate-800 p-2 rounded-3xl">
            {zoomPhotoUrl && (
              <img src={zoomPhotoUrl} alt="Foto Ampliada" className="w-full max-h-[82vh] object-contain rounded-2xl" />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Wrapper>
  )
}
