import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListPeriodicTasks,
  useListPendingPeriodicTasks,
  useCreatePeriodicTask,
  useUpdatePeriodicTask,
  useDeletePeriodicTask,
  useExecutePeriodicTask,
  useListFlats,
  useGetMe,
  getListPeriodicTasksQueryKey,
  getListPendingPeriodicTasksQueryKey,
  PeriodicTask,
  PendingPeriodicTask,
} from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Pencil, Trash2, CheckCircle2, Clock, AlertCircle } from "lucide-react"

function TaskFormDialog({
  open,
  onClose,
  task,
  flatOptions,
}: {
  open: boolean
  onClose: () => void
  task?: any | null
  flatOptions: { id: number; number: string }[]
}) {
  const qc = useQueryClient()
  const todayStr = new Date().toISOString().substring(0, 10)
  const [name, setName] = useState(task?.name ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [firstDueDate, setFirstDueDate] = useState(task?.firstDueDate ? String(task.firstDueDate).substring(0, 10) : todayStr)
  const [periodDays, setPeriodDays] = useState<number>(task?.periodDays ?? 30)
  const [assignToHousekeeping, setAssignToHousekeeping] = useState<boolean>(task?.assignToHousekeeping !== false)
  const [selectedFlats, setSelectedFlats] = useState<number[]>(task?.flatIds ?? [])
  const [isActive, setIsActive] = useState(task?.isActive !== false)
  const [saving, setSaving] = useState(false)

  const recurrencePresets = [
    { label: "7 dias (Semanal)", days: 7 },
    { label: "15 dias (Quinzenal)", days: 15 },
    { label: "30 dias (Mensal)", days: 30 },
    { label: "60 dias (Bimestral)", days: 60 },
    { label: "90 dias (Trimestral)", days: 90 },
    { label: "180 dias (Semestral)", days: 180 },
    { label: "365 dias (Anual)", days: 365 },
  ]

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPeriodicTasksQueryKey() })
    qc.invalidateQueries({ queryKey: getListPendingPeriodicTasksQueryKey() })
    onClose()
  }

  const handleToggleFlat = (id: number) => {
    setSelectedFlats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSelectAll = () => {
    if (selectedFlats.length === flatOptions.length) {
      setSelectedFlats([])
    } else {
      setSelectedFlats(flatOptions.map(f => f.id))
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description ? description.trim() : null,
        firstDueDate,
        periodDays: Number(periodDays) || 30,
        assignToHousekeeping,
        isActive,
        flatIds: selectedFlats.length > 0 ? selectedFlats : flatOptions.map(f => f.id)
      }

      if (task) {
        await fetch(`/api/periodic-tasks/${task.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      } else {
        await fetch("/api/periodic-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      }
      invalidate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa Preventiva" : "Nova Tarefa Preventiva Recorrente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-xs">
          <div className="space-y-1">
            <Label className="text-xs font-bold">Nome da Tarefa Preventiva *</Label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Ex: Limpeza de Filtro de AC, Troca de Pilhas, Dedetização..." 
              className="text-xs font-semibold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Descrição / Instruções Técnicas (opcional)</Label>
            <Textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              rows={2} 
              placeholder="Detalhes dos procedimentos, peças necessárias, checklists..." 
              className="text-xs resize-none"
            />
          </div>

          {/* 📅 Data da 1ª Execução / Início */}
          <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-1.5">
            <Label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <span>📅 Data da 1ª Tarefa / Início da Preventiva *</span>
            </Label>
            <Input 
              type="date" 
              value={firstDueDate} 
              onChange={e => setFirstDueDate(e.target.value)} 
              className="text-xs font-bold bg-background"
            />
            <span className="text-[10px] text-muted-foreground block">
              A primeira ordem desta preventiva será gerada para este dia.
            </span>
          </div>

          {/* 🔄 Intervalo de Repetição (Periodicidade) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Intervalo de Repetição (Periodicidade em dias) *</Label>
              <span className="text-xs font-bold text-primary">A cada {periodDays} dias</span>
            </div>
            
            <Input 
              type="number" 
              min={1} 
              max={730} 
              value={periodDays} 
              onChange={e => setPeriodDays(parseInt(e.target.value) || 1)} 
              className="text-xs font-bold"
            />

            {/* Presets Rápidos */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {recurrencePresets.map(preset => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setPeriodDays(preset.days)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                    periodDays === preset.days
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-muted/40 hover:bg-muted text-foreground border-border"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 🧹 Competência / Atribuição (Camareiras vs Manutenção Técnica) */}
          <div className="p-3 bg-muted/40 rounded-xl border space-y-2">
            <Label className="text-xs font-bold block">Responsável pela Execução / Competência *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAssignToHousekeeping(true)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  assignToHousekeeping
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-950 dark:text-emerald-300 font-bold shadow-2xs"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <span>🧹 Competência das Camareiras</span>
                </div>
                <div className="text-[10px] opacity-80 mt-1 font-normal leading-tight">
                  Aparece no card do quarto no dia agendado (ou na próxima limpeza se não houver check-out no dia).
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAssignToHousekeeping(false)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  !assignToHousekeeping
                    ? "bg-purple-500/15 border-purple-500 text-purple-950 dark:text-purple-300 font-bold shadow-2xs"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <span>🛠️ Manutenção Técnica / Admin</span>
                </div>
                <div className="text-[10px] opacity-80 mt-1 font-normal leading-tight">
                  Não exibe para camareiras. Fica registrada no painel da administração para manutenções programadas.
                </div>
              </button>
            </div>
          </div>

          {task && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox checked={isActive} onCheckedChange={v => setIsActive(!!v)} id="active" />
              <Label htmlFor="active" className="text-xs font-semibold cursor-pointer">Tarefa ativa (gera alertas e pendências)</Label>
            </div>
          )}

          {/* Seleção de Flats */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Flats Aplicáveis ({selectedFlats.length === 0 || selectedFlats.length === flatOptions.length ? "Todos os Flats" : `${selectedFlats.length} selecionados`})</Label>
              <Button size="sm" variant="ghost" onClick={handleSelectAll} className="text-xs h-7">
                {selectedFlats.length === flatOptions.length ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 bg-muted/20 border rounded-xl">
              {flatOptions.map(f => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`flat-${f.id}`}
                    checked={selectedFlats.length === 0 || selectedFlats.includes(f.id)}
                    onCheckedChange={() => handleToggleFlat(f.id)}
                  />
                  <Label htmlFor={`flat-${f.id}`} className="text-xs font-medium cursor-pointer">Apt {f.number}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()} className="font-bold">
            {saving ? "Salvando..." : task ? "Salvar Alterações" : "Criar Preventiva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function overdueBadge(daysOverdue: number, nextDueAt?: string) {
  if (daysOverdue > 0) return <Badge className="bg-destructive/15 text-destructive border-0 text-xs font-bold">{daysOverdue}d atrasada</Badge>
  if (daysOverdue === 0) return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs font-bold">Vence hoje</Badge>
  return <Badge variant="outline" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Próx: {nextDueAt ? nextDueAt.split('-').reverse().join('/') : `Em ${Math.abs(daysOverdue)}d`}</Badge>
}

export default function Tasks() {
  const { data: user } = useGetMe()
  const isAdmin = user?.role === "admin"
  const qc = useQueryClient()
  const [roleFilter, setRoleFilter] = useState<"all" | "camareira" | "manutencao">("all")

  const { data: tasks, isLoading: loadingTasks } = useListPeriodicTasks(
    { query: { enabled: isAdmin, queryKey: getListPeriodicTasksQueryKey() } }
  )
  const { data: pending, isLoading: loadingPending } = useListPendingPeriodicTasks(
    undefined, { query: { refetchInterval: 60000, queryKey: getListPendingPeriodicTasksQueryKey() } }
  )
  const { data: flats } = useListFlats()

  const [formOpen, setFormOpen] = useState(false)
  const [editTask, setEditTask] = useState<any | null>(null)
  const [execDialogTaskId, setExecDialogTaskId] = useState<number | null>(null)
  const [execFlatId, setExecFlatId] = useState<number | null>(null)
  const [execNotes, setExecNotes] = useState("")

  const deleteTask = useDeletePeriodicTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPeriodicTasksQueryKey() })
        qc.invalidateQueries({ queryKey: getListPendingPeriodicTasksQueryKey() })
      }
    }
  })

  const execute = useExecutePeriodicTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPendingPeriodicTasksQueryKey() })
        setExecDialogTaskId(null)
        setExecFlatId(null)
        setExecNotes("")
      }
    }
  })

  // Filter tasks and pending by role
  const allPending = (pending ?? []).map((p: any) => ({
    ...p,
    assignToHousekeeping: p.assignToHousekeeping !== false
  }))

  const filteredPending = allPending.filter((p: any) => {
    if (roleFilter === "camareira") return p.assignToHousekeeping === true
    if (roleFilter === "manutencao") return p.assignToHousekeeping === false
    return true
  })

  const pendingDueOrOverdue = filteredPending.filter(p => p.daysOverdue >= 0)
  const pendingUpcoming = filteredPending.filter(p => p.daysOverdue < 0)

  const countCamareiraPending = allPending.filter(p => p.assignToHousekeeping === true && p.daysOverdue >= 0).length
  const countManutencaoPending = allPending.filter(p => p.assignToHousekeeping === false && p.daysOverdue >= 0).length

  const filteredTasks = (tasks ?? []).filter((t: any) => {
    if (roleFilter === "camareira") return t.assignToHousekeeping !== false
    if (roleFilter === "manutencao") return t.assignToHousekeeping === false
    return true
  })

  const flatOptions = (flats ?? []).map(f => ({ id: f.id, number: f.number }))
  const execItem = allPending.find(p => p.taskId === execDialogTaskId && p.flatId === execFlatId)

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manutenções & Tarefas Preventivas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Controle de tarefas recorrentes por flat com separação entre Camareiras e Manutenção Técnica.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditTask(null); setFormOpen(true) }} className="font-bold gap-1.5 shadow-xs">
              <Plus className="w-4 h-4" /> Nova Preventiva
            </Button>
          )}
        </div>

        {/* Top KPIs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="rounded-xl border shadow-2xs p-3.5 bg-card">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total de Pendências</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {allPending.filter(p => p.daysOverdue >= 0).length}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Todas as preventivas vencidas ou de hoje</div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
            <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <span>🧹 Competência das Camareiras</span>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {countCamareiraPending}
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">
              Aparecem no card do quarto durante a limpeza
            </div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5 bg-purple-50/40 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
            <div className="text-[11px] font-semibold text-purple-900 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <span>🛠️ Manutenção Técnica (Admin)</span>
            </div>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {countManutencaoPending}
            </div>
            <div className="text-[10px] text-purple-700 dark:text-purple-400 mt-0.5 font-medium">
              Serviços técnicos exclusivos da administração
            </div>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border w-fit">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              roleFilter === "all"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📋 Todas ({allPending.filter(p => p.daysOverdue >= 0).length})
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter("camareira")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              roleFilter === "camareira"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-emerald-700"
            }`}
          >
            <span>🧹 Camareiras ({countCamareiraPending})</span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter("manutencao")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              roleFilter === "manutencao"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-purple-700"
            }`}
          >
            <span>🛠️ Manutenção Técnica ({countManutencaoPending})</span>
          </button>
        </div>

        {/* Pending / due today */}
        <section className="space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Pendentes de Execução ({pendingDueOrOverdue.length})
          </h2>
          {loadingPending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : pendingDueOrOverdue.length === 0 ? (
            <div className="text-center py-8 bg-card border rounded-xl border-dashed text-xs text-muted-foreground">
              Nenhuma tarefa preventiva pendente neste filtro. ✓
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingDueOrOverdue.map((item: any) => (
                <Card key={`${item.taskId}-${item.flatId}`} className="border-l-4 border-l-destructive/60 shadow-2xs">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {item.assignToHousekeeping ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[9px] font-bold">
                              🧹 Camareira
                            </Badge>
                          ) : (
                            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[9px] font-bold">
                              🛠️ Manutenção Admin
                            </Badge>
                          )}
                        </div>
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{item.taskName}</p>
                        <p className="text-xs text-muted-foreground">Flat {item.flatNumber} · a cada {item.periodDays}d</p>
                      </div>
                      {overdueBadge(item.daysOverdue, item.nextDueAt)}
                    </div>
                    {item.taskDescription && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.taskDescription}</p>
                    )}
                    <Button
                      size="sm" className="w-full mt-2 font-semibold text-xs gap-1.5"
                      onClick={() => { setExecDialogTaskId(item.taskId); setExecFlatId(item.flatId) }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Executada
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming */}
        {pendingUpcoming.length > 0 && (
          <section className="space-y-3 pt-2">
            <h2 className="text-base font-bold flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              Próximas Manutenções Programadas ({pendingUpcoming.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingUpcoming.slice(0, 12).map((item: any) => (
                <Card key={`${item.taskId}-${item.flatId}`} className="opacity-75 shadow-2xs">
                  <CardContent className="p-3.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          {item.assignToHousekeeping ? (
                            <Badge variant="outline" className="text-[9px] text-emerald-700 border-emerald-300">
                              🧹 Camareira
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-purple-700 border-purple-300">
                              🛠️ Manutenção
                            </Badge>
                          )}
                        </div>
                        <p className="font-semibold text-sm">{item.taskName}</p>
                        <p className="text-xs text-muted-foreground">Flat {item.flatNumber} · a cada {item.periodDays}d</p>
                      </div>
                      {overdueBadge(item.daysOverdue, item.nextDueAt)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Admin: manage tasks */}
        {isAdmin && (
          <section className="space-y-3 pt-2">
            <h2 className="text-base font-bold">Catálogo de Tarefas Preventivas Cadastradas</h2>
            {loadingTasks ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 bg-card border rounded-xl border-dashed text-xs text-muted-foreground">
                Nenhuma tarefa cadastrada neste filtro.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task: any) => (
                  <div key={task.id} className="flex items-center gap-3 p-3.5 bg-card border rounded-xl shadow-2xs">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{task.name}</span>
                        {task.assignToHousekeeping !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                            🧹 Camareira
                          </Badge>
                        ) : (
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold">
                            🛠️ Manutenção Admin
                          </Badge>
                        )}
                        {!task.isActive && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                        <Badge variant="secondary" className="text-xs font-bold">a cada {task.periodDays}d</Badge>
                        {task.firstDueDate && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            📅 1ª Execução: {task.firstDueDate.split('-').reverse().join('/')}
                          </Badge>
                        )}
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                      <p className="text-[11px] text-muted-foreground font-mono">{task.flatIds.length} flat{task.flatIds.length !== 1 ? "s" : ""} aplicáveis</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditTask(task); setFormOpen(true) }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteTask.mutate({ id: task.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Form dialog */}
      {formOpen && (
        <TaskFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTask(null) }}
          task={editTask}
          flatOptions={flatOptions}
        />
      )}

      {/* Execute dialog */}
      <Dialog open={execDialogTaskId !== null} onOpenChange={v => !v && setExecDialogTaskId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Concluída</DialogTitle>
          </DialogHeader>
          {execItem && (
            <div className="space-y-3 py-2">
              <p className="text-sm"><span className="font-medium">{execItem.taskName}</span> — Flat {execItem.flatNumber}</p>
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea value={execNotes} onChange={e => setExecNotes(e.target.value)} rows={2} placeholder="Algum detalhe?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExecDialogTaskId(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!execDialogTaskId || !execFlatId) return
                execute.mutate({ id: execDialogTaskId, data: { flatId: execFlatId, notes: execNotes || null } })
              }}
              disabled={execute.isPending}
            >
              {execute.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
