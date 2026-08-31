import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListObservations,
  useCreateObservation,
  useResolveObservation,
  useListFlats,
  useGetMe,
  getListObservationsQueryKey,
  Observation,
} from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Plus, CheckCircle2, AlertTriangle, Wrench, HelpCircle, Filter, 
  MessageCircle, Clock, Check, Search, Sparkles, Building2, Package, ArrowRight
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Link } from "wouter"

const categoryConfig: Record<string, { label: string; icon: React.ElementType; color: string; badgeBg: string }> = {
  defeito: { label: "Defeito", icon: AlertTriangle, color: "text-rose-600", badgeBg: "bg-rose-500/10 text-rose-700 border-rose-500/30" },
  manutencao: { label: "Manutenção", icon: Wrench, color: "text-amber-600", badgeBg: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  outro: { label: "Outro", icon: HelpCircle, color: "text-blue-600", badgeBg: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
}

function ObservationCard({ obs, isAdmin, onResolve }: { obs: Observation; isAdmin: boolean; onResolve: (id: number) => void }) {
  const cat = categoryConfig[obs.category] ?? categoryConfig.outro
  const Icon = cat.icon
  const date = obs.createdAt ? format(parseISO(obs.createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : "-"

  return (
    <Card className={`rounded-3xl border border-border shadow-xs overflow-hidden transition-all ${
      obs.status === "resolvida" ? "bg-muted/10 opacity-75" : "bg-card hover:border-border/80"
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3.5">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            obs.status === 'resolvida' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
          }`}>
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-foreground">Flat {obs.flatNumber}</span>
                <Badge variant="outline" className={`text-[10px] font-bold ${cat.badgeBg}`}>
                  {cat.label}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {obs.status === "resolvida" ? (
                  <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                    ✓ Resolvida
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                    Pendente
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">{date}</span>
              </div>
            </div>

            <p className="text-xs text-foreground leading-relaxed bg-muted/30 p-3 rounded-2xl border border-border/50">
              {obs.text}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
              <span>Relatado por: <strong>{obs.authorUsername || "Camareira"}</strong></span>
              
              {obs.status === "resolvida" && obs.resolvedByUsername && (
                <span className="text-emerald-600 font-medium">
                  ✓ Resolvido por <strong>{obs.resolvedByUsername}</strong>
                  {obs.resolvedNote && `: ${obs.resolvedNote}`}
                </span>
              )}
            </div>
          </div>

          {isAdmin && obs.status === "aberta" && (
            <Button 
              size="sm" 
              onClick={() => onResolve(obs.id)}
              className="shrink-0 h-9 px-3 rounded-xl text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resolver</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Observations() {
  const { data: user } = useGetMe()
  const isAdmin = user?.role === "admin"
  const qc = useQueryClient()

  // Filtros Observações
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("aberta")
  const [filterFlat, setFilterFlat] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const queryParams: any = {}
  if (filterCategory !== "all") queryParams.category = filterCategory
  if (filterStatus !== "all") queryParams.status = filterStatus
  if (filterFlat !== "all") queryParams.flatId = parseInt(filterFlat)

  const { data: observations, isLoading } = useListObservations(queryParams, {
    query: { refetchInterval: 30000, queryKey: getListObservationsQueryKey(queryParams) }
  })
  const { data: flats } = useListFlats()

  const [newObsOpen, setNewObsOpen] = useState(false)
  const [newFlatId, setNewFlatId] = useState<string>("")
  const [newCategory, setNewCategory] = useState("defeito")
  const [newText, setNewText] = useState("")

  const [resolveId, setResolveId] = useState<number | null>(null)
  const [resolveNote, setResolveNote] = useState("")

  const create = useCreateObservation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListObservationsQueryKey() })
        setNewObsOpen(false)
        setNewFlatId("")
        setNewText("")
        setNewCategory("defeito")
      }
    }
  })

  const resolve = useResolveObservation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListObservationsQueryKey() })
        setResolveId(null)
        setResolveNote("")
      }
    }
  })

  const openCount = (observations ?? []).filter(o => o.status === "aberta").length

  const filteredObservations = (observations ?? []).filter(obs => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (obs.text || "").toLowerCase().includes(q) ||
      String(obs.flatNumber || "").toLowerCase().includes(q) ||
      (obs.authorUsername || "").toLowerCase().includes(q)
    )
  })

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-28">
        {/* Header Principal */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
                <span>Ocorrências & Avarias dos Flats</span>
                {openCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px] animate-pulse">
                    {openCount} pendentes
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Controle de defeitos estruturais, manutenções preventivas e reparos relatados pela equipe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setNewObsOpen(true)} 
              className="h-10 px-4 rounded-2xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Ocorrência</span>
            </Button>
          </div>
        </div>

        {/* Banner Direcionador para Achados & Perdidos */}
        <div className="p-4 rounded-3xl bg-indigo-500/5 border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-foreground block">Procurando por Objetos Esquecidos nos Quartos?</span>
              <span className="text-muted-foreground text-[11px]">Gerencie a custódia, fotos e contato com hóspedes na Central de Achados & Perdidos</span>
            </div>
          </div>

          <Link href="/achados-perdidos">
            <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-xl gap-1.5 border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 shrink-0">
              <span>Ir para Achados & Perdidos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* Filtros e Busca */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card border border-border rounded-3xl shadow-xs">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Buscar por descrição do defeito, flat ou camareira..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9.5 rounded-xl bg-background"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-9.5 text-xs rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="aberta">Pendentes</SelectItem>
                <SelectItem value="resolvida">Resolvidas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-36 h-9.5 text-xs rounded-xl">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                <SelectItem value="defeito">Defeitos</SelectItem>
                <SelectItem value="manutencao">Manutenções</SelectItem>
                <SelectItem value="outro">Outros</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterFlat} onValueChange={setFilterFlat}>
              <SelectTrigger className="w-36 h-9.5 text-xs rounded-xl">
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

        {/* Lista de Ocorrências */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-3xl" />)}
          </div>
        ) : filteredObservations.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border p-12 text-center">
            <Wrench className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-black text-sm text-foreground">Nenhuma ocorrência encontrada</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Nenhum defeito ou manutenção pendente para os filtros selecionados.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredObservations.map(obs => (
              <ObservationCard 
                key={obs.id} 
                obs={obs} 
                isAdmin={isAdmin} 
                onResolve={id => setResolveId(id)} 
              />
            ))}
          </div>
        )}

        {/* Modal Nova Ocorrência */}
        <Dialog open={newObsOpen} onOpenChange={setNewObsOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-500" />
                <span>Relatar Nova Ocorrência / Defeito</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Registre uma avaria, defeito elétrico/hidráulico ou item para manutenção
              </DialogDescription>
            </DialogHeader>

            <form 
              onSubmit={e => {
                e.preventDefault()
                if (!newFlatId || !newText.trim()) return
                create.mutate({
                  data: {
                    flatId: parseInt(newFlatId),
                    category: newCategory as any,
                    text: newText.trim()
                  }
                })
              }} 
              className="space-y-4 pt-2"
            >
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
                <Label className="text-xs font-bold">Tipo de Ocorrência *</Label>
                <Select value={newCategory} onValueChange={setNewCategory} required>
                  <SelectTrigger className="h-10 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defeito">Defeito Físico / Quebrado</SelectItem>
                    <SelectItem value="manutencao">Manutenção Preventiva / Troca</SelectItem>
                    <SelectItem value="outro">Outro Tipo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição Detalhada do Problema *</Label>
                <Textarea 
                  placeholder="Ex: Ar-condicionado não está gelando no flat 408, torneira do banheiro pingando..."
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  required
                  rows={3}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setNewObsOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {create.isPending ? "Salvando..." : "Registrar Ocorrência"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Resolver Ocorrência */}
        <Dialog open={resolveId !== null} onOpenChange={open => { if (!open) setResolveId(null) }}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Dar Baixa na Ocorrência</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Confirme a resolução e adicione notas sobre o conserto efetuado
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={e => {
                e.preventDefault()
                if (resolveId === null) return
                resolve.mutate({ id: resolveId, data: { resolvedNote: resolveNote.trim() } })
              }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nota de Resolução (Opcional)</Label>
                <Textarea 
                  placeholder="Ex: Torneira trocada pelo técnico João, gás do ar recarregado..."
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  rows={2}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setResolveId(null)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={resolve.isPending} className="rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                  {resolve.isPending ? "Gravando..." : "Confirmar Resolução"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
