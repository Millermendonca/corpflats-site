import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Sparkles, Star, MessageSquare, AlertTriangle, CheckCircle2,
  Wrench, ThumbsUp, TrendingUp, RefreshCw, Plus, Building2,
  Calendar, Check, ShieldCheck, MessageCircle, Filter,
  Heart, Frown, Meh, Smile, BarChart3, Phone, ChevronRight,
  Shield, Target, Activity, Zap, Eye, TrendingDown, Users, Trash2,
  ClipboardList, RotateCcw, Save
} from "lucide-react"

// ── helpers ──
function toneColor(tone: string) {
  if (tone === "positive") return "text-emerald-400"
  if (tone === "negative") return "text-rose-400"
  return "text-amber-400"
}
function toneBg(tone: string) {
  if (tone === "positive") return "bg-emerald-950/40 border-emerald-800/40"
  if (tone === "negative") return "bg-rose-950/40 border-rose-800/40"
  return "bg-amber-950/30 border-amber-800/30"
}
function toneLabel(tone: string) {
  if (tone === "positive") return "Positivo"
  if (tone === "negative") return "Negativo"
  return "Neutro"
}
function ToneIcon({ tone, className = "w-4 h-4" }: { tone: string; className?: string }) {
  if (tone === "positive") return <Smile className={`${className} text-emerald-400`} />
  if (tone === "negative") return <Frown className={`${className} text-rose-400`} />
  return <Meh className={`${className} text-amber-400`} />
}
function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-500 text-xs">•</span>
  const color = score >= 70 ? "text-emerald-400" : score >= 45 ? "text-amber-400" : "text-rose-400"
  return <span className={`font-black font-mono text-lg ${color}`}>{score}<span className="text-xs font-normal text-slate-500">/100</span></span>
}
function NpsScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <Badge className="bg-slate-800 text-slate-400 text-xs">Aguardando</Badge>
  if (score === 5) return <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs font-bold">⭐⭐⭐⭐⭐ Promotor</Badge>
  if (score === 4) return <Badge className="bg-sky-950 text-sky-300 border-sky-800 text-xs font-bold">⭐⭐⭐⭐ Satisfeito</Badge>
  if (score === 3) return <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-xs font-bold">⭐⭐⭐ Neutro</Badge>
  if (score === 2) return <Badge className="bg-orange-950 text-orange-300 border-orange-800 text-xs font-bold">⭐⭐ Insatisfeito</Badge>
  return <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-xs font-bold">⭐ Detrator</Badge>
}

const NPS_TEMPLATE_IDS = [
  "tpl_post_checkout_review",
  "tpl_nps_score_4",
  "tpl_nps_score_3",
  "tpl_nps_score_2",
  "tpl_nps_score_1",
  "tpl_nps_feedback_thanks"
]

const NPS_TEMPLATE_META: Record<string, { badge: string; badgeClass: string; subtitle: string }> = {
  tpl_post_checkout_review: {
    badge: "⭐⭐⭐⭐⭐ Nota 5",
    badgeClass: "bg-emerald-950 text-emerald-300 border-emerald-800",
    subtitle: "Enviada automaticamente quando o hóspede responde 5 (com link de avaliação no Google)"
  },
  tpl_nps_score_4: {
    badge: "⭐⭐⭐⭐ Nota 4",
    badgeClass: "bg-sky-950 text-sky-300 border-sky-800",
    subtitle: "Enviada quando o hóspede responde 4 — agradece e convida a contar o que faltou para ser 5 estrelas"
  },
  tpl_nps_score_3: {
    badge: "⭐⭐⭐ Nota 3",
    badgeClass: "bg-amber-950 text-amber-300 border-amber-800",
    subtitle: "Enviada quando o hóspede responde 3 — convida a digitar sugestões de melhoria"
  },
  tpl_nps_score_2: {
    badge: "⭐⭐ Nota 2",
    badgeClass: "bg-orange-950 text-orange-300 border-orange-800",
    subtitle: "Enviada quando o hóspede responde 2 — pede desculpas e pergunta o que aconteceu para correção"
  },
  tpl_nps_score_1: {
    badge: "⭐ Nota 1",
    badgeClass: "bg-rose-950 text-rose-300 border-rose-800",
    subtitle: "Enviada quando o hóspede responde 1 — acolhimento prioritário da gerência perguntando o ocorrido"
  },
  tpl_nps_feedback_thanks: {
    badge: "🙏 Pós-Comentário (1 a 4)",
    badgeClass: "bg-purple-950 text-purple-300 border-purple-800",
    subtitle: "Enviada assim que o hóspede (nota 1 a 4) termina de digitar sua sugestão/explicação"
  }
}

