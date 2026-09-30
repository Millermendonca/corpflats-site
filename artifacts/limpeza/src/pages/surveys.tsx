import { useState, useEffect } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { 
  ClipboardCheck, Plus, AlertCircle, CheckCircle2, Trash2, Power, Eye, 
  HelpCircle, Camera, Star, CheckSquare, CircleDot, AlignLeft,
  Pencil, RefreshCw, X, Image as ImageIcon, ExternalLink, ArrowRight,
  Sparkles, Check, Building2
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useListFlats } from "@workspace/api-client-react"

export interface SurveyQuestion {
  id: string
  question: string
  type: "yes_no" | "single_choice" | "multi_choice" | "scale" | "text" | "photo"
  options?: string[]
  scaleMin?: number
  scaleMax?: number
  isRequired: boolean
}

export interface Survey {
  id: number
  title: string
  description?: string
  isActive: boolean
  flatIds?: number[]
  questions: SurveyQuestion[]
  createdAt: string
  updatedAt?: string
  responses: any[]
}

const QUESTION_TYPES = [
  { value: "yes_no", label: "Sim / Não", icon: HelpCircle, desc: "Pergunta binária simples com botões Sim e Não" },
  { value: "single_choice", label: "Escolha Única", icon: CircleDot, desc: "O usuário escolhe apenas 1 opção de uma lista" },
  { value: "multi_choice", label: "Múltipla Seleção", icon: CheckSquare, desc: "O usuário pode marcar várias opções de uma lista" },
  { value: "scale", label: "Nota / Escala (1 a 5)", icon: Star, desc: "Avaliação numérica ou por estrelas de 1 a 5" },
  { value: "text", label: "Texto Livre", icon: AlignLeft, desc: "Campo aberto para digitar observações ou descrições" },
  { value: "photo", label: "Foto / Evidência", icon: Camera, desc: "Tirar foto na hora ou enviar da galeria (comprimida)" },
]

