import { useState, useMemo, useEffect, useRef } from "react"
import { useLocation } from "wouter"
import { 
  useGetMe,
  useListCheckouts, 
  useListCheckins,
  useGetDashboardSummary,
  useBatchClaimFlats,
  getListCheckoutsQueryKey,
  getListCheckinsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { format, addDays, subDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Shell } from "@/components/layout"
import { FlatCard } from "@/components/flat-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { 
  ChevronLeft, ChevronRight, CheckSquare, PlusCircle, Sparkles, Filter, X, RefreshCw, Upload, FileSpreadsheet,
  Calendar as CalendarIcon, UserCheck, CheckCircle2, BedDouble, Coins, MessageSquare
} from "lucide-react"
import { cn } from "@/lib/utils"

function getDefaultDate(userRole?: string) {
  const now = new Date()
  if (now.getHours() >= 18) {
    return format(addDays(now, 1), "yyyy-MM-dd")
  }
  return format(now, "yyyy-MM-dd")
}

export default function Dashboard() {
  const { data: user } = useGetMe()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "admin"
  
  const defaultDate = useMemo(() => getDefaultDate(user?.role), [user?.role])
  const [selectedDateStr, setSelectedDateStr] = useState<string>(defaultDate)
  
  // Interactive Status Filter: "all" | "dirty" | "cleaning_now" | "pending_issue" | "clean"
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  useEffect(() => {
    if (user?.role) {
      setSelectedDateStr(getDefaultDate(user.role))
    }
  }, [user?.role])

  const setDate = (newDate: string) => {
    setSelectedDateStr(newDate)
    setStatusFilter("all") // Reset filter on date change
  }



  const { data: checkouts, isLoading: loadingCheckouts } = useListCheckouts(
    { date: selectedDateStr },
    { query: { refetchInterval: 12000, refetchOnWindowFocus: true, queryKey: getListCheckoutsQueryKey({ date: selectedDateStr }) } }
  )
  
  const { data: checkins, isLoading: loadingCheckins } = useListCheckins(
    { date: selectedDateStr },
    { query: { refetchInterval: 12000, refetchOnWindowFocus: true, queryKey: getListCheckinsQueryKey({ date: selectedDateStr }) } }
  )
  
  const { data: summary } = useGetDashboardSummary(
    { date: selectedDateStr },
    { query: { refetchInterval: 12000, refetchOnWindowFocus: true, queryKey: getGetDashboardSummaryQueryKey({ date: selectedDateStr }) } }
  )

  const [availableFlats, setAvailableFlats] = useState<any[]>([])
  const [cleanersList, setCleanersList] = useState<any[]>([])
  
  useEffect(() => {
    fetch("/api/flats")
      .then(res => res.json())
      .then(data => setAvailableFlats(data))
      .catch(() => {})

    fetch("/api/cleaners")
      .then(res => res.json())
      .then(data => setCleanersList(data))
      .catch(() => {})
  }, [])

  // Manual cleaning / instruction request modal state
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualRequestType, setManualRequestType] = useState<"cleaning" | "instruction">("cleaning")
  const [manualFlatId, setManualFlatId] = useState<string>("")
  const [manualDate, setManualDate] = useState<string>("")
  const [manualMarkAsClean, setManualMarkAsClean] = useState(false)
  const [manualCleanerId, setManualCleanerId] = useState<string>("")
  const [manualIsPriority, setManualIsPriority] = useState(false)
  const [manualTwinBeds, setManualTwinBeds] = useState(false)
  const [manualObservation, setManualObservation] = useState<string>("")
  const [manualInstructionText, setManualInstructionText] = useState<string>("")
  const [manualIsPaid, setManualIsPaid] = useState(false)
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)

  const handleOpenManualModal = (initialType: "cleaning" | "instruction" = "cleaning") => {
    if (!isAdmin) return
    setManualRequestType(initialType)
    setManualDate(selectedDateStr || format(new Date(), "yyyy-MM-dd"))
    setManualFlatId("")
    setManualMarkAsClean(false)
    setManualCleanerId("")
    setManualIsPriority(false)
    if (initialType === "instruction") {
      setManualTwinBeds(true)
      setManualInstructionText("Separar as camas, colocar como 2 solteiras")
    } else {
      setManualTwinBeds(false)
      setManualInstructionText("")
    }
    setManualIsPaid(false)
    setManualObservation("")
    setManualModalOpen(true)
  }

  const handleCreateManualRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualFlatId) return
    setIsSubmittingManual(true)
    const targetDate = manualDate || selectedDateStr
    const isInst = manualRequestType === "instruction"
    try {
      await fetch("/api/cleaning/requests/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: Number(manualFlatId),
          requestDate: targetDate,
          isPriority: manualIsPriority,
          twinBeds: manualTwinBeds,
          markAsClean: manualMarkAsClean,
          assignedUserId: manualMarkAsClean && manualCleanerId ? Number(manualCleanerId) : null,
          observation: isInst ? (manualInstructionText.trim() || null) : (manualObservation.trim() || null),
          requestType: manualRequestType,
          instructionText: isInst ? (manualInstructionText.trim() || (manualTwinBeds ? "Separar as camas, colocar como 2 solteiras" : "Instrução no flat")) : null,
          isPaidCleaning: isInst ? manualIsPaid : true,
          isBedAdjustmentOnly: isInst && manualTwinBeds
        })
      })
      setManualModalOpen(false)
      setManualFlatId("")
      setManualIsPriority(false)
      setManualTwinBeds(false)
      setManualMarkAsClean(false)
      setManualCleanerId("")
      setManualObservation("")
      setManualInstructionText("")
      setManualIsPaid(false)
      setManualRequestType("cleaning")
      queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date: selectedDateStr }) })
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ date: selectedDateStr }) })
      if (targetDate !== selectedDateStr) {
        queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date: targetDate }) })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ date: targetDate }) })
      }
    } finally {
      setIsSubmittingManual(false)
    }
  }

  const batchClaim = useBatchClaimFlats({
    mutation: {
      onSuccess: () => {
        setSelectedRequestIds([])
        queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date: selectedDateStr }) })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ date: selectedDateStr }) })
      }
    }
  })

  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([])

  const toggleSelect = (id: number) => {
    setSelectedRequestIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleBatchClaim = () => {
    if (selectedRequestIds.length > 0) {
      batchClaim.mutate({ data: { requestIds: selectedRequestIds } })
    }
  }

  const isLoading = loadingCheckouts || loadingCheckins

  // Sort logic: Priority first, then Pending from previous day, then Check-in today, then by flat number
  const sortedFlats = useMemo(() => {
    if (!checkouts || !Array.isArray(checkouts)) return []
    return [...checkouts].sort((a: any, b: any) => {
      const aPriority = a?.isPriority || a?.cleaningRequest?.isPriority ? 1 : 0
      const bPriority = b?.isPriority || b?.cleaningRequest?.isPriority ? 1 : 0
      if (aPriority !== bPriority) return bPriority - aPriority

      const aPending = a?.isPendingFromPreviousDay || a?.cleaningRequest?.isPendingFromPreviousDay ? 1 : 0
      const bPending = b?.isPendingFromPreviousDay || b?.cleaningRequest?.isPendingFromPreviousDay ? 1 : 0
      if (aPending !== bPending) return bPending - aPending

      const aCheckin = a?.hasCheckinToday ? 1 : 0
      const bCheckin = b?.hasCheckinToday ? 1 : 0
      if (aCheckin !== bCheckin) return bCheckin - aCheckin

      const numA = String(a?.flatNumber || a?.flatId || "")
      const numB = String(b?.flatNumber || b?.flatId || "")
      return numA.localeCompare(numB, undefined, { numeric: true })
    })
  }, [checkouts])

  // Filtered flats according to active status filter
  const filteredFlats = useMemo(() => {
    if (!sortedFlats || !Array.isArray(sortedFlats)) return []
    // Para camareiras, quartos com No Show não entram na fila de quartos para higienização
    const baseFlats = !isAdmin 
      ? sortedFlats.filter((f: any) => (f?.cleaningRequest?.status || f?.status) !== "no_show")
      : sortedFlats

    if (statusFilter === "all") return baseFlats
    if (statusFilter === "cleaning_now") {
      return baseFlats.filter((f: any) => {
        const isInst = Boolean(f?.isInstructionOnly || f?.cleaningRequest?.isInstructionOnly || f?.type === "instruction" || f?.source === "manual_instruction" || f?.isBedAdjustmentOnly || f?.cleaningRequest?.isBedAdjustmentOnly)
        if (isInst) return false
        const st = f?.cleaningRequest?.status || "dirty"
        return st === "cleaning_now" || st === "will_clean"
      })
    }
    if (statusFilter === "dirty") {
      return baseFlats.filter((f: any) => {
        const isInst = Boolean(f?.isInstructionOnly || f?.cleaningRequest?.isInstructionOnly || f?.type === "instruction" || f?.source === "manual_instruction" || f?.isBedAdjustmentOnly || f?.cleaningRequest?.isBedAdjustmentOnly)
        if (isInst) return false
        const st = f?.cleaningRequest?.status || "dirty"
        return st === "dirty"
      })
    }
    return baseFlats.filter((f: any) => {
      const st = f?.cleaningRequest?.status || "dirty"
      return st === statusFilter
    })
  }, [sortedFlats, statusFilter, isAdmin])

  const toggleFilter = (targetStatus: string) => {
    if (statusFilter === targetStatus) {
      setStatusFilter("all")
    } else {
      setStatusFilter(targetStatus)
    }
  }

  const parsedDate = selectedDateStr ? parseISO(selectedDateStr) : new Date()
  const displayDate = format(parsedDate, "dd 'de' MMMM", { locale: ptBR })
  const isToday = selectedDateStr === format(new Date(), "yyyy-MM-dd")

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* Header & Date Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Controle de Limpeza
            </h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin ? "Visão geral e gestão operacional dos quartos" : "Sua lista de quartos para higienização hoje"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Add Manual Flat Button right on main screen */}
            {isAdmin && (
              <Button 
                onClick={handleOpenManualModal}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs flex items-center gap-1.5 text-xs h-9"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Adicionar Quarto</span>
              </Button>
            )}

            {/* Date Picker Buttons */}
            <div className="flex items-center gap-1 bg-card border border-border/80 rounded-xl p-1 shadow-2xs">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-3 text-center min-w-[130px]">
                <div className="font-bold text-sm capitalize">{displayDate}</div>
                {isToday && <div className="text-[11px] text-primary font-semibold">Hoje</div>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Stats / Filters */}
        {summary && (
          <div className="mb-6 space-y-2">
            {!isAdmin ? (
              // Maid View: Simplified to Total, Sujos, Limpos (Clickable Filters)
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => toggleFilter("all")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "all"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 ring-2 ring-primary ring-offset-2 scale-[1.02]"
                      : "bg-white/90 dark:bg-card border-slate-200/80 hover:bg-slate-50 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalCheckouts}</div>
                  <div className="text-[11px] uppercase font-bold tracking-wider">Total do Dia</div>
                </button>

                <button
                  onClick={() => toggleFilter("dirty")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "dirty"
                      ? "bg-rose-600 text-white border-rose-600 ring-2 ring-rose-500 ring-offset-2 scale-[1.02]"
                      : "bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 hover:bg-rose-100/90 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalDirty}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "dirty" ? "text-white" : "text-rose-700 dark:text-rose-300"}`}>
                    Sujos
                  </div>
                </button>

                <button
                  onClick={() => toggleFilter("clean")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "clean"
                      ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500 ring-offset-2 scale-[1.02]"
                      : "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 hover:bg-emerald-100/90 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalClean}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "clean" ? "text-white" : "text-emerald-700 dark:text-emerald-300"}`}>
                    Limpos
                  </div>
                </button>
              </div>
            ) : (
              // Admin View: All categories (Clickable Filters)
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <button
                  onClick={() => toggleFilter("all")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "all"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 ring-2 ring-primary ring-offset-2 scale-[1.02]"
                      : "bg-white/90 dark:bg-card border-slate-200/80 hover:bg-slate-50 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalCheckouts}</div>
                  <div className="text-[11px] uppercase font-bold tracking-wider">Total</div>
                </button>

                <button
                  onClick={() => toggleFilter("dirty")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "dirty"
                      ? "bg-rose-600 text-white border-rose-600 ring-2 ring-rose-500 ring-offset-2 scale-[1.02]"
                      : "bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 hover:bg-rose-100/90 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalDirty}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "dirty" ? "text-white" : "text-rose-700"}`}>
                    Sujos
                  </div>
                </button>

                <button
                  onClick={() => toggleFilter("cleaning_now")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "cleaning_now"
                      ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500 ring-offset-2 scale-[1.02]"
                      : "bg-blue-50/80 dark:bg-blue-950/20 border-blue-200 hover:bg-blue-100/90 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalCleaning}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "cleaning_now" ? "text-white" : "text-blue-700"}`}>
                    Limpando
                  </div>
                </button>

                <button
                  onClick={() => toggleFilter("pending_issue")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "pending_issue"
                      ? "bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500 ring-offset-2 scale-[1.02]"
                      : "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 hover:bg-amber-100/90 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalPending}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "pending_issue" ? "text-white" : "text-amber-800"}`}>
                    Pendências
                  </div>
                </button>

                <button
                  onClick={() => toggleFilter("clean")}
                  className={`border rounded-xl p-3.5 text-center transition-all cursor-pointer shadow-2xs ${
                    statusFilter === "clean"
                      ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500 ring-offset-2 scale-[1.02]"
                      : "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 hover:bg-emerald-100/90 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <div className="text-2xl font-black">{summary.totalClean}</div>
                  <div className={`text-[11px] uppercase font-bold tracking-wider ${statusFilter === "clean" ? "text-white" : "text-emerald-700"}`}>
                    Limpos
                  </div>
                </button>
              </div>
            )}

            {/* Active Filter Notice */}
            {statusFilter !== "all" && (
              <div className="flex items-center justify-between bg-muted/60 border border-border/80 px-3.5 py-2 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <span>
                    Exibindo apenas quartos: <strong>
                      {statusFilter === "dirty" ? "Sujos" : statusFilter === "clean" ? "Limpos" : statusFilter === "cleaning_now" ? "Limpando" : "Pendências"}
                    </strong> ({filteredFlats.length})
                  </span>
                </div>
                <button
                  onClick={() => setStatusFilter("all")}
                  className="text-primary hover:underline font-bold flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Limpar filtro
                </button>
              </div>
            )}
          </div>
        )}

        {/* Batch Actions Bar */}
        {selectedRequestIds.length > 0 && (
          <div className="sticky top-4 z-20 bg-sky-600 text-white p-3.5 rounded-xl shadow-lg mb-6 flex items-center justify-between animate-in fade-in slide-in-from-top-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CheckSquare className="w-5 h-5" />
              <span>{selectedRequestIds.length} flats selecionados</span>
            </div>
            <Button 
              className="bg-white text-sky-800 hover:bg-slate-100 font-bold shadow-xs text-xs" 
              onClick={handleBatchClaim}
              disabled={batchClaim.isPending}
            >
              {batchClaim.isPending ? "Processando..." : "Marcar como 'Vou Limpar'"}
            </Button>
          </div>
        )}

        {/* Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {[1,2,3,4,5,6,7,8].map(i => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredFlats.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 pb-20">
            {filteredFlats.map((flat: any) => {
              const req = flat.cleaningRequest
              const chk = checkins?.find((c: any) => c.flatId === flat.flatId)
              const cardId = req?.id || flat.flatId || flat.id
              
              return (
                <FlatCard 
                  key={`flat-card-${flat.flatId || flat.flatNumber}-${req?.id || flat.checkoutDate || 'item'}`}
                  flat={flat}
                  request={req}
                  checkin={chk}
                  date={selectedDateStr}
                  isSelected={cardId ? selectedRequestIds.includes(cardId) : false}
                  onToggleSelect={toggleSelect}
                  selectable={!isAdmin}
                  onSelectDate={setDate}
                  userRole={user?.role}
                  currentUserId={user?.id}
                  currentUsername={user?.username}
                />
              )
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-card border border-dashed rounded-2xl p-8">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-200 text-lg mb-1">
              {statusFilter !== "all" ? "Nenhum quarto encontrado com este filtro." : "Nenhuma limpeza programada para esta data."}
            </div>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              {statusFilter !== "all" 
                ? "Clique no botão 'Limpar filtro' no topo para exibir todos os quartos do dia."
                : "Você pode adicionar um quarto manualmente clicando no botão abaixo ou selecionar outra data."}
            </p>
            {statusFilter !== "all" ? (
              <Button onClick={() => setStatusFilter("all")} variant="outline" className="font-semibold">
                Exibir Todos os Quartos
              </Button>
            ) : (
              <Button onClick={handleOpenManualModal} className="font-semibold">
                <PlusCircle className="w-4 h-4 mr-1.5" /> Adicionar Quarto para Limpeza
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Manual Request Modal with Date, Mark as Clean & Cleaner Selection ── */}
      {isAdmin && (
        <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border shadow-2xl rounded-2xl">
          <form onSubmit={handleCreateManualRequest}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-black text-foreground">
                {manualRequestType === "instruction" ? (
                  <>
                    <BedDouble className="w-5 h-5 text-purple-600" />
                    <span>Nova Instrução para o Flat (Sem Limpeza)</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-5 h-5 text-primary" />
                    <span>Adicionar Quarto para Limpeza / Relatório</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {manualRequestType === "instruction"
                  ? "Crie uma solicitação avulsa de instrução (ex: separar camas, favor operacional). Não depende de reservas e não interfere no fluxo de faxina."
                  : "Escolha o apartamento, selecione a data desejada (retroativa, hoje ou futura) e defina o status inicial."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4 text-xs">
              {/* Seletor de Tipo: Limpeza vs Apenas Instrução */}
              <div className="space-y-1.5">
                <Label className="font-bold text-xs text-foreground">
                  Tipo de Solicitação *
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualRequestType("cleaning")}
                    className={cn(
                      "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all",
                      manualRequestType === "cleaning"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Limpeza de Quarto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualRequestType("instruction")
                      if (!manualTwinBeds && !manualInstructionText) {
                        setManualTwinBeds(true)
                        setManualInstructionText("Separar as camas, colocar como 2 solteiras")
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all",
                      manualRequestType === "instruction"
                        ? "bg-purple-700 text-white border-purple-700 shadow-sm"
                        : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <BedDouble className="w-4 h-4" />
                    <span>Instrução no Flat</span>
                  </button>
                </div>
              </div>

              {/* Apartamento */}
              <div className="space-y-1.5">
                <Label htmlFor="flatSelect" className="font-bold text-xs text-foreground">
                  Apartamento *
                </Label>
                <Select value={manualFlatId} onValueChange={setManualFlatId} required>
                  <SelectTrigger id="flatSelect" className="w-full text-xs h-9.5 rounded-xl font-medium">
                    <SelectValue placeholder="Selecione o flat..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {availableFlats.map(f => (
                      <SelectItem key={f.id} value={String(f.id)} className="text-xs font-semibold">
                        Apt {f.number} {f.isOccupied ? "• (Ocupado)" : "• (Vago)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data da Limpeza / Instrução */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dateSelect" className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                    {manualRequestType === "instruction" ? "Data da Instrução *" : "Data da Limpeza *"}
                  </Label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setManualDate(format(subDays(new Date(), 1), "yyyy-MM-dd"))}
                      className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground transition-colors"
                    >
                      Ontem
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualDate(format(new Date(), "yyyy-MM-dd"))}
                      className="px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-[10px] font-bold text-primary transition-colors"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualDate(format(addDays(new Date(), 1), "yyyy-MM-dd"))}
                      className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground transition-colors"
                    >
                      Amanhã
                    </button>
                  </div>
                </div>
                <Input
                  id="dateSelect"
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  required
                  className="w-full text-xs h-9.5 rounded-xl font-semibold bg-background"
                />
              </div>

              {/* Se for apenas INSTRUÇÃO */}
              {manualRequestType === "instruction" && (
                <div className="p-3.5 rounded-xl border bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/60 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="manualTwinBedsInst"
                      checked={manualTwinBeds}
                      onCheckedChange={(checked) => {
                        const val = Boolean(checked)
                        setManualTwinBeds(val)
                        if (val && (!manualInstructionText || manualInstructionText.includes("Separar as camas"))) {
                          setManualInstructionText("Separar as camas, colocar como 2 solteiras")
                        }
                      }}
                      className="data-[state=checked]:bg-purple-700 data-[state=checked]:border-purple-700"
                    />
                    <Label htmlFor="manualTwinBedsInst" className="text-xs font-bold cursor-pointer text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                      <span>🛏️ Separar camas em 2 solteiras</span>
                    </Label>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="instructionTextInput" className="font-bold text-xs text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                      <span>O que deve ser feito no flat? *</span>
                    </Label>
                    <Textarea
                      id="instructionTextInput"
                      value={manualInstructionText}
                      onChange={e => setManualInstructionText(e.target.value)}
                      placeholder="Ex: Separar as camas, colocar como 2 solteiras, colocar toalhas extras..."
                      required={manualRequestType === "instruction"}
                      className="w-full text-xs min-h-[70px] rounded-xl font-medium bg-background border-purple-200 dark:border-purple-800/80"
                    />
                  </div>

                  {/* Configuração de Remuneração: Apenas Admin */}
                  <div className="pt-2 border-t border-purple-200/80 dark:border-purple-800/50 space-y-1">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="remuneratedCheck"
                        checked={manualIsPaid}
                        onCheckedChange={(checked) => setManualIsPaid(Boolean(checked))}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="remuneratedCheck" className="text-xs font-bold cursor-pointer text-foreground flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-amber-600" />
                          <span>Serviço Remunerado?</span>
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                          {manualIsPaid 
                            ? "✅ Remunerado: Contabilizará como diária no relatório e extrato de pagamento da camareira." 
                            : "🤍 Favor / Cortesia (Não Remunerado): Não gera créditos nem entra no acerto financeiro das camareiras."}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-0.5">
                          🔒 A informação de remuneração nunca é exibida para as camareiras.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Se for LIMPEZA: opções de marcar limpo, prioridade, solteiro, etc. */}
              {manualRequestType === "cleaning" && (
                <>
                  {/* Card Toggle: Já Registrar como Limpo (Concluído para Relatórios) */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    manualMarkAsClean 
                      ? "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800" 
                      : "bg-muted/40 border-border/80"
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <Checkbox 
                        id="markAsCleanCheck" 
                        checked={manualMarkAsClean} 
                        onCheckedChange={(checked) => setManualMarkAsClean(Boolean(checked))}
                        className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="markAsCleanCheck" className="font-bold text-xs text-foreground cursor-pointer flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Já registrar como LIMPO (Concluído para Relatórios)
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {manualMarkAsClean 
                            ? "✨ O quarto ficará gravado como concluído nesta data e contabilizará nos relatórios de produtividade/pagamento, sem poluir a fila diária de tarefas." 
                            : "Marque esta opção caso a limpeza já tenha sido executada e você queira apenas registrar o relatório retroativo ou avulso."}
                        </p>
                      </div>
                    </div>

                    {/* Seleção de Camareira quando Marcado como Limpo */}
                    {manualMarkAsClean && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-900/60 space-y-1.5 animate-in fade-in slide-in-from-top-1">
                        <Label htmlFor="cleanerSelect" className="font-bold text-xs text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          Camareira que realizou a limpeza *
                        </Label>
                        <Select value={manualCleanerId} onValueChange={setManualCleanerId} required={manualMarkAsClean}>
                          <SelectTrigger id="cleanerSelect" className="w-full text-xs h-9 rounded-xl font-semibold bg-background border-emerald-300 dark:border-emerald-800">
                            <SelectValue placeholder="Selecione a camareira responsável..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cleanersList.length > 0 ? (
                              [...cleanersList]
                                .sort((a, b) => (a.role === "camareira" || a.role === "cleaner" ? -1 : 1))
                                .map(c => (
                                  <SelectItem key={c.id} value={String(c.id)} className="text-xs font-semibold">
                                    {c.role === "camareira" || c.role === "cleaner" ? `🧹 ${c.username} (Camareira)` : `👤 ${c.username} (${c.role})`}
                                  </SelectItem>
                                ))
                            ) : (
                              <>
                                <SelectItem value="2" className="text-xs font-semibold">🧹 Cris (Camareira)</SelectItem>
                                <SelectItem value="3" className="text-xs font-semibold">🧹 Grazi (Camareira)</SelectItem>
                                <SelectItem value="1" className="text-xs font-semibold">👤 Admin</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Opção 2 Camas de Solteiro */}
                  <div className="flex items-center gap-2 px-1 pt-0.5">
                    <Checkbox 
                      id="manualTwinBedsCheck" 
                      checked={manualTwinBeds} 
                      onCheckedChange={(checked) => setManualTwinBeds(Boolean(checked))} 
                    />
                    <Label htmlFor="manualTwinBedsCheck" className="text-xs font-medium cursor-pointer text-foreground flex items-center gap-1.5">
                      <span>🛏️ Montar 2 Camas de Solteiro (Separadas)</span>
                    </Label>
                  </div>

                  {/* Observação / Recado para a Camareira */}
                  <div className="space-y-1.5">
                    <Label htmlFor="obsInput" className="font-semibold text-xs text-muted-foreground">
                      Nota / Recado para a Camareira (Opcional)
                    </Label>
                    <Input
                      id="obsInput"
                      value={manualObservation}
                      onChange={e => setManualObservation(e.target.value)}
                      placeholder="Ex: Deixar toalhas extras, colocar manta nova, faxina profunda..."
                      className="w-full text-xs h-9 rounded-xl"
                    />
                  </div>
                </>
              )}

              {/* Opção de Prioridade (disponível para ambos os tipos quando não marcado como já concluído) */}
              {!manualMarkAsClean && (
                <div className="flex items-center gap-2 px-1 pt-0.5">
                  <Checkbox 
                    id="priorityCheck" 
                    checked={manualIsPriority} 
                    onCheckedChange={(checked) => setManualIsPriority(Boolean(checked))} 
                  />
                  <Label htmlFor="priorityCheck" className="text-xs font-medium cursor-pointer text-foreground">
                    Marcar como Prioridade Alta (Primeiro na lista)
                  </Label>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setManualModalOpen(false)} className="text-xs font-bold rounded-xl h-9.5">
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={
                  !manualFlatId || 
                  isSubmittingManual || 
                  (manualRequestType === "instruction" && !manualInstructionText.trim()) ||
                  (manualMarkAsClean && !manualCleanerId && cleanersList.length > 0)
                } 
                className={`text-xs font-bold rounded-xl h-9.5 gap-1.5 shadow-sm ${
                  manualRequestType === "instruction"
                    ? "bg-purple-700 hover:bg-purple-600 text-white"
                    : manualMarkAsClean 
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }`}
              >
                {isSubmittingManual ? (
                  "Salvando..."
                ) : manualRequestType === "instruction" ? (
                  <>
                    <BedDouble className="w-4 h-4" />
                    <span>Criar Instrução no Flat</span>
                  </>
                ) : manualMarkAsClean ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Registrar Limpeza Concluída</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Adicionar à Fila de Limpeza</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}
    </Shell>
  )
}