// ── main component ──
export default function ReviewInsights() {
  const [activeTab, setActiveTab] = useState("overview")

  // Dados de avaliações existentes
  const [reviewsData, setReviewsData] = useState<any | null>(null)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Dados de sentimento WhatsApp
  const [sentimentOverview, setSentimentOverview] = useState<any | null>(null)
  const [wppSentiments, setWppSentiments] = useState<any[]>([])
  const [loadingSentiment, setLoadingSentiment] = useState(false)
  const [analyzingWpp, setAnalyzingWpp] = useState(false)

  // Dados NPS
  const [npsResponses, setNpsResponses] = useState<any[]>([])
  const [npsFilter, setNpsFilter] = useState("all")
  const [loadingNps, setLoadingNps] = useState(false)

  // Resumo de Melhorias a Fazer (Notas 1 a 4)
  const [improvementsSummary, setImprovementsSummary] = useState<any | null>(null)
  const [loadingImprovements, setLoadingImprovements] = useState(false)
  const [refreshingImprovements, setRefreshingImprovements] = useState(false)
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null)
  const [improvementStatusFilter, setImprovementStatusFilter] = useState<"pending" | "resolved" | "all">("pending")

  // Templates de mensagens por nota (1 a 5 + agradecimento)
  const [npsTemplates, setNpsTemplates] = useState<any[]>([])
  const [editingTplMessages, setEditingTplMessages] = useState<Record<string, string>>({})
  const [savingTplId, setSavingTplId] = useState<string | null>(null)

  // Filtros de reviews
  const [reviewFilter, setReviewFilter] = useState({ tone: "all", channel: "all", rating: "all" })

  // Modal importar review
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [author, setAuthor] = useState("")
  const [rating, setRating] = useState("5")
  const [channel, setChannel] = useState("airbnb")
  const [flatMentioned, setFlatMentioned] = useState("")
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Modal NPS manual
  const [npsModalOpen, setNpsModalOpen] = useState(false)
  const [npsPhone, setNpsPhone] = useState("")
  const [npsGuestName, setNpsGuestName] = useState("")
  const [npsScore, setNpsScore] = useState("5")
  const [npsComment, setNpsComment] = useState("")
  const [npsReservationId, setNpsReservationId] = useState("")
  const [submittingNps, setSubmittingNps] = useState(false)

  // ── fetchers ──
  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true)
    try {
      const res = await fetch("/api/ai/reviews")
      if (res.ok) setReviewsData(await res.json())
    } catch { } finally { setLoadingReviews(false) }
  }, [])

  const fetchImprovementsSummary = useCallback(async () => {
    setLoadingImprovements(true)
    try {
      const res = await fetch("/api/ai/improvements-summary")
      if (res.ok) {
        const data = await res.json()
        setImprovementsSummary(data.improvements || data.improvementsSummary || null)
      }
    } catch { } finally { setLoadingImprovements(false) }
  }, [])

  const fetchNpsTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/templates")
      if (res.ok) {
        const all: any[] = await res.json()
        const filtered = NPS_TEMPLATE_IDS
          .map(id => all.find(t => t.id === id))
          .filter(Boolean)
        setNpsTemplates(filtered)
        const initialMap: Record<string, string> = {}
        filtered.forEach(t => {
          initialMap[t.id] = t.message || ""
        })
        setEditingTplMessages(initialMap)
      }
    } catch { }
  }, [])

  const fetchSentimentOverview = useCallback(async () => {
    setLoadingSentiment(true)
    try {
      const res = await fetch("/api/ai/sentiment/overview")
      if (res.ok) {
        const d = await res.json()
        setSentimentOverview(d)
        if (d.improvements || d.improvementsSummary) {
          setImprovementsSummary(d.improvements || d.improvementsSummary)
        }
      }
      const wppRes = await fetch("/api/ai/sentiment/whatsapp")
      if (wppRes.ok) { const d = await wppRes.json(); setWppSentiments(d.sentiments || []) }
    } catch { } finally { setLoadingSentiment(false) }
  }, [])

  const fetchNps = useCallback(async (filter = "all") => {
    setLoadingNps(true)
    try {
      const url = filter === "all" ? "/api/ai/nps-responses" : `/api/ai/nps-responses?result=${filter}`
      const res = await fetch(url)
      if (res.ok) { const d = await res.json(); setNpsResponses(d.npsResponses || []) }
    } catch { } finally { setLoadingNps(false) }
  }, [])

  useEffect(() => {
    fetchReviews()
    fetchSentimentOverview()
    fetchNps("all")
    fetchImprovementsSummary()
    fetchNpsTemplates()
  }, [])
  useEffect(() => { fetchNps(npsFilter) }, [npsFilter])

  // ── actions ──
  const handleRefreshImprovements = async () => {
    setRefreshingImprovements(true)
    try {
      const res = await fetch("/api/ai/improvements-summary/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.improvements || data.improvementsSummary) {
          setImprovementsSummary(data.improvements || data.improvementsSummary)
        }
      }
    } catch { } finally { setRefreshingImprovements(false) }
  }

  const handleToggleImprovementStatus = async (itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "resolved" ? "pending" : "resolved"
    setTogglingItemId(itemId)
    try {
      const res = await fetch(`/api/ai/improvements-summary/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.improvements || data.improvementsSummary) {
          setImprovementsSummary(data.improvements || data.improvementsSummary)
        }
      }
    } catch { } finally { setTogglingItemId(null) }
  }

  const handleSaveNpsTemplate = async (tpl: any) => {
    const newMsg = editingTplMessages[tpl.id]
    if (typeof newMsg !== "string" || !newMsg.trim()) return
    setSavingTplId(tpl.id)
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tpl, message: newMsg })
      })
      if (res.ok) {
        setNpsTemplates(prev => prev.map(item => item.id === tpl.id ? { ...item, message: newMsg } : item))
      } else {
        alert("Erro ao salvar mensagem do template.")
      }
    } catch {
      alert("Erro de conexão ao salvar mensagem.")
    } finally {
      setSavingTplId(null)
    }
  }

  const handleRunAIAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch("/api/ai/analyze-reviews", { method: "POST", headers: { "Content-Type": "application/json" } })
      if (res.ok) {
        const data = await res.json()
        await Promise.all([fetchReviews(), fetchSentimentOverview(), fetchImprovementsSummary()])
        if (data.message) {
          alert(data.message)
        }
      } else {
        alert("Erro ao executar análise de avaliações.")
      }
    } catch (err: any) {
      alert("Erro de conexão ao analisar avaliações: " + err.message)
    } finally { setAnalyzing(false) }
  }

  const handleAnalyzeWpp = async () => {
    setAnalyzingWpp(true)
    try {
      const res = await fetch("/api/ai/sentiment/analyze-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      })
      if (res.ok) {
        const data = await res.json()
        await Promise.all([fetchSentimentOverview(), fetchReviews()])
        if (data.analyzed === 0) {
          alert("Nenhuma nova mensagem de hóspede encontrada para analisar.")
        } else {
          alert(`Análise concluída com sucesso! ${data.analyzed} conversa(s) de hóspedes processada(s) pela IA.`)
        }
      } else {
        alert("Erro ao executar análise de conversas WhatsApp.")
      }
    } catch (err: any) {
      alert("Erro de conexão ao analisar conversas: " + err.message)
    } finally {
      setAnalyzingWpp(false)
    }
  }

  const handleAnalyzeSingleReview = async (reviewId: number) => {
    try {
      await fetch(`/api/ai/reviews/${reviewId}/analyze-sentiment`, { method: "POST", headers: { "Content-Type": "application/json" } })
      fetchReviews()
    } catch { }
  }

  const handleClearTestData = async () => {
    if (!window.confirm("Deseja realmente excluir todos os dados de teste (avaliações simuladas, sentimento e tickets automáticos de teste)?")) {
      return
    }
    setClearing(true)
    try {
      const res = await fetch("/api/ai/clear-test-data", { method: "POST" })
      if (res.ok) {
        await Promise.all([fetchReviews(), fetchSentimentOverview(), fetchNps("all"), fetchImprovementsSummary()])
      }
    } catch { } finally {
      setClearing(false)
    }
  }

  const handleImportReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!author.trim() || !comment.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/ai/import-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, rating: Number(rating), channel, flatMentioned, comment })
      })
      if (res.ok) {
        setImportModalOpen(false); setAuthor(""); setComment(""); setFlatMentioned("")
        fetchReviews(); fetchImprovementsSummary(); handleRunAIAnalysis()
      }
    } finally { setSubmitting(false) }
  }

  const handleSubmitNps = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!npsGuestName.trim() && !npsPhone.trim()) return
    setSubmittingNps(true)
    try {
      const res = await fetch("/api/ai/nps-response", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestPhone: npsPhone, guestName: npsGuestName, score: Number(npsScore), comment: npsComment, reservationId: npsReservationId || undefined })
      })
      if (res.ok) {
        setNpsModalOpen(false); setNpsPhone(""); setNpsGuestName(""); setNpsComment(""); setNpsScore("5"); setNpsReservationId("")
        fetchNps(npsFilter); fetchSentimentOverview(); fetchImprovementsSummary()
      }
    } finally { setSubmittingNps(false) }
  }

  // ── computed ──
  const insights = reviewsData?.insights || { overallScore: 0, npsScore: 0, totalAnalyzed: 0, positivePercent: 0, highlights: [], actionItems: [] }
  const reviews = reviewsData?.reviews || []

  const filteredReviews = reviews.filter((r: any) => {
    if (reviewFilter.tone !== "all" && r.sentiment !== reviewFilter.tone) return false
    if (reviewFilter.channel !== "all" && r.channel !== reviewFilter.channel) return false
    if (reviewFilter.rating !== "all" && String(r.rating) !== reviewFilter.rating) return false
    return true
  })

  const nps = sentimentOverview?.nps || {}
  const wpp = sentimentOverview?.whatsapp || {}

  const impItems: any[] = improvementsSummary?.items || []
  const pendingImpItems = impItems.filter(i => i.status !== "resolved")
  const resolvedImpItems = impItems.filter(i => i.status === "resolved")
  const visibleImpItems = improvementStatusFilter === "pending"
    ? pendingImpItems
    : improvementStatusFilter === "resolved"
      ? resolvedImpItems
      : impItems
  const recentSub5Feedbacks: any[] = improvementsSummary?.recentFeedbacks || []

  // ── render ──
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-950/95 sticky top-0 z-10 px-4 sm:px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs font-bold mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>IA de Sentimento — CorpFlats</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Análise de Sentimento de Hóspedes</h1>
            <p className="text-xs text-slate-400 mt-0.5">Feedbacks, tom de voz WhatsApp, filtro NPS por nota (1 a 5) e resumo contínuo de melhorias</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={clearing}
              onClick={handleClearTestData}
              variant="outline"
              className="bg-rose-950/30 border-rose-800/40 text-rose-300 hover:bg-rose-900/50 hover:text-white text-xs font-bold gap-1.5 rounded-xl h-9"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearing ? "Limpando..." : "Excluir Dados de Teste"}
            </Button>
            <Button onClick={() => setImportModalOpen(true)} variant="outline" className="bg-slate-900 border-slate-700 text-slate-200 hover:text-white text-xs font-bold gap-1.5 rounded-xl h-9">
              <Plus className="w-3.5 h-3.5" />Colar Avaliação
            </Button>
            <Button disabled={analyzing} onClick={handleRunAIAnalysis} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-black gap-1.5 rounded-xl h-9">
              <Sparkles className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
              {analyzing ? "Analisando..." : "Reanalisar com IA"}
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8 py-6 space-y-6">
        {/* ── Top KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Score Avaliações</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center"><Star className="w-3.5 h-3.5 text-amber-400" /></div>
            </div>
            <div className="flex items-baseline gap-1.5">
              {(insights.totalAnalyzed || reviews.length) > 0 && insights.overallScore > 0 ? (
                <>
                  <span className="text-2xl font-black text-white font-mono">{insights.overallScore}</span>
                  <span className="text-xs text-amber-400 font-bold">/ 5</span>
                </>
              ) : (
                <span className="text-sm text-slate-500 font-bold">Sem dados</span>
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              {(insights.totalAnalyzed || reviews.length) > 0 ? `${insights.totalAnalyzed || reviews.length} avaliações analisadas` : "Nenhuma avaliação cadastrada"}
            </span>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tom WhatsApp</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center"><MessageCircle className="w-3.5 h-3.5 text-emerald-400" /></div>
            </div>
            <div className="flex items-baseline gap-1.5">
              {wpp.avgScore != null
                ? <><span className={`text-2xl font-black font-mono ${wpp.avgScore >= 70 ? "text-emerald-400" : wpp.avgScore >= 45 ? "text-amber-400" : "text-rose-400"}`}>{wpp.avgScore}</span><span className="text-xs text-slate-400 font-bold">/100</span></>
                : <span className="text-sm text-slate-500">Sem dados</span>}
            </div>
            <span className="text-[10px] text-slate-500">{wpp.analyzed || 0} conversas analisadas</span>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Filtro Google NPS</span>
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-sky-400" /></div>
            </div>
            <div className="flex items-baseline gap-1.5">
              {nps.filterRate != null
                ? <span className="text-2xl font-black text-sky-400 font-mono">{nps.filterRate}%</span>
                : <span className="text-sm text-slate-500">Sem dados</span>}
            </div>
            <span className="text-[10px] text-slate-500">{nps.googleLinkSent || 0} links Google enviados</span>
          </Card>

          <Card
            onClick={() => setActiveTab("improvements")}
            className="bg-slate-900 border-amber-800/40 hover:border-amber-600/60 cursor-pointer transition-colors rounded-2xl p-4 shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">Melhorias a Fazer (&lt; 5⭐)</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center"><ClipboardList className="w-3.5 h-3.5 text-amber-400" /></div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-400 font-mono">{pendingImpItems.length}</span>
              <span className="text-xs text-slate-400">pendentes</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {improvementsSummary?.totalFeedbacksAnalyzed || improvementsSummary?.totalWrittenSub5 || 0} respostas digitadas (notas 1-4)
            </span>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="overview" className="text-xs font-bold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Visão Geral
            </TabsTrigger>
            <TabsTrigger value="improvements" className="text-xs font-bold rounded-lg data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <ClipboardList className="w-3.5 h-3.5 mr-1.5" />Melhorias a Fazer (Notas 1-4)
              {pendingImpItems.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-700 text-[10px] font-black">
                  {pendingImpItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="nps" className="text-xs font-bold rounded-lg data-[state=active]:bg-sky-700 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <Shield className="w-3.5 h-3.5 mr-1.5" />Filtro Google NPS & Msgs (1-5)
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="text-xs font-bold rounded-lg data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />Sentimento WhatsApp
            </TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs font-bold rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <Star className="w-3.5 h-3.5 mr-1.5" />Feedbacks
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="text-xs font-bold rounded-lg data-[state=active]:bg-rose-700 data-[state=active]:text-white text-slate-400 px-3 py-1.5">
              <Wrench className="w-3.5 h-3.5 mr-1.5" />Manutenção IA
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: VISÃO GERAL ── */}
          <TabsContent value="overview" className="space-y-5 mt-4">
            {/* Resumo Executivo de Melhorias a Fazer (Notas 1 a 4) */}
            <Card className="bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border-amber-800/40 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <ClipboardList className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black text-white">Resumo de Melhorias a Fazer (Notas 1 a 4)</h2>
                      <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                        {pendingImpItems.length} pendente(s) · {resolvedImpItems.length} concluída(s)
                      </Badge>
                      <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-800 text-[10px]">
                        📲 Alerta WhatsApp Gerência: (22) 99850-5276
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-line">
                      {improvementsSummary?.executiveSummary || "Nenhuma sugestão de melhoria pendente no momento. Todas as respostas digitadas por hóspedes que avaliam com nota 1 a 4 são consolidadas automaticamente aqui."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={refreshingImprovements}
                    onClick={handleRefreshImprovements}
                    className="h-8 text-xs bg-slate-900 border-slate-700 text-slate-200 hover:text-white rounded-xl gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingImprovements ? "animate-spin" : ""}`} />
                    Atualizar Resumo
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setActiveTab("improvements")}
                    className="h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl gap-1"
                  >
                    Gerenciar Melhorias
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {pendingImpItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-slate-800/80">
                  {pendingImpItems.slice(0, 4).map((item: any) => {
                    const count = item.mentionsCount ?? item.occurrences ?? 1
                    const latestQuote = item.quotes?.[0]?.comment || item.latestComment || item.summary || ""
                    const latestGuest = item.quotes?.[0]?.guestName || item.latestGuestName || "Hóspede"
                    const flatsArr: string[] = item.flats || (item.flatNumber ? [item.flatNumber] : [])
                    return (
                      <div key={item.id} className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-amber-300">{item.category || item.label}: {item.title}</span>
                            {flatsArr.length > 0 && (
                              <Badge className="bg-slate-800 text-slate-200 text-[10px] font-bold">Flat {flatsArr.join(", ")}</Badge>
                            )}
                            <Badge className="bg-rose-950/80 text-rose-300 border-rose-800 text-[10px]">
                              {count}x relato(s) · mín {item.minScore}⭐
                            </Badge>
                          </div>
                          {latestQuote && <p className="text-xs text-slate-300 line-clamp-2 italic">"{latestQuote}"</p>}
                          <p className="text-[10px] text-slate-500">Último relato: {latestGuest}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={togglingItemId === item.id}
                          onClick={() => handleToggleImprovementStatus(item.id, item.status)}
                          className="h-7 px-2.5 text-[10px] font-bold bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60 hover:text-white shrink-0 rounded-lg"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Concluir
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2"><Users className="w-3.5 h-3.5" />Funil de Sentimento WPP</h3>
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-emerald-400 font-bold">😊 Positivos</span><span className="text-emerald-400 font-mono font-bold">{wpp.positive || 0}</span></div>
                    <Progress value={wpp.analyzed > 0 ? (wpp.positive / wpp.analyzed) * 100 : 0} className="h-1.5 bg-slate-800 [&>div]:bg-emerald-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-amber-400 font-bold">😐 Neutros</span><span className="text-amber-400 font-mono font-bold">{wpp.neutral || 0}</span></div>
                    <Progress value={wpp.analyzed > 0 ? (wpp.neutral / wpp.analyzed) * 100 : 0} className="h-1.5 bg-slate-800 [&>div]:bg-amber-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-rose-400 font-bold">😤 Negativos</span><span className="text-rose-400 font-mono font-bold">{wpp.negative || 0}</span></div>
                    <Progress value={wpp.analyzed > 0 ? (wpp.negative / wpp.analyzed) * 100 : 0} className="h-1.5 bg-slate-800 [&>div]:bg-rose-500" />
                  </div>
                </div>
              </Card>

              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2"><Target className="w-3.5 h-3.5" />Funil Google NPS</h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    { label: "Pesquisas enviadas", val: nps.sent || 0, color: "text-slate-300" },
                    { label: "Responderam", val: nps.responded || 0, color: "text-sky-300" },
                    { label: "Nota 5 — Promotores ⭐", val: nps.promoters || 0, color: "text-emerald-400" },
                    { label: "Nota 3-4 — Neutros", val: nps.neutrals || 0, color: "text-amber-400" },
                    { label: "Nota 1-2 — Detratores", val: nps.detractors || 0, color: "text-rose-400" },
                    { label: "Link Google enviado ✓", val: nps.googleLinkSent || 0, color: "text-purple-400" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-slate-400">{label}</span>
                      <span className={`font-black font-mono ${color}`}>{val}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-rose-400" />Top Pontos Negativos</h3>
                {sentimentOverview?.topNegativeKeywords?.length > 0 ? (
                  <div className="space-y-1.5">
                    {(() => {
                      const deduplicated: { word: string; count: number }[] = []
                      for (const kw of sentimentOverview.topNegativeKeywords) {
                        const cleanWord = (kw.word || "").replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "").toLowerCase()
                        if (!cleanWord || cleanWord.length < 3) continue
                        const existing = deduplicated.find(d => d.word.toLowerCase() === cleanWord)
                        if (existing) {
                          existing.count += kw.count
                        } else {
                          deduplicated.push({ word: cleanWord, count: kw.count })
                        }
                      }
                      return deduplicated.sort((a, b) => b.count - a.count).map((kw: any) => (
                        <div key={kw.word} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 capitalize">{kw.word}</span>
                          <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold">{kw.count}x</Badge>
                        </div>
                      ))
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Sem palavras-chave negativas identificadas. Rode a análise de IA!</p>
                )}
              </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h2 className="text-base font-black text-white">Diagnóstico Geral da IA</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {insights.highlights?.length > 0 ? insights.highlights.map((h: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-200">{h}</span>
                  </div>
                )) : (
                  <p className="text-xs text-slate-500 col-span-2 italic">
                    {reviews.length === 0
                      ? "Nenhuma avaliação cadastrada no sistema. Importe avaliações reais de hóspedes para que a IA gere destaques com base em dados verídicos."
                      : "Nenhum ponto de destaque positivo identificado nas avaliações atuais."}
                  </p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ── TAB: MELHORIAS A FAZER (NOTAS 1 A 4) ── */}
          <TabsContent value="improvements" className="space-y-5 mt-4">
            <Card className="bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-800/40 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardList className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-black text-white">Resumo Contínuo de Melhorias a Fazer (Notas 1 a 4)</h2>
                    <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                      📲 Alerta automático WhatsApp: (22) 99850-5276
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Toda vez que um hóspede avalia com nota <strong>1, 2, 3 ou 4</strong> e digita o que pode ser melhorado, o sistema agradece o hóspede, classifica a melhoria, atualiza este resumo executivo e envia um alerta no seu WhatsApp com o relato e a lista atualizada de pendências.
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-800/30 mt-2">
                    <p className="text-[11px] font-bold text-amber-300 mb-0.5">📌 Síntese Executiva Atual:</p>
                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                      {improvementsSummary?.executiveSummary || "Nenhuma melhoria pendente registrada até o momento."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    size="sm"
                    disabled={refreshingImprovements}
                    onClick={handleRefreshImprovements}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-xl gap-1.5 h-9"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingImprovements ? "animate-spin" : ""}`} />
                    {refreshingImprovements ? "Recalculando..." : "Atualizar Resumo Agora"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNpsModalOpen(true)}
                    className="bg-slate-900 border-slate-700 text-slate-200 hover:text-white text-xs rounded-xl h-8"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Simular / Registrar Nota 1-4
                  </Button>
                </div>
              </div>
            </Card>

            {/* Filtros de Status das Melhorias */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white">Plano de Ação & Melhorias Consolidadas</h3>
                <Badge className="bg-slate-800 text-slate-300 text-[10px]">
                  {visibleImpItems.length} item(ns)
                </Badge>
              </div>
              <div className="flex rounded-xl overflow-hidden border border-slate-700">
                {[
                  { val: "pending", label: `🛠️ Pendentes (${pendingImpItems.length})` },
                  { val: "resolved", label: `✅ Concluídas (${resolvedImpItems.length})` },
                  { val: "all", label: `📋 Todas (${impItems.length})` },
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setImprovementStatusFilter(opt.val as any)}
                    className={`text-xs font-bold px-3 py-1.5 transition-colors ${improvementStatusFilter === opt.val ? "bg-amber-600 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {loadingImprovements ? (
              <div className="text-center py-10 text-slate-500 text-sm">Carregando resumo de melhorias...</div>
            ) : visibleImpItems.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-10 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-300">
                  {improvementStatusFilter === "pending"
                    ? "Nenhuma melhoria pendente no momento!"
                    : "Nenhum item encontrado neste filtro."}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Quando um hóspede avaliar com nota 1 a 4 e responder no WhatsApp o que pode melhorar, o ponto de atenção aparecerá automaticamente aqui.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {visibleImpItems.map((item: any) => {
                  const isResolved = item.status === "resolved"
                  const isHighPriority = item.priority === "alta" || (item.minScore != null && item.minScore <= 2) || (item.mentionsCount ?? 1) >= 2
                  const count = item.mentionsCount ?? item.occurrences ?? 1
                  const quotesList = item.quotes || item.sampleQuotes || []
                  const flatsList: string[] = item.flats || (item.flatNumber ? [item.flatNumber] : [])
                  return (
                    <Card
                      key={item.id}
                      className={`rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                        isResolved
                          ? "bg-slate-900/50 border-emerald-900/40 opacity-80"
                          : isHighPriority
                            ? "bg-rose-950/15 border-rose-900/40"
                            : "bg-slate-900 border-amber-900/40"
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-slate-800 text-amber-300 border-slate-700 text-[10px] font-bold">
                                {item.category || "Melhoria"}
                              </Badge>
                              {flatsList.length > 0 && (
                                <Badge className="bg-amber-950 text-amber-200 border-amber-800 text-[10px] font-bold">
                                  Flat(s) {flatsList.join(", ")}
                                </Badge>
                              )}
                              {isResolved ? (
                                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                                  ✓ Resolvida
                                </Badge>
                              ) : (
                                <Badge className={isHighPriority ? "bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold" : "bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold"}>
                                  {isHighPriority ? "🔥 Prioridade Alta" : "⚡ Prioridade Média"}
                                </Badge>
                              )}
                              <Badge className="bg-slate-800 text-slate-300 text-[10px]">
                                {count}x menção(ões) · Nota mín: {item.minScore}⭐
                              </Badge>
                            </div>
                            <p className="text-sm font-black text-white">{item.title}</p>
                            {item.actionSuggestion && (
                              <p className="text-[11px] text-slate-400">💡 {item.actionSuggestion}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {quotesList.slice(0, 4).map((q: any, qIdx: number) => (
                            <div key={qIdx} className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 text-xs">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                <span className="font-bold text-slate-200">
                                  {q.guestName} {q.flatNumber ? `· Flat ${q.flatNumber}` : ""}
                                </span>
                                <span className="text-amber-400 font-bold">Nota {q.score}⭐</span>
                              </div>
                              <p className="text-slate-300 italic leading-relaxed">"{q.comment}"</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                        <span className="text-[10px] text-slate-500">
                          Atualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("pt-BR") : "—"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={togglingItemId === item.id}
                          onClick={() => handleToggleImprovementStatus(item.id, item.status)}
                          className={`h-8 text-xs font-bold rounded-xl gap-1.5 ${
                            isResolved
                              ? "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                              : "bg-emerald-950/50 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60 hover:text-white"
                          }`}
                        >
                          {isResolved ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              Reabrir Pendência
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Marcar como Resolvida
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Lista de Respostas Digitadas (Notas 1 a 4) */}
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-400" />
                    Histórico de Respostas Digitadas por Quem Avaliou de 1 a 4 ({recentSub5Feedbacks.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Textos exatos enviados pelos hóspedes no WhatsApp ou avaliações após darem nota inferior a 5.
                  </p>
                </div>
              </div>

              {recentSub5Feedbacks.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4">
                  Nenhuma resposta escrita de nota 1 a 4 registrada até o momento.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {recentSub5Feedbacks.map((fb: any) => (
                    <div key={fb.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-white">{fb.guestName}</span>
                          {fb.flatNumber && <Badge className="bg-slate-800 text-slate-300 text-[10px]">Flat {fb.flatNumber}</Badge>}
                          <NpsScoreBadge score={fb.score} />
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {(fb.date || fb.createdAt) ? new Date(fb.date || fb.createdAt).toLocaleDateString("pt-BR") : "—"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 italic leading-relaxed">"{fb.comment}"</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── TAB 2: SENTIMENTO WHATSAPP ── */}
          <TabsContent value="whatsapp" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-400" />Análise de Tom de Voz — WhatsApp</h2>
                <p className="text-xs text-slate-400 mt-0.5">A IA analisa o conteúdo das mensagens recebidas dos hóspedes e calcula o sentimento de cada conversa.</p>
              </div>
              <Button onClick={handleAnalyzeWpp} disabled={analyzingWpp} className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black gap-1.5 rounded-xl h-9">
                <Sparkles className={`w-3.5 h-3.5 ${analyzingWpp ? "animate-spin" : ""}`} />
                {analyzingWpp ? "Analisando..." : "Analisar Conversas com IA"}
              </Button>
            </div>

            {loadingSentiment ? (
              <div className="text-center py-12 text-slate-500 text-sm">Carregando análises...</div>
            ) : wppSentiments.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-10 text-center">
                <MessageCircle className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">Nenhuma análise de sentimento ainda</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Clique em "Analisar Conversas com IA" para processar o histórico de mensagens WhatsApp dos hóspedes.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wppSentiments.map((s: any) => (
                  <Card key={s.id} className={`border rounded-2xl p-4 space-y-3 ${toneBg(s.overallTone)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <ToneIcon tone={s.overallTone} className="w-5 h-5" />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-black text-white">{s.guestName}</p>
                            {s.hasMaintenanceTicket && (
                              <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[9px] font-bold">⚠️ Ticket IA</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">{s.guestPhone} {s.flatNumber ? `— Flat ${s.flatNumber}` : ""}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <ScoreBadge score={s.overallScore} />
                        <p className={`text-[10px] font-bold ${toneColor(s.overallTone)}`}>{toneLabel(s.overallTone)}</p>
                      </div>
                    </div>
                    {s.summary && (
                      <p className="text-xs text-slate-300 leading-relaxed italic border-l-2 border-slate-700 pl-2.5">{s.summary}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {s.positiveKeywords?.slice(0, 4).map((kw: string) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-emerald-950/60 text-emerald-300 rounded-md font-bold border border-emerald-900/50">+{kw}</span>
                      ))}
                      {s.negativeKeywords?.slice(0, 4).map((kw: string) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-rose-950/60 text-rose-300 rounded-md font-bold border border-rose-900/50">-{kw}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/50">
                      <span>{s.inboundCount || 0} msgs recebidas · {s.messageCount || 0} no total</span>
                      <span>{s.analyzedAt ? new Date(s.analyzedAt).toLocaleDateString("pt-BR") : "—"}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── TAB 3: FEEDBACKS & AVALIAÇÕES ── */}
          <TabsContent value="reviews" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-black text-white flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" />Feedbacks de Hóspedes ({filteredReviews.length})</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select value={reviewFilter.tone} onChange={e => setReviewFilter(f => ({ ...f, tone: e.target.value }))} className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white">
                  <option value="all">Todos os sentimentos</option>
                  <option value="positive">😊 Positivo</option>
                  <option value="neutral">😐 Neutro</option>
                  <option value="negative">😤 Negativo</option>
                </select>
                <select value={reviewFilter.channel} onChange={e => setReviewFilter(f => ({ ...f, channel: e.target.value }))} className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white">
                  <option value="all">Todos os canais</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="booking">Booking</option>
                  <option value="google">Google</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="site">Site</option>
                </select>
                <select value={reviewFilter.rating} onChange={e => setReviewFilter(f => ({ ...f, rating: e.target.value }))} className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white">
                  <option value="all">Todas as notas</option>
                  <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                  <option value="4">⭐⭐⭐⭐ (4)</option>
                  <option value="3">⭐⭐⭐ (3)</option>
                  <option value="2">⭐⭐ (2)</option>
                  <option value="1">⭐ (1)</option>
                </select>
                <Button onClick={() => setImportModalOpen(true)} variant="outline" size="sm" className="h-8 text-xs bg-slate-900 border-slate-700 rounded-lg">
                  <Plus className="w-3 h-3 mr-1" />Adicionar
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredReviews.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Nenhum feedback encontrado com os filtros selecionados.</div>
              ) : filteredReviews.map((rev: any) => (
                <div key={rev.id} className={`p-4 rounded-2xl border space-y-2.5 ${rev.sentiment === "negative" ? "bg-rose-950/10 border-rose-900/30" : rev.sentiment === "mixed" ? "bg-amber-950/10 border-amber-900/30" : "bg-slate-900 border-slate-800"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ToneIcon tone={rev.sentiment || "neutral"} />
                      <span className="font-bold text-sm text-white">{rev.author}</span>
                      <Badge className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">{rev.channel}</Badge>
                      {rev.flatMentioned && <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">Apt {rev.flatMentioned}</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      {rev.sentimentScore != null && <ScoreBadge score={rev.sentimentScore} />}
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {[...Array(rev.rating || 5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />)}
                        {[...Array(5 - (rev.rating || 5))].map((_, i) => <Star key={`e${i}`} className="w-3.5 h-3.5 text-slate-700" />)}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">"{rev.comment}"</p>
                  {rev.sentimentSummary && (
                    <p className="text-[10px] text-purple-300/80 italic border-l-2 border-purple-800/50 pl-2">🤖 IA: {rev.sentimentSummary}</p>
                  )}
                  {(rev.positiveKeywords?.length > 0 || rev.negativeKeywords?.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {rev.positiveKeywords?.slice(0, 3).map((kw: string) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-emerald-950/60 text-emerald-300 rounded font-bold">+{kw}</span>
                      ))}
                      {rev.negativeKeywords?.slice(0, 3).map((kw: string) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-rose-950/60 text-rose-300 rounded font-bold">-{kw}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/50">
                    <span>{rev.date}</span>
                    <div className="flex items-center gap-3">
                      {rev.maintenanceGenerated && <span className="text-rose-400 font-bold flex items-center gap-1"><Wrench className="w-3 h-3" />Ticket Gerado</span>}
                      {!rev.analyzedByAI ? (
                        <button onClick={() => handleAnalyzeSingleReview(rev.id)} className="text-purple-400 font-bold flex items-center gap-1 hover:text-purple-300 transition-colors">
                          <Sparkles className="w-3 h-3" />Analisar IA
                        </button>
                      ) : (
                        <span className="text-purple-400 font-bold flex items-center gap-1"><Check className="w-3 h-3" />Analisado por IA</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── TAB 4: FILTRO GOOGLE NPS & MENSAGENS POR NOTA (1 A 5) ── */}
          <TabsContent value="nps" className="space-y-5 mt-4">
            <Card className="bg-sky-950/20 border-sky-800/40 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-black text-white mb-1">Como funciona o Filtro de Reputação Google & Respostas por Nota (1 a 5)</h2>
                  <p className="text-xs text-sky-300/80 leading-relaxed">
                    Após o check-out, o sistema envia uma pesquisa de satisfação de <strong>1 a 5 estrelas</strong> via WhatsApp.
                    <strong> Nota 5</strong> recebe automaticamente o link do Google Reviews.
                    <strong> Notas 1, 2, 3 e 4</strong> recebem uma mensagem empática personalizada para cada nota convidando o hóspede a digitar o que podemos melhorar. Assim que ele responde, o sistema envia uma mensagem de agradecimento, atualiza o <strong>Resumo de Melhorias a Fazer</strong> e dispara um alerta no WhatsApp da gerência.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /><span>Nota 5 — Link Google enviado</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-sky-400"><Smile className="w-3.5 h-3.5" /><span>Nota 4 — Pergunta o que faltou p/ 5⭐</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-amber-400"><Meh className="w-3.5 h-3.5" /><span>Nota 3 — Convida sugestões de melhoria</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-rose-400"><AlertTriangle className="w-3.5 h-3.5" /><span>Nota 1-2 — Acolhimento + Ticket + Alerta Gerência</span></div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Mensagens Programadas para Cada Nota (1 a 5 + Agradecimento) */}
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    Mensagens Programadas para Cada Nota (1 a 5 Estrelas)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Personalize abaixo a mensagem automática enviada no WhatsApp para cada nota recebida. Use <code className="text-amber-300">{"{{primeiro_nome}}"}</code>, <code className="text-amber-300">{"{{quarto}}"}</code> e <code className="text-amber-300">{"{{nome_hotel}}"}</code>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {npsTemplates.map((tpl: any) => {
                  const meta = NPS_TEMPLATE_META[tpl.id] || {
                    badge: tpl.title,
                    badgeClass: "bg-slate-800 text-slate-300",
                    subtitle: tpl.description || ""
                  }
                  const currentVal = editingTplMessages[tpl.id] ?? tpl.message ?? ""
                  const isDirty = currentVal !== (tpl.message ?? "")
                  return (
                    <div key={tpl.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={`${meta.badgeClass} text-xs font-bold`}>{meta.badge}</Badge>
                          {isDirty && <span className="text-[10px] text-amber-400 font-bold">Alterado • não salvo</span>}
                        </div>
                        <p className="text-[11px] text-slate-400">{meta.subtitle}</p>
                        <Textarea
                          rows={4}
                          value={currentVal}
                          onChange={e => setEditingTplMessages(prev => ({ ...prev, [tpl.id]: e.target.value }))}
                          className="bg-slate-900 border-slate-700 text-xs text-slate-100 leading-relaxed mt-1"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {isDirty && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTplMessages(prev => ({ ...prev, [tpl.id]: tpl.message || "" }))}
                            className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-300"
                          >
                            Reverter
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={!isDirty || savingTplId === tpl.id}
                          onClick={() => handleSaveNpsTemplate(tpl)}
                          className="h-7 text-[11px] bg-sky-700 hover:bg-sky-600 text-white font-bold gap-1"
                        >
                          <Save className="w-3 h-3" />
                          {savingTplId === tpl.id ? "Salvando..." : "Salvar Mensagem"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Enviadas", val: nps.sent || 0, color: "text-slate-200", icon: <Activity className="w-3.5 h-3.5" /> },
                { label: "Respondidas", val: nps.responded || 0, color: "text-sky-400", icon: <MessageSquare className="w-3.5 h-3.5" /> },
                { label: "Promotores (5⭐)", val: nps.promoters || 0, color: "text-emerald-400", icon: <ThumbsUp className="w-3.5 h-3.5" /> },
                { label: "Neutros (3-4⭐)", val: nps.neutrals || 0, color: "text-amber-400", icon: <Meh className="w-3.5 h-3.5" /> },
                { label: "Detratores (1-2⭐)", val: nps.detractors || 0, color: "text-rose-400", icon: <Frown className="w-3.5 h-3.5" /> },
                { label: "Link Google ✓", val: nps.googleLinkSent || 0, color: "text-purple-400", icon: <Shield className="w-3.5 h-3.5" /> },
              ].map(({ label, val, color, icon }) => (
                <Card key={label} className="bg-slate-900 border-slate-800 rounded-xl p-3 text-center">
                  <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
                  <p className={`text-xl font-black font-mono ${color}`}>{val}</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{label}</p>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-black text-white">Histórico de Pesquisas NPS</h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl overflow-hidden border border-slate-700">
                  {[
                    { val: "all", label: "Todos" },
                    { val: "promoters", label: "⭐⭐⭐⭐⭐" },
                    { val: "neutrals", label: "🤔 Neutros" },
                    { val: "detractors", label: "⚠️ Detratores" },
                    { val: "pending", label: "⏳ Aguardando" },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setNpsFilter(opt.val)} className={`text-[10px] font-bold px-2.5 py-1.5 transition-colors ${npsFilter === opt.val ? "bg-sky-700 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"}`}>{opt.label}</button>
                  ))}
                </div>
                <Button onClick={() => setNpsModalOpen(true)} size="sm" variant="outline" className="h-8 text-xs bg-slate-900 border-slate-700 rounded-lg">
                  <Plus className="w-3 h-3 mr-1" />Registrar Manual
                </Button>
              </div>
            </div>

            {loadingNps ? (
              <div className="text-center py-10 text-slate-500 text-sm">Carregando...</div>
            ) : npsResponses.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-10 text-center">
                <Shield className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">Nenhuma pesquisa NPS registrada ainda</p>
                <p className="text-xs text-slate-500 mt-1">As pesquisas são enviadas automaticamente 24h após o check-out via WhatsApp.</p>
              </Card>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {npsResponses.map((npsItem: any) => (
                  <div key={npsItem.id} className={`p-4 rounded-2xl border flex flex-wrap items-start gap-3 justify-between ${npsItem.score === 5 ? "bg-emerald-950/10 border-emerald-900/30" : npsItem.score != null && npsItem.score <= 2 ? "bg-rose-950/10 border-rose-900/30" : npsItem.score == null ? "bg-slate-900 border-slate-800" : "bg-amber-950/10 border-amber-900/30"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-sm font-black text-white">{npsItem.guestName}</span>
                        {npsItem.flatNumber && <Badge className="bg-slate-800 text-slate-300 text-[10px]">Flat {npsItem.flatNumber}</Badge>}
                        {npsItem.channel && <Badge className="bg-slate-800 text-slate-400 text-[10px] uppercase">{npsItem.channel}</Badge>}
                        <NpsScoreBadge score={npsItem.score} />
                      </div>
                      {npsItem.comment && <p className="text-xs text-slate-300 leading-relaxed italic mb-1.5">"{npsItem.comment}"</p>}
                      {npsItem.sentimentSummary && <p className="text-[10px] text-purple-300/80 italic">🤖 {npsItem.sentimentSummary}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-slate-500">
                        <span>Enviado: {npsItem.sentAt ? new Date(npsItem.sentAt).toLocaleDateString("pt-BR") : "—"}</span>
                        {npsItem.respondedAt && <span>Respondido: {new Date(npsItem.respondedAt).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {npsItem.googleLinkSent && <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">✓ Link Google Enviado</Badge>}
                      {npsItem.awaitingFeedbackComment && <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px]">✍️ Aguardando Sugestão</Badge>}
                      {npsItem.managerAlertSent && <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-[10px]">📲 Gerência Alertada</Badge>}
                      {npsItem.autoAction === "recovery_ticket_created" && <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px]">⚠️ Ticket Criado</Badge>}
                      {npsItem.autoAction === "feedback_collected" && <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px]">📝 Feedback Interno</Badge>}
                      {npsItem.pendingResponse && <Badge className="bg-slate-800 text-slate-400 text-[10px]">⏳ Aguardando Resposta</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── TAB 5: MANUTENÇÃO IA ── */}
          <TabsContent value="maintenance" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-rose-400" />Ordens de Manutenção Geradas por IA</h2>
                <p className="text-xs text-slate-400 mt-0.5">Tickets criados automaticamente por menções em avaliações, feedbacks e NPS detratores.</p>
              </div>
              <Button disabled={analyzing} onClick={handleRunAIAnalysis} size="sm" className="bg-rose-700 hover:bg-rose-600 text-white text-xs font-black gap-1.5 rounded-xl h-9">
                <Sparkles className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
                Reprocessar
              </Button>
            </div>
            {insights.actionItems?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.actionItems.map((act: any, idx: number) => (
                  <div key={idx} className="p-4 bg-rose-950/15 rounded-2xl border border-rose-900/40 flex flex-col justify-between space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-rose-950 text-rose-300 border-rose-800 font-bold text-xs">Apartamento {act.flat}</Badge>
                      <span className="text-[10px] text-amber-400 font-bold uppercase">{act.status || act.priority}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">{act.issue}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <Wrench className="w-3 h-3 text-rose-400" />
                      <span>Criado por IA · {act.priority === "alta" ? "Prioridade Alta" : "Prioridade Média"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="bg-slate-900 border-slate-800 rounded-2xl p-10 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">Nenhum ticket de manutenção pendente</p>
                <p className="text-xs text-slate-500 mt-1">A IA não identificou problemas técnicos nas avaliações recentes.</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Modal: Importar Avaliação ── */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-white">
          <form onSubmit={handleImportReview}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white"><Plus className="w-4 h-4 text-purple-400" />Importar Avaliação Externa</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">Cole a avaliação recebida do Airbnb, Booking ou Google para que a IA processe.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nome do Hóspede</Label>
                  <Input value={author} onChange={e => setAuthor(e.target.value)} required placeholder="Ex: Carlos Santana" className="bg-slate-950 border-slate-700 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Canal</Label>
                  <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white">
                    <option value="airbnb">Airbnb</option>
                    <option value="booking">Booking.com</option>
                    <option value="google">Google Reviews</option>
                    <option value="site">Site CorpFlats</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nota (1 a 5)</Label>
                  <select value={rating} onChange={e => setRating(e.target.value)} className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-bold">
                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                    <option value="4">⭐⭐⭐⭐ (4)</option>
                    <option value="3">⭐⭐⭐ (3)</option>
                    <option value="2">⭐⭐ (2)</option>
                    <option value="1">⭐ (1)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Flat Citado (Opcional)</Label>
                  <Input value={flatMentioned} onChange={e => setFlatMentioned(e.target.value)} placeholder="Ex: 304, 1017" className="bg-slate-950 border-slate-700 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Comentário do Hóspede</Label>
                <Textarea value={comment} onChange={e => setComment(e.target.value)} required rows={4} placeholder="Cole aqui o texto exato do hóspede..." className="bg-slate-950 border-slate-700 text-xs leading-relaxed" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={submitting} className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs">{submitting ? "Importando..." : "Importar e Analisar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Registrar NPS Manual ── */}
      <Dialog open={npsModalOpen} onOpenChange={setNpsModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
          <form onSubmit={handleSubmitNps}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white"><Shield className="w-4 h-4 text-sky-400" />Registrar Resposta NPS</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">Registre manualmente a resposta de um hóspede à pesquisa de satisfação.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nome do Hóspede</Label>
                  <Input value={npsGuestName} onChange={e => setNpsGuestName(e.target.value)} placeholder="Ex: Maria Silva" className="bg-slate-950 border-slate-700 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Telefone (WhatsApp)</Label>
                  <Input value={npsPhone} onChange={e => setNpsPhone(e.target.value)} placeholder="+55 22 9xxxx-xxxx" className="bg-slate-950 border-slate-700 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nota Dada (1 a 5)</Label>
                  <select value={npsScore} onChange={e => setNpsScore(e.target.value)} className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-bold">
                    <option value="5">⭐⭐⭐⭐⭐ — Promotor</option>
                    <option value="4">⭐⭐⭐⭐ — Satisfeito</option>
                    <option value="3">⭐⭐⭐ — Neutro</option>
                    <option value="2">⭐⭐ — Insatisfeito</option>
                    <option value="1">⭐ — Detrator</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Cód. Reserva (Opcional)</Label>
                  <Input value={npsReservationId} onChange={e => setNpsReservationId(e.target.value)} placeholder="Ex: RES-2026-001" className="bg-slate-950 border-slate-700 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Comentário / Melhoria Sugerida pelo Hóspede</Label>
                <Textarea value={npsComment} onChange={e => setNpsComment(e.target.value)} rows={3} placeholder="O que o hóspede digitou que pode melhorar..." className="bg-slate-950 border-slate-700 text-xs leading-relaxed" />
              </div>
              {Number(npsScore) === 5 && (
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-900/40 rounded-xl text-emerald-300 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Nota 5 — Link do Google será marcado como enviado automaticamente.
                </div>
              )}
              {Number(npsScore) < 5 && (
                <div className="p-2.5 bg-amber-950/30 border border-amber-900/40 rounded-xl text-amber-300 text-[11px] flex items-center gap-2">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  Nota {npsScore} — Se houver comentário, será incluído no Resumo de Melhorias a Fazer e enviado alerta WhatsApp para a gerência.
                </div>
              )}
              {Number(npsScore) <= 2 && (
                <div className="p-2.5 bg-rose-950/30 border border-rose-900/40 rounded-xl text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Nota 1-2 — Ticket de recuperação de experiência será criado automaticamente.
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNpsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={submittingNps} className="bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs">{submittingNps ? "Salvando..." : "Registrar Resposta"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
