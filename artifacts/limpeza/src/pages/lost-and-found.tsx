import { useState, useEffect, useRef } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Package, Search, PlusCircle, CheckCircle2, Clock, MapPin, User, 
  Phone, MessageSquare, Trash2, Camera, ExternalLink, RefreshCw, 
  AlertCircle, Sparkles, Check, Filter, Image as ImageIcon, Eye, PackageOpen
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

interface LostItem {
  id: number
  flatId?: number | null
  flatNumber: string
  description: string
  locationInRoom?: string
  photoUrl?: string | null
  status: "guardado" | "devolvido" | "descartado"
  foundBy: string
  lastGuestName?: string
  lastGuestPhone?: string
  lastGuestEmail?: string
  lastCheckoutDate?: string
  notes?: string
  returnedTo?: string
  returnedAt?: string
  returnedBy?: string
  createdAt: string
  updatedAt: string
}

export default function LostAndFoundPage() {
  const [items, setItems] = useState<LostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Modal Novo Item
  const [newModalOpen, setNewModalOpen] = useState(false)
  const [flatNumberInput, setFlatNumberInput] = useState("")
  const [descriptionInput, setDescriptionInput] = useState("")
  const [locationInput, setLocationInput] = useState("")
  const [notesInput, setNotesInput] = useState("")
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modal Foto Ampliada (Zoom)
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null)

  // Modal Dar Baixa / Devolução
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [selectedItemForReturn, setSelectedItemForReturn] = useState<LostItem | null>(null)
  const [returnedToInput, setReturnedToInput] = useState("")
  const [returnNotesInput, setReturnNotesInput] = useState("")
  const [submittingReturn, setSubmittingReturn] = useState(false)

  // Lista de Flats para o Select
  const [flats, setFlats] = useState<any[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [itemsRes, flatsRes] = await Promise.all([
        fetch("/api/lost-and-found", { credentials: "include" }).then(r => r.json()).catch(() => []),
        fetch("/api/flats", { credentials: "include" }).then(r => r.json()).catch(() => [])
      ])
      if (Array.isArray(itemsRes)) setItems(itemsRes)
      if (Array.isArray(flatsRes)) setFlats(flatsRes)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/lost-and-found", { credentials: "include" })
      const data = await res.json()
      if (Array.isArray(data)) setItems(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Upload e Compressão de Foto
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        const maxWidth = 1200
        let w = img.width
        let h = img.height

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w)
          w = maxWidth
        }

        canvas.width = w
        canvas.height = h
        ctx?.drawImage(img, 0, 0, w, h)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75)
        setPhotoBase64(compressedBase64)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descriptionInput.trim() || !flatNumberInput) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/lost-and-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNumberInput,
          description: descriptionInput.trim(),
          locationInRoom: locationInput.trim(),
          notes: notesInput.trim(),
          photoBase64
        }),
        credentials: "include"
      })

      if (res.ok) {
        setNewModalOpen(false)
        setFlatNumberInput("")
        setDescriptionInput("")
        setLocationInput("")
        setNotesInput("")
        setPhotoBase64(null)
        fetchItems()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItemForReturn) return

    setSubmittingReturn(true)
    try {
      const res = await fetch(`/api/lost-and-found/${selectedItemForReturn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "devolvido",
          returnedTo: returnedToInput.trim() || selectedItemForReturn.lastGuestName || "Hóspede",
          notes: returnNotesInput ? `${selectedItemForReturn.notes || ''}\n[Devolução]: ${returnNotesInput.trim()}`.trim() : selectedItemForReturn.notes
        }),
        credentials: "include"
      })

      if (res.ok) {
        setReturnModalOpen(false)
        setSelectedItemForReturn(null)
        setReturnedToInput("")
        setReturnNotesInput("")
        fetchItems()
      }
    } finally {
      setSubmittingReturn(false)
    }
  }

  const handleUpdateStatus = async (item: LostItem, newStatus: "guardado" | "devolvido" | "descartado") => {
    if (newStatus === "devolvido") {
      setSelectedItemForReturn(item)
      setReturnedToInput(item.lastGuestName || "")
      setReturnNotesInput("")
      setReturnModalOpen(true)
      return
    }

    try {
      const res = await fetch(`/api/lost-and-found/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include"
      })
      if (res.ok) {
        fetchItems()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteItem = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir o registro deste item?")) return
    try {
      await fetch(`/api/lost-and-found/${id}`, { method: "DELETE", credentials: "include" })
      fetchItems()
    } catch (e) {
      console.error(e)
    }
  }

  // Filtragem
  const filteredItems = items.filter(item => {
    const matchesStatus = filterStatus === "all" || item.status === filterStatus
    if (!matchesStatus) return false

    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (item.description || "").toLowerCase().includes(q) ||
      String(item.flatNumber || "").toLowerCase().includes(q) ||
      (item.lastGuestName || "").toLowerCase().includes(q) ||
      (item.foundBy || "").toLowerCase().includes(q) ||
      (item.locationInRoom || "").toLowerCase().includes(q)
    )
  })

  // Estatísticas
  const totalCount = items.length
  const guardadosCount = items.filter(i => i.status === "guardado").length
  const devolvidosCount = items.filter(i => i.status === "devolvido").length
  const descartadosCount = items.filter(i => i.status === "descartado").length

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <span>Achados & Perdidos (Lost & Found)</span>
                {guardadosCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px] animate-pulse">
                    {guardadosCount} em custódia
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Controle completo de objetos esquecidos nos apartamentos, custódia e contato direto com hóspedes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setNewModalOpen(true)}
              className="h-10 px-4 rounded-2xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Registrar Item Esquecido</span>
            </Button>
          </div>
        </div>

        {/* ── CARDS DE ESTATÍSTICAS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <Card 
            onClick={() => setFilterStatus("all")}
            className={`rounded-2xl border p-4 cursor-pointer transition-all ${
              filterStatus === 'all' ? 'border-primary bg-primary/5 shadow-xs' : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total de Registros</span>
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-black text-foreground mt-1">{totalCount}</div>
          </Card>

          <Card 
            onClick={() => setFilterStatus("guardado")}
            className={`rounded-2xl border p-4 cursor-pointer transition-all ${
              filterStatus === 'guardado' ? 'border-amber-500 bg-amber-500/5 shadow-xs' : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Em Custódia</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{guardadosCount}</div>
          </Card>

          <Card 
            onClick={() => setFilterStatus("devolvido")}
            className={`rounded-2xl border p-4 cursor-pointer transition-all ${
              filterStatus === 'devolvido' ? 'border-emerald-600 bg-emerald-600/5 shadow-xs' : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Devolvidos</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{devolvidosCount}</div>
          </Card>

          <Card 
            onClick={() => setFilterStatus("descartado")}
            className={`rounded-2xl border p-4 cursor-pointer transition-all ${
              filterStatus === 'descartado' ? 'border-slate-500 bg-slate-500/5 shadow-xs' : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descartados / Doados</span>
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-black text-muted-foreground mt-1">{descartadosCount}</div>
          </Card>
        </div>

        {/* ── BARRA DE BUSCA E FILTROS ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-3 rounded-2xl shadow-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Buscar por descrição do objeto, apartamento, hóspede ou camareira..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9.5 rounded-xl bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-9.5 text-xs rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="guardado">📦 Guardados em Custódia</SelectItem>
                <SelectItem value="devolvido">✓ Devolvidos</SelectItem>
                <SelectItem value="descartado">🗑️ Descartados</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="h-9.5 px-3 text-xs font-bold rounded-xl gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </Button>
          </div>
        </div>

        {/* ── GRID DE ITENS ACHADOS E PERDIDOS (CARDS ULTRA-RICOS) ── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-3xl border border-border p-5 space-y-3 bg-card shadow-xs">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-24 rounded-lg" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-8 flex-1 rounded-xl" />
                  <Skeleton className="h-8 flex-1 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="rounded-3xl border border-dashed border-border p-12 text-center">
            <PackageOpen className="w-12 h-12 mx-auto text-amber-500 opacity-40 mb-3" />
            <h3 className="font-black text-sm text-foreground">Nenhum item encontrado</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Não há registros de objetos esquecidos para os filtros selecionados.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map(item => {
              const itemDate = item.createdAt ? format(parseISO(item.createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : "-"
              const cleanPhone = item.lastGuestPhone ? item.lastGuestPhone.replace(/\D/g, "") : ""
              const phoneWithDDI = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`
              const guestFirstName = item.lastGuestName ? item.lastGuestName.split(" ")[0] : "Hóspede"
              
              const whatsappMsg = `Olá, *${guestFirstName}*! Tudo bem?\nA equipe de governança do *CorpFlats Soho Residence* identificou que foi esquecido um(a) *${item.description}* no *Flat ${item.flatNumber}* após o seu check-out.\n\n📦 O objeto está guardado com segurança na nossa administração.\nComo prefere combinar a retirada ou envio?`
              const whatsappUrl = cleanPhone ? `https://api.whatsapp.com/send?phone=${phoneWithDDI}&text=${encodeURIComponent(whatsappMsg)}` : null

              return (
                <Card key={item.id} className="rounded-3xl border border-border shadow-xs flex flex-col justify-between overflow-hidden hover:border-border/80 transition-all bg-card">
                  <div>
                    {/* Imagem do Item com Efeito Hover de Zoom e Badge de Apartamento */}
                    {item.photoUrl ? (
                      <div 
                        className="relative h-44 bg-slate-950/10 dark:bg-slate-950 flex items-center justify-center cursor-pointer group overflow-hidden border-b border-border"
                        onClick={() => setSelectedPhotoModal(item.photoUrl || null)}
                      >
                        <img 
                          src={item.photoUrl} 
                          alt={item.description} 
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                          <Eye className="w-4 h-4" />
                          <span>Ver Foto Ampliada</span>
                        </div>
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-slate-900/85 text-white backdrop-blur-xs font-black text-xs shadow-sm">
                            Flat {item.flatNumber}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 bg-amber-500/5 dark:bg-amber-950/20 flex flex-col items-center justify-center border-b border-border relative">
                        <PackageOpen className="w-8 h-8 text-amber-500 opacity-60 mb-1" />
                        <span className="text-[11px] font-semibold text-muted-foreground">Sem foto anexada</span>
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-slate-900 text-white font-black text-xs">
                            Flat {item.flatNumber}
                          </Badge>
                        </div>
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* Status Badge e Data */}
                      <div className="flex items-center justify-between">
                        {item.status === "guardado" && (
                          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold text-[10px] border border-amber-500/30">
                            📦 Em Custódia
                          </Badge>
                        )}
                        {item.status === "devolvido" && (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                            ✓ Devolvido
                          </Badge>
                        )}
                        {item.status === "descartado" && (
                          <Badge className="bg-muted text-muted-foreground font-bold text-[10px]">
                            🗑️ Descartado / Doado
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">{itemDate}</span>
                      </div>

                      {/* Descrição e Local */}
                      <div>
                        <h3 className="font-black text-sm text-foreground leading-tight">
                          {item.description}
                        </h3>
                        {item.locationInRoom && (
                          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-primary shrink-0" />
                            <span>Local: <strong className="text-foreground">{item.locationInRoom}</strong></span>
                          </p>
                        )}
                        {item.foundBy && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Encontrado por: <strong>{item.foundBy}</strong>
                          </p>
                        )}
                      </div>

                      {/* Dados do Hóspede Anterior & Botão WhatsApp */}
                      <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <User className="w-3 h-3" /> Hóspede Associado
                          </span>
                        </div>
                        <div className="font-bold text-foreground">
                          {item.lastGuestName || "Hóspede Anterior"}
                        </div>
                        {item.lastGuestPhone && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono">{item.lastGuestPhone}</span>
                          </div>
                        )}

                        {whatsappUrl && item.status === "guardado" && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center justify-center gap-1.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Avisar Hóspede via WhatsApp</span>
                          </a>
                        )}
                      </div>

                      {/* Observações de devolução */}
                      {item.returnedTo && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-300">
                          <strong>Entregue a:</strong> {item.returnedTo}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded-xl border border-border">
                          {item.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé de Ações */}
                  <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {item.status !== "devolvido" && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(item, "devolvido")}
                          className="h-8 px-2.5 text-[11px] font-bold rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Dar Baixa</span>
                        </Button>
                      )}

                      {item.status === "devolvido" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateStatus(item, "guardado")}
                          className="h-8 px-2 text-[11px] font-bold rounded-xl"
                        >
                          Reabrir Custódia
                        </Button>
                      )}

                      {item.status === "guardado" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdateStatus(item, "descartado")}
                          className="h-8 px-2 text-[11px] font-bold text-muted-foreground rounded-xl"
                        >
                          Descartar
                        </Button>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteItem(item.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* ── MODAL: REGISTRAR NOVO ITEM ── */}
        <Dialog open={newModalOpen} onOpenChange={setNewModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                <span>Registrar Item Esquecido no Quarto</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre o objeto encontrado pela equipe de governança para controle de custódia
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateItem} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Número do Flat *</Label>
                <Select value={flatNumberInput} onValueChange={setFlatNumberInput} required>
                  <SelectTrigger className="h-10 text-xs rounded-xl">
                    <SelectValue placeholder="Selecione o apartamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {flats.map(f => (
                      <SelectItem key={f.id} value={String(f.number)}>Flat {f.number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição do Objeto *</Label>
                <Input 
                  placeholder="Ex: Carregador de iPhone branco, Relógio prata, Casaco preto..."
                  value={descriptionInput}
                  onChange={e => setDescriptionInput(e.target.value)}
                  required
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Local no Quarto (Opcional)</Label>
                <Input 
                  placeholder="Ex: Em cima da mesa de cabeceira, dentro do armário..."
                  value={locationInput}
                  onChange={e => setLocationInput(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Foto do Objeto</Label>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  onChange={handlePhotoUpload} 
                  className="hidden" 
                />
                
                {photoBase64 ? (
                  <div className="relative h-32 rounded-2xl overflow-hidden border border-border group">
                    <img src={photoBase64} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoBase64(null)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-16 rounded-2xl border-dashed border-2 flex flex-col items-center justify-center gap-1 text-xs"
                  >
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span>Tirar Foto ou Anexar Imagem</span>
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações Adicionais</Label>
                <Textarea 
                  placeholder="Anotações internas sobre o estado do item..."
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  rows={2}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setNewModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {submitting ? "Salvando..." : "Salvar Registro"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL: DAR BAIXA / DEVOLUÇÃO ── */}
        <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Registrar Devolução do Item</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Confirme quem recebeu o objeto e adicione observações de entrega
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmReturn} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Entregue para quem? *</Label>
                <Input 
                  placeholder="Nome do hóspede, portaria ou transportadora..."
                  value={returnedToInput}
                  onChange={e => setReturnedToInput(e.target.value)}
                  required
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações da Entrega</Label>
                <Textarea 
                  placeholder="Ex: Retirado presencialmente na portaria / Enviado via Sedex código..."
                  value={returnNotesInput}
                  onChange={e => setReturnNotesInput(e.target.value)}
                  rows={2}
                  className="text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setReturnModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submittingReturn} className="rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                  {submittingReturn ? "Gravando..." : "Confirmar Devolução"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL: FOTO AMPLIADA (ZOOM) ── */}
        <Dialog open={Boolean(selectedPhotoModal)} onOpenChange={(open) => { if (!open) setSelectedPhotoModal(null); }}>
          <DialogContent className="max-w-2xl bg-black/95 text-white border-0 rounded-3xl p-4 flex flex-col items-center">
            {selectedPhotoModal && (
              <img 
                src={selectedPhotoModal} 
                alt="Foto do Item Esquecido" 
                className="max-h-[80vh] w-auto object-contain rounded-2xl shadow-2xl" 
              />
            )}
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setSelectedPhotoModal(null)} 
              className="mt-3 text-xs font-bold rounded-xl border-white/20 text-white hover:bg-white/10"
            >
              Fechar Visualização
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
