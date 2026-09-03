import { useState, useEffect } from "react"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { AccessDenied } from "@/components/access-denied"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Coffee, Clock, Home as HomeIcon, Users, CheckCircle2, 
  Package, MessageCircle, Plus, ChevronRight, RefreshCw, AlertTriangle, Trash2, ExternalLink,
  Edit2, Scale, DollarSign, Layers, Check, Copy
} from "lucide-react"
import { format, addDays } from "date-fns"
import { ptBR } from "date-fns/locale"

function todayISO() { return format(new Date(), 'yyyy-MM-dd') }
function tomorrowISO() { return format(addDays(new Date(), 1), 'yyyy-MM-dd') }
function labelDate(iso: string) { return format(new Date(iso + 'T12:00:00'), "dd/MM", { locale: ptBR }) }
function fullDate(iso: string) { return format(new Date(iso + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR }) }

export default function BreakfastProduction() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const [mainTab, setMainTab] = useState<"orders" | "technical_sheet">("orders")
  const [activeDateTab, setActiveDateTab] = useState<"today" | "tomorrow">("today")
  const currentDate = activeDateTab === "today" ? todayISO() : tomorrowISO()

  const [data, setData] = useState<any>(null)
  const [ingredients, setIngredients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedSummary, setCopiedSummary] = useState(false)

  // Ingredient Modal
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<any | null>(null)
  const [ingName, setIngName] = useState("")
  const [ingCategory, setIngCategory] = useState("paes")
  const [ingUnit, setIngUnit] = useState("un")
  const [ingCost, setIngCost] = useState("0")
  const [ingStock, setIngStock] = useState("100")
  const [ingPortionRule, setIngPortionRule] = useState("multiplied")
  const [savingIngredient, setSavingIngredient] = useState(false)

  // Standard Breakfast Config Modal
  const [stdModalOpen, setStdModalOpen] = useState(false)
  const [stdConfig, setStdConfig] = useState<any>({
    coffee: "Café com leite",
    otherBeverage: "Suco de laranja",
    breads: ["Pão francês", "Pão de queijo"],
    accompaniments: ["Queijo mussarela", "Presunto"],
    complements: ["Manteiga"],
    sweets: ["Bolo do dia"],
    fruit: "Fruta do dia",
    fruitAvailableOptions: ["Banana", "Maçã", "Mamão"],
    sweetener: "Açúcar"
  })
  const [savingStdConfig, setSavingStdConfig] = useState(false)

  // Manual Order Modal
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualRoom, setManualRoom] = useState("")
  const [manualName, setManualName] = useState("")
  const [manualPhone, setManualPhone] = useState("")
  const [manualGuests, setManualGuests] = useState<"1" | "2" | "3">("2")
  const [manualTime, setManualTime] = useState("08:00")
  const [manualNotes, setManualNotes] = useState("")
  const [savingManual, setSavingManual] = useState(false)

  // Reminder Template Modal & States
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [reminderTemplate, setReminderTemplate] = useState(
    "Olá {nome}, vimos que você ainda não efetuou o seu pedido de café da manhã para o Flat {quarto} ({data}). Clique no link a seguir para escolher seus itens e horário: {link}. Precisamos recebê-lo o quanto antes para programar a produção e envio no horário escolhido!"
  )
  const [savingReminderTemplate, setSavingReminderTemplate] = useState(false)

  const handleSendReminder = (room: any) => {
    const guestName = room.guestName || "Hóspede"
    const flatNumber = room.flatNumber || ""
    const formattedDate = labelDate(currentDate)
    const link = `${window.location.origin}/cafe?res=${room.reservationCode || room.breakfastToken}`

    let msg = reminderTemplate
      .replace(/\{nome\}/gi, guestName)
      .replace(/\{quarto\}/gi, flatNumber)
      .replace(/\{data\}/gi, formattedDate)
      .replace(/\{link\}/gi, link)

    const phone = (room.guestPhone || "").replace(/\D/g, "")
    if (!phone) {
      navigator.clipboard.writeText(msg)
      alert(`O hóspede ${guestName} (Flat ${flatNumber}) não possui telefone com WhatsApp cadastrado. O texto de lembrete com o link foi copiado para a sua área de transferência!`)
      return
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank")
  }

  const handleCopyRoomLink = (room: any) => {
    const link = `${window.location.origin}/cafe?res=${room.reservationCode || room.breakfastToken}`
    navigator.clipboard.writeText(link)
    alert(`Link exclusivo do café para o Flat ${room.flatNumber} copiado!`)
  }

  const handleSaveReminderTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingReminderTemplate(true)
    try {
      const res = await fetch("/api/breakfast/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderTemplate }),
        credentials: "include"
      })
      if (res.ok) {
        setReminderModalOpen(false)
        alert("Mensagem padrão de lembrete salva com sucesso!")
        fetchOrders()
      }
    } catch {
      alert("Erro ao salvar mensagem padrão de lembrete.")
    } finally {
      setSavingReminderTemplate(false)
    }
  }

  const fetchStdConfig = async () => {
    try {
      const res = await fetch("/api/breakfast/standard-config", { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        setStdConfig(json)
      }
    } catch {}
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/breakfast/orders?date=${currentDate}`, { credentials: "include" })
      const json = await res.json()
      setData(json)
      if (json.reminderTemplate) {
        setReminderTemplate(json.reminderTemplate)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchIngredients = async () => {
    try {
      const res = await fetch("/api/breakfast/ingredients", { credentials: "include" })
      const json = await res.json()
      if (Array.isArray(json)) setIngredients(json)
    } catch {}
  }

  useEffect(() => {
    fetchOrders()
    fetchIngredients()
    fetchStdConfig()
  }, [currentDate])

  const handleSaveStdConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingStdConfig(true)
    try {
      const res = await fetch("/api/breakfast/standard-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stdConfig),
        credentials: "include"
      })
      if (res.ok) {
        setStdModalOpen(false)
        alert("Configuração do Pedido de Café da Manhã Padrão atualizada com sucesso!")
        fetchOrders()
      }
    } finally {
      setSavingStdConfig(false)
    }
  }

  const handleToggleStatus = async (orderId: number, currentStatus: string) => {
    const nextStatus = currentStatus === "ready" || currentStatus === "delivered" ? "pending" : "ready"
    await fetch(`/api/breakfast/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
      credentials: "include"
    })
    fetchOrders()
  }

  const handleSendWhatsApp = async (orderId: number) => {
    const res = await fetch(`/api/breakfast/orders/${orderId}/whatsapp`, { method: "POST", credentials: "include" })
    const json = await res.json()
    if (json.whatsappUrl) {
      window.open(json.whatsappUrl, "_blank")
    }
  }

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm("Deseja realmente cancelar este pedido de café?")) return
    await fetch(`/api/breakfast/orders/${orderId}`, { method: "DELETE", credentials: "include" })
    fetchOrders()
  }

  const handleOpenNewIngredient = () => {
    setEditingIngredient(null)
    setIngName("")
    setIngCategory("paes")
    setIngUnit("un")
    setIngCost("0.50")
    setIngStock("100")
    setIngPortionRule("multiplied")
    setIngredientModalOpen(true)
  }

  const handleEditIngredient = (ing: any) => {
    setEditingIngredient(ing)
    setIngName(ing.name || "")
    setIngCategory(ing.category || "paes")
    setIngUnit(ing.unit || "un")
    setIngCost(String(ing.costPerUnit || 0))
    setIngStock(String(ing.stock || 0))
    setIngPortionRule(ing.portionRule || "multiplied")
    setIngredientModalOpen(true)
  }

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ingName.trim()) return

    setSavingIngredient(true)
    try {
      await fetch("/api/breakfast/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ingName.trim(),
          category: ingCategory,
          unit: ingUnit,
          costPerUnit: Number(ingCost) || 0,
          stock: Number(ingStock) || 0,
          portionRule: ingPortionRule
        }),
        credentials: "include"
      })
      setIngredientModalOpen(false)
      fetchIngredients()
    } finally {
      setSavingIngredient(false)
    }
  }

  const handleCopyKitchenSummary = () => {
    if (!data) return
    const lines: string[] = []
    lines.push(`☕ *CAFÉ DA MANHÃ CORPFLATS — ${labelDate(currentDate)}*`)
    lines.push(`📅 Data: ${fullDate(currentDate)}`)
    lines.push("")
    lines.push("📊 *PANORAMA GERAL:*")
    lines.push(`• Total de Apartamentos com Pedido: ${data.totalOrders || 0}`)
    lines.push(`• Total de Hóspedes: ${data.totalGuests || 0} pessoas`)
    lines.push("")
    lines.push("🍳 *ITENS PARA PRODUÇÃO CONSOLIDADA (MISE EN PLACE):*")
    if (data.itemTotals && data.itemTotals.length > 0) {
      data.itemTotals.forEach((it: any) => {
        lines.push(`• ${it.name}: *${it.totalQuantity}×*`)
      })
    } else {
      lines.push("• Nenhum item pendente para produção.")
    }
    lines.push("")
    lines.push("⏱️ *CRONOGRAMA DE ENTREGAS POR HORÁRIO:*")
    if (data.timeSlots && data.timeSlots.length > 0) {
      data.timeSlots.forEach((slot: any) => {
        lines.push(`\n*Horário: ${slot.time}* (${slot.orders?.length || 0} quarto${(slot.orders?.length || 0) > 1 ? 's' : ''})`)
        slot.orders?.forEach((o: any) => {
          lines.push(`  → Apt ${o.roomNumber} (${o.guestCount} ${o.guestCount === 1 ? 'pessoa' : 'pessoas'}) - ${o.isStandard ? '☕ Padrão' : '🎨 Personalizado'} - ${o.clientName}`)
        })
      })
    }
    lines.push("\n_CorpFlats Room Service Gastronomia_")

    navigator.clipboard.writeText(lines.join("\n"))
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2500)
  }

  const handleSaveManualOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualRoom || !manualName) return

    setSavingManual(true)
    try {
      await fetch("/api/breakfast/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: manualRoom,
          clientName: manualName,
          phone: manualPhone,
          guestCount: Number(manualGuests) || 1,
          deliveryTime: manualTime,
          deliveryDate: currentDate,
          isStandard: true,
          orderType: "standard",
          notes: manualNotes
        }),
        credentials: "include"
      })
      setManualModalOpen(false)
      setManualRoom("")
      setManualName("")
      setManualPhone("")
      setManualNotes("")
      fetchOrders()
    } finally {
      setSavingManual(false)
    }
  }

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="o Painel de Produção do Café da Manhã" />
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full font-sans">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Coffee className="w-6 h-6 text-amber-600" />
                Gestão, Produção & Ficha Técnica de Café da Manhã
              </h1>
              <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold text-xs">
                Controle de Insumos & Cozinha
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Gestão de pedidos por horário (slots de 7 min), ficha técnica de insumos e consumo consolidado do dia.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setStdModalOpen(true)}
              className="text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              <Coffee className="w-3.5 h-3.5 text-amber-500" />
              <span>Configurar Café Padrão</span>
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open("/cafe", "_blank")}
              className="text-xs font-semibold gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Ver Portal (/cafe)</span>
            </Button>

            {mainTab === "orders" ? (
              <Button 
                size="sm" 
                onClick={() => setManualModalOpen(true)}
                className="text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Lançar Pedido Manual</span>
              </Button>
            ) : (
              <Button 
                size="sm" 
                onClick={handleOpenNewIngredient}
                className="text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar Insumo</span>
              </Button>
            )}
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/50 rounded-2xl border">
          <button
            type="button"
            onClick={() => setMainTab("orders")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mainTab === "orders"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Ordem de Produção & Entregas</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab("technical_sheet")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mainTab === "technical_sheet"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Scale className="w-4 h-4 text-indigo-600" />
            <span>Ficha Técnica & Insumos ({ingredients.length})</span>
          </button>
        </div>

        {/* Tab 1: Orders & Production */}
        {mainTab === "orders" && (
          <div className="space-y-6">
            {/* Day Selector Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-xl">
                <button
                  onClick={() => {
                    setActiveDateTab("today")
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeDateTab === "today"
                      ? "bg-background text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <span>Hoje ({labelDate(todayISO())})</span>
                </button>

                <button
                  onClick={() => {
                    setActiveDateTab("tomorrow")
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeDateTab === "tomorrow"
                      ? "bg-background text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <span>Amanhã ({labelDate(tomorrowISO())})</span>
                </button>
              </div>

              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{fullDate(currentDate)}</span>
              </div>
            </div>

            {/* Top KPIs Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="rounded-xl border shadow-2xs p-3.5 bg-card">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Café Contratado no Dia</div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 flex items-baseline gap-1">
                  <span>{data?.totalEligible ?? ((data?.totalOrders || 0) + (data?.pendingRooms?.length || 0))}</span>
                  <span className="text-xs font-bold text-muted-foreground">flats</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">com café da manhã incluso</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Pedidos Concluídos</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline gap-1">
                  <span>{data?.totalOrders || 0}</span>
                  <span className="text-xs font-bold text-emerald-700/70">agendados</span>
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/70 mt-0.5">horário & opções definidos</div>
              </Card>

              <Card className={`rounded-xl border shadow-2xs p-3.5 transition-all ${
                (data?.pendingRooms?.length || 0) > 0 
                  ? "bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/40" 
                  : "bg-card"
              }`}>
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${
                  (data?.pendingRooms?.length || 0) > 0 ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"
                }`}>
                  Aguardando Pedido
                </div>
                <div className={`text-2xl font-black mt-1 flex items-baseline gap-1 ${
                  (data?.pendingRooms?.length || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
                }`}>
                  <span>{data?.totalPending ?? data?.pendingRooms?.length ?? 0}</span>
                  <span className="text-xs font-bold">pendentes</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">ainda não escolheram</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hóspedes Atendidos</div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {data?.totalGuests || 0}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">pessoas com pedido confirmado</div>
              </Card>
            </div>

            {/* Seção: Quartos com Café Aguardando Pedido */}
            {data?.pendingRooms && data.pendingRooms.length > 0 && (
              <Card className="rounded-2xl border-amber-300 dark:border-amber-700/60 bg-gradient-to-r from-amber-50/80 via-background to-background dark:from-amber-950/30 dark:via-background dark:to-background shadow-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 border-b border-amber-200 dark:border-amber-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                      </span>
                      <CardTitle className="text-base font-black text-amber-950 dark:text-amber-200 flex items-center gap-2">
                        Quartos com Café Aguardando Pedido ({data.pendingRooms.length})
                      </CardTitle>
                      <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 font-black text-[10px]">
                        Lembrete Pendente
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-amber-900/80 dark:text-amber-300/80">
                      Estes apartamentos têm café da manhã contratado para <strong>{labelDate(currentDate)}</strong>, mas ainda não enviaram as opções e o horário. Envie o lembrete com link exclusivo pelo WhatsApp.
                    </CardDescription>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReminderModalOpen(true)}
                    className="h-8 text-xs font-bold gap-1.5 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-950 shrink-0"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Editar Mensagem Padrão</span>
                  </Button>
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.pendingRooms.map((room: any, idx: number) => (
                      <div 
                        key={room.reservationId || idx}
                        className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-800/40 bg-card hover:shadow-md transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center font-black text-base border border-amber-500/30">
                              {room.flatNumber}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-foreground leading-tight">
                                {room.guestName}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span>{room.guestCount} {room.guestCount === 1 ? "pessoa" : "pessoas"}</span>
                                <span>•</span>
                                <span>{room.guestPhone || "Sem telefone"}</span>
                              </div>
                            </div>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-[10px] font-bold">
                            Aguardando Pedido
                          </Badge>
                        </div>

                        <div className="pt-1 flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSendReminder(room)}
                            className="flex-1 h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Enviar Lembrete</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyRoomLink(room)}
                            title="Copiar Link Individual do Café"
                            className="h-8 px-2.5 text-xs font-bold border-muted-foreground/30 hover:bg-muted"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(room.breakfastLink || `/cafe?res=${room.reservationCode || room.breakfastToken}`, "_blank")}
                            title="Abrir página de pedido do hóspede"
                            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily Insumes Required */}
            {data?.itemTotals && data.itemTotals.length > 0 && (
              <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                <CardHeader className="bg-muted/10 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-600" />
                      <span>Consumo Consolidado de Insumos para a Cozinha ({data.date})</span>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Itens unificados e normalizados sem duplicidades (Pedido Padrão e Personalizados somados).
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKitchenSummary}
                    className="self-start sm:self-auto text-xs font-bold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-600" />}
                    <span>{copiedSummary ? "Copiado!" : "Copiar Resumo da Cozinha"}</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {data.itemTotals.map((it: any, idx: number) => (
                      <div key={idx} className="p-2.5 bg-muted/20 border rounded-xl flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate mr-2">{it.name}</span>
                        <span className="font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-lg shrink-0">
                          {it.totalQuantity}×
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time Slots & Orders Grid */}
            {loading ? (
              <div className="text-center py-12 text-xs text-muted-foreground">Carregando pedidos da cozinha...</div>
            ) : !data?.timeSlots || data.timeSlots.length === 0 ? (
              <Card className="border-dashed bg-muted/10 p-12 text-center rounded-2xl">
                <Coffee className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Nenhum pedido de café para esta data</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Os pedidos feitos pelos hóspedes no link <code className="bg-muted px-1.5 py-0.5 rounded">/cafe</code> aparecem aqui automaticamente.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {data.timeSlots.map((slot: any) => (
                  <div key={slot.time} className="space-y-3">
                    {/* Time slot header */}
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          <Clock className="w-4 h-4" />
                        </div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                          Entrega às {slot.time}
                        </h2>
                        <Badge variant="outline" className="text-xs font-mono font-bold">
                          {slot.orders.filter((o: any) => o.status !== "cancelled").length} {slot.orders.filter((o: any) => o.status !== "cancelled").length === 1 ? "quarto" : "quartos"}
                        </Badge>
                        {slot.orders.some((o: any) => o.status === "cancelled") && (
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            {slot.orders.filter((o: any) => o.status === "cancelled").length} cancelado(s)
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Slot Orders List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {slot.orders.map((order: any) => {
                        const isCancelled = order.status === "cancelled"
                        const isReady = order.status === "ready" || order.status === "delivered"
                        return (
                          <Card 
                            key={order.id} 
                            className={`rounded-2xl border transition-all shadow-sm ${
                              isCancelled
                                ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 opacity-85"
                                : isReady 
                                  ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800" 
                                  : "bg-card hover:border-amber-400"
                            }`}
                          >
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xl font-black ${isCancelled ? 'line-through text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                      Apt {order.roomNumber}
                                    </span>
                                    {isCancelled ? (
                                      <Badge variant="destructive" className="text-[10px] font-black">
                                        🚫 CANCELADO
                                      </Badge>
                                    ) : (
                                      <>
                                        <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold">
                                          👥 {order.guestCount} {order.guestCount === 1 ? 'Pessoa' : 'Pessoas'}
                                        </Badge>
                                        <Badge variant="outline" className={`text-[10px] font-bold ${order.isStandard ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-blue-500/10 text-blue-600 border-blue-500/30'}`}>
                                          {order.isStandard ? '☕ Café Padrão' : '🎨 Personalizado'}
                                        </Badge>
                                      </>
                                    )}
                                  </div>
                                  <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                                    {order.clientName}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {isCancelled ? (
                                    <Badge variant="outline" className="border-rose-400 text-rose-700 dark:text-rose-300 text-[10px] font-bold bg-rose-100/60">
                                      Não Produzir
                                    </Badge>
                                  ) : (
                                    <Button 
                                      size="sm" 
                                      onClick={() => handleToggleStatus(order.id, order.status)}
                                      className={`h-8 text-xs font-bold px-2.5 rounded-lg ${
                                        isReady 
                                          ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                                          : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                      }`}
                                    >
                                      {isReady ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 mr-1" />
                                          <span>Pronto / Entregue</span>
                                        </>
                                      ) : (
                                        <span>Marcar Pronto</span>
                                      )}
                                    </Button>
                                  )}

                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteOrder(order.id)}
                                    className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                                    title="Excluir pedido"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {isCancelled && (
                                <div className="mt-2 p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-bold flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                  <span>MOTIVO: {order.cancelReason || "Reserva cancelada ou check-out antecipado"} (NÃO PREPARAR)</span>
                                </div>
                              )}
                            </CardHeader>

                            <CardContent className="p-4 pt-2 space-y-3">
                              {/* Items list */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                                  Itens Totais do Pedido:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {order.items?.map((it: any, idx: number) => (
                                    <Badge key={idx} variant="outline" className="text-[11px] py-0.5 px-2 bg-muted/30">
                                      {it.quantity}x {it.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              {/* Detalhamento por Hóspede (quando individual/personalizado) */}
                              {order.guestChoices && order.guestChoices.length > 0 && !order.isStandard && (
                                <div className="space-y-1.5 p-2.5 bg-muted/30 rounded-xl border text-xs">
                                  <span className="text-[10px] font-black uppercase text-muted-foreground block">
                                    Escolha de Cada Hóspede:
                                  </span>
                                  <div className="space-y-1">
                                    {order.guestChoices.map((gc: any, idx: number) => (
                                      <div key={idx} className="border-b last:border-0 pb-1 pt-0.5 text-[11px]">
                                        <span className="font-bold text-foreground">
                                          👤 {gc.guestName || `Hóspede ${gc.guestIndex}`}: 
                                        </span>{" "}
                                        <span className="text-muted-foreground">
                                          {[
                                            gc.coffee,
                                            gc.otherBeverage,
                                            ...(gc.breads || []),
                                            ...(gc.accompaniments || []),
                                            ...(gc.complements || []),
                                            ...(gc.sweets || []),
                                            gc.fruit ? `${gc.fruit}${gc.fruitHoney ? ' (c/ mel)' : ''}${gc.fruitSaladOption ? ` (${gc.fruitSaladOption})` : ''}` : null,
                                            gc.sweetener
                                          ].filter(Boolean).filter(v => v !== 'Não quero café' && v !== 'Nenhuma outra bebida' && v !== 'Nenhuma fruta' && v !== 'Não quero nenhum desses' && v !== 'Nenhum').join(", ")}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Conditional questions / details (Ex: Mel no mamão, salada de frutas) */}
                              {order.preferences && (
                                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[11px] space-y-1">
                                  {order.preferences.fruit && (
                                    <div>
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Fruta: </span>
                                      <span>{order.preferences.fruit} {order.preferences.fruitHoney ? "(com mel)" : ""} {order.preferences.fruitSaladOption ? `(${order.preferences.fruitSaladOption})` : ""}</span>
                                    </div>
                                  )}
                                  {order.preferences.sweetener && (
                                    <div>
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Adoçamento: </span>
                                      <span>{order.preferences.sweetener}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {order.notes && (
                                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300">
                                  <span className="font-bold block text-[10px] uppercase">Restrição / Observação:</span>
                                  {order.notes}
                                </div>
                              )}

                              {/* WhatsApp Direct Notify */}
                              {order.phone && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleSendWhatsApp(order.id)}
                                  className="w-full text-xs font-semibold h-8 gap-1.5 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>Avisar no WhatsApp que o Café Saiu</span>
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Technical Sheet & Ingredients CRUD */}
        {mainTab === "technical_sheet" && (
          <div className="space-y-4">
            <Card className="rounded-2xl border shadow-2xs overflow-hidden">
              <CardHeader className="bg-muted/10 border-b pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    Ficha Técnica & Tabela de Insumos ({ingredients.length})
                  </span>
                  <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200">
                    Controle de Custo e Porções
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Cadastre ingredientes, defina unidades de medida (un, kg, L), custos unitários e estoque mínimo.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0">
                <div className="divide-y">
                  {ingredients.map((ing) => (
                    <div key={ing.id} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{ing.name}</span>
                          <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-[10px] uppercase font-bold">
                            {ing.unit}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground capitalize">
                            {ing.category}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-0.5">
                          <span>Custo Unitário: <strong className="text-slate-800 dark:text-slate-200">R$ {Number(ing.costPerUnit || 0).toFixed(2)}</strong></span>
                          <span>Estoque Atual: <strong className="text-slate-800 dark:text-slate-200">{ing.stock || 0} {ing.unit}</strong></span>
                          <span>Regra de Porção: <strong className="text-slate-800 dark:text-slate-200">{ing.portionRule === "multiplied" ? "Multiplicado por Pessoa" : "Porção Única por Pedido/Quarto"}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditIngredient(ing)}
                          className="font-semibold text-xs gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar Insumo</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Modal: Create / Edit Ingredient */}
        <Dialog open={ingredientModalOpen} onOpenChange={setIngredientModalOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSaveIngredient}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-600" />
                  {editingIngredient ? "Editar Insumo" : "Cadastrar Novo Insumo"}
                </DialogTitle>
                <DialogDescription>
                  Defina o nome, unidade de medida, custo e regras de cálculo para a ficha técnica.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome do Insumo *</Label>
                  <Input value={ingName} onChange={e => setIngName(e.target.value)} required placeholder="Ex: Pão Francês Tradicional" className="text-xs" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={ingCategory} onValueChange={setIngCategory}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paes">🍞 Pães & Torradas</SelectItem>
                        <SelectItem value="bebidas">☕ Cafés & Bebidas</SelectItem>
                        <SelectItem value="frios">🧀 Frios & Queijos</SelectItem>
                        <SelectItem value="bolos">🍰 Bolos & Doces</SelectItem>
                        <SelectItem value="frutas">🍎 Frutas</SelectItem>
                        <SelectItem value="outros">📦 Outros Insumos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Unidade de Medida</Label>
                    <Select value={ingUnit} onValueChange={setIngUnit}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="un">Unidade (un)</SelectItem>
                        <SelectItem value="kg">Quilograma (kg)</SelectItem>
                        <SelectItem value="g">Gramas (g)</SelectItem>
                        <SelectItem value="L">Litros (L)</SelectItem>
                        <SelectItem value="ml">Mililitros (ml)</SelectItem>
                        <SelectItem value="pote">Pote / Sache</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Custo por Unidade (R$)</Label>
                    <Input type="number" step="0.01" value={ingCost} onChange={e => setIngCost(e.target.value)} placeholder="0.50" className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estoque Atual</Label>
                    <Input type="number" value={ingStock} onChange={e => setIngStock(e.target.value)} placeholder="100" className="text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Regra de Cálculo de Porção</Label>
                  <Select value={ingPortionRule} onValueChange={setIngPortionRule}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiplied">Multiplicado pela Qtd. de Pessoas</SelectItem>
                      <SelectItem value="fixed_basket">Porção Única por Pedido/Quarto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setIngredientModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingIngredient} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {savingIngredient ? "Salvando..." : "Salvar Insumo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Manual Order */}
        <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSaveManualOrder}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-600" />
                  Lançar Pedido Manual de Café
                </DialogTitle>
                <DialogDescription>
                  Para hóspedes que solicitaram o café diretamente na recepção ou por telefone.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Número do Apartamento *</Label>
                    <Input value={manualRoom} onChange={e => setManualRoom(e.target.value)} required placeholder="Ex: 113" className="text-xs font-bold" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd. de Pessoas (1 a 3) *</Label>
                    <Select value={manualGuests} onValueChange={(v: any) => setManualGuests(v)}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Pessoa</SelectItem>
                        <SelectItem value="2">2 Pessoas</SelectItem>
                        <SelectItem value="3">3 Pessoas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nome do Hóspede *</Label>
                  <Input value={manualName} onChange={e => setManualName(e.target.value)} required placeholder="Nome completo" className="text-xs" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">WhatsApp / Celular</Label>
                    <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="(21) 99999-9999" className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Horário de Entrega</Label>
                    <Input value={manualTime} onChange={e => setManualTime(e.target.value)} placeholder="08:00" className="text-xs font-bold" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações / Restrições</Label>
                  <Textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Sem lactose, ovos mexidos, café puro..." className="text-xs resize-none" rows={2} />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setManualModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingManual} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {savingManual ? "Salvando..." : "Lançar Pedido"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Configurar Café da Manhã Padrão */}
        <Dialog open={stdModalOpen} onOpenChange={setStdModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <form onSubmit={handleSaveStdConfig}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Coffee className="w-5 h-5" />
                  Configurar Café da Manhã Padrão CorpFlats
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Defina os itens que compõem o pedido padrão recomendado entregue aos hóspedes.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Café / Bebida Quente</Label>
                    <Input 
                      value={stdConfig?.coffee || ""} 
                      onChange={e => setStdConfig({ ...stdConfig, coffee: e.target.value })} 
                      placeholder="Ex: Café com leite" 
                      className="text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Bebida Fria / Suco</Label>
                    <Input 
                      value={stdConfig?.otherBeverage || ""} 
                      onChange={e => setStdConfig({ ...stdConfig, otherBeverage: e.target.value })} 
                      placeholder="Ex: Suco de laranja" 
                      className="text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Pães do Pedido Padrão</Label>
                    <Input 
                      value={Array.isArray(stdConfig?.breads) ? stdConfig.breads.join(", ") : (stdConfig?.breads || "")} 
                      onChange={e => setStdConfig({ ...stdConfig, breads: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} 
                      placeholder="Ex: Pão francês, Pão de queijo" 
                      className="text-xs" 
                    />
                    <span className="text-[10px] text-muted-foreground block">Separar por vírgula</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Queijo & Frios</Label>
                    <Input 
                      value={Array.isArray(stdConfig?.accompaniments) ? stdConfig.accompaniments.join(", ") : (stdConfig?.accompaniments || "")} 
                      onChange={e => setStdConfig({ ...stdConfig, accompaniments: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} 
                      placeholder="Ex: Queijo mussarela, Presunto" 
                      className="text-xs" 
                    />
                    <span className="text-[10px] text-muted-foreground block">Separar por vírgula</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Complementos</Label>
                    <Input 
                      value={Array.isArray(stdConfig?.complements) ? stdConfig.complements.join(", ") : (stdConfig?.complements || "")} 
                      onChange={e => setStdConfig({ ...stdConfig, complements: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} 
                      placeholder="Ex: Manteiga" 
                      className="text-xs" 
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Bolo / Doce do Dia</Label>
                    <Input 
                      value={Array.isArray(stdConfig?.sweets) ? stdConfig.sweets.join(", ") : (stdConfig?.sweets || "")} 
                      onChange={e => setStdConfig({ ...stdConfig, sweets: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} 
                      placeholder="Ex: Bolo do dia" 
                      className="text-xs" 
                    />
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-amber-900 dark:text-amber-300">
                      Fruta do Pedido Padrão (Fruta do Dia)
                    </Label>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Nome da Categoria</Label>
                      <Input 
                        value={stdConfig?.fruit || "Fruta do dia"} 
                        onChange={e => setStdConfig({ ...stdConfig, fruit: e.target.value })} 
                        placeholder="Fruta do dia" 
                        className="text-xs bg-background" 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Opções Disponíveis para Escolha</Label>
                      <Input 
                        value={Array.isArray(stdConfig?.fruitAvailableOptions) ? stdConfig.fruitAvailableOptions.join(", ") : (stdConfig?.fruitAvailableOptions || "")} 
                        onChange={e => setStdConfig({ ...stdConfig, fruitAvailableOptions: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} 
                        placeholder="Banana, Maçã, Mamão" 
                        className="text-xs bg-background" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Adoçamento Padrão</Label>
                  <Input 
                    value={stdConfig?.sweetener || "Açúcar"} 
                    onChange={e => setStdConfig({ ...stdConfig, sweetener: e.target.value })} 
                    placeholder="Ex: Açúcar" 
                    className="text-xs" 
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setStdModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingStdConfig} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {savingStdConfig ? "Salvando..." : "Salvar Configuração"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Editar Mensagem Padrão de Lembrete */}
        <Dialog open={reminderModalOpen} onOpenChange={setReminderModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Editar Mensagem Padrão de Lembrete</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Esta mensagem será utilizada ao clicar em <strong>Enviar Lembrete</strong> para os hóspedes com café que ainda não enviaram o pedido.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveReminderTemplate} className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Texto da Mensagem</Label>
                  <span className="text-[11px] text-muted-foreground">Clique para adicionar tags:</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { tag: "{nome}", label: "Nome do Hóspede" },
                    { tag: "{quarto}", label: "Número do Quarto" },
                    { tag: "{data}", label: "Data da Entrega" },
                    { tag: "{link}", label: "Link Individual do Café" },
                  ].map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => setReminderTemplate(prev => prev + " " + v.tag)}
                      className="text-[11px] px-2 py-0.5 bg-muted hover:bg-muted/80 rounded-md font-mono border border-border text-foreground transition-colors"
                      title={v.label}
                    >
                      <span className="font-bold text-amber-600 dark:text-amber-400">{v.tag}</span>
                    </button>
                  ))}
                </div>

                <Textarea
                  value={reminderTemplate}
                  onChange={(e) => setReminderTemplate(e.target.value)}
                  rows={5}
                  required
                  className="text-xs font-mono leading-relaxed"
                  placeholder="Digite a mensagem padrão..."
                />
              </div>

              {/* Live Preview */}
              <div className="p-3 bg-muted/40 rounded-xl border space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Pré-visualização do texto no WhatsApp:
                </span>
                <div className="text-xs text-slate-800 dark:text-slate-200 bg-background/80 p-2.5 rounded-lg border leading-relaxed break-words">
                  {reminderTemplate
                    .replace(/\{nome\}/gi, "Carlos Silva")
                    .replace(/\{quarto\}/gi, "113")
                    .replace(/\{data\}/gi, labelDate(currentDate))
                    .replace(/\{link\}/gi, `${window.location.origin}/cafe?res=RES-113-0034`)
                  }
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReminderTemplate("Olá {nome}, vimos que você ainda não efetuou o seu pedido de café da manhã para o Flat {quarto} ({data}). Clique no link a seguir para escolher seus itens e horário: {link}. Precisamos recebê-lo o quanto antes para programar a produção e envio no horário escolhido!")}
                  className="text-xs text-muted-foreground hover:text-foreground mr-auto"
                >
                  Restaurar Padrão
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReminderModalOpen(false)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingReminderTemplate}
                    className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {savingReminderTemplate ? "Salvando..." : "Salvar Mensagem"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