export default function SurveysPage() {
  const { toast } = useToast()
  const { data: flatsData } = useListFlats()
  const flatOptions = (flatsData ?? []).map(f => ({ id: f.id, number: f.number }))

  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [activeTab, setActiveTab] = useState<"questions" | "responses">("responses")

  // Modal de Criar/Editar
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingSurveyId, setEditingSurveyId] = useState<number | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formFlatIds, setFormFlatIds] = useState<number[]>([]) // vazio = todos
  const [formQuestions, setFormQuestions] = useState<SurveyQuestion[]>([])
  const [formIsActive, setFormIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modal de Zoom da Foto
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null)
  const [zoomPhotoInfo, setZoomPhotoInfo] = useState<{ flatNumber: string; question: string } | null>(null)

  const fetchSurveys = async () => {
    try {
      const res = await fetch("/api/surveys")
      if (res.ok) {
        const data = await res.json()
        setSurveys(data)
        if (data.length > 0 && !selectedSurvey) {
          setSelectedSurvey(data[0])
        } else if (selectedSurvey) {
          const updated = data.find((s: Survey) => s.id === selectedSurvey.id)
          if (updated) setSelectedSurvey(updated)
          else setSelectedSurvey(data[0] || null)
        }
      }
    } catch (e) {
      console.error("Erro ao buscar vistorias:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSurveys()
  }, [])

  // Abrir modal de criação
  const handleOpenCreate = () => {
    setEditingSurveyId(null)
    setFormTitle("")
    setFormDescription("")
    setFormFlatIds([]) // padrão todos
    setFormIsActive(true)
    // Pergunta inicial padrão
    setFormQuestions([
      {
        id: `q_${Date.now()}_1`,
        question: "Como está o estado geral do apartamento?",
        type: "single_choice",
        options: ["Muito Bom", "Bom", "Regular", "Apresenta Danos"],
        scaleMin: 1,
        scaleMax: 5,
        isRequired: true
      }
    ])
    setFormModalOpen(true)
  }

  // Abrir modal de edição
  const handleOpenEdit = (survey: Survey) => {
    setEditingSurveyId(survey.id)
    setFormTitle(survey.title || "")
    setFormDescription(survey.description || "")
    setFormFlatIds(Array.isArray(survey.flatIds) ? [...survey.flatIds] : [])
    setFormIsActive(survey.isActive !== false)
    
    // Normalizar perguntas existentes
    const qs = Array.isArray(survey.questions) && survey.questions.length > 0
      ? survey.questions.map(q => ({
          id: q.id || `q_${Math.random()}`,
          question: q.question || "",
          type: q.type || "yes_no",
          options: Array.isArray(q.options) ? [...q.options] : [],
          scaleMin: q.scaleMin || 1,
          scaleMax: q.scaleMax || 5,
          isRequired: q.isRequired !== false
        }))
      : [{
          id: `q_${Date.now()}_1`,
          question: (survey as any).question || survey.title,
          type: (survey as any).type || "yes_no",
          options: [],
          scaleMin: 1,
          scaleMax: 5,
          isRequired: true
        }]

    setFormQuestions(qs)
    setFormModalOpen(true)
  }

  // Adicionar Pergunta no Form
  const handleAddQuestion = () => {
    const newQ: SurveyQuestion = {
      id: `q_${Date.now()}_${formQuestions.length + 1}`,
      question: "",
      type: "yes_no",
      options: ["Boa", "Regular", "Ruim"],
      scaleMin: 1,
      scaleMax: 5,
      isRequired: true
    }
    setFormQuestions([...formQuestions, newQ])
  }

  // Atualizar campo de pergunta
  const handleUpdateQuestion = (index: number, patch: Partial<SurveyQuestion>) => {
    setFormQuestions(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  // Remover pergunta
  const handleRemoveQuestion = (index: number) => {
    if (formQuestions.length <= 1) {
      toast({
        title: "Atenção",
        description: "A vistoria precisa ter pelo menos 1 pergunta.",
        variant: "destructive"
      })
      return
    }
    setFormQuestions(prev => prev.filter((_, i) => i !== index))
  }

  // Adicionar opção em escolha única ou múltipla
  const handleAddOption = (qIndex: number) => {
    const q = formQuestions[qIndex]
    const currentOpts = q.options || []
    const newOpts = [...currentOpts, `Opção ${currentOpts.length + 1}`]
    handleUpdateQuestion(qIndex, { options: newOpts })
  }

  // Atualizar texto de opção
  const handleUpdateOption = (qIndex: number, optIndex: number, text: string) => {
    const q = formQuestions[qIndex]
    const nextOpts = [...(q.options || [])]
    nextOpts[optIndex] = text
    handleUpdateQuestion(qIndex, { options: nextOpts })
  }

  // Remover opção
  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    const q = formQuestions[qIndex]
    const nextOpts = (q.options || []).filter((_, i) => i !== optIndex)
    handleUpdateQuestion(qIndex, { options: nextOpts })
  }

  // Toggle Flat Seleção
  const handleToggleFlat = (id: number) => {
    setFormFlatIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const handleSelectAllFlats = () => {
    if (formFlatIds.length === flatOptions.length) {
      setFormFlatIds([]) // vazio = todos
    } else {
      setFormFlatIds(flatOptions.map(f => f.id))
    }
  }

  // Salvar Vistoria (Create ou Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      toast({ title: "Preencha o título", description: "O nome da vistoria é obrigatório.", variant: "destructive" })
      return
    }

    // Validar se todas as perguntas têm texto
    for (let i = 0; i < formQuestions.length; i++) {
      if (!formQuestions[i].question.trim()) {
        toast({ title: "Pergunta vazia", description: `Por favor, preencha o texto da Pergunta ${i + 1}.`, variant: "destructive" })
        return
      }
      if (
        (formQuestions[i].type === "single_choice" || formQuestions[i].type === "multi_choice") &&
        (!formQuestions[i].options || formQuestions[i].options!.length < 2)
      ) {
        toast({
          title: "Opções insuficientes",
          description: `A Pergunta ${i + 1} precisa ter pelo menos 2 opções de resposta.`,
          variant: "destructive"
        })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        flatIds: formFlatIds.length === flatOptions.length ? [] : formFlatIds,
        questions: formQuestions,
        isActive: formIsActive
      }

      if (editingSurveyId) {
        const res = await fetch(`/api/surveys/${editingSurveyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
        if (res.ok) {
          toast({ title: "Vistoria atualizada!", description: "As alterações foram salvas com sucesso." })
        }
      } else {
        const res = await fetch("/api/surveys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
        if (res.ok) {
          toast({ title: "Vistoria criada!", description: "A vistoria já está disponível para os flats selecionados." })
        }
      }

      setFormModalOpen(false)
      await fetchSurveys()
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Ocorreu um erro.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Alternar Status Ativa/Pausada
  const toggleSurveyStatus = async (id: number) => {
    try {
      await fetch(`/api/surveys/${id}/toggle`, { method: "PATCH" })
      await fetchSurveys()
      toast({ title: "Status alterado", description: "O status da vistoria foi atualizado." })
    } catch {
      toast({ title: "Erro", description: "Não foi possível alterar o status.", variant: "destructive" })
    }
  }

  // Excluir Vistoria
  const deleteSurvey = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta vistoria? Todas as respostas coletadas serão apagadas.")) return
    try {
      await fetch(`/api/surveys/${id}`, { method: "DELETE" })
      if (selectedSurvey?.id === id) setSelectedSurvey(null)
      await fetchSurveys()
      toast({ title: "Vistoria excluída", description: "Vistoria removida com sucesso." })
    } catch {
      toast({ title: "Erro", description: "Não foi possível excluir a vistoria.", variant: "destructive" })
    }
  }

  // Reiniciar vistoria para um flat específico (para permitir que responda novamente)
  const handleResetFlat = async (surveyId: number, flatId: number, flatNumber: string) => {
    if (!confirm(`Deseja reiniciar a vistoria para o Flat ${flatNumber}? A resposta anterior será descartada e a vistoria voltará a aparecer na próxima limpeza.`)) return
    try {
      const res = await fetch(`/api/surveys/${surveyId}/reset-flat/${flatId}`, { method: "POST" })
      if (res.ok) {
        toast({ title: "Vistoria reiniciada!", description: `Flat ${flatNumber} responderá novamente na próxima limpeza.` })
        await fetchSurveys()
      }
    } catch {
      toast({ title: "Erro ao reiniciar", variant: "destructive" })
    }
  }

  // Excluir foto para liberar espaço
  const handleDeletePhoto = async (surveyId: number, responseId: string, questionId: string) => {
    if (!confirm("Deseja apagar esta foto para liberar espaço no armazenamento?")) return
    try {
      const res = await fetch(`/api/surveys/${surveyId}/responses/${responseId}/photos/${questionId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Foto apagada!", description: "Espaço liberado com sucesso." })
        await fetchSurveys()
      }
    } catch {
      toast({ title: "Erro ao apagar foto", variant: "destructive" })
    }
  }

  // Dados computados da vistoria selecionada
  const targetFlatsList = selectedSurvey
    ? (!selectedSurvey.flatIds || selectedSurvey.flatIds.length === 0
        ? flatOptions
        : flatOptions.filter(f => selectedSurvey.flatIds?.includes(f.id)))
    : []

  const answeredFlatIds = new Set((selectedSurvey?.responses || []).map((r: any) => Number(r.flatId)))
  const pendingFlatsList = targetFlatsList.filter(f => !answeredFlatIds.has(f.id))
  const answeredCount = answeredFlatIds.size
  const totalTargetCount = targetFlatsList.length
  const progressPercent = totalTargetCount > 0 ? Math.round((answeredCount / totalTargetCount) * 100) : 0

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <ClipboardCheck className="w-8 h-8 text-primary" />
              Vistorias & Pesquisas Operacionais
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">
              Crie vistorias pontuais com perguntas personalizadas (Sim/Não, Múltipla Escolha, Fotos e Notas). A camareira responde antes de liberar o quarto.
            </p>
          </div>

          <Button 
            onClick={handleOpenCreate}
            className="bg-primary hover:bg-primary/90 font-bold shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Vistoria</span>
          </Button>
        </div>

        {/* KPIs Rápidos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="rounded-xl border shadow-2xs p-3.5 bg-card">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vistorias Ativas</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {surveys.filter(s => s.isActive).length}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Em exibição nos quartos selecionados</div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
            <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
              Total de Vistorias Respondidas
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {surveys.reduce((acc, s) => acc + (s.responses?.length || 0), 0)}
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">
              Apartamentos já checados e registrados
            </div>
          </Card>

          <Card className="rounded-xl border shadow-2xs p-3.5 bg-sky-50/40 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
            <div className="text-[11px] font-semibold text-sky-900 dark:text-sky-300 uppercase tracking-wider">
              Regra de Execução
            </div>
            <div className="text-sm font-bold text-sky-950 dark:text-sky-200 mt-1">
              1 Resposta por Flat
            </div>
            <div className="text-[10px] text-sky-800 dark:text-sky-300 mt-0.5">
              Após respondida, a vistoria é concluída e não reaparece para o quarto
            </div>
          </Card>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Surveys List (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Vistorias Cadastradas ({surveys.length})
              </h2>
            </div>

            {loading ? (
              <div className="text-center py-10 text-muted-foreground text-xs">Carregando vistorias...</div>
            ) : surveys.length === 0 ? (
              <Card className="border-dashed p-6 text-center text-muted-foreground text-xs rounded-2xl">
                Nenhuma vistoria criada ainda. Clique em "Nova Vistoria" para criar a primeira!
              </Card>
            ) : (
              <div className="space-y-2.5">
                {surveys.map(s => {
                  const isSelected = selectedSurvey?.id === s.id
                  const questionsCount = s.questions?.length || (s as any).question ? 1 : 0
                  const respCount = s.responses?.length || 0
                  const isAllFlats = !s.flatIds || s.flatIds.length === 0 || s.flatIds.length >= flatOptions.length
                  const targetCount = isAllFlats ? flatOptions.length : s.flatIds!.length

                  return (
                    <Card 
                      key={s.id} 
                      onClick={() => setSelectedSurvey(s)}
                      className={`cursor-pointer transition-all border-2 rounded-2xl p-3.5 ${
                        isSelected 
                          ? "border-primary bg-primary/5 shadow-xs" 
                          : "border-border/60 hover:border-border bg-card"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                          {s.title}
                        </div>
                        <Badge 
                          variant={s.isActive ? "default" : "secondary"} 
                          className={`text-[10px] shrink-0 font-bold ${s.isActive ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                        >
                          {s.isActive ? "Ativa" : "Pausada"}
                        </Badge>
                      </div>

                      {s.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 font-normal">
                          {s.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {questionsCount} pergunta{questionsCount !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                          {isAllFlats ? "Todos os Flats" : `${s.flatIds?.length} Flats`}
                        </Badge>
                        <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400">
                          {respCount} / {targetCount} respondidos
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Survey Report (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedSurvey ? (
              <Card className="rounded-2xl shadow-xs border bg-card overflow-hidden">
                <CardHeader className="border-b pb-4 bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-xl font-black">{selectedSurvey.title}</CardTitle>
                        <Badge variant={selectedSurvey.isActive ? "default" : "secondary"} className={selectedSurvey.isActive ? "bg-emerald-600" : ""}>
                          {selectedSurvey.isActive ? "Ativa nos quartos" : "Pausada"}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-semibold">
                          {!selectedSurvey.flatIds || selectedSurvey.flatIds.length === 0 ? "Aplica a Todos os Flats" : `${selectedSurvey.flatIds.length} Flats Vinculados`}
                        </Badge>
                      </div>
                      {selectedSurvey.description && (
                        <CardDescription className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {selectedSurvey.description}
                        </CardDescription>
                      )}
                    </div>

                    {/* Botões de Ação da Vistoria */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleOpenEdit(selectedSurvey)}
                        className="text-xs font-semibold h-8"
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>

                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => toggleSurveyStatus(selectedSurvey.id)}
                        className="text-xs font-semibold h-8"
                      >
                        <Power className="w-3.5 h-3.5 mr-1" />
                        {selectedSurvey.isActive ? "Pausar" : "Ativar"}
                      </Button>

                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => deleteSurvey(selectedSurvey.id)}
                        className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Barra de Progresso de Execução */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-muted-foreground">Progresso dos Flats:</span>
                      <span className="text-primary font-black">{answeredCount} de {totalTargetCount} flats checados ({progressPercent}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Abas: Perguntas vs Respostas */}
                  <div className="flex gap-2 pt-3 border-t mt-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab("responses")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeTab === "responses"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Respostas por Apartamento ({selectedSurvey.responses?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("questions")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeTab === "questions"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>Perguntas Configuradas ({selectedSurvey.questions?.length || 1})</span>
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-6">
                  {/* ABA: RESPOSTAS POR APARTAMENTO */}
                  {activeTab === "responses" && (
                    <div className="space-y-6">
                      {/* Flats Pendentes de Vistoria */}
                      {pendingFlatsList.length > 0 && selectedSurvey.isActive && (
                        <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800 rounded-xl space-y-1.5">
                          <div className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Aguardando vistoria ({pendingFlatsList.length} flats pendentes):</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {pendingFlatsList.map(f => (
                              <Badge key={f.id} variant="outline" className="text-[10px] bg-background border-amber-300 text-amber-900 dark:text-amber-200">
                                Apt {f.number}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Aparecerá automaticamente para a camareira no próximo check-out ou higienização destes apartamentos.
                          </p>
                        </div>
                      )}

                      {/* Lista de Flats que já responderam */}
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Respostas Concluídas ({selectedSurvey.responses?.length || 0})</span>
                        </h3>

                        {selectedSurvey.responses && selectedSurvey.responses.length > 0 ? (
                          <div className="space-y-3">
                            {selectedSurvey.responses.map((resp: any, idx: number) => {
                              return (
                                <Card key={resp.id || idx} className="rounded-xl border shadow-2xs overflow-hidden">
                                  <div className="p-3.5 bg-muted/30 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-black text-base text-slate-900 dark:text-slate-100">
                                        Apt {resp.flatNumber}
                                      </span>
                                      <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                                        Vistoriado
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span>Camareira: <strong className="text-foreground capitalize">{resp.answeredByUsername || "Camareira"}</strong></span>
                                      <span>•</span>
                                      <span>{new Date(resp.answeredAt).toLocaleString("pt-BR")}</span>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => handleResetFlat(selectedSurvey.id, resp.flatId, resp.flatNumber)}
                                        className="h-7 text-[10px] font-bold gap-1 ml-2 text-slate-600 hover:text-primary"
                                        title="Reiniciar vistoria para este flat responder novamente"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Permitir Refazer</span>
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="p-4 space-y-3">
                                    {/* Lista de Respostas das Perguntas */}
                                    {Array.isArray(resp.answers) && resp.answers.length > 0 ? (
                                      resp.answers.map((a: any, aIdx: number) => {
                                        return (
                                          <div key={aIdx} className="p-2.5 rounded-lg bg-muted/20 border space-y-1.5">
                                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                              {aIdx + 1}. {a.questionText || "Pergunta"}
                                            </div>

                                            {/* Renderização conforme tipo */}
                                            {a.type === "yes_no" && (
                                              <Badge className={`text-xs font-bold ${a.answer === "Sim" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                                                {a.answer}
                                              </Badge>
                                            )}

                                            {a.type === "single_choice" && (
                                              <Badge variant="outline" className="text-xs font-bold text-primary border-primary/40 bg-primary/5">
                                                {a.answer}
                                              </Badge>
                                            )}

                                            {a.type === "multi_choice" && (
                                              <div className="flex flex-wrap gap-1">
                                                {Array.isArray(a.answer) && a.answer.length > 0 ? (
                                                  a.answer.map((item: string, i: number) => (
                                                    <Badge key={i} variant="secondary" className="text-xs font-semibold">
                                                      ✓ {item}
                                                    </Badge>
                                                  ))
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">{String(a.answer || "Nenhuma opção marcada")}</span>
                                                )}
                                              </div>
                                            )}

                                            {a.type === "scale" && (
                                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                                                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                                                <span>Nota {a.answer} de 5</span>
                                              </div>
                                            )}

                                            {a.type === "text" && (
                                              <p className="text-xs bg-background p-2 rounded border text-slate-700 dark:text-slate-300 font-medium">
                                                "{a.answer || "Sem observações adicionais"}"
                                              </p>
                                            )}

                                            {a.type === "photo" && (
                                              <div className="space-y-2 pt-1">
                                                {a.photoUrl ? (
                                                  <div className="flex items-start gap-3">
                                                    <div 
                                                      className="relative group cursor-pointer overflow-hidden rounded-xl border w-24 h-24 bg-black/5"
                                                      onClick={() => {
                                                        setZoomPhotoUrl(a.photoUrl)
                                                        setZoomPhotoInfo({ flatNumber: resp.flatNumber, question: a.questionText })
                                                      }}
                                                    >
                                                      <img 
                                                        src={a.photoUrl} 
                                                        alt="Foto da Vistoria" 
                                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                      />
                                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                                                        Ampliar
                                                      </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                          setZoomPhotoUrl(a.photoUrl)
                                                          setZoomPhotoInfo({ flatNumber: resp.flatNumber, question: a.questionText })
                                                        }}
                                                        className="text-xs h-7 gap-1 font-semibold"
                                                      >
                                                        <ExternalLink className="w-3 h-3" /> Ver Foto Completa
                                                      </Button>
                                                      <div>
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => handleDeletePhoto(selectedSurvey.id, resp.id, a.questionId)}
                                                          className="text-[11px] h-7 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 font-semibold"
                                                        >
                                                          <Trash2 className="w-3 h-3" /> Excluir Foto (Liberar Espaço)
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground italic">
                                                    {a.answer || "Nenhuma foto anexada"}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })
                                    ) : (
                                      // Formato legado
                                      <div className="space-y-1 text-xs">
                                        <div className="font-semibold text-muted-foreground">Resposta: <strong className="text-foreground">{resp.answer}</strong></div>
                                        {resp.notes && <div className="bg-muted p-2 rounded">Obs: {resp.notes}</div>}
                                      </div>
                                    )}
                                  </div>
                                </Card>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-2xl p-6 text-xs">
                            Nenhuma resposta coletada ainda para esta vistoria.
                            {selectedSurvey.isActive && (
                              <p className="text-primary font-medium mt-1">
                                A vistoria está ativa e aparecerá no card do quarto para a camareira.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ABA: PERGUNTAS CONFIGURADAS */}
                  {activeTab === "questions" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          As camareiras deverão responder a este questionário para liberar o apartamento:
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleOpenEdit(selectedSurvey)}
                          className="text-xs font-bold gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar Perguntas
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {(selectedSurvey.questions || []).map((q, idx) => {
                          const typeInfo = QUESTION_TYPES.find(t => t.value === q.type) || QUESTION_TYPES[0]
                          const TypeIcon = typeInfo.icon

                          return (
                            <div key={q.id || idx} className="p-3.5 rounded-xl border bg-card space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  <h4 className="font-bold text-sm text-foreground">{q.question}</h4>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge variant="outline" className="text-[10px] font-bold gap-1 text-slate-700 dark:text-slate-300">
                                    <TypeIcon className="w-3 h-3 text-primary" />
                                    <span>{typeInfo.label}</span>
                                  </Badge>
                                  {q.isRequired ? (
                                    <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold border-0">
                                      Obrigatória
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Opcional
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Exibição de Opções se houver */}
                              {(q.type === "single_choice" || q.type === "multi_choice") && q.options && q.options.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pl-7">
                                  {q.options.map((opt, oIdx) => (
                                    <Badge key={oIdx} variant="secondary" className="text-xs font-medium">
                                      {opt}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {q.type === "scale" && (
                                <div className="text-xs text-muted-foreground pl-7 font-medium">
                                  Escala de notas: 1 até 5
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Flats vinculados */}
                      <div className="pt-4 border-t space-y-2">
                        <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Flats Aplicáveis ({targetFlatsList.length} apartamentos):
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {targetFlatsList.map(f => (
                            <Badge key={f.id} variant="outline" className="text-xs font-bold">
                              Apt {f.number}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="p-12 text-center text-muted-foreground border-dashed rounded-2xl">
                Selecione uma vistoria ao lado para visualizar os detalhes e respostas.
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE VISTORIA */}
      <Dialog open={formModalOpen} onOpenChange={setFormModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitForm} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                <span>{editingSurveyId ? "Editar Vistoria" : "Nova Vistoria de Flats"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure as perguntas e selecione para quais apartamentos esta vistoria deverá ser realizada pela camareira.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {/* Nome e Descrição */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome da Vistoria *</Label>
                <Input 
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Ex: Conferir Pintura e Teto, Verificar TV e Canais, Checklist de Enxoval..."
                  className="text-xs font-semibold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Orientações / Descrição Técnica (opcional)</Label>
                <Textarea 
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Instruções para orientar a camareira durante a verificação..."
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              {/* Status Ativa */}
              <div className="flex items-center gap-2 pt-1">
                <Checkbox 
                  id="survey-active" 
                  checked={formIsActive} 
                  onCheckedChange={v => setFormIsActive(Boolean(v))} 
                />
                <Label htmlFor="survey-active" className="text-xs font-semibold cursor-pointer">
                  Vistoria Ativa (aparecerá imediatamente nos flats selecionados para higienização)
                </Label>
              </div>

              {/* SELEÇÃO DE FLATS */}
              <div className="p-3.5 bg-muted/40 rounded-xl border space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold block">Flats Aplicáveis</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {formFlatIds.length === 0 || formFlatIds.length === flatOptions.length
                        ? "Aplica-se a Todos os Flats do Hotel"
                        : `${formFlatIds.length} apartamento(s) selecionado(s)`}
                    </span>
                  </div>
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="outline" 
                    onClick={handleSelectAllFlats}
                    className="text-xs h-7"
                  >
                    {formFlatIds.length === flatOptions.length ? "Desmarcar Todos" : "Selecionar Todos"}
                  </Button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-2 bg-background border rounded-lg">
                  {flatOptions.map(f => {
                    const isChecked = formFlatIds.length === 0 || formFlatIds.includes(f.id)
                    return (
                      <div key={f.id} className="flex items-center gap-1.5">
                        <Checkbox 
                          id={`flat-sel-${f.id}`}
                          checked={isChecked}
                          onCheckedChange={() => handleToggleFlat(f.id)}
                        />
                        <Label htmlFor={`flat-sel-${f.id}`} className="text-xs font-medium cursor-pointer">
                          Apt {f.number}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* CONSTRUTOR DE PERGUNTAS */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-black text-foreground block">
                      Perguntas da Vistoria ({formQuestions.length})
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Adicione perguntas de múltipla escolha, sim/não, texto ou solicitação de foto.
                    </span>
                  </div>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleAddQuestion}
                    className="font-bold text-xs gap-1 h-8"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Pergunta
                  </Button>
                </div>

                <div className="space-y-3.5">
                  {formQuestions.map((q, idx) => {
                    return (
                      <div key={q.id || idx} className="p-3.5 bg-card border-2 rounded-2xl space-y-3 relative shadow-2xs">
                        {/* Header da Pergunta */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground font-black text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-foreground">Pergunta {idx + 1}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <Checkbox 
                                id={`req-${idx}`} 
                                checked={q.isRequired}
                                onCheckedChange={v => handleUpdateQuestion(idx, { isRequired: Boolean(v) })}
                              />
                              <Label htmlFor={`req-${idx}`} className="text-xs font-semibold cursor-pointer">
                                Obrigatória
                              </Label>
                            </div>

                            <Button 
                              type="button" 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleRemoveQuestion(idx)}
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Remover pergunta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Enunciado */}
                        <div className="space-y-1">
                          <Input 
                            value={q.question}
                            onChange={e => handleUpdateQuestion(idx, { question: e.target.value })}
                            placeholder="Ex: Como está a pintura do teto do banheiro? ou A TV está funcionando?"
                            className="text-xs font-semibold"
                            required
                          />
                        </div>

                        {/* Tipo de Pergunta */}
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-muted-foreground uppercase">Tipo de Resposta</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {QUESTION_TYPES.map(t => {
                              const isSelected = q.type === t.value
                              const Icon = t.icon
                              return (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() => handleUpdateQuestion(idx, { type: t.value as any })}
                                  className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                                    isSelected 
                                      ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs" 
                                      : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                                  }`}
                                >
                                  <Icon className="w-4 h-4 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold leading-tight">{t.label}</div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Configurações extras de Opções (para Escolha Única ou Múltipla) */}
                        {(q.type === "single_choice" || q.type === "multi_choice") && (
                          <div className="p-3 bg-muted/30 rounded-xl border space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-bold">Opções de Resposta</Label>
                              <Button 
                                type="button" 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleAddOption(idx)}
                                className="text-xs h-7 text-primary font-bold gap-1"
                              >
                                <Plus className="w-3 h-3" /> Adicionar Opção
                              </Button>
                            </div>

                            <div className="space-y-1.5">
                              {(q.options || []).map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground font-mono w-4 text-center">{oIdx + 1}.</span>
                                  <Input 
                                    value={opt}
                                    onChange={e => handleUpdateOption(idx, oIdx, e.target.value)}
                                    placeholder={`Opção ${oIdx + 1}`}
                                    className="text-xs h-8 bg-background"
                                    required
                                  />
                                  <Button 
                                    type="button" 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => handleRemoveOption(idx, oIdx)}
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {q.type === "scale" && (
                          <div className="p-2.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                            ⭐ <strong>Escala de 1 a 5:</strong> A camareira poderá avaliar escolhendo uma nota de 1 a 5 estrelas.
                          </div>
                        )}

                        {q.type === "photo" && (
                          <div className="p-2.5 bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-xl text-xs text-sky-900 dark:text-sky-200">
                            📸 <strong>Captura de Foto:</strong> A camareira poderá abrir a câmera do celular ou escolher foto da galeria. A foto é compactada automaticamente (WebP ~80KB) para não consumir dados nem armazenamento.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setFormModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="font-bold">
                {isSubmitting ? "Gravando..." : editingSurveyId ? "Salvar Alterações" : "Criar e Ativar Vistoria"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL DE ZOOM DE FOTO */}
      <Dialog open={Boolean(zoomPhotoUrl)} onOpenChange={open => !open && setZoomPhotoUrl(null)}>
        <DialogContent className="max-w-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              <span>Foto da Vistoria • Apt {zoomPhotoInfo?.flatNumber}</span>
            </DialogTitle>
            {zoomPhotoInfo?.question && (
              <DialogDescription className="text-xs">
                Pergunta: "{zoomPhotoInfo.question}"
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex items-center justify-center p-2 bg-black/5 dark:bg-black/30 rounded-2xl overflow-hidden max-h-[70vh]">
            {zoomPhotoUrl && (
              <img 
                src={zoomPhotoUrl} 
                alt="Foto Ampliada" 
                className="max-h-[65vh] w-auto object-contain rounded-xl shadow-md"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoomPhotoUrl(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
