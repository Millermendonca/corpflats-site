import { useState, useEffect } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { 
  ClipboardCheck, Plus, AlertCircle, CheckCircle2, Trash2, Power, Eye, MessageSquare 
} from "lucide-react"

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedSurvey, setSelectedSurvey] = useState<any | null>(null)

  // Form states
  const [title, setTitle] = useState("")
  const [question, setQuestion] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchSurveys = async () => {
    try {
      const res = await fetch("/api/surveys")
      const data = await res.json()
      setSurveys(data)
      if (data.length > 0 && !selectedSurvey) {
        setSelectedSurvey(data[0])
      } else if (selectedSurvey) {
        const updated = data.find((s: any) => s.id === selectedSurvey.id)
        if (updated) setSelectedSurvey(updated)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSurveys()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !question.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, question, isActive: true }),
      })
      if (res.ok) {
        setTitle("")
        setQuestion("")
        setCreateModalOpen(false)
        await fetchSurveys()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleSurveyStatus = async (id: number) => {
    await fetch(`/api/surveys/${id}/toggle`, { method: "PATCH" })
    await fetchSurveys()
  }

  const deleteSurvey = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta pesquisa?")) return
    await fetch(`/api/surveys/${id}`, { method: "DELETE" })
    if (selectedSurvey?.id === id) setSelectedSurvey(null)
    await fetchSurveys()
  }

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <ClipboardCheck className="w-8 h-8 text-primary" />
              Pesquisas & Vistorias por Flat
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie perguntas pontuais para as camareiras checarem durante a limpeza dos quartos e acompanhe as respostas.
            </p>
          </div>

          <Button 
            onClick={() => setCreateModalOpen(true)}
            className="bg-primary hover:bg-primary/90 font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Pergunta de Vistoria</span>
          </Button>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Surveys List */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Pesquisas Cadastradas</h2>
            {loading ? (
              <div className="text-center py-10 text-muted-foreground">Carregando pesquisas...</div>
            ) : surveys.length === 0 ? (
              <Card className="border-dashed p-6 text-center text-muted-foreground">
                Nenhuma pesquisa criada ainda. Clique no botão acima para criar a primeira!
              </Card>
            ) : (
              surveys.map(s => {
                const isSelected = selectedSurvey?.id === s.id
                const issuesCount = s.responses?.filter((r: any) => r.answer === "Sim").length || 0

                return (
                  <Card 
                    key={s.id} 
                    onClick={() => setSelectedSurvey(s)}
                    className={`cursor-pointer transition-all border-2 rounded-xl p-4 ${
                      isSelected 
                        ? "border-primary bg-primary/5 shadow-sm" 
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-base text-slate-900 dark:text-slate-100">{s.title}</div>
                      <Badge variant={s.isActive ? "default" : "secondary"} className={s.isActive ? "bg-emerald-600" : ""}>
                        {s.isActive ? "Ativa" : "Pausada"}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {s.question}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {s.responses?.length || 0} flats respondidos
                      </span>

                      {issuesCount > 0 && (
                        <span className="font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {issuesCount} com problema
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>

          {/* Right Column: Selected Survey Report */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Relatório e Respostas por Flat</h2>
            {selectedSurvey ? (
              <Card className="rounded-xl shadow-xs border">
                <CardHeader className="border-b pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">{selectedSurvey.title}</CardTitle>
                        <Badge variant={selectedSurvey.isActive ? "default" : "secondary"}>
                          {selectedSurvey.isActive ? "Ativa nos quartos" : "Pausada"}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">
                        Pergunta: "{selectedSurvey.question}"
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => toggleSurveyStatus(selectedSurvey.id)}
                        className="text-xs font-semibold"
                      >
                        <Power className="w-3.5 h-3.5 mr-1" />
                        {selectedSurvey.isActive ? "Pausar Pesquisa" : "Ativar Pesquisa"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => deleteSurvey(selectedSurvey.id)}
                        className="text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Status Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-slate-800 dark:text-slate-200">
                        {selectedSurvey.responses?.length || 0}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase font-bold">Flats Vistoriados</div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-emerald-600">
                        {selectedSurvey.responses?.filter((r: any) => r.answer === "Não").length || 0}
                      </div>
                      <div className="text-xs text-emerald-800 uppercase font-bold">Flats Normais</div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-rose-600">
                        {selectedSurvey.responses?.filter((r: any) => r.answer === "Sim").length || 0}
                      </div>
                      <div className="text-xs text-rose-800 uppercase font-bold">Apresentam Problema</div>
                    </div>
                  </div>

                  {/* Responses Table */}
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-primary" />
                      Lista Detalhada por Apartamento
                    </h3>

                    {selectedSurvey.responses && selectedSurvey.responses.length > 0 ? (
                      <div className="border rounded-xl overflow-hidden divide-y divide-border/60">
                        {selectedSurvey.responses.map((resp: any, idx: number) => {
                          const hasIssue = resp.answer === "Sim"
                          return (
                            <div key={idx} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              hasIssue ? "bg-rose-50/50 dark:bg-rose-950/10" : "bg-card"
                            }`}>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-base">Apt {resp.flatNumber}</span>
                                  <Badge className={hasIssue ? "bg-rose-600 text-white font-semibold" : "bg-emerald-600 text-white font-semibold"}>
                                    {hasIssue ? "Problema Detectado" : "Normal"}
                                  </Badge>
                                </div>
                                {resp.notes && (
                                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-2 rounded border border-border/40">
                                    Obs: "{resp.notes}"
                                  </p>
                                )}
                              </div>

                              <div className="text-left sm:text-right text-xs text-muted-foreground space-y-0.5">
                                <div>Respondido por: <span className="font-semibold text-foreground capitalize">{resp.answeredByUsername}</span></div>
                                <div>Em: {new Date(resp.answeredAt).toLocaleString("pt-BR")}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl p-6">
                        Nenhuma resposta coletada ainda para esta pesquisa.
                        {selectedSurvey.isActive && (
                          <p className="text-xs text-primary font-medium mt-1">
                            A pergunta está ativa e aparecerá para as camareiras nos cards dos flats a serem limpos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="p-12 text-center text-muted-foreground border-dashed">
                Selecione uma pesquisa ao lado para visualizar os resultados.
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Survey Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Nova Pergunta de Vistoria
              </DialogTitle>
              <DialogDescription>
                Crie uma checagem que será exibida no card do quarto para as camareiras responderem ao finalizar a limpeza.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="stitle" className="font-semibold text-sm">Título Resumido</Label>
                <Input 
                  id="stitle"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Barulho no Ar-Condicionado, Vazamento de Chuveiro..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="squest" className="font-semibold text-sm">Pergunta para a Camareira</Label>
                <Textarea 
                  id="squest"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Ex: O ar-condicionado está fazendo algum barulho anormal ou vazando água?"
                  className="resize-none h-20"
                  required
                />
              </div>

              <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200 rounded-lg p-3 text-xs text-sky-900 dark:text-sky-300">
                💡 <strong>Como funciona:</strong> Essa pergunta aparecerá nos cards de todos os flats a serem limpos. Uma vez que a camareira responder para um flat, o sistema salva e não pergunta de novo naquele apartamento.
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!title.trim() || !question.trim() || isSubmitting} className="font-semibold">
                {isSubmitting ? "Criando..." : "Criar e Ativar Pesquisa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Shell>
  )
}
