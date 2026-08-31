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
  Edit2, Scale, DollarSign, Layers, Check
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
        alert("Configuração da Cesta de Café da Manhã Padrão atualizada com sucesso!")
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
              <Card className="rounded-xl border shadow-2xs p-3.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quartos com Pedido</div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {data?.totalOrders || 0}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">apartamentos agendados</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hóspedes Atendidos</div>
                <div className="text-2xl font-black text-amber-600 mt-1">
                  {data?.totalGuests || 0}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">pessoas no café da manhã</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Horários com Entregas</div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {data?.timeSlots?.length || 0}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">slots espaçados em 7 min</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wider">Capacidade por Quarto</div>
                <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mt-1 truncate">
                  1 a 3 Pessoas por Reserva
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Sem opção para 4 pessoas</div>
              </Card>
            </div>

            {/* Daily Insumes Required */}
            {data?.itemTotals && data.itemTotals.length > 0 && (
              <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                <CardHeader className="bg-muted/10 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    <span>Consumo Consolidado de Insumos para a Cozinha ({data.date})</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Total calculado conforme regras de porções por pessoa (Pão francês, queijo, manteiga, café, leite, etc.).
                  </CardDescription>
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
                          {slot.orders.length} {slot.orders.length > 1 ? "quartos" : "quarto"}
                        </Badge>
                      </div>
                    </div>

                    {/* Slot Orders List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {slot.orders.map((order: any) => {
                        const isReady = order.status === "ready" || order.status === "delivered"
                        return (
                          <Card 
                            key={order.id} 
                            className={`rounded-2xl border transition-all shadow-sm ${
                              isReady 
                                ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800" 
                                : "bg-card hover:border-amber-400"
                            }`}
                          >
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl font-black text-slate-900 dark:text-slate-100">
                                      Apt {order.roomNumber}
                                    </span>
                                    <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold">
                                      👥 {order.guestCount} {order.guestCount === 1 ? 'Pessoa' : 'Pessoas'}
                                    </Badge>
                                    <Badge variant="outline" className={`text-[10px] font-bold ${order.isStandard ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-blue-500/10 text-blue-600 border-blue-500/30'}`}>
                                      {order.isStandard ? '☕ Café Padrão' : '🎨 Personalizado'}
                                    </Badge>
                                  </div>
                                  <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                                    {order.clientName}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
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

                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteOrder(order.id)}
                                    className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>

                            <CardContent className="p-4 pt-2 space-y-3">
                              {/* Items list */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                                  Itens Totais da Cesta:
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
                          <span>Regra de Porção: <strong className="text-slate-800 dark:text-slate-200">{ing.portionRule === "multiplied" ? "Multiplicado por Pessoa" : "Porção Única por Cesta"}</strong></span>
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
                      <SelectItem value="fixed_basket">Porção Única por Cesta/Quarto</SelectItem>
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
                  Defina os itens que compõem a cesta rápida recomendada entregue aos hóspedes.
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
                    <Label className="text-xs font-bold">Pães da Cesta</Label>
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
                      Fruta da Cesta Padrão (Fruta do Dia)
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
      </div>
    </Shell>
  )
}
