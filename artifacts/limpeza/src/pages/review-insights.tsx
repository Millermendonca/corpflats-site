import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Sparkles, Star, MessageSquare, AlertTriangle, CheckCircle2, 
  Wrench, ThumbsUp, TrendingUp, RefreshCw, Plus, Building2,
  Calendar, Check, ShieldCheck
} from "lucide-react"

export default function ReviewInsights() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)

  // Form states for new review import
  const [author, setAuthor] = useState("")
  const [rating, setRating] = useState("5")
  const [channel, setChannel] = useState("airbnb")
  const [flatMentioned, setFlatMentioned] = useState("")
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchReviews = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/reviews")
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.warn("Erro ao buscar avaliações:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  const handleRunAIAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch("/api/ai/analyze-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
      if (res.ok) {
        const json = await res.json()
        fetchReviews()
        alert(json.message || "Análise de IA concluída com sucesso!")
      }
    } catch (e) {
      alert("Erro ao rodar análise de IA.")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleImportReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!author.trim() || !comment.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/ai/import-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author,
          rating: Number(rating),
          channel,
          flatMentioned,
          comment
        })
      })
      if (res.ok) {
        setImportModalOpen(false)
        setAuthor("")
        setComment("")
        setFlatMentioned("")
        fetchReviews()
        // Roda IA automaticamente na nova review
        handleRunAIAnalysis()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const insights = data?.insights || {
    overallScore: 4.8,
    npsScore: 88,
    totalAnalyzed: 0,
    positivePercent: 90,
    mixedPercent: 10,
    negativePercent: 0,
    highlights: [],
    actionItems: []
  }

  const reviews = data?.reviews || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans space-y-6">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs font-bold mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Inteligência Artificial CorpFlats</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Leitor Inteligente de Avaliações & Auto-Manutenção
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            A IA processa feedbacks de todos os canais, gera ordens de serviço automáticas para quartos citados e aponta diagnósticos de melhoria contínua.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setImportModalOpen(true)}
            variant="outline"
            className="bg-slate-900 border-slate-700 text-slate-200 hover:text-white text-xs font-bold gap-2 rounded-xl h-10"
          >
            <Plus className="w-4 h-4" />
            <span>Colar Nova Avaliação</span>
          </Button>

          <Button
            disabled={analyzing}
            onClick={handleRunAIAnalysis}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-black gap-2 rounded-xl h-10 shadow-lg"
          >
            <Sparkles className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
            <span>{analyzing ? "Processando com IA..." : "⚡ Reanalisar com IA"}</span>
          </Button>
        </div>
      </header>

      {/* ── Top Metric Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Score Médio Geral</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Star className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-white font-mono">{insights.overallScore}</span>
            <span className="text-xs text-amber-400 font-bold">de 5.0 estrelas</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Baseado em {insights.totalAnalyzed} avaliações</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">NPS de Satisfação</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ThumbsUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-400 font-mono">+{insights.npsScore}</span>
            <Badge className="bg-emerald-950 text-emerald-400 text-[10px] font-bold">Zona de Excelência</Badge>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">{insights.positivePercent}% de avaliações 5 estrelas</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Auto-Tickets de Manutenção</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-rose-400 font-mono">{insights.actionItems?.length || 0}</span>
            <span className="text-xs text-slate-400">gerados pela IA</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Extraídos de menções a quartos</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Canais Monitorados</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-xl font-black text-white">Airbnb • Booking • Google</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Central unificada de reputação</span>
        </Card>
      </div>

      {/* ── Seção: Ordens de Manutenção Geradas por IA ───────────────────── */}
      {insights.actionItems?.length > 0 && (
        <Card className="bg-rose-950/20 border-rose-800/40 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Ordens de Serviço Automáticas Geradas por IA</h2>
              <p className="text-xs text-rose-300/80">
                A IA identificou problemas pontuais relatados por hóspedes e criou ordens na governança para correção imediata:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.actionItems.map((act: any, idx: number) => (
              <div key={idx} className="p-3.5 bg-slate-950/90 rounded-2xl border border-rose-900/50 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-rose-950 text-rose-300 border-rose-800 font-bold text-xs">
                    Apartamento {act.flat}
                  </Badge>
                  <span className="text-[10px] text-amber-400 font-bold uppercase">{act.status}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  {act.issue}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Grid: Destaques Globais & Lista de Avaliações ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Destaques e Síntese de IA */}
        <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-black text-white">Diagnóstico Geral da IA</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Síntese automática dos pontos mais elogiados pelos hóspedes da CorpFlats:
          </p>

          <div className="space-y-2.5">
            {insights.highlights?.map((h: string, idx: number) => (
              <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Lista de Avaliações */}
        <Card className="lg:col-span-8 bg-slate-900 border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-black text-white">Feedbacks de Hóspedes ({reviews.length})</h2>
            </div>
            <Badge variant="outline" className="text-xs text-slate-400 border-slate-700">
              Todos os canais
            </Badge>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {reviews.map((rev: any) => (
              <div key={rev.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{rev.author}</span>
                    <Badge className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">
                      {rev.channel}
                    </Badge>
                    {rev.flatMentioned && (
                      <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                        Apt {rev.flatMentioned}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(rev.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  "{rev.comment}"
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                  <span>Data: {rev.date}</span>
                  {rev.maintenanceGenerated && (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> Auto-Ticket Criado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Modal: Colar Nova Avaliação ──────────────────────────────────── */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-white">
          <form onSubmit={handleImportReview}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Plus className="w-5 h-5 text-purple-400" />
                Importar Avaliação Externa
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Cole a avaliação recebida do Airbnb, Booking ou Google para que a IA processe.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nome do Hóspede</Label>
                  <Input 
                    value={author} 
                    onChange={e => setAuthor(e.target.value)} 
                    required 
                    placeholder="Ex: Carlos Santana" 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-slate-300">Canal</Label>
                  <select
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white"
                  >
                    <option value="airbnb">🔴 Airbnb</option>
                    <option value="booking">🔵 Booking.com</option>
                    <option value="google">🟢 Google Reviews</option>
                    <option value="site">🌐 Site CorpFlats</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nota (1 a 5 estrelas)</Label>
                  <select
                    value={rating}
                    onChange={e => setRating(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-bold"
                  >
                    <option value="5">⭐⭐⭐⭐⭐ (5 Estrelas)</option>
                    <option value="4">⭐⭐⭐⭐ (4 Estrelas)</option>
                    <option value="3">⭐⭐⭐ (3 Estrelas)</option>
                    <option value="2">⭐⭐ (2 Estrelas)</option>
                    <option value="1">⭐ (1 Estrela)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-slate-300">Flat Citado (Opcional)</Label>
                  <Input 
                    value={flatMentioned} 
                    onChange={e => setFlatMentioned(e.target.value)} 
                    placeholder="Ex: 304, 1017" 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Comentário Completo do Hóspede</Label>
                <Textarea 
                  value={comment} 
                  onChange={e => setComment(e.target.value)} 
                  required 
                  rows={4} 
                  placeholder="Cole aqui o texto exato escrito pelo hóspede..." 
                  className="bg-slate-950 border-slate-700 text-xs leading-relaxed" 
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs">
                {submitting ? "Importando..." : "Importar e Processar IA"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
