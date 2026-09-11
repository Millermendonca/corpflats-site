import { useState, useEffect, useMemo } from "react"
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
import { useToast } from "@/hooks/use-toast"
import { 
  Coffee, Clock, Home as HomeIcon, Users, CheckCircle2, 
  Package, MessageCircle, Plus, ChevronRight, RefreshCw, AlertTriangle, Trash2, ExternalLink,
  Edit2, Scale, DollarSign, Layers, Check, Copy, Flame, Send, Loader2, ChefHat,
  Search, Calendar, Filter, Download, ArrowUpDown, TrendingUp, BarChart3, Star, Beef, Utensils,
  ChevronDown, ChevronUp, History, User, ShoppingBag, FileSpreadsheet, RotateCcw
} from "lucide-react"
import { format, addDays, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area
} from "recharts"

function todayISO() { return format(new Date(), 'yyyy-MM-dd') }
function tomorrowISO() { return format(addDays(new Date(), 1), 'yyyy-MM-dd') }
function labelDate(iso: string) { return format(new Date(iso + 'T12:00:00'), "dd/MM", { locale: ptBR }) }
function fullDate(iso: string) { return format(new Date(iso + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR }) }

export default function BreakfastProduction() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  type MainTabType = "orders" | "history" | "insights" | "technical_sheet"
  const [mainTab, setMainTab] = useState<MainTabType>(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname
      const s = new URLSearchParams(window.location.search)
      const tabParam = s.get("tab")
      if (tabParam === "history" || p === "/historico-cafe") return "history"
      if (tabParam === "insights" || tabParam === "relatorios" || p === "/relatorios-cafe" || p === "/insights-cafe") return "insights"
      if (tabParam === "sheet" || tabParam === "technical_sheet") return "technical_sheet"
    }
    return "orders"
  })
  const [activeDateTab, setActiveDateTab] = useState<"today" | "tomorrow">("today")
  const currentDate = activeDateTab === "today" ? todayISO() : tomorrowISO()

  const [data, setData] = useState<any>(null)
  const [ingredients, setIngredients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const { toast } = useToast()
  const [sendingNotify, setSendingNotify] = useState<{ [key: string]: boolean }>({})

  // History Tab States
  const [historyOrders, setHistoryOrders] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyStartDate, setHistoryStartDate] = useState("")
  const [historyEndDate, setHistoryEndDate] = useState("")
  const [historyStatus, setHistoryStatus] = useState("all")
  const [historyRoom, setHistoryRoom] = useState("all")
  const [historySearch, setHistorySearch] = useState("")
  const [historyQuickRange, setHistoryQuickRange] = useState("all")
  const [expandedHistoryOrder, setExpandedHistoryOrder] = useState<{ [key: number]: boolean }>({})

  // Insights Tab States
  const [insightsPeriod, setInsightsPeriod] = useState<"all" | "7d" | "30d" | "90d">("all")
  const [insightsData, setInsightsData] = useState<any>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [showAllTopItems, setShowAllTopItems] = useState(false)
  const [showAllCostIngredients, setShowAllCostIngredients] = useState(false)

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
    coffee: "Café, Leite",
    otherBeverage: "Suco de laranja",
    breads: ["Pão francês", "Pão de queijo"],
    accompaniments: ["Queijo mussarela", "Presunto"],
    complements: ["Manteiga"],
    sweets: ["Bolo do dia"],
    fruit: "Fruta do dia",
    fruitAvailableOptions: ["Fruta do dia (Mamão, maçã ou banana)"],
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
    const link = `${window.location.origin}/cafe?res=${room.reservationCode || room.breakfastToken}&v=1`

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
    const link = `${window.location.origin}/cafe?res=${room.reservationCode || room.breakfastToken}&v=1`
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

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams()
      if (historyStartDate) params.set("startDate", historyStartDate)
      if (historyEndDate) params.set("endDate", historyEndDate)
      if (historyStatus && historyStatus !== "all") params.set("status", historyStatus)
      if (historyRoom && historyRoom !== "all") params.set("roomNumber", historyRoom)
      if (historySearch.trim()) params.set("search", historySearch.trim())

      const res = await fetch(`/api/breakfast/orders/history?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        setHistoryOrders(json.orders || [])
      }
    } catch (err) {
      console.error("Erro ao buscar histórico:", err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchInsights = async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch(`/api/breakfast/orders/insights?period=${insightsPeriod}`, { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        setInsightsData(json)
      }
    } catch (err) {
      console.error("Erro ao buscar insights:", err)
    } finally {
      setInsightsLoading(false)
    }
  }

  const handleQuickRange = (range: "today" | "yesterday" | "7d" | "30d" | "all") => {
    setHistoryQuickRange(range)
    if (range === "today") {
      setHistoryStartDate(todayISO())
      setHistoryEndDate(todayISO())
    } else if (range === "yesterday") {
      const y = format(subDays(new Date(), 1), 'yyyy-MM-dd')
      setHistoryStartDate(y)
      setHistoryEndDate(y)
    } else if (range === "7d") {
      setHistoryStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
      setHistoryEndDate(todayISO())
    } else if (range === "30d") {
      setHistoryStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
      setHistoryEndDate(todayISO())
    } else if (range === "all") {
      setHistoryStartDate("")
      setHistoryEndDate("")
    }
  }

  const handleReactivateOrder = async (order: any) => {
    if (!confirm(`Deseja reativar o pedido do Apt ${order.roomNumber} (${order.clientName})?`)) return
    try {
      const res = await fetch(`/api/breakfast/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", cancelReason: null }),
        credentials: "include"
      })
      if (res.ok) {
        toast({
          title: "Pedido Reativado!",
          description: `O pedido do Apt ${order.roomNumber} voltou para a fila de produção ativa.`
        })
        fetchOrders()
        fetchHistory()
        if (mainTab === "insights") fetchInsights()
      } else {
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível reativar o pedido." })
      }
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha de conexão com o servidor." })
    }
  }

  const handleExportCSV = () => {
    if (!historyOrders || historyOrders.length === 0) {
      toast({ title: "Sem dados", description: "Não há pedidos para exportar com o filtro atual." })
      return
    }
    const headers = ["Data", "Horário", "Quarto", "Hóspede", "Qtd Pessoas", "Tipo", "Status", "Motivo Cancelamento", "Itens", "Observações", "Telefone"]
    const rows = historyOrders.map(o => [
      o.date || "",
      o.deliveryTime || "",
      `"${o.roomNumber || ""}"`,
      `"${(o.clientName || "").replace(/"/g, '""')}"`,
      o.guestCount || 1,
      o.isStandard ? "Padrão" : "Personalizado",
      o.status === "cancelled" ? "Cancelado" : o.status === "ready" || o.status === "delivered" ? "Entregue" : o.status === "in_production" ? "Em Produção" : "Pendente",
      `"${(o.cancelReason || "").replace(/"/g, '""')}"`,
      `"${(o.items || []).map((i: any) => `${i.quantity || 1}x ${i.name || i}`).join(", ").replace(/"/g, '""')}"`,
      `"${(o.notes || "").replace(/"/g, '""')}"`,
      `"${o.phone || ""}"`
    ])
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `pedidos_cafe_historico_${format(new Date(), "yyyyMMdd_HHmm")}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const availableRooms = useMemo(() => {
    const set = new Set<string>()
    ;(historyOrders || []).forEach(o => {
      if (o.roomNumber) set.add(String(o.roomNumber))
    })
    if (data?.orders) {
      data.orders.forEach((o: any) => {
        if (o.roomNumber) set.add(String(o.roomNumber))
      })
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [historyOrders, data])

  useEffect(() => {
    fetchOrders()
    fetchIngredients()
    fetchStdConfig()
  }, [currentDate])

  useEffect(() => {
    if (mainTab === "history") {
      fetchHistory()
    }
  }, [mainTab, historyStartDate, historyEndDate, historyStatus, historyRoom])

  useEffect(() => {
    if (mainTab === "insights") {
      fetchInsights()
    }
  }, [mainTab, insightsPeriod])

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

  const handleSetStatus = async (orderId: number, nextStatus: string) => {
    try {
      await fetch(`/api/breakfast/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
        credentials: "include"
      })
      fetchOrders()
    } catch {}
  }

  const handleToggleStatus = async (orderId: number, currentStatus: string) => {
    const nextStatus = currentStatus === "ready" || currentStatus === "delivered" ? "pending" : "ready"
    handleSetStatus(orderId, nextStatus)
  }

  const handleNotifyGuest = async (order: any, type: "in_production" | "on_the_way") => {
    const phone = (order.phone || "").replace(/\D/g, "")
    if (!phone) {
      toast({
        variant: "destructive",
        title: "Telefone não cadastrado",
        description: `O pedido do Apt ${order.roomNumber} (${order.clientName}) não possui WhatsApp válido cadastrado.`
      })
      return
    }

    const notifyKey = `${order.id}_${type}`
    setSendingNotify(prev => ({ ...prev, [notifyKey]: true }))

    try {
      const res = await fetch(`/api/breakfast/orders/${order.id}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
        credentials: "include"
      })
      const json = await res.json()

      if (res.ok && json.success) {
        toast({
          title: type === "in_production" ? "🍳 Pedido em Produção Avisado!" : "🚀 Café a Caminho Avisado!",
          description: json.simulated
            ? `[Simulação API] Mensagem enviada para ${order.clientName} (Apt ${order.roomNumber})!`
            : `Mensagem enviada com sucesso via WhatsApp para ${order.clientName} (Apt ${order.roomNumber})!`
        })
        fetchOrders()
      } else {
        toast({
          variant: "destructive",
          title: "Falha no envio da API",
          description: json.error || "Não foi possível enviar a mensagem. Abrindo WhatsApp Web..."
        })
        if (json.whatsappUrl) {
          window.open(json.whatsappUrl, "_blank")
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Falha de conexão",
        description: err?.message || "Erro ao conectar com o servidor."
      })
    } finally {
      setSendingNotify(prev => ({ ...prev, [notifyKey]: false }))
    }
  }

  const handleCancelOrDeleteOrder = async (order: any) => {
    if (order.status === "cancelled") {
      if (!confirm(`Deseja excluir o registro do pedido cancelado do Apt ${order.roomNumber} definitivamente?`)) return
      await fetch(`/api/breakfast/orders/${order.id}`, { method: "DELETE", credentials: "include" })
      fetchOrders()
      return
    }

    const reason = prompt(`Informe o motivo do cancelamento para o Apt ${order.roomNumber} (ex: Hóspede avisou no WhatsApp / Saiu mais cedo / Não quer café hoje):`)
    if (reason === null) return

    await fetch(`/api/breakfast/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        status: "cancelled", 
        cancelReason: reason.trim() ? `Cancelamento manual: ${reason.trim()}` : "Cancelado manualmente pela recepção / cozinha"
      }),
      credentials: "include"
    })
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
          let fruitDetail = ""
          if (o.orderMode === "individual" && o.guestChoices && o.guestChoices.length > 0) {
            fruitDetail = " | " + o.guestChoices.map((gc: any) => 
              `${gc.guestName ? gc.guestName.split(' ')[0] : `H${gc.guestIndex}`}: ${gc.fruit || 'Sem fruta'}${gc.fruitHoney ? ' (c/ mel)' : ''}${gc.fruit === 'Salada de frutas' ? ` (${gc.fruitSaladOption || 'Salada pura'})` : ''}`
            ).join(", ")
          } else if (o.preferences?.fruit) {
            fruitDetail = ` | Fruta: ${o.preferences.fruit}${o.preferences.fruitHoney ? ' (c/ mel)' : ''}${o.preferences.fruit === 'Salada de frutas' ? ` (${o.preferences.fruitSaladOption || 'Salada pura'})` : ''}`
          }
          lines.push(`  → Apt ${o.roomNumber} (${o.guestCount} ${o.guestCount === 1 ? 'pessoa' : 'pessoas'}) - ${o.isStandard ? '☕ Padrão' : '🎨 Personalizado'} - ${o.clientName}${fruitDetail}`)
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

          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open("/cafe", "_blank")}
              className="text-xs font-semibold gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Ver Portal (/cafe)</span>
            </Button>

            {mainTab === "orders" && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setReminderModalOpen(true)}
                  className="text-xs font-semibold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">Lembrete WhatsApp</span>
                </Button>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setStdModalOpen(true)}
                  className="text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                >
                  <Coffee className="w-3.5 h-3.5 text-amber-500" />
                  <span>Configurar Padrão</span>
                </Button>

                <Button 
                  size="sm" 
                  onClick={() => setManualModalOpen(true)}
                  className="text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Lançar Pedido Manual</span>
                </Button>
              </>
            )}

            {mainTab === "history" && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportCSV}
                  className="text-xs font-semibold gap-1.5 border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar CSV</span>
                </Button>
                <Button 
                  size="sm" 
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                  <span>Atualizar</span>
                </Button>
              </>
            )}

            {mainTab === "insights" && (
              <Button 
                size="sm" 
                onClick={fetchInsights}
                disabled={insightsLoading}
                className="text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${insightsLoading ? "animate-spin" : ""}`} />
                <span>Atualizar Métricas</span>
              </Button>
            )}

            {mainTab === "technical_sheet" && (
              <Button 
                size="sm" 
                onClick={handleOpenNewIngredient}
                className="text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar Insumo</span>
              </Button>
            )}
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-1.5 bg-muted/50 rounded-2xl border">
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
            <span>Produção do Dia</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab("history")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mainTab === "history"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="w-4 h-4 text-blue-600" />
            <span>Histórico de Pedidos</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab("insights")}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mainTab === "insights"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <span>Relatórios & Insights</span>
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
            <span>Ficha Técnica ({ingredients.length})</span>
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
                        const isInProduction = order.status === "in_production"
                        return (
                          <Card 
                            key={order.id} 
                            className={`rounded-2xl border transition-all shadow-sm ${
                              isCancelled
                                ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 opacity-85"
                                : isReady 
                                  ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800" 
                                  : isInProduction
                                    ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/40"
                                    : "bg-card hover:border-amber-400"
                            }`}
                          >
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xl font-black ${isCancelled ? 'line-through text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                      Apt {order.roomNumber}
                                    </span>
                                    {isCancelled ? (
                                      <Badge variant="destructive" className="text-[10px] font-black">
                                        🚫 CANCELADO
                                      </Badge>
                                    ) : (
                                      <>
                                        {isInProduction && (
                                          <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs">
                                            <Flame className="w-3 h-3 animate-pulse" />
                                            <span>Em Produção</span>
                                          </Badge>
                                        )}
                                        {isReady && (
                                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Pronto / Saiu</span>
                                          </Badge>
                                        )}
                                        {!isInProduction && !isReady && (
                                          <Badge variant="outline" className="text-slate-600 dark:text-slate-400 text-[10px] font-bold border-slate-300 dark:border-slate-700">
                                            ⏳ Na Fila
                                          </Badge>
                                        )}
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
                                    <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border">
                                      <Button 
                                        type="button"
                                        size="sm" 
                                        variant={isInProduction ? "default" : "ghost"}
                                        onClick={() => handleSetStatus(order.id, isInProduction ? "pending" : "in_production")}
                                        className={`h-7 text-[11px] font-bold px-2 rounded-md transition-all ${
                                          isInProduction
                                            ? "bg-amber-600 hover:bg-amber-700 text-white shadow-2xs" 
                                            : "text-amber-700 dark:text-amber-400 hover:bg-amber-100/50"
                                        }`}
                                        title={isInProduction ? "Clique para voltar para Na Fila" : "Marcar como Em Produção"}
                                      >
                                        <Flame className="w-3 h-3 mr-1" />
                                        <span>{isInProduction ? "Produzindo" : "Produzir"}</span>
                                      </Button>

                                      <Button 
                                        type="button"
                                        size="sm" 
                                        variant={isReady ? "default" : "ghost"}
                                        onClick={() => handleSetStatus(order.id, isReady ? "pending" : "ready")}
                                        className={`h-7 text-[11px] font-bold px-2 rounded-md transition-all ${
                                          isReady 
                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs" 
                                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                                        }`}
                                        title={isReady ? "Clique para voltar para Na Fila" : "Marcar como Pronto / Entregue"}
                                      >
                                        <Check className="w-3 h-3 mr-1" />
                                        <span>{isReady ? "Pronto" : "Concluir"}</span>
                                      </Button>
                                    </div>
                                  )}

                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleCancelOrDeleteOrder(order)}
                                    className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                    title={isCancelled ? "Excluir registro permanentemente" : "Cancelar pedido com motivo"}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {isCancelled && (
                                <div className="mt-2.5 p-3 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 space-y-1.5 shadow-2xs">
                                  <div className="flex items-center justify-between gap-2 border-b border-rose-200/80 dark:border-rose-800/60 pb-1.5">
                                    <span className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                      <span>Motivo do Cancelamento • Não Preparar</span>
                                    </span>
                                    <Badge variant="destructive" className="text-[10px] font-black uppercase px-2 py-0.5 shadow-none">
                                      {order.cancelReason?.toLowerCase().includes("early check-out") 
                                        ? "🚪 Early Check-out" 
                                        : order.cancelReason?.toLowerCase().includes("check-in") 
                                          ? "🔄 Check-in Alterado" 
                                          : order.cancelReason?.toLowerCase().includes("diária") || order.cancelReason?.toLowerCase().includes("check-out antecipado") || order.cancelReason?.toLowerCase().includes("reduzida")
                                            ? "✂️ Diária Removida"
                                            : order.cancelReason?.toLowerCase().includes("autoatendimento")
                                              ? "👤 Cancelado p/ Hóspede"
                                              : order.cancelReason?.toLowerCase().includes("desmarcado")
                                                ? "☕ Café Desmarcado"
                                                : "🚫 Cancelado"}
                                    </Badge>
                                  </div>
                                  <p className="text-xs font-bold text-rose-900 dark:text-rose-200 leading-relaxed pl-5.5">
                                    {order.cancelReason || "Reserva cancelada no calendário ou alteração na estadia."}
                                  </p>
                                  <div className="pt-1.5 flex items-center justify-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReactivateOrder(order)}
                                      className="h-7 text-xs font-bold gap-1.5 bg-white dark:bg-slate-900 border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 shadow-xs"
                                    >
                                      <RotateCcw className="w-3 h-3 text-rose-600" />
                                      <span>Reativar Pedido</span>
                                    </Button>
                                  </div>
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
                                  {order.items?.map((it: any, idx: number) => {
                                    let extraLabel = ""
                                    if (it.name === "Salada de frutas") {
                                      const opt = order.preferences?.fruitSaladOption || order.guestChoices?.find((g: any) => g.fruit === "Salada de frutas")?.fruitSaladOption
                                      extraLabel = opt ? ` (${opt})` : " (Salada pura)"
                                    } else if (it.name === "Mamão") {
                                      const hasHoney = order.preferences?.fruitHoney || order.guestChoices?.some((g: any) => g.fruit === "Mamão" && g.fruitHoney)
                                      if (hasHoney) extraLabel = " (c/ mel)"
                                    }
                                    const isHighlight = it.name === "Mel" || it.name === "Leite condensado" || extraLabel.includes("Mel") || extraLabel.includes("Leite")
                                    return (
                                      <Badge 
                                        key={idx} 
                                        variant="outline" 
                                        className={`text-[11px] py-0.5 px-2 ${
                                          isHighlight 
                                            ? "bg-amber-100/90 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200 font-bold" 
                                            : "bg-muted/30"
                                        }`}
                                      >
                                        {it.quantity}x {it.name === "Mel" ? "🍯 Mel" : it.name === "Leite condensado" ? "🥛 Leite condensado" : it.name}{extraLabel}
                                      </Badge>
                                    )
                                  })}
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
                                            gc.fruit ? `${gc.fruit}${gc.fruitHoney ? ' (c/ mel)' : ''}${gc.fruit === 'Salada de frutas' ? ` (${gc.fruitSaladOption || 'Salada pura'})` : (gc.fruitSaladOption ? ` (${gc.fruitSaladOption})` : '')}` : null,
                                            gc.sweetener
                                          ].filter(Boolean).filter(v => v !== 'Não quero café' && v !== 'Nenhuma outra bebida' && v !== 'Nenhuma fruta' && v !== 'Não quero nenhum desses' && v !== 'Nenhum').join(", ")}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Conditional questions / details (Ex: Mel no mamão, salada de frutas) */}
                              {order.orderMode === "individual" && order.guestChoices && order.guestChoices.length > 0 && !order.isStandard ? (
                                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[11px] space-y-1">
                                  <span className="font-bold text-amber-800 dark:text-amber-300 block text-[10px] uppercase">
                                    Frutas & Adoçamento por Hóspede:
                                  </span>
                                  <div className="space-y-0.5">
                                    {order.guestChoices.map((gc: any, idx: number) => (
                                      <div key={idx} className="flex items-center gap-1">
                                        <span className="font-bold text-amber-900 dark:text-amber-200">
                                          👤 {gc.guestName ? gc.guestName.split(' ')[0] : `Hóspede ${gc.guestIndex}`}:
                                        </span>
                                        <span>
                                          {gc.fruit || "Sem fruta"}
                                          {gc.fruitHoney ? " (com mel)" : ""}
                                          {gc.fruit === "Salada de frutas" ? ` (${gc.fruitSaladOption || "Salada pura"})` : ""}
                                          {gc.sweetener ? ` • ${gc.sweetener}` : ""}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : order.preferences && !order.isStandard ? (
                                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[11px] space-y-1">
                                  {order.preferences.fruit && (
                                    <div>
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Fruta: </span>
                                      <span>
                                        {order.preferences.fruit}
                                        {order.preferences.fruitHoney ? " (com mel)" : ""}
                                        {order.preferences.fruit === "Salada de frutas" ? ` (${order.preferences.fruitSaladOption || "Salada pura"})` : (order.preferences.fruitSaladOption ? ` (${order.preferences.fruitSaladOption})` : "")}
                                      </span>
                                    </div>
                                  )}
                                  {order.preferences.sweetener && (
                                    <div>
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Adoçamento: </span>
                                      <span>{order.preferences.sweetener}</span>
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              {order.notes && (
                                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300">
                                  <span className="font-bold block text-[10px] uppercase">Observação:</span>
                                  {order.notes}
                                </div>
                              )}

                              {/* WhatsApp Direct API Actions */}
                              {!isCancelled && (
                                <div className="space-y-1.5 pt-2 border-t border-border/60">
                                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="w-3 h-3 text-emerald-600" />
                                      <span>Avisos ao Hóspede (WhatsApp API)</span>
                                    </span>
                                    {order.phone && <span className="font-mono text-muted-foreground/80">{order.phone}</span>}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {/* Botão: Pedido em Produção */}
                                    <Button 
                                      type="button"
                                      variant="outline" 
                                      size="sm" 
                                      disabled={!order.phone || Boolean(sendingNotify[`${order.id}_in_production`])}
                                      onClick={() => handleNotifyGuest(order, "in_production")}
                                      className={`h-8 text-xs font-bold gap-1.5 transition-all ${
                                        order.inProductionNotifiedAt 
                                          ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                                          : "border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                      }`}
                                      title={!order.phone ? "Hóspede sem telefone cadastrado" : "Disparar mensagem via API informando que o café está sendo preparado"}
                                    >
                                      {sendingNotify[`${order.id}_in_production`] ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        {sendingNotify[`${order.id}_in_production`] 
                                          ? "Enviando..." 
                                          : order.inProductionNotifiedAt 
                                            ? `✓ Produção às ${format(new Date(order.inProductionNotifiedAt), "HH:mm")}` 
                                            : "Avisar em Produção"}
                                      </span>
                                    </Button>

                                    {/* Botão: Café a Caminho */}
                                    <Button 
                                      type="button"
                                      variant="outline" 
                                      size="sm" 
                                      disabled={!order.phone || Boolean(sendingNotify[`${order.id}_on_the_way`])}
                                      onClick={() => handleNotifyGuest(order, "on_the_way")}
                                      className={`h-8 text-xs font-bold gap-1.5 transition-all ${
                                        order.onTheWayNotifiedAt 
                                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20"
                                          : "border-emerald-400 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                      }`}
                                      title={!order.phone ? "Hóspede sem telefone cadastrado" : "Disparar mensagem via API informando que o café está pronto e a caminho"}
                                    >
                                      {sendingNotify[`${order.id}_on_the_way`] ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Send className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        {sendingNotify[`${order.id}_on_the_way`] 
                                          ? "Enviando..." 
                                          : order.onTheWayNotifiedAt 
                                            ? `✓ A caminho às ${format(new Date(order.onTheWayNotifiedAt), "HH:mm")}` 
                                            : "Avisar Café a Caminho"}
                                      </span>
                                    </Button>
                                  </div>

                                  {!order.phone && (
                                    <div className="text-[10px] text-amber-700 dark:text-amber-400 italic text-center py-0.5">
                                      ⚠️ Hóspede sem WhatsApp cadastrado no pedido
                                    </div>
                                  )}
                                </div>
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

        {/* Tab 2: Order History */}
        {mainTab === "history" && (
          <div className="space-y-6">
            {/* Filters and Controls Card */}
            <Card className="rounded-2xl border shadow-2xs overflow-hidden">
              <CardHeader className="bg-muted/10 border-b p-4 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="w-5 h-5 text-blue-600" />
                      Histórico Geral de Pedidos de Café
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Consulte, filtre e audite todos os pedidos registrados de qualquer data ou apartamento.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCSV}
                      disabled={historyOrders.length === 0}
                      className="text-xs font-bold gap-1.5 border-blue-400/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar CSV</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={fetchHistory}
                      disabled={historyLoading}
                      className="text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                      <span>Atualizar</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground mr-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Atalhos:
                  </span>
                  {[
                    { id: "all", label: "Todo o Histórico" },
                    { id: "today", label: "Hoje" },
                    { id: "yesterday", label: "Ontem" },
                    { id: "7d", label: "Últimos 7 dias" },
                    { id: "30d", label: "Últimos 30 dias" }
                  ].map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleQuickRange(preset.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        historyQuickRange === preset.id
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Filter Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                  {/* Search */}
                  <div className="space-y-1 lg:col-span-2">
                    <Label className="text-xs font-medium text-muted-foreground">Buscar (Hóspede, Quarto, Item)</Label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={historySearch}
                        onChange={e => setHistorySearch(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && fetchHistory()}
                        placeholder="Ex: Carlos, 113, Pão francês..."
                        className="pl-8 text-xs h-9"
                      />
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Status do Pedido</Label>
                    <Select value={historyStatus} onValueChange={v => setHistoryStatus(v)}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        <SelectItem value="pending">⏳ Na Fila (Pendente)</SelectItem>
                        <SelectItem value="in_production">🍳 Em Produção</SelectItem>
                        <SelectItem value="ready">✓ Concluído / Entregue</SelectItem>
                        <SelectItem value="cancelled">🚫 Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Room */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Apartamento / Flat</Label>
                    <Select value={historyRoom} onValueChange={v => setHistoryRoom(v)}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Todos os Flats" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Flats</SelectItem>
                        {availableRooms.map(rm => (
                          <SelectItem key={rm} value={rm}>Flat {rm}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range: Start & End */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Data Inicial & Final</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={historyStartDate}
                        onChange={e => {
                          setHistoryQuickRange("all")
                          setHistoryStartDate(e.target.value)
                        }}
                        className="text-xs h-9 px-2"
                        title="Data Início"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <Input
                        type="date"
                        value={historyEndDate}
                        onChange={e => {
                          setHistoryQuickRange("all")
                          setHistoryEndDate(e.target.value)
                        }}
                        className="text-xs h-9 px-2"
                        title="Data Fim"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="rounded-xl border shadow-2xs p-3.5 bg-card">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total de Pedidos</div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {historyOrders.length}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">pedidos no filtro aplicado</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Pedidos Ativos</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {historyOrders.filter(o => o.status !== "cancelled").length}
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/70 mt-0.5">produzidos ou na fila</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5 bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
                <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">Cancelados</div>
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {historyOrders.filter(o => o.status === "cancelled").length}
                </div>
                <div className="text-[10px] text-rose-700/80 dark:text-rose-400/70 mt-0.5">early check-out / manual</div>
              </Card>

              <Card className="rounded-xl border shadow-2xs p-3.5 bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Hóspedes Atendidos</div>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                  {historyOrders.filter(o => o.status !== "cancelled").reduce((acc, o) => acc + (Number(o.guestCount) || 1), 0)}
                </div>
                <div className="text-[10px] text-blue-700/80 dark:text-blue-400/70 mt-0.5">pessoas servidas no total</div>
              </Card>
            </div>

            {/* Orders List */}
            {historyLoading ? (
              <div className="text-center py-16 text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span>Carregando histórico de pedidos...</span>
              </div>
            ) : historyOrders.length === 0 ? (
              <Card className="border-dashed p-12 text-center rounded-2xl bg-muted/10">
                <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Nenhum pedido encontrado</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Tente alterar as datas ou limpar a pesquisa para exibir mais registros.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHistoryQuickRange("all")
                    setHistoryStartDate("")
                    setHistoryEndDate("")
                    setHistoryStatus("all")
                    setHistoryRoom("all")
                    setHistorySearch("")
                  }}
                  className="mt-4 text-xs font-bold"
                >
                  Limpar Filtros
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => {
                  const isCancelled = order.status === "cancelled"
                  const isReady = order.status === "ready" || order.status === "delivered"
                  const isInProduction = order.status === "in_production"
                  const isExpanded = Boolean(expandedHistoryOrder[order.id])

                  return (
                    <Card
                      key={order.id}
                      className={`rounded-2xl border transition-all shadow-2xs ${
                        isCancelled
                          ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60"
                          : isReady
                            ? "bg-card hover:border-emerald-300"
                            : isInProduction
                              ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-300"
                              : "bg-card hover:border-blue-300"
                      }`}
                    >
                      <div className="p-4 sm:p-5 space-y-3">
                        {/* Order Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-base sm:text-lg font-black ${isCancelled ? "line-through text-rose-700 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
                              Flat {order.roomNumber}
                            </span>
                            <Badge variant="outline" className="text-xs font-bold flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              {order.date ? format(new Date(order.date + 'T12:00:00'), "dd/MM/yyyy (EEE)", { locale: ptBR }) : "Sem data"}
                            </Badge>
                            <Badge variant="outline" className="text-xs font-bold flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-amber-600" />
                              {order.deliveryTime || "08:00"}
                            </Badge>

                            {isCancelled ? (
                              <Badge variant="destructive" className="text-[10px] font-black uppercase">
                                🚫 Cancelado
                              </Badge>
                            ) : isInProduction ? (
                              <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-[10px] flex items-center gap-1">
                                <Flame className="w-3 h-3 animate-pulse" />
                                <span>Em Produção</span>
                              </Badge>
                            ) : isReady ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Concluído / Entregue</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                                ⏳ Na Fila
                              </Badge>
                            )}

                            <Badge className="bg-muted text-foreground text-[10px] font-bold">
                              👥 {order.guestCount || 1} {order.guestCount === 1 ? 'Pessoa' : 'Pessoas'}
                            </Badge>

                            <Badge variant="outline" className={`text-[10px] font-bold ${order.isStandard ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-blue-500/10 text-blue-600 border-blue-500/30'}`}>
                              {order.isStandard ? '☕ Café Padrão' : '🎨 Personalizado'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            {isCancelled ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleReactivateOrder(order)}
                                className="h-8 text-xs font-bold gap-1.5 bg-white dark:bg-slate-900 border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 shadow-xs"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                                <span>Reativar Pedido</span>
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isInProduction ? "default" : "ghost"}
                                  onClick={() => handleSetStatus(order.id, isInProduction ? "pending" : "in_production")}
                                  className={`h-7 text-[11px] font-bold px-2 rounded-md ${
                                    isInProduction
                                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                                      : "text-amber-700 dark:text-amber-400 hover:bg-amber-100/50"
                                  }`}
                                >
                                  <Flame className="w-3 h-3 mr-1" />
                                  <span>{isInProduction ? "Produzindo" : "Produzir"}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isReady ? "default" : "ghost"}
                                  onClick={() => handleSetStatus(order.id, isReady ? "pending" : "ready")}
                                  className={`h-7 text-[11px] font-bold px-2 rounded-md ${
                                    isReady
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  <span>{isReady ? "Pronto" : "Concluir"}</span>
                                </Button>
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancelOrDeleteOrder(order)}
                              className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                              title={isCancelled ? "Excluir permanentemente" : "Cancelar pedido"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Guest details & Creation info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              {order.clientName || "Hóspede"}
                            </span>
                            {order.phone && (
                              <button
                                type="button"
                                onClick={() => window.open(`https://wa.me/${order.phone.replace(/\D/g, "")}`, "_blank")}
                                className="text-emerald-700 dark:text-emerald-400 font-mono font-medium hover:underline flex items-center gap-1"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>{order.phone}</span>
                              </button>
                            )}
                            {order.reservationCode && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Res: {order.reservationCode}
                              </Badge>
                            )}
                          </div>

                          <div className="text-[11px] text-muted-foreground">
                            Pedido registrado em: {order.createdAt ? format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm") : "N/D"}
                          </div>
                        </div>

                        {/* Cancellation Reason alert */}
                        {isCancelled && (
                          <div className="p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                                {order.cancelReason || "Pedido cancelado no sistema."}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReactivateOrder(order)}
                              className="self-start sm:self-auto h-7 text-xs font-bold gap-1 bg-white dark:bg-slate-900 border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                            >
                              <RotateCcw className="w-3 h-3 text-rose-600" />
                              Reativar
                            </Button>
                          </div>
                        )}

                        {/* Items preview & toggle */}
                        <div className="pt-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                              <ShoppingBag className="w-3.5 h-3.5" />
                              Itens Solicitados ({order.items?.length || 0}):
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedHistoryOrder(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                              className="h-6 text-[11px] text-muted-foreground hover:text-foreground font-medium gap-1"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="w-3 h-3" /> Recolher itens</>
                              ) : (
                                <><ChevronDown className="w-3 h-3" /> Ver detalhes ({order.items?.length || 0} itens)</>
                              )}
                            </Button>
                          </div>

                          {/* Items badges */}
                          <div className="flex flex-wrap gap-1.5">
                            {(isExpanded ? order.items : (order.items || []).slice(0, 6))?.map((it: any, idx: number) => (
                              <div
                                key={idx}
                                className="px-2 py-1 bg-muted/40 border rounded-lg text-xs flex items-center gap-1.5"
                              >
                                <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 rounded text-[11px]">
                                  {it.quantity || 1}×
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {it.name || it}
                                </span>
                              </div>
                            ))}
                            {!isExpanded && (order.items?.length || 0) > 6 && (
                              <button
                                type="button"
                                onClick={() => setExpandedHistoryOrder(prev => ({ ...prev, [order.id]: true }))}
                                className="px-2 py-1 bg-muted/60 hover:bg-muted text-muted-foreground rounded-lg text-xs font-bold"
                              >
                                +{(order.items?.length || 0) - 6} outros
                              </button>
                            )}
                          </div>

                          {order.notes && (
                            <div className="text-xs bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-2.5 rounded-xl text-amber-900 dark:text-amber-200 font-medium">
                              📝 <strong>Observações do Hóspede:</strong> {order.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Reports & Insights */}
        {mainTab === "insights" && (
          <div className="space-y-6">
            {/* Insights Top Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  Relatórios Analíticos & Insights de Consumo
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Métricas de volume, picos de horário, ranking de itens mais pedidos e custos da ficha técnica.
                </p>
              </div>

              {/* Period Selector Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-muted/50 p-1 rounded-xl border self-start sm:self-auto">
                {[
                  { id: "all", label: "Todo o Histórico" },
                  { id: "7d", label: "Últimos 7 dias" },
                  { id: "30d", label: "Últimos 30 dias" },
                  { id: "90d", label: "Últimos 90 dias" }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setInsightsPeriod(p.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      insightsPeriod === p.id
                        ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {insightsLoading ? (
              <div className="text-center py-20 text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <span>Calculando relatórios e estatísticas de consumo...</span>
              </div>
            ) : !insightsData || insightsData.totalOrders === 0 ? (
              <Card className="border-dashed p-12 text-center rounded-2xl bg-muted/10">
                <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Sem dados para o período</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Não há pedidos suficientes cadastrados para gerar os gráficos neste filtro.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* 4 Main KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="bg-emerald-600 text-white rounded-2xl border-transparent shadow-md p-5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Total de Pedidos</span>
                      <ShoppingBag className="w-5 h-5 text-emerald-200" />
                    </div>
                    <div className="text-3xl font-black mt-2">
                      {insightsData.totalOrders}
                    </div>
                    <div className="text-[11px] text-emerald-100/90 mt-1">
                      {insightsData.activeOrders} ativos • {insightsData.cancelledOrders} cancelados
                    </div>
                  </Card>

                  <Card className="rounded-2xl border shadow-2xs p-5 flex flex-col justify-between bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Clientes Únicos</span>
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-2">
                      {insightsData.uniqueCustomers}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {insightsData.totalGuests || 0} pessoas atendidas no total
                    </div>
                  </Card>

                  <Card className="rounded-2xl border shadow-2xs p-5 flex flex-col justify-between bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Média Itens / Pedido</span>
                      <TrendingUp className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-2">
                      {insightsData.averageItemsPerOrder?.toFixed(1) || "0.0"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {insightsData.totalItems || 0} itens individuais servidos
                    </div>
                  </Card>

                  <Card className="rounded-2xl border shadow-2xs p-5 flex flex-col justify-between bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custo Médio / Hóspede</span>
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400 mt-2">
                      R$ {(insightsData.costInsights?.averageCostPerPerson || 0).toFixed(2).replace('.', ',')}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      R$ {(insightsData.costInsights?.averageCostPerOrder || 0).toFixed(2).replace('.', ',')} por pedido
                    </div>
                  </Card>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Chart 1: Orders by Day of Week */}
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                    <CardHeader className="p-4 pb-2 border-b bg-muted/10">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-600" />
                        <CardTitle className="text-sm font-bold">Pedidos por Dia da Semana</CardTitle>
                      </div>
                      <CardDescription className="text-xs">Volume de pedidos distribuído de segunda a domingo</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={insightsData.ordersByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="day" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#64748b' }} 
                            dy={8}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            allowDecimals={false}
                          />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: any) => [`${value} pedidos`, 'Volume']}
                            labelStyle={{ color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}
                          />
                          <Bar dataKey="count" fill="#d97706" radius={[6, 6, 0, 0]} maxBarSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Chart 2: Peak Delivery Hours */}
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                    <CardHeader className="p-4 pb-2 border-b bg-muted/10">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-600" />
                        <CardTitle className="text-sm font-bold">Horários de Pico de Entrega</CardTitle>
                      </div>
                      <CardDescription className="text-xs">Horários mais requisitados pelos hóspedes</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={insightsData.peakTimes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="peakGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#64748b' }} 
                            dy={8}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            allowDecimals={false}
                          />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: any) => [`${value} pedidos`, 'Entregas']}
                            labelStyle={{ color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}
                          />
                          <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#peakGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Items & Top Customers Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Items Progress Bars */}
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden flex flex-col">
                    <CardHeader className="p-4 pb-3 border-b bg-muted/10">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        <CardTitle className="text-sm font-bold">Itens Mais Pedidos (Ranking de Preferência)</CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        {insightsData.topItems?.length || 0} itens distintos solicitados no período
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 flex-1 space-y-3">
                      {(() => {
                        const items = insightsData.topItems || []
                        const visible = showAllTopItems ? items : items.slice(0, 8)
                        const maxQty = items.length > 0 ? Math.max(...items.map((i: any) => i.totalQuantity)) : 1

                        return (
                          <>
                            <div className="space-y-2.5">
                              {visible.map((it: any, idx: number) => (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-medium">
                                    <span className="text-foreground truncate mr-2">
                                      <strong className="text-amber-600 font-bold mr-1.5">#{idx + 1}</strong>
                                      {it.name}
                                    </span>
                                    <span className="text-muted-foreground font-bold shrink-0">
                                      {it.totalQuantity} un ({it.percentage}%)
                                    </span>
                                  </div>
                                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                      style={{ width: `${(it.totalQuantity / maxQty) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {items.length > 8 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAllTopItems(!showAllTopItems)}
                                className="w-full text-xs text-muted-foreground hover:text-foreground font-bold mt-2"
                              >
                                {showAllTopItems ? (
                                  <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Mostrar menos</>
                                ) : (
                                  <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Ver ranking completo ({items.length - 8} mais)</>
                                )}
                              </Button>
                            )}
                          </>
                        )
                      })()}
                    </CardContent>
                  </Card>

                  {/* Top Customers Table */}
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden flex flex-col">
                    <CardHeader className="p-4 pb-3 border-b bg-muted/10">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <CardTitle className="text-sm font-bold">Hóspedes Mais Recorrentes</CardTitle>
                      </div>
                      <CardDescription className="text-xs">Clientes com maior frequência de pedidos</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold border-b">
                            <tr>
                              <th className="px-4 py-2.5">Hóspede</th>
                              <th className="px-3 py-2.5 text-center">Flat</th>
                              <th className="px-3 py-2.5 text-center">Pedidos</th>
                              <th className="px-4 py-2.5 text-right">Itens Totais</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(insightsData.topCustomers || []).slice(0, 8).map((c: any, idx: number) => (
                              <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-foreground truncate max-w-[160px]">
                                  {c.name}
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                                  {c.roomNumber || "-"}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px]">
                                    {c.orderCount}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                  {c.totalItems} un
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly Comparison Row */}
                {insightsData.consumptionByMonth && insightsData.consumptionByMonth.length > 0 && (
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                    <CardHeader className="p-4 pb-2 border-b bg-muted/10">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-4 h-4 text-indigo-600" />
                        <CardTitle className="text-sm font-bold">Consumo Médio do Café da Manhã por Mês</CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        Quantidade média consumida de cada item por pedido nos últimos 3 meses e média geral.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {insightsData.consumptionByMonth.map((period: any, idx: number) => {
                          const isOverall = period.month === null
                          const maxAvg = period.items?.length > 0 ? Math.max(...period.items.map((i: any) => i.avgQtyPerOrder)) : 1
                          const items = (period.items || []).slice(0, 8)

                          return (
                            <div
                              key={idx}
                              className={`rounded-xl border p-4 flex flex-col gap-3 ${
                                isOverall ? "bg-primary/5 border-primary/30" : "bg-muted/15 border-border"
                              }`}
                            >
                              <div className="border-b pb-2">
                                <h4 className={`font-bold text-xs uppercase tracking-wide ${isOverall ? "text-primary" : "text-foreground"}`}>
                                  {period.label}
                                </h4>
                                <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                                  {period.totalOrders} {period.totalOrders === 1 ? "pedido" : "pedidos"}
                                </p>
                              </div>

                              {period.totalOrders === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhum pedido registrado</p>
                              ) : (
                                <div className="space-y-2">
                                  {items.map((it: any, i: number) => (
                                    <div key={i} className="space-y-0.5">
                                      <div className="flex justify-between text-[11px]">
                                        <span className="font-medium text-foreground truncate mr-1">{it.name}</span>
                                        <span className="font-bold shrink-0">{it.avgQtyPerOrder.toFixed(2).replace('.', ',')}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${isOverall ? "bg-primary" : "bg-primary/70"}`}
                                          style={{ width: `${(it.avgQtyPerOrder / maxAvg) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Technical Costs & Ingredients Table */}
                {insightsData.costInsights?.ingredientTotals && insightsData.costInsights.ingredientTotals.length > 0 && (
                  <Card className="rounded-2xl border shadow-2xs overflow-hidden">
                    <CardHeader className="p-4 pb-2 border-b bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Beef className="w-4 h-4 text-rose-600" />
                          <CardTitle className="text-sm font-bold">Consumo Total de Insumos & Custos da Ficha Técnica</CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                          Cálculo consolidado com base nos preços unitários cadastrados na aba Ficha Técnica.
                        </CardDescription>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs">
                        Custo Total: R$ {Number(insightsData.costInsights.totalCost || 0).toFixed(2).replace('.', ',')}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold border-b">
                            <tr>
                              <th className="px-4 py-2.5">Ingrediente</th>
                              <th className="px-4 py-2.5 text-right">Qtd Consumida</th>
                              <th className="px-3 py-2.5 text-center">Unidade</th>
                              <th className="px-4 py-2.5 text-right">Custo Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(showAllCostIngredients 
                              ? insightsData.costInsights.ingredientTotals 
                              : insightsData.costInsights.ingredientTotals.slice(0, 10)
                            ).map((ing: any, idx: number) => (
                              <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-foreground">
                                  {ing.ingredient}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium">
                                  {ing.totalQuantity}
                                </td>
                                <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">
                                  {ing.unit}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                                  R$ {Number(ing.totalCost || 0).toFixed(2).replace('.', ',')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {insightsData.costInsights.ingredientTotals.length > 10 && (
                        <div className="p-2 border-t text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAllCostIngredients(!showAllCostIngredients)}
                            className="text-xs text-muted-foreground hover:text-foreground font-bold"
                          >
                            {showAllCostIngredients ? (
                              <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Mostrar menos</>
                            ) : (
                              <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Ver todos os {insightsData.costInsights.ingredientTotals.length} insumos</>
                            )}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Technical Sheet & Ingredients CRUD */}
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
                  Para hóspedes que solicitaram o café diretamente à administração ou por telefone.
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
                  <Label className="text-xs">Observações</Label>
                  <Textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="" className="text-xs resize-none" rows={2} />
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
                      placeholder="Ex: Café, Leite" 
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
                    .replace(/\{link\}/gi, `${window.location.origin}/cafe?res=RES-113-0034&v=1`)
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
