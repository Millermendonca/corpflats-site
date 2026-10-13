import React, { useState } from "react"
import {
  Lightbulb,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  RotateCw,
  Search,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
  Phone,
  User,
  Building,
  Sparkles,
  MessageSquare,
  Layers,
  ArrowRight,
  TrendingUp,
  Tag,
  Check,
  Calendar,
  Calculator,
  QrCode,
  XCircle,
  CalendarRange,
  BedDouble,
  Wrench,
  Hourglass,
  Car,
  FileText,
  ArrowLeftRight,
  Coffee,
  PauseCircle,
  LogOut
} from "lucide-react"

import {
  useBotDemands,
  UnmetDemandItem,
  DemandStatus,
  DemandPriority,
  CATEGORY_META_MAP,
  UnmetDemandCategory,
  formatPhoneNumber
} from "@/hooks/use-bot-demands"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface BotDemandsBacklogProps {
  onNavigateToAiAgent?: () => void
}

export function BotDemandsBacklog({ onNavigateToAiAgent }: BotDemandsBacklogProps) {
  const {
    filteredDemands,
    stats,
    loading,
    refresh,
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
  } = useBotDemands()

  // Estado para edição inline de notas
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<string>("")
  const [savingNotes, setSavingNotes] = useState<boolean>(false)

  // Estado para expandir variações de texto
  const [expandedVariations, setExpandedVariations] = useState<Record<string, boolean>>({})

  // Estado de loading para ativação de ação
  const [activatingActionId, setActivatingActionId] = useState<string | null>(null)

  const toggleVariations = (id: string) => {
    setExpandedVariations(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleStartEditNotes = (demand: UnmetDemandItem) => {
    setEditingNotesId(demand.id)
    setNotesDraft(demand.adminNotes || "")
  }

  const handleSaveNotes = async (id: string) => {
    setSavingNotes(true)
    await updateDemandStatus(id, undefined as any, notesDraft)
    setSavingNotes(false)
    setEditingNotesId(null)
  }

  const handleQuickActivate = async (id: string) => {
    setActivatingActionId(id)
    await activateActionLink(id)
    setActivatingActionId(null)
  }

  const renderCategoryIcon = (category: UnmetDemandCategory) => {
    switch (category) {
      case "efetivacao_reserva":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case "cotacao_diarias":
        return <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      case "consulta_disponibilidade":
        return <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
      case "geracao_pix":
        return <QrCode className="w-4 h-4 text-teal-600 dark:text-teal-400" />
      case "pre_reserva":
        return <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
      case "cancelamento_reserva":
        return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
      case "alteracao_datas":
        return <CalendarRange className="w-4 h-4 text-purple-600 dark:text-purple-400" />
      case "enxoval_toalhas":
        return <BedDouble className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      case "chamado_manutencao":
        return <Wrench className="w-4 h-4 text-orange-600 dark:text-orange-400" />
      case "limpeza_avulsa":
        return <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400" />
      case "late_checkout":
        return <Hourglass className="w-4 h-4 text-violet-600 dark:text-violet-400" />
      case "checkout_comunicacao":
        return <LogOut className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case "garagem_veiculo":
        return <Car className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      case "emissao_nota_fiscal":
        return <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
      case "troca_flat":
        return <ArrowLeftRight className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
      case "cafe_quarto":
        return <Coffee className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
      case "operacoes_sistema_pausadas":
        return <PauseCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
      default:
        return <HelpCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
    }
  }

  const getStatusBadge = (status: DemandStatus) => {
    switch (status) {
      case "aberta":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200">Aberta</Badge>
      case "pendente":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200">Pendente</Badge>
      case "em_analise":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200">Em Análise</Badge>
      case "planejada":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200">Planejada</Badge>
      case "implementada":
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200">Implementada</Badge>
      case "descartada":
        return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300">Descartada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── Header & Apresentação ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 rounded-2xl border shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Oportunidades de Automação & Demandas Sem Acesso
              </h2>
              <p className="text-xs text-muted-foreground">
                Mapeamento contínuo de solicitações onde a IA não possui autonomia (chaves desativadas ou novos recursos).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToAiAgent && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToAiAgent}
              className="text-xs font-semibold gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-blue-500" />
              Chaves do Bot
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={() => refresh()}
            disabled={loading}
            className="text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ─── Cards de Indicadores (KPIs) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Ocorrências */}
        <Card className="border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Total de Demandas
              </span>
              <Layers className="w-4 h-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-amber-900 dark:text-amber-100">
              {stats?.totalDemands ?? 0}
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-1">
              <strong>{stats?.totalOccurrences ?? 0}</strong> solicitações de{" "}
              <strong>{stats?.totalUniquePhones ?? 0}</strong> clientes
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Chaves Desativadas (Ação Imediata) */}
        <Card className="border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                Chaves Desativadas
              </span>
              <Zap className="w-4 h-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-rose-900 dark:text-rose-100">
              {stats?.actionDisabledCount ?? 0}
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-400 mt-1">
              Recursos prontos bloqueados por chave no painel
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Novas Funcionalidades (Roadmap) */}
        <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                Novos Recursos
              </span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100">
              {stats?.capabilityMissingCount ?? 0}
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400 mt-1">
              Gaps operacionais (cancelamento, enxoval, manutenção)
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Implementadas / Resolvidas */}
        <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Implementadas
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
              {stats?.implementedDemands ?? 0}
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-1">
              Automações concedidas e chaves ativadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Top 5 Mais Solicitadas (Ranking de Prioridade) ─── */}
      {stats && stats.topRequested && stats.topRequested.length > 0 && (
        <Card className="border shadow-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-sm font-bold">Top Oportunidades Mais Solicitadas</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Demandas que mais impactam clientes e geram transbordo humano para a recepção.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex flex-wrap gap-2">
              {stats.topRequested.map((top, idx) => {
                const meta = CATEGORY_META_MAP[top.category] || CATEGORY_META_MAP.outros
                return (
                  <div
                    key={top.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-muted/40 text-xs hover:bg-muted/70 transition-colors"
                  >
                    <span className="font-black text-muted-foreground">#{idx + 1}</span>
                    <span className="font-semibold text-foreground">{top.demandTitle}</span>
                    <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-4">
                      {top.occurrencesCount}x
                    </Badge>
                    {top.reason === "action_disabled" && (
                      <span className="text-[10px] text-rose-600 font-semibold flex items-center gap-0.5">
                        <Zap className="w-3 h-3" /> Chave
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Barra de Filtros e Busca ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por mensagem, hóspede, telefone, anotação ou recurso..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de Categoria */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-xs w-[170px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Categorias</SelectItem>
              {Object.entries(CATEGORY_META_MAP).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.shortLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro de Motivo */}
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="h-9 text-xs w-[150px]">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Motivos</SelectItem>
              <SelectItem value="action_disabled">Chave Desativada</SelectItem>
              <SelectItem value="capability_missing">Nova Capacidade</SelectItem>
              <SelectItem value="requires_operator">Requer Humano</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="aberta">Abertas</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="planejada">Planejadas</SelectItem>
              <SelectItem value="implementada">Implementadas</SelectItem>
              <SelectItem value="descartada">Descartadas</SelectItem>
            </SelectContent>
          </Select>

          {/* Ordenação */}
          <Select value={sortOption} onValueChange={(val: any) => setSortOption(val)}>
            <SelectTrigger className="h-9 text-xs w-[150px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="occurrences">Mais Solicitadas</SelectItem>
              <SelectItem value="date">Mais Recentes</SelectItem>
              <SelectItem value="title">Título Alfabético</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Lista de Demandas Mapeadas ─── */}
      {filteredDemands.length === 0 ? (
        <Card className="border border-dashed p-10 text-center">
          <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
            <div className="p-3 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600">
              <Lightbulb className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Nenhuma demanda não atendida encontrada</h3>
            <p className="text-xs text-muted-foreground">
              {search || categoryFilter !== "all" || statusFilter !== "all" || reasonFilter !== "all"
                ? "Nenhum resultado corresponde aos filtros selecionados. Tente limpar os filtros."
                : "Quando hóspedes solicitarem algo fora do alcance da IA no WhatsApp ou através do Simulador, o sistema mapeará a oportunidade automaticamente aqui."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDemands.map(demand => {
            const meta = CATEGORY_META_MAP[demand.category] || CATEGORY_META_MAP.outros
            const hasMultipleVariations = demand.variations && demand.variations.length > 1
            const isVariationsOpen = Boolean(expandedVariations[demand.id])
            const isEditingNotes = editingNotesId === demand.id

            return (
              <Card
                key={demand.id}
                className={`border transition-shadow hover:shadow-sm ${
                  demand.status === "implementada"
                    ? "opacity-85 border-emerald-200/70 dark:border-emerald-950"
                    : demand.reason === "action_disabled"
                    ? "border-rose-200 dark:border-rose-900/40"
                    : "border-border"
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 p-2 rounded-lg bg-muted/60">
                        {renderCategoryIcon(demand.category)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground">
                            {demand.demandTitle}
                          </h4>

                          <Badge variant="outline" className={`text-[10px] font-semibold ${meta.badgeClass}`}>
                            {meta.shortLabel}
                          </Badge>

                          {demand.reason === "action_disabled" ? (
                            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 text-[10px] font-bold">
                              ⚡ Chave Desativada
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 text-[10px] font-semibold">
                              💡 Nova Capacidade
                            </Badge>
                          )}

                          {getStatusBadge(demand.status)}
                        </div>

                        {/* Metadados de Hóspede e Ocorrência */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1 font-semibold text-foreground">
                            <TrendingUp className="w-3 h-3 text-amber-500" />
                            {demand.occurrencesCount} {demand.occurrencesCount === 1 ? "solicitação" : "solicitações"}
                            {demand.clientPhones && demand.clientPhones.length > 1 && (
                              <span className="text-muted-foreground font-normal">
                                ({demand.clientPhones.length} hóspedes diferentes)
                              </span>
                            )}
                          </span>

                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {demand.senderName || "Hóspede"}
                          </span>

                          {demand.senderPhone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3" />
                              {formatPhoneNumber(demand.senderPhone)}
                            </span>
                          )}

                          {demand.guestContext?.flatNumber && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Building className="w-3 h-3" />
                              Flat {demand.guestContext.flatNumber}
                            </span>
                          )}

                          {demand.lastDetectedAt && (
                            <span className="text-[10px]">
                              Último: {new Date(demand.lastDetectedAt).toLocaleDateString("pt-BR")} às{" "}
                              {new Date(demand.lastDetectedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações Rápidas no Canto Superior Direito */}
                    <div className="flex items-center gap-1.5 self-end sm:self-start">
                      {demand.senderPhone && (
                        <a
                          href={`https://wa.me/${demand.senderPhone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 transition-colors"
                          title="Conversar no WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Conversar
                        </a>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDemand(demand.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                        title="Remover do backlog"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Mensagem Original do Cliente */}
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Mensagem do Cliente:
                    </span>
                    <p className="italic text-foreground">
                      "{demand.rawMessage}"
                    </p>

                    {/* Variações Expansíveis */}
                    {hasMultipleVariations && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => toggleVariations(demand.id)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          {isVariationsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isVariationsOpen
                            ? "Ocultar outras formas que falaram"
                            : `Ver outras ${demand.variations.length - 1} variações de mensagem`}
                        </button>

                        {isVariationsOpen && (
                          <ul className="mt-2 space-y-1 pl-4 list-disc text-[11px] text-muted-foreground">
                            {demand.variations.map((v, i) => (
                              <li key={i} className="italic">"{v}"</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sugestão de Automação & Botão de Ação Imediata */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Sugestão para Conceder Autonomia:
                      </span>
                      <p className="text-amber-900 dark:text-amber-200 text-xs">
                        {demand.suggestedFeature}
                      </p>
                    </div>

                    {/* Se for ação existente desativada ou mapeada para chave do bot, exibe botão de ativação com 1 clique */}
                    {(demand.reason === "action_disabled" || meta.isAction || Boolean(demand.actionTarget)) && demand.status !== "implementada" && (
                      <Button
                        size="sm"
                        onClick={() => handleQuickActivate(demand.id)}
                        disabled={activatingActionId === demand.id}
                        className="text-xs font-bold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shrink-0 self-start sm:self-center"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {activatingActionId === demand.id ? "Ativando..." : "Ativar Chave do Bot"}
                      </Button>
                    )}
                  </div>

                  {/* Seletor de Status & Anotações do Admin */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground">Status do Roadmap:</span>
                      <Select
                        value={demand.status || "aberta"}
                        onValueChange={(val: DemandStatus) => updateDemandStatus(demand.id, val)}
                      >
                        <SelectTrigger className="h-7 text-xs w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberta">Aberta</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_analise">Em Análise</SelectItem>
                          <SelectItem value="planejada">Planejada</SelectItem>
                          <SelectItem value="implementada">Implementada</SelectItem>
                          <SelectItem value="descartada">Descartada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Anotações do Admin */}
                    <div className="flex items-center gap-2">
                      {isEditingNotes ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Input
                            value={notesDraft}
                            onChange={e => setNotesDraft(e.target.value)}
                            placeholder="Adicionar nota técnica ou sprint..."
                            className="h-7 text-xs w-[240px]"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveNotes(demand.id)}
                            disabled={savingNotes}
                            className="h-7 text-xs px-2.5"
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingNotesId(null)}
                            className="h-7 text-xs px-2 text-muted-foreground"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[11px]">
                          {demand.adminNotes ? (
                            <span className="text-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/60">
                              📝 {demand.adminNotes}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Sem anotações</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEditNotes(demand)}
                            className="h-6 text-[10px] px-1.5 text-primary hover:underline"
                          >
                            {demand.adminNotes ? "Editar" : "+ Nota"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
