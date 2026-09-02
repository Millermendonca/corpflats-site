import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { 
  useUpdateFlat,
  getListCheckoutsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  User, CheckCircle2, AlertCircle, Clock, PlayCircle, Sparkles, 
  Flame, Wrench, ClipboardCheck, DoorOpen, RotateCcw, AlertTriangle, Check, CalendarX,
  PackageOpen, Camera, BedDouble, Image as ImageIcon, UserX, Calendar, CloudOff, Loader2
} from "lucide-react"
import { compressImage } from "@/lib/image-compression"
import { cn } from "@/lib/utils"

export type FlatStatus = "dirty" | "will_clean" | "cleaning_now" | "pending_issue" | "clean" | "extended"

const statusStyles: Record<FlatStatus, { label: string; cardBg: string; badgeClass: string; icon: React.ElementType }> = {
  dirty: { 
    label: "Sujo", 
    cardBg: "bg-rose-50/75 border-rose-200/90 text-rose-950 dark:bg-rose-950/20 dark:border-rose-900/40", 
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300", 
    icon: AlertCircle 
  },
  will_clean: { 
    label: "Vou Limpar", 
    cardBg: "bg-sky-50/80 border-sky-200/90 text-sky-950 dark:bg-sky-950/20 dark:border-sky-900/40", 
    badgeClass: "bg-sky-100 text-sky-800 border-sky-300", 
    icon: Clock 
  },
  cleaning_now: { 
    label: "Limpando", 
    cardBg: "bg-blue-50/90 border-blue-300 text-blue-950 dark:bg-blue-950/30 dark:border-blue-800/50", 
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300 font-bold", 
    icon: PlayCircle 
  },
  pending_issue: { 
    label: "Com Pendência", 
    cardBg: "bg-amber-50/85 border-amber-200/90 text-amber-950 dark:bg-amber-950/20 dark:border-amber-900/40", 
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300", 
    icon: AlertCircle 
  },
  clean: { 
    label: "Limpo", 
    cardBg: "bg-emerald-50/75 border-emerald-200/90 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-900/40", 
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300", 
    icon: CheckCircle2 
  },
  extended: {
    label: "Estendeu",
    cardBg: "bg-purple-50/95 border-purple-300 text-purple-950 dark:bg-purple-950/30 dark:border-purple-800",
    badgeClass: "bg-purple-100 text-purple-900 border-purple-300 font-bold",
    icon: CalendarX,
  }
}

interface FlatCardProps {
  flat: any
  request?: any
  checkin?: any
  date: string
  isSelected: boolean
  onToggleSelect: (id: number) => void
  selectable: boolean
  onSelectDate?: (date: string) => void
  userRole?: string
  currentUserId?: number
  currentUsername?: string
}

export function FlatCard({
  flat,
  request,
  checkin,
  date,
  isSelected,
  onToggleSelect,
  selectable,
  onSelectDate,
  userRole,
  currentUserId = 1,
}: FlatCardProps) {
  const isAdmin = userRole === "admin"
  const queryClient = useQueryClient()

  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [issueText, setIssueText] = useState("")
  const [finishModalOpen, setFinishModalOpen] = useState(false)
  const [minTimeAlertOpen, setMinTimeAlertOpen] = useState(false)
  const [futureCheckoutAlertOpen, setFutureCheckoutAlertOpen] = useState(false)
  const [futureCheckoutInfo, setFutureCheckoutInfo] = useState<{ guestName?: string; checkoutDate?: string } | null>(null)
  const [surveyAnswer, setSurveyAnswer] = useState<string>("Não")
  const [surveyNotes, setSurveyNotes] = useState<string>("")
  const [attestedTaskIds, setAttestedTaskIds] = useState<number[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Live elapsed time for cleaning_now
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0)

  // Lost & Found (Item Encontrado no Quarto)
  const [lostItemModalOpen, setLostItemModalOpen] = useState(false)
  const [lostDescription, setLostDescription] = useState("")
  const [lostLocation, setLostLocation] = useState("")
  const [lostPhotoBase64, setLostPhotoBase64] = useState<string | null>(null)
  const [lostNotes, setLostNotes] = useState("")
  const [savingLostItem, setSavingLostItem] = useState(false)
  const [lostItemSuccess, setLostItemSuccess] = useState(false)
  const [compressingPhoto, setCompressingPhoto] = useState(false)
  const [photoCompressionStats, setPhotoCompressionStats] = useState<{ origKb: number; compKb: number; saved: number } | null>(null)
  const [offlineQueued, setOfflineQueued] = useState(false)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)

  // No Show (Admin only)
  const [noShowModalOpen, setNoShowModalOpen] = useState(false)
  const [isSubmittingNoShow, setIsSubmittingNoShow] = useState(false)

  // Extend Stay (Hóspede Estendeu)
  const [extendStayModalOpen, setExtendStayModalOpen] = useState(false)
  const [extendNotes, setExtendNotes] = useState("")
  const [isSubmittingExtend, setIsSubmittingExtend] = useState(false)

  const handleConfirmExtendStay = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingExtend(true)
    try {
      const res = await fetch(`/api/cleaning/assignments/${request?.id || 0}/mark-extended`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flat.flatNumber,
          notes: extendNotes.trim() || "Hóspede estendeu a estadia"
        }),
        credentials: "include"
      })
      if (res.ok) {
        setExtendStayModalOpen(false)
        setExtendNotes("")
        refreshData()
      }
    } catch (err) {
      console.error("Erro ao registrar extensão de estadia:", err)
    } finally {
      setIsSubmittingExtend(false)
    }
  }

  // Admin Clean on behalf of Maid Modal
  const [adminCleanModalOpen, setAdminCleanModalOpen] = useState(false)
  const [staffList, setStaffList] = useState<Array<{ id: number; username: string; name: string; role: string }>>([])
  const [selectedMaidId, setSelectedMaidId] = useState<string>("")
  const [adminCleanSubmitting, setAdminCleanSubmitting] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/staff")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setStaffList(data.filter(u => u.role === "camareira" || u.role === "admin"))
          }
        })
        .catch(() => {})
    }
  }, [isAdmin])

  useEffect(() => {
    if (request?.assignedUserId) {
      setSelectedMaidId(String(request.assignedUserId))
    } else if (staffList.length > 0 && !selectedMaidId) {
      const firstMaid = staffList.find(s => s.role === "camareira") || staffList[0]
      if (firstMaid) setSelectedMaidId(String(firstMaid.id))
    }
  }, [request?.assignedUserId, staffList])

  const handleAdminConfirmClean = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMaidId) return
    setAdminCleanSubmitting(true)
    try {
      let activeReqId = request?.id
      if (!activeReqId) {
        const createRes = await fetch("/api/cleaning/requests/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: flat.flatId, requestDate: date }),
          credentials: "include"
        })
        const created = await createRes.json()
        activeReqId = created.id
      }

      if (activeReqId) {
        const res = await fetch(`/api/cleaning/assignments/${activeReqId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "clean",
            assignedUserId: parseInt(selectedMaidId),
            flatNumber: flat.flatNumber,
            flatId: flat.flatId,
            date: date
          }),
          credentials: "include"
        })
        if (res.ok) {
          setAdminCleanModalOpen(false)
          refreshData()
        }
      }
    } catch (err) {
      console.error("Erro ao confirmar limpeza pelo admin:", err)
    } finally {
      setAdminCleanSubmitting(false)
    }
  }

  // Admin Custom Instructions Modal (Twin Beds & Maid Notes)
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false)
  const [twinBedsSetting, setTwinBedsSetting] = useState<boolean>(Boolean(flat?.setupInfo?.twinBeds))
  const [adminNoteText, setAdminNoteText] = useState<string>(flat?.setupInfo?.specialRequests || "")
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)

  useEffect(() => {
    setTwinBedsSetting(Boolean(flat?.setupInfo?.twinBeds))
    setAdminNoteText(flat?.setupInfo?.specialRequests || "")
  }, [flat?.setupInfo?.twinBeds, flat?.setupInfo?.specialRequests])

  const handleSaveInstructions = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingInstructions(true)
    try {
      await fetch(`/api/cleaning/requests/${request?.id || 0}/admin-instructions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: flat.flatId,
          requestDate: date,
          twinBeds: twinBedsSetting,
          adminNote: adminNoteText.trim() || null,
        })
      })
      setInstructionsModalOpen(false)
      queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date }) })
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ date }) })
    } finally {
      setIsSavingInstructions(false)
    }
  }

  useEffect(() => {
    if (request?.status === "cleaning_now" && request?.cleaningStartedAt) {
      const calculate = () => {
        const started = new Date(request.cleaningStartedAt).getTime()
        const mins = Math.max(0, Math.floor((Date.now() - started) / 60000))
        setElapsedMinutes(mins)
      }
      calculate()
      const interval = setInterval(calculate, 15000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [request?.status, request?.cleaningStartedAt])

  const updateOccupancy = useUpdateFlat({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date }) })
      }
    }
  })

  const currentStatus: FlatStatus = (request?.status as FlatStatus) || "dirty"
  const isExtended = currentStatus === "extended" || Boolean(request?.isExtended)
  const isAssignedToMe = request?.assignedUserId === currentUserId
  const isAssignedToOther = request?.assignedUserId && request.assignedUserId !== currentUserId && !isAdmin

  // If the flat was extended and the maid is not the assigned one, hide it completely
  if (isExtended && !isAssignedToMe && !isAdmin) {
    return null
  }

  const conf = statusStyles[currentStatus] || statusStyles.dirty
  const Icon = conf.icon
  const isPriority = typeof request?.isPriority === "boolean" ? request.isPriority : (typeof flat?.isPriority === "boolean" ? flat.isPriority : false)
  const pendingPeriodicTasks = flat?.pendingPeriodicTasks || []
  const pendingSurveys = flat?.pendingSurveys || []

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressingPhoto(true)
    setSaveErrorMessage(null)
    try {
      // Compressão Inteligente Client-Side: Reduz de 5-10MB para ~80KB sem perda de nitidez
      const res = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
        preferredFormat: "image/webp"
      })
      setLostPhotoBase64(res.base64)
      setPhotoCompressionStats({
        origKb: Math.round(res.originalSizeBytes / 1024),
        compKb: Math.round(res.compressedSizeBytes / 1024),
        saved: res.savedPercentage
      })
    } catch (err: any) {
      console.warn("Falha no canvas de compressão, usando fallback direto:", err)
      const reader = new FileReader()
      reader.onload = () => setLostPhotoBase64(reader.result as string)
      reader.readAsDataURL(file)
    } finally {
      setCompressingPhoto(false)
    }
  }

  const handleSaveLostItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lostDescription.trim()) return
    setSavingLostItem(true)
    setSaveErrorMessage(null)
    setOfflineQueued(false)

    const payload = {
      flatId: flat.flatId,
      flatNumber: flat.flatNumber,
      description: lostDescription.trim(),
      locationInRoom: lostLocation.trim(),
      photoBase64: lostPhotoBase64,
      notes: lostNotes.trim(),
      timestamp: new Date().toISOString()
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)

      const res = await fetch("/api/lost-and-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        setLostItemSuccess(true)
        queryClient.invalidateQueries({ queryKey: ["/api/lost-and-found"] })
        queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date }) })
        setTimeout(() => {
          setLostItemSuccess(false)
          setLostItemModalOpen(false)
          setLostDescription("")
          setLostLocation("")
          setLostPhotoBase64(null)
          setLostNotes("")
          setPhotoCompressionStats(null)
        }, 1600)
      } else {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Erro HTTP ${res.status}`)
      }
    } catch (err: any) {
      console.warn("[Lost Item Save] Falha na rede, salvando em fila offline local:", err.message)
      try {
        const queue = JSON.parse(localStorage.getItem("corpflats_offline_lost_items") || "[]")
        queue.push(payload)
        localStorage.setItem("corpflats_offline_lost_items", JSON.stringify(queue))
        setOfflineQueued(true)
        setLostItemSuccess(true)
        setTimeout(() => {
          setLostItemSuccess(false)
          setLostItemModalOpen(false)
          setLostDescription("")
          setLostLocation("")
          setLostPhotoBase64(null)
          setLostNotes("")
          setPhotoCompressionStats(null)
        }, 2000)
      } catch (storageErr) {
        setSaveErrorMessage("Falha de conexão. Verifique o sinal da internet e tente novamente.")
      }
    } finally {
      setSavingLostItem(false)
    }
  }

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: getListCheckoutsQueryKey({ date }) })
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ date }) })
  }

  // Acknowledge Extended Stay ("Ciente")
  const handleAcknowledgeExtended = async () => {
    if (!request?.id) return
    setIsProcessing(true)
    try {
      await fetch(`/api/cleaning/assignments/${request.id}/acknowledge-extended`, { method: "POST" })
      refreshData()
    } finally {
      setIsProcessing(false)
    }
  }

  // Confirm No Show (Admin only)
  const handleConfirmNoShow = async () => {
    let activeReqId = request?.id
    setIsSubmittingNoShow(true)
    try {
      if (!activeReqId) {
        const createRes = await fetch("/api/cleaning/requests/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: flat.flatId, requestDate: date }),
          credentials: "include"
        })
        const created = await createRes.json()
        activeReqId = created.id
      }
      if (activeReqId) {
        await fetch(`/api/cleaning/assignments/${activeReqId}/no-show`, {
          method: "POST",
          credentials: "include"
        })
      }
      setNoShowModalOpen(false)
      refreshData()
    } catch (err) {
      console.error("Erro ao registrar No Show:", err)
    } finally {
      setIsSubmittingNoShow(false)
    }
  }

  // Toggle Priority (Admin only)
  const togglePriority = async (e: React.MouseEvent) => {
    e.stopPropagation()
    let activeReqId = request?.id
    try {
      if (!activeReqId) {
        const createRes = await fetch("/api/cleaning/requests/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: flat.flatId, requestDate: date, isPriority: !isPriority })
        })
        const created = await createRes.json()
        activeReqId = created.id
      } else {
        await fetch(`/api/cleaning/assignments/${activeReqId}/priority`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPriority: !isPriority }),
        })
      }
      refreshData()
    } catch (err) {
      console.error("Erro ao alterar prioridade:", err)
    }
  }

  // Release / Devolver flat
  const handleRelease = async () => {
    if (!request?.id) return
    setIsProcessing(true)
    try {
      await fetch(`/api/cleaning/assignments/${request.id}/release`, { 
        method: "POST",
        credentials: "include"
      })
      refreshData()
    } finally {
      setIsProcessing(false)
    }
  }

  // Resolve pending issue (Baixa de pendência)
  const handleResolveIssue = async () => {
    if (!request?.id) return
    setIsProcessing(true)
    try {
      await fetch(`/api/cleaning/assignments/${request.id}/resolve-issue`, { 
        method: "POST",
        credentials: "include"
      })
      refreshData()
    } finally {
      setIsProcessing(false)
    }
  }

  // Status transition handler
  const handleStatusChange = async (newStatus: FlatStatus) => {
    if (newStatus === "pending_issue") {
      setIssueDialogOpen(true)
      return
    }

    if (newStatus === "clean") {
      if (isAdmin) {
        setAdminCleanModalOpen(true)
        return
      }

      if (request?.cleaningStartedAt) {
        const started = new Date(request.cleaningStartedAt).getTime()
        const mins = (Date.now() - started) / 60000
        if (mins < 10) {
          setMinTimeAlertOpen(true)
          return
        }
      }

      if (pendingPeriodicTasks.length > 0 || pendingSurveys.length > 0) {
        setFinishModalOpen(true)
        return
      }
    }

    setIsProcessing(true)
    try {
      let activeReqId = request?.id
      if (!activeReqId) {
        const createRes = await fetch("/api/cleaning/requests/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: flat.flatId, requestDate: date }),
          credentials: "include"
        })
        const created = await createRes.json()
        activeReqId = created.id
      }

      if (activeReqId) {
        const res = await fetch(`/api/cleaning/assignments/${activeReqId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            status: newStatus,
            flatNumber: flat.flatNumber,
            flatId: flat.flatId,
            date: date
          }),
          credentials: "include"
        })
        if (!res.ok) {
          const err = await res.json()
          if (err.error?.includes("Tempo insuficiente")) {
            setMinTimeAlertOpen(true)
            return
          }
          if (err.targetCheckoutDate || err.error?.includes("check-out deste")) {
            setFutureCheckoutInfo({
              guestName: flat.activeReservation?.guestName,
              checkoutDate: err.targetCheckoutDate || flat.activeReservation?.checkoutDate
            })
            setFutureCheckoutAlertOpen(true)
            return
          }
        }
      }
      refreshData()
    } catch (e) {
      console.error("Erro ao alterar status:", e)
    } finally {
      setIsProcessing(false)
    }
  }

  // Complete cleaning
  const submitCompletion = async () => {
    if (!request?.id) return
    setIsProcessing(true)
    try {
      const taskIds = attestedTaskIds.length > 0 ? attestedTaskIds : pendingPeriodicTasks.map((t: any) => t.id)
      const surveyAnswers = pendingSurveys.map((s: any) => ({
        surveyId: s.id,
        answer: surveyAnswer,
        notes: surveyNotes,
      }))

      await fetch(`/api/cleaning/assignments/${request.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "clean",
          executedPeriodicTaskIds: taskIds,
          surveyAnswers,
        }),
        credentials: "include"
      })
      setFinishModalOpen(false)
      setAttestedTaskIds([])
      refreshData()
    } finally {
      setIsProcessing(false)
    }
  }

  const submitIssue = async () => {
    if (!request?.id || !issueText.trim()) return
    setIsProcessing(true)
    try {
      await fetch(`/api/cleaning/assignments/${request.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending_issue", observation: issueText.trim() }),
        credentials: "include"
      })
      setIssueDialogOpen(false)
      setIssueText("")
      refreshData()
    } finally {
      setIsProcessing(false)
    }
  }

  const isOccupied = typeof request?.isVacant === "boolean"
    ? !request.isVacant
    : (typeof flat.isOccupied === "boolean" ? flat.isOccupied : true)

  const toggleOccupancy = () => {
    updateOccupancy.mutate({
      id: flat.flatId,
      data: { isOccupied: !isOccupied }
    })
    if (request?.id) {
      fetch(`/api/cleaning/assignments/${request.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVacant: isOccupied }),
        credentials: "include"
      }).then(() => refreshData()).catch(() => {})
    }
  }

  const hasCheckin = flat.hasCheckinToday || !!checkin

  // ── SPECIAL RENDERING: EXTENDED STAY ("ESTENDEU") ────────────────────────
  if (isExtended) {
    return (
      <Card className="overflow-hidden border-2 border-purple-300 rounded-xl bg-purple-50/95 dark:bg-purple-950/40 text-purple-950 dark:text-purple-100 shadow-sm transition-all animate-in fade-in">
        <CardContent className="p-5 flex flex-col justify-between items-center text-center space-y-4">
          <div className="space-y-2 pt-2">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 mx-auto flex items-center justify-center">
              <CalendarX className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black tracking-tight">Apt {flat.flatNumber}</h3>
            <div className="inline-block px-3 py-1 bg-purple-200 text-purple-900 rounded-full font-black text-sm uppercase tracking-wider">
              Estendeu
            </div>
            <p className="text-xs text-purple-900 dark:text-purple-300 font-medium max-w-xs pt-1">
              O hóspede estendeu a estadia. A limpeza deste quarto foi cancelada para hoje.
            </p>
          </div>

          <Button 
            className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 shadow-sm flex items-center justify-center gap-1.5"
            onClick={handleAcknowledgeExtended}
            disabled={isProcessing}
          >
            <Check className="w-4 h-4" />
            <span>Ciente</span>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={cn(
        "overflow-hidden transition-all duration-200 border rounded-2xl shadow-xs hover:shadow-md flex flex-col justify-between h-full bg-card",
        conf.cardBg,
        isSelected && "ring-2 ring-primary ring-offset-1 shadow-md",
        isPriority && "border-rose-400 dark:border-rose-800 shadow-rose-100/50 dark:shadow-none"
      )}>
        <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
          <div className="space-y-2.5">
            {/* Top Bar - Linha 1: Identificação do Flat (Sem corte) e Ocupação */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 shrink-0">
                {selectable && currentStatus === "dirty" && !isAssignedToOther && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation()
                      const cardId = request?.id || flat?.cleaningRequest?.id || flat?.flatId || flat?.id
                      if (cardId) {
                        onToggleSelect?.(Number(cardId))
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                    title="Selecionar para limpeza em lote"
                  />
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <h3 className="text-lg font-black tracking-tight text-foreground whitespace-nowrap shrink-0">
                    Apt {flat.flatNumber}
                  </h3>
                  {isPriority && (
                    <Badge variant="destructive" className="animate-pulse bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 flex items-center gap-0.5 shrink-0">
                      <Flame className="w-3 h-3 fill-current" />
                      <span>Prioridade</span>
                    </Badge>
                  )}
                </div>
              </div>

              {/* Botão de Ocupação (Ocupado / Desocupado) */}
              <button 
                onClick={toggleOccupancy}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors border shadow-2xs shrink-0 whitespace-nowrap", 
                  isOccupied 
                    ? "bg-amber-100/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 hover:bg-amber-200" 
                    : "bg-emerald-100/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 hover:bg-emerald-200"
                )}
                title="Clique para alternar ocupação"
                disabled={updateOccupancy.isPending}
              >
                {isOccupied ? (
                  <>
                    <User className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Ocupado</span>
                  </>
                ) : (
                  <>
                    <DoorOpen className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Desocupado</span>
                  </>
                )}
              </button>
            </div>

            {/* Top Bar - Linha 2 (Exclusiva para Administrador: Ações Rápidas de Camas e Prioridade) */}
            {isAdmin && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => setInstructionsModalOpen(true)}
                  title="Configurar montagem de camas e recado/nota para a camareira"
                  className={cn(
                    "px-2 py-0.5 rounded-lg border transition-colors text-[11px] flex items-center gap-1 font-bold shadow-2xs",
                    flat?.setupInfo?.twinBeds || flat?.setupInfo?.specialRequests
                      ? "bg-indigo-100/90 border-indigo-300 text-indigo-900 hover:bg-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200"
                      : "bg-background border-border text-foreground hover:bg-muted"
                  )}
                >
                  <BedDouble className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{flat?.setupInfo?.twinBeds ? "2 Camas" : "Camas/Nota"}</span>
                </button>

                <button
                  onClick={togglePriority}
                  title={isPriority ? "Remover prioridade" : "Marcar como prioridade"}
                  className={cn(
                    "px-2 py-0.5 rounded-lg border transition-colors text-[11px] flex items-center gap-1 font-bold shadow-2xs",
                    isPriority 
                      ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:border-red-800" 
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Flame className={cn("w-3 h-3", isPriority && "fill-red-600 text-red-600")} />
                  <span>{isPriority ? "Prioritário" : "Prioridade"}</span>
                </button>
              </div>
            )}

            {/* Top Bar - Linha 3 DEDICADA: Identificação Completa de Quem Limpou / Camareira (Linha Inteira sem cortes) */}
            <div className="w-full pt-1 pb-0.5">
              {(request?.assignedUserName || request?.assignedUsername) ? (
                <div 
                  title={`${currentStatus === "clean" ? "Limpo por:" : "Camareira:"} ${request.assignedUserName || request.assignedUsername}`}
                  className={cn(
                    "w-full text-xs font-bold px-2.5 py-1.5 rounded-xl shadow-2xs flex items-center gap-1.5 border whitespace-normal break-words leading-relaxed cursor-help",
                    currentStatus === "clean" 
                      ? "bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700"
                      : "bg-sky-50 text-sky-950 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-700"
                  )}
                >
                  <User className="w-3.5 h-3.5 text-current shrink-0" />
                  <div className="flex-1 min-w-0 break-words">
                    <span className="font-semibold text-muted-foreground mr-1 text-[11px]">
                      {currentStatus === "clean" ? "Limpo por:" : "Camareira:"}
                    </span>
                    <strong className="capitalize font-black text-foreground text-xs">
                      {request.assignedUserName || request.assignedUsername}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="w-full text-[11px] text-muted-foreground italic font-medium py-0.5 flex items-center gap-1">
                  <User className="w-3 h-3 opacity-50 shrink-0" />
                  <span>Disponível para assumir</span>
                </div>
              )}
            </div>

            {/* Badges de Status, Check-in e Duração */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("font-bold text-[11px] px-2.5 py-0.5 rounded-lg", conf.badgeClass)}>
                <Icon className="w-3 h-3 mr-1" />
                {conf.label}
              </Badge>

              {(flat.isBedAdjustmentOnly || request?.isBedAdjustmentOnly || request?.type === "bed_adjustment_only") && (
                <Badge className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] shadow-2xs px-2.5 py-0.5 flex items-center gap-1 rounded-lg">
                  <BedDouble className="w-3 h-3 shrink-0" />
                  <span>🛏️ Apenas Alterar para 2 Camas (Não é Limpeza)</span>
                </Badge>
              )}

              {flat.isPendingFromPreviousDay && (
                <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shadow-2xs px-2 py-0.5 flex items-center gap-1 rounded-lg">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Não limpo em {flat.originalRequestDate ? format(new Date(flat.originalRequestDate + "T12:00:00"), "dd/MM") : "dia anterior"}</span>
                </Badge>
              )}

              {hasCheckin && (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-2xs px-2 py-0.5 flex items-center gap-1 rounded-lg">
                  <span>🟢 Entra Hoje</span>
                </Badge>
              )}

              {currentStatus === "cleaning_now" && (
                <Badge variant="outline" className={cn(
                  "text-[10px] px-2 py-0.5 font-bold border rounded-lg",
                  elapsedMinutes >= 30 
                    ? "bg-rose-100 border-rose-300 text-rose-800 animate-pulse" 
                    : "bg-blue-100/80 border-blue-300 text-blue-800"
                )}>
                  <Clock className="w-3 h-3 mr-1 inline" />
                  {elapsedMinutes >= 30 ? `Atenção: ${elapsedMinutes} min` : `${elapsedMinutes} min`}
                </Badge>
              )}
            </div>

            {/* Guest Info - Admin View (Nomes dos hóspedes em box limpo) */}
            {isAdmin && (flat?.leavingGuest || flat?.arrivingGuest) && (
              <div className="text-[11px] bg-muted/40 rounded-xl p-2.5 border border-border/70 space-y-1">
                {flat.leavingGuest && (
                  <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-slate-500 shrink-0">Saiu:</span>
                    <span className="font-semibold break-words">{flat.leavingGuest}</span>
                  </div>
                )}
                {flat.arrivingGuest && (
                  <div className="flex items-start gap-1.5 text-blue-700 dark:text-blue-400">
                    <span className="font-bold text-blue-600 dark:text-blue-500 shrink-0">Entra:</span>
                    <span className="font-semibold break-words">{flat.arrivingGuest}</span>
                  </div>
                )}
              </div>
            )}

            {/* Aviso Anônimo para a Camareira */}
            {!isAdmin && hasCheckin && (
              <div className="text-[11px] text-emerald-900 dark:text-emerald-200 bg-emerald-50/90 dark:bg-emerald-950/40 rounded-xl px-2.5 py-1.5 border border-emerald-200 dark:border-emerald-800/50 font-semibold flex items-center gap-1.5">
                <span>🟢 Há novo check-in previsto para este flat hoje.</span>
              </div>
            )}

            {/* Instruções para a Camareira (2 Camas de Solteiro e Nota da Administração) */}
            {flat?.setupInfo && (flat.setupInfo.twinBeds || flat.setupInfo.extraMattress || flat.setupInfo.prefersHighFloor || flat.setupInfo.specialRequests) && (
              <div 
                className={cn(
                  "bg-amber-500/10 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 rounded-xl p-2.5 text-xs space-y-2",
                  isAdmin && "cursor-pointer hover:border-amber-400 hover:bg-amber-500/15 transition-all"
                )}
                onClick={isAdmin ? () => setInstructionsModalOpen(true) : undefined}
                title={isAdmin ? "Clique para editar instruções e notas deste quarto" : undefined}
              >
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <BedDouble className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Instruções da Governança:</span>
                  </div>
                  {isAdmin && (
                    <span className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold underline flex items-center gap-0.5">
                      ✏️ Editar
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {flat.setupInfo.twinBeds && (
                    <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2 py-0.5 shadow-2xs flex items-center gap-1 rounded-lg">
                      <span>🛏️ Montar 2 Camas de Solteiro</span>
                    </Badge>
                  )}
                  {flat.setupInfo.extraMattress && (
                    <Badge className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] px-2 py-0.5 shadow-2xs flex items-center gap-1 rounded-lg">
                      <span>➕ Colocar Colchão Extra</span>
                    </Badge>
                  )}
                  {flat.setupInfo.prefersHighFloor && (
                    <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] px-2 py-0.5 shadow-2xs flex items-center gap-1 rounded-lg">
                      <span>🏢 Prefere Andar Alto</span>
                    </Badge>
                  )}
                </div>

                {flat.setupInfo.specialRequests && (
                  <div className="bg-background/90 p-2 rounded-lg border border-amber-300/80 dark:border-amber-700/60 text-[11px] text-foreground leading-snug">
                    <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1 mb-0.5 text-[10px]">
                      📝 Nota / Recado da Administração:
                    </span>
                    <p className="whitespace-pre-wrap font-medium">{flat.setupInfo.specialRequests}</p>
                  </div>
                )}
              </div>
            )}

            {/* Alerta de Tempo Excedido */}
            {currentStatus === "cleaning_now" && elapsedMinutes >= 30 && (
              <div className="bg-amber-100/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Limpeza em andamento há mais de 30 min.</span>
                  <p className="text-[10px] text-amber-800 dark:text-amber-300 mt-0.5">Lembre-se de finalizar assim que terminar o quarto.</p>
                </div>
              </div>
            )}

            {/* Vistoria / Tarefa Preventiva */}
            {pendingSurveys.length > 0 && currentStatus !== "clean" && (
              <div className="bg-indigo-50/90 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2.5 text-xs text-indigo-950 dark:text-indigo-200">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                  <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Vistoria Pendente:</span>
                </div>
                <p className="text-[11px] text-indigo-800 dark:text-indigo-300 font-medium">
                  {pendingSurveys[0].question}
                </p>
              </div>
            )}

            {/* Tarefa Preventiva Periódica */}
            {pendingPeriodicTasks.length > 0 && currentStatus !== "clean" && (
              <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-xl p-2.5 text-xs text-cyan-950 dark:text-cyan-200">
                <div className="flex items-center gap-1.5 font-bold text-cyan-900 dark:text-cyan-300 mb-0.5">
                  <Wrench className="w-3.5 h-3.5 text-cyan-700" />
                  <span>Tarefa Preventiva:</span>
                </div>
                <p className="text-[11px] text-cyan-800 dark:text-cyan-300 font-semibold">{pendingPeriodicTasks[0].name}</p>
              </div>
            )}

            {/* Pendência Registrada */}
            {currentStatus === "pending_issue" && request?.pendingObservation && (
              <div className="bg-amber-100/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-2.5 text-xs text-amber-950 dark:text-amber-200">
                <span className="font-bold block mb-1 text-amber-900 dark:text-amber-300 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700" /> Pendência Registrada:
                </span>
                <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed font-medium">{request.pendingObservation}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200/70 mt-2">
            {isAssignedToOther ? (
              <div 
                title={`Assumido por: ${request.assignedUserName || request.assignedUsername}`}
                className="text-center py-2 px-2.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-normal break-words"
              >
                🔒 Assumido por <strong className="capitalize font-black">{request.assignedUserName || request.assignedUsername}</strong>
              </div>
            ) : (
              <div className="space-y-2">
                {currentStatus === "dirty" && (
                  isAdmin ? (
                    <div className="flex gap-1.5">
                      <Button 
                        size="sm" 
                        className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-2xs text-xs" 
                        onClick={() => handleStatusChange("will_clean")}
                        disabled={isProcessing}
                      >
                        Vou Limpar
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs text-xs gap-1" 
                        onClick={() => setAdminCleanModalOpen(true)}
                        disabled={isProcessing}
                        title="Marcar como limpo escolhendo a camareira responsável"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Marcar Limpo</span>
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      size="sm" 
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-2xs" 
                      onClick={() => handleStatusChange("will_clean")}
                      disabled={isProcessing}
                    >
                      Vou Limpar
                    </Button>
                  )
                )}

                {currentStatus === "will_clean" && (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-2xs" 
                      onClick={() => handleStatusChange("cleaning_now")}
                      disabled={isProcessing}
                    >
                      <Sparkles className="w-4 h-4 mr-1" /> Iniciar
                    </Button>
                    {isAdmin && (
                      <Button 
                        size="sm" 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs text-xs" 
                        onClick={() => setAdminCleanModalOpen(true)}
                        disabled={isProcessing}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Limpo
                      </Button>
                    )}
                    {(isAssignedToMe || isAdmin) && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs text-slate-600 border-slate-300 hover:bg-slate-100" 
                        onClick={handleRelease}
                        title="Devolver quarto para que outra camareira possa pegar"
                        disabled={isProcessing}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
                      </Button>
                    )}
                  </div>
                )}

                {currentStatus === "cleaning_now" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1 text-amber-700 border-amber-300 hover:bg-amber-100 font-medium" 
                        onClick={() => handleStatusChange("pending_issue")}
                        disabled={isProcessing}
                      >
                        Pendência
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs" 
                        onClick={() => handleStatusChange("clean")}
                        disabled={isProcessing}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Concluir
                      </Button>
                    </div>
                    {(isAssignedToMe || isAdmin) && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 h-7" 
                        onClick={handleRelease}
                        disabled={isProcessing}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver quarto à lista
                      </Button>
                    )}
                  </div>
                )}

                {currentStatus === "pending_issue" && (
                  <div className="space-y-1.5">
                    <Button 
                      size="sm" 
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs" 
                      onClick={handleResolveIssue}
                      disabled={isProcessing}
                    >
                      <Check className="w-4 h-4 mr-1.5" /> Dar Baixa e Finalizar
                    </Button>
                    {isAdmin && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="w-full text-xs text-slate-500 h-7" 
                        onClick={() => handleStatusChange("dirty")}
                        disabled={isProcessing}
                      >
                        Reabrir como Sujo
                      </Button>
                    )}
                  </div>
                )}

                {currentStatus === "clean" && (
                  <div className="flex gap-1.5">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs text-slate-600 border-slate-300 hover:bg-slate-100" 
                      onClick={() => handleStatusChange("dirty")}
                      disabled={isProcessing}
                      title="Devolver quarto para o estado sujo e desfazer o registro de limpeza"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver Quarto
                    </Button>
                    {isAdmin && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 font-bold" 
                        onClick={() => setAdminCleanModalOpen(true)}
                        disabled={isProcessing}
                      >
                        Trocar Camareira
                      </Button>
                    )}
                  </div>
                )}

                {/* Lost Item button for maids & admin */}
                <Button 
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLostItemModalOpen(true)}
                  className="w-full text-[11px] font-semibold h-8 gap-1.5 border-dashed border-amber-400/90 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-900 dark:text-amber-200 mt-1 shadow-2xs"
                >
                  <PackageOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>Item Encontrado no Quarto</span>
                </Button>

                {/* Extend Stay Button (Admin & Maids, when not clean) */}
                {currentStatus !== "clean" && (
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtendStayModalOpen(true)}
                    disabled={isProcessing || isSubmittingExtend}
                    title="Hóspede estendeu: o hóspede renovou a estadia e continua no apartamento (não deve ser limpo hoje)."
                    className="w-full text-[11px] font-semibold h-7 gap-1 text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 mt-0.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Hóspede Estendeu (Não Limpar)</span>
                  </Button>
                )}

                {/* No Show Button (Admin Only, available when room not clean) */}
                {isAdmin && currentStatus !== "clean" && (
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNoShowModalOpen(true)}
                    disabled={isProcessing || isSubmittingNoShow}
                    title="Marcar No Show: o hóspede não compareceu e o quarto não foi utilizado (permanece limpo)."
                    className="w-full text-[11px] font-semibold h-7 gap-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 mt-0.5"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Marcar No Show</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* No Show Confirmation Dialog */}
      <Dialog open={noShowModalOpen} onOpenChange={setNoShowModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <UserX className="w-5 h-5" />
              Confirmar No Show - Flat {flat.flatNumber}
            </DialogTitle>
            <DialogDescription>
              O hóspede não compareceu (No Show). O quarto não foi utilizado e será liberado como limpo, saindo da lista de limpeza de hoje.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setNoShowModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs"
              onClick={handleConfirmNoShow}
              disabled={isSubmittingNoShow}
            >
              {isSubmittingNoShow ? "Registrando..." : "Confirmar No Show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lost & Found Item Registration Dialog */}
      <Dialog open={lostItemModalOpen} onOpenChange={setLostItemModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveLostItem}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackageOpen className="w-5 h-5 text-amber-600" />
                Registrar Item Encontrado - Apt {flat.flatNumber}
              </DialogTitle>
              <DialogDescription>
                Cadastre qualquer objeto esquecido pelo hóspede para controle da governança.
              </DialogDescription>
            </DialogHeader>

            {lostItemSuccess ? (
              <div className="py-8 text-center space-y-2.5 animate-in fade-in zoom-in-95">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-black text-sm text-slate-900 dark:text-slate-100">
                  {offlineQueued ? "Salvo no Dispositivo com Sucesso!" : "Item e Foto Registrados com Sucesso!"}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {offlineQueued 
                    ? "Salvo na memória local do celular. Será enviado para o servidor automaticamente assim que o sinal retornar."
                    : "Objeto catalogado com foto nítida e vinculado aos dados do hóspede anterior."}
                </p>
                {offlineQueued && (
                  <Badge className="bg-amber-100 text-amber-800 text-[10px] font-bold">
                    <CloudOff className="w-3 h-3 mr-1" />
                    Sincronização Offline Ativa
                  </Badge>
                )}
              </div>
            ) : (
              <div className="py-3 space-y-3 text-xs">
                {saveErrorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{saveErrorMessage}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Descrição do Objeto Encontrado *</Label>
                  <Input 
                    value={lostDescription}
                    onChange={e => setLostDescription(e.target.value)}
                    required
                    placeholder="Ex: Relógio de pulso prata, Carregador Samsung, Óculos de sol..."
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Local Onde Estava no Quarto</Label>
                  <Input 
                    value={lostLocation}
                    onChange={e => setLostLocation(e.target.value)}
                    placeholder="Ex: Em cima da mesa de cabeceira, dentro do guarda-roupa..."
                    className="text-xs"
                  />
                </div>

                {/* Photo Upload & Compressed Preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Foto do Item Encontrado</Label>
                    {photoCompressionStats && (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        ⚡ Otimizada: {photoCompressionStats.compKb} KB (-{photoCompressionStats.saved}%)
                      </span>
                    )}
                  </div>

                  {compressingPhoto ? (
                    <div className="p-6 border-2 border-dashed border-sky-300 dark:border-sky-800 rounded-xl flex flex-col items-center justify-center gap-2 bg-sky-50/50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300">
                      <Sparkles className="w-6 h-6 animate-spin text-sky-600" />
                      <span className="text-xs font-bold">Otimizando foto em alta qualidade...</span>
                    </div>
                  ) : lostPhotoBase64 ? (
                    <div className="relative rounded-xl overflow-hidden border border-amber-300 max-h-48 flex items-center justify-center bg-slate-950/5">
                      <img src={lostPhotoBase64} alt="Item Encontrado" className="max-h-48 w-auto object-contain rounded-lg" />
                      <button
                        type="button"
                        onClick={() => { setLostPhotoBase64(null); setPhotoCompressionStats(null); }}
                        className="absolute top-2 right-2 bg-rose-600 text-white p-1 rounded-full text-xs shadow-md hover:bg-rose-700"
                        title="Remover foto"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-amber-300 dark:border-amber-800 rounded-xl cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all">
                      <Camera className="w-6 h-6 text-amber-600 mb-1" />
                      <span className="font-semibold text-xs text-amber-900 dark:text-amber-200">Tirar Foto com a Câmera ou Galeria</span>
                      <span className="text-[10px] text-muted-foreground">Compressão automática para envio ultrarrápido</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Observações Extras</Label>
                  <Textarea 
                    value={lostNotes}
                    onChange={e => setLostNotes(e.target.value)}
                    placeholder="Ex: Entregue na recepção, guardado no armário de governança..."
                    className="text-xs h-16 resize-none"
                  />
                </div>
              </div>
            )}

            {!lostItemSuccess && (
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLostItemModalOpen(false)} disabled={savingLostItem}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={savingLostItem || compressingPhoto || !lostDescription.trim()} 
                  className="font-semibold text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                >
                  {savingLostItem ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Gravando e Enviando...</span>
                    </>
                  ) : (
                    <span>Salvar Item Encontrado</span>
                  )}
                </Button>
              </DialogFooter>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Minimum Time Alert Modal */}
      <Dialog open={minTimeAlertOpen} onOpenChange={setMinTimeAlertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <Clock className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg">Tempo Mínimo Insuficiente</DialogTitle>
            <DialogDescription className="text-center text-sm pt-1 text-slate-700 font-medium">
              Não é possível finalizar a limpeza ainda. O tempo de higienização registrado é insuficiente (mínimo exigido de 10 minutos).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pt-2">
            <Button className="w-full sm:w-auto" onClick={() => setMinTimeAlertOpen(false)}>
              Entendido, continuarei a limpeza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: DECLARAÇÃO & ATESTADO OBRIGATÓRIO DE TAREFAS PREVENTIVAS ── */}
      <Dialog open={finishModalOpen} onOpenChange={setFinishModalOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Finalizar Higienização • Flat {flat.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Para liberar o apartamento, ateste a realização dos serviços preventivos agendados.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4 text-xs">
            {/* Lista de Tarefas Preventivas Agendadas com Checkbox de Atestado Obrigatório */}
            {pendingPeriodicTasks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 font-black text-xs text-foreground uppercase tracking-wider">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span>Tarefas Preventivas Agendadas ({pendingPeriodicTasks.length}):</span>
                </div>

                {pendingPeriodicTasks.map((t: any) => {
                  const isChecked = attestedTaskIds.includes(t.id)
                  const maidName = userRole === "admin" ? "Administração" : (request?.assignedUsername || "Camareira")

                  return (
                    <div 
                      key={t.id} 
                      className={cn(
                        "p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2",
                        isChecked 
                          ? "bg-emerald-500/10 border-emerald-500/40" 
                          : "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60"
                      )}
                      onClick={() => {
                        setAttestedTaskIds(prev => 
                          prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                        )
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={isChecked}
                          onCheckedChange={(c) => {
                            setAttestedTaskIds(prev => 
                              c ? [...prev, t.id] : prev.filter(x => x !== t.id)
                            )
                          }}
                          className="mt-0.5 rounded-md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-black text-xs text-foreground">{t.name}</h4>
                            <Badge variant="outline" className="text-[10px] font-bold text-amber-600 border-amber-500/30">
                              Obrigatória
                            </Badge>
                          </div>
                          {t.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Termo de Atestado Formal */}
                      <div className={cn(
                        "p-2.5 rounded-xl text-[11px] leading-relaxed border transition-colors",
                        isChecked 
                          ? "bg-emerald-500/20 text-emerald-950 dark:text-emerald-200 border-emerald-500/30 font-medium" 
                          : "bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-500/20"
                      )}>
                        ✍️ <strong>Declaração de Execução:</strong> "Eu, <u>{maidName}</u>, atesto sob minha responsabilidade que executei a tarefa <strong>{t.name}</strong> de forma completa neste apartamento."
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Vistorias Pendentes */}
            {pendingSurveys.length > 0 && (
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-3.5 space-y-2.5">
                <div className="font-black text-xs text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 text-indigo-600" />
                  <span>Pergunta de Vistoria de Saída:</span>
                </div>
                <p className="text-foreground font-bold text-xs">
                  {pendingSurveys[0].question}
                </p>

                <div className="flex gap-2 pt-1">
                  <Button 
                    type="button" 
                    size="sm"
                    variant={surveyAnswer === "Não" ? "default" : "outline"} 
                    className={cn(
                      "rounded-xl text-xs font-bold h-8",
                      surveyAnswer === "Não" ? "bg-emerald-600 text-white" : ""
                    )}
                    onClick={() => setSurveyAnswer("Não")}
                  >
                    ✓ Tudo Normal (Não)
                  </Button>
                  <Button 
                    type="button" 
                    size="sm"
                    variant={surveyAnswer === "Sim" ? "destructive" : "outline"}
                    className="rounded-xl text-xs font-bold h-8"
                    onClick={() => setSurveyAnswer("Sim")}
                  >
                    ⚠️ Apresenta Defeito (Sim)
                  </Button>
                </div>

                {surveyAnswer === "Sim" && (
                  <div className="pt-2">
                    <Label htmlFor="snotes" className="text-[11px] font-bold block mb-1">Detalhes do problema:</Label>
                    <Textarea 
                      id="snotes" 
                      value={surveyNotes} 
                      onChange={e => setSurveyNotes(e.target.value)} 
                      placeholder="Ex: Barulho na ventoinha do ar-condicionado, controle sem pilha..."
                      className="resize-none h-16 text-xs rounded-xl"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border">
            <Button 
              variant="outline" 
              onClick={() => setFinishModalOpen(false)}
              className="rounded-xl h-9.5 text-xs font-bold"
            >
              Voltar
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-9.5 text-xs shadow-xs"
              onClick={submitCompletion}
              disabled={isProcessing || (pendingPeriodicTasks.length > 0 && attestedTaskIds.length < pendingPeriodicTasks.length)}
            >
              {isProcessing ? "Gravando..." : (
                pendingPeriodicTasks.length > 0 && attestedTaskIds.length < pendingPeriodicTasks.length
                  ? `Marque o atestado das ${pendingPeriodicTasks.length} tarefas`
                  : "Confirmar Atestado & Concluir Limpeza"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Issue Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pendência</DialogTitle>
            <DialogDescription>
              Apt {flat.flatNumber} - Descreva o item faltante ou defeito que impede a liberação imediata do quarto.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="issue" className="mb-2 block">Observação (obrigatório)</Label>
            <Textarea 
              id="issue"
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="Ex: Faltando fronhas, aguardando lavanderia, controle de TV sem pilha..."
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitIssue} disabled={!issueText.trim() || isProcessing}>
              Salvar Pendência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Alerta de Check-out em Data Futura */}
      <Dialog open={futureCheckoutAlertOpen} onOpenChange={setFutureCheckoutAlertOpen}>
        <DialogContent className="sm:max-w-md bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Check-out em Data Posterior</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Este apartamento ainda está ocupado pelo hóspede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs py-2">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                  Apt {flat.flatNumber} • {futureCheckoutInfo?.guestName || flat.activeReservation?.guestName || "Hóspede"}
                </span>
                <Badge className="bg-amber-600 text-white font-bold text-[10px]">Ocupado</Badge>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
                O check-out deste hóspede está agendado apenas para <strong>{futureCheckoutInfo?.checkoutDate ? futureCheckoutInfo.checkoutDate.split('-').reverse().join('/') : (flat.activeReservation?.checkoutDate ? flat.activeReservation.checkoutDate.split('-').reverse().join('/') : "o dia seguinte")}</strong>. Não é permitido iniciar a higienização de saída antes da desocupação do quarto.
              </p>
            </div>

            <p className="text-muted-foreground text-[11px] leading-relaxed">
              💡 Para programar a escala de limpeza ou visualizar o fluxo no dia da saída, por favor altere a data selecionada no topo da tela para a data do check-out.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFutureCheckoutAlertOpen(false)}
              className="text-xs"
            >
              Entendido / Fechar
            </Button>

            {(futureCheckoutInfo?.checkoutDate || flat.activeReservation?.checkoutDate) && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const targetDate = futureCheckoutInfo?.checkoutDate || flat.activeReservation?.checkoutDate
                  setFutureCheckoutAlertOpen(false)
                  if (targetDate) {
                    if (onSelectDate) {
                      onSelectDate(targetDate)
                    } else {
                      window.location.href = `/dashboard?date=${targetDate}`
                    }
                  }
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Alterar Data para {futureCheckoutInfo?.checkoutDate ? futureCheckoutInfo.checkoutDate.split('-').reverse().join('/') : (flat.activeReservation?.checkoutDate ? flat.activeReservation.checkoutDate.split('-').reverse().join('/') : "")}</span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Custom Instructions Modal (Twin Beds & Custom Maid Note) */}
      {isAdmin && (
        <Dialog open={instructionsModalOpen} onOpenChange={setInstructionsModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border shadow-2xl rounded-2xl">
            <form onSubmit={handleSaveInstructions}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-black text-foreground">
                  <BedDouble className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Instruções para a Camareira • Flat {flat.flatNumber}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Defina a configuração de camas e deixe um recado ou nota para a camareira ver ao limpar este apartamento.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4 text-xs">
                {/* Opção 2 Camas de Solteiro */}
                <div className={`p-3.5 rounded-xl border transition-all ${
                  twinBedsSetting
                    ? "bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800"
                    : "bg-muted/40 border-border/80"
                }`}>
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id={`twinBeds-${flat.flatId}`}
                      checked={twinBedsSetting}
                      onCheckedChange={(checked) => setTwinBedsSetting(Boolean(checked))}
                      className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`twinBeds-${flat.flatId}`} className="font-bold text-xs text-foreground cursor-pointer flex items-center gap-1.5">
                        <BedDouble className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Montar 2 Camas de Solteiro (Separadas)
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        A camareira verá um aviso destacado informando que as camas devem ser preparadas separadas como solteiro.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nota / Recado Digitado para a Camareira */}
                <div className="space-y-1.5">
                  <Label htmlFor={`adminNote-${flat.flatId}`} className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <span>📝 Nota / Recado para a Camareira:</span>
                  </Label>
                  <Textarea
                    id={`adminNote-${flat.flatId}`}
                    value={adminNoteText}
                    onChange={e => setAdminNoteText(e.target.value)}
                    placeholder="Digite qualquer instrução para a camareira (ex: Deixar toalhas extras, colocar manta nova, conferir ar condicionado, montar berço...)"
                    rows={3}
                    className="w-full text-xs rounded-xl bg-background leading-relaxed"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Esta nota aparecerá em destaque no card do quarto para a camareira ler antes de iniciar a limpeza.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setInstructionsModalOpen(false)} className="text-xs font-bold rounded-xl h-9">
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSavingInstructions} 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl h-9 gap-1.5 shadow-sm"
                >
                  {isSavingInstructions ? "Salvando..." : "Salvar Instruções"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Admin Marcar como Limpo em nome de uma Camareira */}
      {isAdmin && (
        <Dialog open={adminCleanModalOpen} onOpenChange={setAdminCleanModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border shadow-2xl rounded-3xl">
            <form onSubmit={handleAdminConfirmClean}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-black text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  Marcar Quarto como Limpo • Flat {flat.flatNumber}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Selecione a camareira responsável por esta higienização para registrar a produtividade e remuneração corretamente no sistema.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4 text-xs">
                {/* Seletor de Camareira */}
                <div className="space-y-2">
                  <Label className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    Quem realizou a limpeza deste quarto? *
                  </Label>
                  <Select value={selectedMaidId} onValueChange={setSelectedMaidId}>
                    <SelectTrigger className="w-full h-10 text-xs rounded-xl bg-background font-semibold">
                      <SelectValue placeholder="Selecione a camareira" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <span className="font-bold capitalize">{s.name || s.username}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                            ({s.role === "admin" ? "Administrador / Gestor" : "Camareira"})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-1 text-xs">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Contabilização Automática
                  </span>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    Esta limpeza será creditada integralmente na contagem e nos relatórios de produtividade da colaboradora selecionada.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setAdminCleanModalOpen(false)} className="text-xs font-bold rounded-xl h-9">
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={adminCleanSubmitting || !selectedMaidId} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl h-9 gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {adminCleanSubmitting ? "Salvando..." : "Confirmar Limpeza"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Confirmar Estadia Estendida (Hóspede Estendeu) */}
      <Dialog open={extendStayModalOpen} onOpenChange={setExtendStayModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border shadow-2xl rounded-3xl">
          <form onSubmit={handleConfirmExtendStay}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-black text-amber-600 dark:text-amber-400">
                <Clock className="w-5 h-5" />
                Confirmar Estadia Estendida • Flat {flat.flatNumber}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                O hóspede renovou a estadia ou continuará no quarto. O apartamento sairá da lista de limpeza de hoje.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Hóspede atual: {flat.leavingGuest || flat.activeReservation?.guestName || "Em estadia contínua"}
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Ao confirmar, este quarto não será mais considerado pendente para limpeza hoje e será marcado como ocupado em permanência.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Observação / Nova data prevista de saída (opcional)</Label>
                <Input
                  value={extendNotes}
                  onChange={e => setExtendNotes(e.target.value)}
                  placeholder="Ex: Hóspede estendeu até dia 30/08..."
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setExtendStayModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingExtend}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl gap-1.5 shadow-sm"
              >
                {isSubmittingExtend ? "Registrando..." : "Confirmar que Estendeu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
