import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Bell, 
  BellRing, 
  Coffee, 
  PackageOpen, 
  AlertTriangle, 
  DoorOpen, 
  AlertOctagon, 
  ShoppingCart, 
  CheckCheck, 
  Trash2, 
  Volume2, 
  PhoneCall, 
  Webhook, 
  ExternalLink, 
  Check, 
  RefreshCw, 
  Clock, 
  Filter,
  Sparkles,
  Search,
  Smartphone,
  CheckCircle2,
  MessageSquare,
  CalendarDays,
  Wrench,
  DollarSign,
  Layers,
  List,
  ChevronDown,
  ChevronRight
} from "lucide-react"
import { 
  getPushPermissionState, 
  requestPushPermission, 
  showNativeNotification, 
  isPushSupported,
  syncWebPushSubscription,
  sendServerWebPushTest,
  resolveNotificationBucketClient,
  clearCategoryTrayNotification,
  type NotificationCategoryBucket
} from "@/lib/push-notifications"
import { format, formatDistanceToNow, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

interface NotificationItem {
  id: number
  category: string
  title: string
  message: string
  severity: "info" | "warning" | "critical"
  metadata?: any
  targetUrl?: string
  read: boolean
  createdAt: string
}

interface NotificationSettings {
  soundEnabled: boolean
  adminWhatsApp: string
  webhookUrl: string
  notifyOnBreakfast: boolean
  notifyOnLostItem: boolean
  notifyOnDefect: boolean
  notifyOnCheckout: boolean
  notifyOnSystemError: boolean
  notifyOnAbandonedCart: boolean
  notifyOnOvertimeCleaning: boolean
}

const BUCKET_ORDER: NotificationCategoryBucket[] = [
  "whatsapp",
  "shopping_list",
  "reservations",
  "checkout",
  "cleaning",
  "maintenance",
  "breakfast",
  "finance",
  "system"
]

const categoryBucketConfig: Record<
  NotificationCategoryBucket,
  { icon: React.ElementType; color: string; headerBg: string; label: string; emoji: string }
> = {
  whatsapp: {
    icon: MessageSquare,
    emoji: "💬",
    label: "WhatsApp",
    color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300",
    headerBg: "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20"
  },
  shopping_list: {
    icon: ShoppingCart,
    emoji: "🛒",
    label: "Lista de Compras",
    color: "text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300",
    headerBg: "border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20"
  },
  reservations: {
    icon: CalendarDays,
    emoji: "📅",
    label: "Reservas & Check-in",
    color: "text-blue-700 bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300",
    headerBg: "border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20"
  },
  checkout: {
    icon: DoorOpen,
    emoji: "🚪",
    label: "Check-out & Frigobar",
    color: "text-teal-700 bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300",
    headerBg: "border-teal-200 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20"
  },
  cleaning: {
    icon: Sparkles,
    emoji: "🧹",
    label: "Governança & Limpeza",
    color: "text-purple-700 bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300",
    headerBg: "border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20"
  },
  maintenance: {
    icon: Wrench,
    emoji: "🔧",
    label: "Manutenção & Achados",
    color: "text-rose-700 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300",
    headerBg: "border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
  },
  breakfast: {
    icon: Coffee,
    emoji: "🥐",
    label: "Café da Manhã",
    color: "text-orange-700 bg-orange-100 dark:bg-orange-950/60 dark:text-orange-300",
    headerBg: "border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-orange-950/20"
  },
  finance: {
    icon: DollarSign,
    emoji: "💰",
    label: "Financeiro & Faturamento",
    color: "text-green-700 bg-green-100 dark:bg-green-950/60 dark:text-green-300",
    headerBg: "border-green-200 dark:border-green-900/60 bg-green-50/40 dark:bg-green-950/20"
  },
  system: {
    icon: AlertOctagon,
    emoji: "⚙️",
    label: "Sistema & IA Sofia",
    color: "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
    headerBg: "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30"
  }
}

const severityBadges: Record<string, { label: string; badgeClass: string }> = {
  info: { label: "Informativo", badgeClass: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300" },
  warning: { label: "Atenção", badgeClass: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 font-bold" },
  critical: { label: "Urgente", badgeClass: "bg-rose-100 text-rose-900 border-rose-400 dark:bg-rose-950/40 dark:text-rose-300 font-black animate-pulse" }
}

// Web Audio API chime generator for zero dependencies
function playChimeSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1) // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

export default function NotificationsHub() {
  const [, setLocation] = useLocation()
  const [activeTab, setActiveTab] = useState<string>("feed")
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false)

  // Settings
  const [settings, setSettings] = useState<NotificationSettings>({
    soundEnabled: true,
    adminWhatsApp: "",
    webhookUrl: "",
    notifyOnBreakfast: true,
    notifyOnLostItem: true,
    notifyOnDefect: true,
    notifyOnCheckout: true,
    notifyOnSystemError: true,
    notifyOnAbandonedCart: true,
    notifyOnOvertimeCleaning: true,
  })
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false)
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState<boolean>(false)
  const [testingTrigger, setTestingTrigger] = useState<boolean>(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default")
  const [isRequestingPush, setIsRequestingPush] = useState<boolean>(false)

  useEffect(() => {
    const state = getPushPermissionState()
    setPushPermission(state)
    if (state === "granted") {
      syncWebPushSubscription().catch(() => {})
    }
  }, [])

  const handleEnablePush = async () => {
    setIsRequestingPush(true)
    try {
      const granted = await requestPushPermission()
      setPushPermission(granted ? "granted" : "denied")
      if (granted) {
        const pushRes = await sendServerWebPushTest({
          title: "🎉 Web Push Real Ativado!",
          message: "Seu dispositivo está inscrito no servidor VAPID e receberá alertas agrupados mesmo com a tela bloqueada."
        })
        if (!pushRes.success) {
          showNativeNotification({
            title: "🎉 Notificações Push Ativadas!",
            message: "Você receberá alertas nativos com som e vibração em tempo real no Chrome e Android.",
            url: "/notificacoes",
            force: true
          })
        }
      }
    } finally {
      setIsRequestingPush(false)
    }
  }

  const handleTestNativePush = async () => {
    if (pushPermission !== "granted") {
      await handleEnablePush()
      return
    }
    playChimeSound()
    const pushRes = await sendServerWebPushTest({
      title: "📲 Web Push Real • Teste CorpFlats",
      message: "Disparo criptografado recebido direto do servidor! Funciona inclusive com a tela bloqueada."
    })
    if (!pushRes.success) {
      showNativeNotification({
        title: "📲 Alerta Push - Teste no Celular/Chrome",
        message: "Notificação nativa recebida com sucesso no seu Android/Chrome!",
        url: "/notificacoes",
        force: true
      })
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (err) {
      console.error("Erro ao carregar notificações:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/notifications/settings")
      if (res.ok) {
        const data = await res.json()
        setSettings(prev => ({ ...prev, ...data }))
      }
    } catch {}
  }

  useEffect(() => {
    fetchNotifications()
    fetchSettings()
    const interval = setInterval(fetchNotifications, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleMarkAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {}
  }

  const handleMarkAllAsRead = async () => {
    try {
      BUCKET_ORDER.forEach(b => clearCategoryTrayNotification(b))
      await fetch("/api/notifications/mark-all-read", { method: "POST" })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {}
  }

  const handleDeleteNotification = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" })
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch {}
  }

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja limpar todo o histórico de notificações?")) return
    try {
      BUCKET_ORDER.forEach(b => clearCategoryTrayNotification(b))
      await fetch("/api/notifications", { method: "DELETE" })
      setNotifications([])
      setUnreadCount(0)
    } catch {}
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingSettings(true)
    try {
      await fetch("/api/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      })
      setSettingsSavedSuccess(true)
      setTimeout(() => setSettingsSavedSuccess(false), 2500)
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleTriggerTestNotification = async (type: string) => {
    setTestingTrigger(true)
    try {
      playChimeSound()
      await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: type,
          title: `🔔 Teste de Notificação: ${type.toUpperCase()}`,
          message: "Seus canais de notificação estão funcionando com sucesso e prontos para disparar alertas.",
          severity: type === "system_error" ? "critical" : (type === "defect" ? "warning" : "info")
        })
      })
      fetchNotifications()
    } finally {
      setTestingTrigger(false)
    }
  }

  const [groupByCategory, setGroupByCategory] = useState<boolean>(true)
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<string, boolean>>({})

  const resolveBucket = (n: NotificationItem): NotificationCategoryBucket =>
    resolveNotificationBucketClient({
      category: n.category,
      targetUrl: n.targetUrl,
      title: n.title
    })

  const toggleBucketCollapse = (bucket: NotificationCategoryBucket) => {
    setCollapsedBuckets(prev => ({ ...prev, [bucket]: !prev[bucket] }))
  }

  const handleMarkBucketAsRead = async (bucket: NotificationCategoryBucket, items: NotificationItem[]) => {
    const unreadItems = items.filter(i => !i.read)
    clearCategoryTrayNotification(bucket)
    if (unreadItems.length === 0) return
    const unreadIds = new Set(unreadItems.map(i => i.id))
    setNotifications(prev => prev.map(n => (unreadIds.has(n.id) ? { ...n, read: true } : n)))
    setUnreadCount(prev => Math.max(0, prev - unreadItems.length))
    await Promise.allSettled(
      unreadItems.map(i => fetch(`/api/notifications/${i.id}/read`, { method: "PATCH" }))
    )
  }

  // Filtered Notifications
  const filteredNotifications = notifications.filter(n => {
    if (selectedCategory !== "all" && resolveBucket(n) !== selectedCategory) return false
    if (selectedSeverity !== "all" && n.severity !== selectedSeverity) return false
    if (unreadOnly && n.read) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q)
    }
    return true
  })

  const groupedBuckets = BUCKET_ORDER.map(bucket => {
    const items = filteredNotifications.filter(n => resolveBucket(n) === bucket)
    const unreadInBucket = items.filter(n => !n.read).length
    return { bucket, items, unreadInBucket, meta: categoryBucketConfig[bucket] }
  }).filter(g => g.items.length > 0)

  const renderNotificationCard = (item: NotificationItem) => {
    const bucket = resolveBucket(item)
    const conf = categoryBucketConfig[bucket]
    const Icon = conf.icon
    const sev = severityBadges[item.severity] || severityBadges.info
    const timeFormatted = format(parseISO(item.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    const timeAgo = formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true, locale: ptBR })

    return (
      <Card
        key={item.id}
        className={`overflow-hidden transition-all duration-200 border-2 rounded-xl shadow-2xs ${
          !item.read
            ? "bg-sky-50/50 dark:bg-sky-950/20 border-primary/40 ring-1 ring-primary/20"
            : "bg-card border-border/70 opacity-90"
        }`}
      >
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${conf.color}`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-sm font-bold tracking-tight ${!item.read ? "text-slate-950 dark:text-slate-50 font-black" : "text-slate-800 dark:text-slate-200"}`}>
                    {item.title}
                  </h3>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${sev.badgeClass}`}>
                    {sev.label}
                  </Badge>
                  {!groupByCategory && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                      {conf.emoji} {conf.label}
                    </Badge>
                  )}
                  {!item.read && (
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-bold">
                      Nova
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {item.message}
                </p>

                {item.metadata?.photoUrl && (
                  <div className="pt-1.5">
                    <img
                      src={item.metadata.photoUrl}
                      alt="Foto Anexa"
                      className="h-20 w-auto rounded-lg border border-amber-300 object-cover shadow-2xs hover:scale-105 transition-transform"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                  <span title={timeFormatted}>{timeAgo}</span>
                  <span>•</span>
                  <span>{timeFormatted}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
              {item.targetUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(item.targetUrl || "/dashboard")}
                  className="text-xs font-semibold h-8 gap-1 shadow-2xs"
                >
                  <span>Ver Detalhes</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}

              {!item.read && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleMarkAsRead(item.id)}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground"
                  title="Marcar como lida"
                >
                  <Check className="w-4 h-4" />
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteNotification(item.id)}
                className="text-xs h-8 text-muted-foreground hover:text-rose-600"
                title="Excluir notificação"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Central de Alertas & Notificações</span>
                  {unreadCount > 0 && (
                    <Badge className="bg-rose-600 text-white font-bold text-xs">
                      {unreadCount} nova{unreadCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Monitoramento instantâneo de pedidos de café, achados & perdidos, defeitos e erros do sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs font-semibold gap-1.5 shadow-2xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Marcar Todas como Lidas</span>
              </Button>
            )}

            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="text-xs font-semibold gap-1.5 text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Histórico</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => handleTriggerTestNotification("breakfast")}
              disabled={testingTrigger}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 shadow-xs"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{testingTrigger ? "Enviando..." : "Testar Alerta"}</span>
            </Button>
          </div>
        </div>

        {/* Native Web Push Banner for Android & Chrome */}
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-sky-50/40 to-background dark:from-primary/10 dark:via-sky-950/20 dark:to-card shadow-sm">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Notificações Push no Chrome & Celular Android
                  </h3>
                  {pushPermission === "granted" ? (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] gap-1 px-2 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Ativadas
                    </Badge>
                  ) : pushPermission === "denied" ? (
                    <Badge variant="destructive" className="font-bold text-[10px] px-2 py-0.5">
                      Bloqueadas no Navegador
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-amber-700 bg-amber-50 border-amber-300">
                      Pendente
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  {pushPermission === "granted"
                    ? "Seu dispositivo está pronto para receber notificações sonoras nativas e vibração na barra de status do Android."
                    : "Ative para receber avisos instantâneos de novos cafés, achados e erros diretamente na tela do seu celular."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {pushPermission !== "granted" ? (
                <Button
                  size="sm"
                  onClick={handleEnablePush}
                  disabled={isRequestingPush}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-xs"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>{isRequestingPush ? "Solicitando..." : "Ativar no Chrome / Android"}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestNativePush}
                  className="text-xs font-semibold gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Testar Push no Celular</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-muted rounded-xl">
            <TabsTrigger value="feed" className="rounded-lg text-xs font-bold gap-2">
              <Bell className="w-4 h-4" />
              <span>Feed de Alertas ({notifications.length})</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg text-xs font-bold gap-2">
              <Webhook className="w-4 h-4" />
              <span>Preferências & Canais</span>
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: FEED DE NOTIFICAÇÕES ──────────────────────────────────── */}
          <TabsContent value="feed" className="space-y-4">
            {/* Filters Bar */}
            <Card className="border shadow-2xs">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                  {/* Search */}
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por quarto, hóspede ou ocorrência..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 text-xs h-9"
                    />
                  </div>

                  {/* Filter chips */}
                  <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                    <Button
                      variant={selectedCategory === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory("all")}
                      className="text-xs h-8 px-2.5 font-semibold"
                    >
                      Todas
                    </Button>
                    {BUCKET_ORDER.map(bucket => {
                      const conf = categoryBucketConfig[bucket]
                      const count = notifications.filter(n => resolveBucket(n) === bucket).length
                      if (count === 0 && selectedCategory !== bucket) return null
                      return (
                        <Button
                          key={bucket}
                          variant={selectedCategory === bucket ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedCategory(bucket)}
                          className="text-xs h-8 px-2.5 font-semibold gap-1"
                        >
                          <span>{conf.emoji}</span>
                          <span>{conf.label}</span>
                          <span className="opacity-70 text-[10px]">({count})</span>
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={unreadOnly}
                        onChange={e => setUnreadOnly(e.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span>Apenas Não Lidas</span>
                    </label>

                    <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setGroupByCategory(true)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          groupByCategory
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Por Categoria</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupByCategory(false)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          !groupByCategory
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Cronológico</span>
                      </button>
                    </div>
                  </div>
                  <span className="text-muted-foreground">
                    Exibindo {filteredNotifications.length} de {notifications.length} notificações
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-card rounded-xl border animate-pulse" />
                ))}
              </div>
            ) : filteredNotifications.length > 0 ? (
              groupByCategory ? (
                <div className="space-y-5">
                  {groupedBuckets.map(({ bucket, items, unreadInBucket, meta }) => {
                    const BucketIcon = meta.icon
                    const isCollapsed = Boolean(collapsedBuckets[bucket])
                    return (
                      <Card key={bucket} className={`border-2 rounded-2xl overflow-hidden shadow-2xs ${meta.headerBg}`}>
                        <div
                          onClick={() => toggleBucketCollapse(bucket)}
                          className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                              <BucketIcon className="w-4 h-4" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-slate-100">
                                {meta.emoji} {meta.label}
                              </h2>
                              <Badge variant="outline" className="text-[11px] font-bold bg-background/80">
                                {items.length} {items.length === 1 ? "item" : "itens"}
                              </Badge>
                              {unreadInBucket > 0 && (
                                <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                                  {unreadInBucket} nova{unreadInBucket > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {unreadInBucket > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMarkBucketAsRead(bucket, items)
                                }}
                                className="h-7 text-[11px] font-semibold gap-1 bg-background"
                              >
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">Marcar categoria lida</span>
                              </Button>
                            )}
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="p-3 pt-1 space-y-2.5 bg-background/70 border-t">
                            {items.map(item => renderNotificationCard(item))}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map(item => renderNotificationCard(item))}
                </div>
              )
            ) : (
              <div className="text-center py-16 bg-card border border-dashed rounded-2xl p-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <CheckCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                  Nenhuma notificação encontrada
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Você está com todas as pendências e alertas em dia! Novos pedidos, achados e erros aparecerão aqui em tempo real.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── TAB 2: CONFIGURAÇÕES DE CANAIS E GATILHOS ────────────────────── */}
          <TabsContent value="settings" className="space-y-6">
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Canais de Entrega */}
              <Card className="border shadow-2xs">
                <CardHeader>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Volume2 className="w-5 h-5 text-primary" />
                    <span>Canais de Entrega de Notificações</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Escolha por onde você deseja ser avisado instantaneamente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Som no Navegador */}
                  <div className="flex items-center justify-between gap-4 p-3 bg-muted/40 rounded-xl border">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-emerald-600" />
                        <span>Alerta Sonoro Sutil no Navegador (Chime In-App)</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Toca um chime agradável e elegante quando uma nova notificação urgente chegar no sistema.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={playChimeSound}
                        className="text-[11px] h-7 px-2"
                      >
                        Ouvir Som
                      </Button>
                      <Switch
                        checked={settings.soundEnabled}
                        onCheckedChange={v => setSettings(s => ({ ...s, soundEnabled: v }))}
                      />
                    </div>
                  </div>

                  {/* WhatsApp Admin */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <PhoneCall className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp do Administrador / Gerente de Plantão</span>
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Número com DDD para envio de links diretos de atendimento de pedidos e alertas graves.
                    </p>
                    <Input
                      placeholder="Ex: 5522998888888 (com DDI e DDD)"
                      value={settings.adminWhatsApp}
                      onChange={e => setSettings(s => ({ ...s, adminWhatsApp: e.target.value }))}
                      className="text-xs max-w-md"
                    />
                  </div>

                  {/* Webhook / Telegram */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Webhook className="w-4 h-4 text-blue-600" />
                      <span>Webhook URL / Integração Externa (Telegram, Discord, Make, n8n)</span>
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Endpoint HTTP POST opcional para despachar o payload JSON de cada notificação em tempo real.
                    </p>
                    <Input
                      placeholder="Ex: https://api.telegram.org/bot... ou https://hook.eu1.make.com/..."
                      value={settings.webhookUrl}
                      onChange={e => setSettings(s => ({ ...s, webhookUrl: e.target.value }))}
                      className="text-xs max-w-xl"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Matriz de Gatilhos de Eventos */}
              <Card className="border shadow-2xs">
                <CardHeader>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-primary" />
                    <span>Matriz de Eventos & Alertas Operacionais</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ative ou desative cada tipo de evento conforme a sua conveniência.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 divide-y">
                  {/* Café */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Coffee className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">☕ Novos Pedidos de Café da Manhã</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Notifica a cozinha imediatamente assim que o hóspede preencher o pedido no quarto.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnBreakfast}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnBreakfast: v }))}
                    />
                  </div>

                  {/* Achados e Perdidos */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <PackageOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">📦 Itens Encontrados nos Quartos</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Notifica quando uma camareira cadastrar um objeto esquecido com foto.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnLostItem}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnLostItem: v }))}
                    />
                  </div>

                  {/* Defeitos e Pendências */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">⚠️ Defeitos & Pendências de Limpeza</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Notifica quando um quarto for marcado com problemas (lâmpada, ar, vazamento ou enxoval).
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnDefect}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnDefect: v }))}
                    />
                  </div>

                  {/* Checkouts */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                        <DoorOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">🚪 Check-outs & Saídas de Hóspedes</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Notifica quando o hóspede ou a recepção confirmar a desocupação do quarto.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnCheckout}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnCheckout: v }))}
                    />
                  </div>

                  {/* Erros e Bugs */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertOctagon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">🚨 Erros do Sistema, Bugs & Inconsistências</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Alerta urgente em caso de falha de conexão do Excel OneDrive, erro de emissão NFS-e ou bugs.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnSystemError}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnSystemError: v }))}
                    />
                  </div>

                  {/* Carrinho Abandonado */}
                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">🛒 Carrinhos Abandonados / Leads Quentes</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Alerta quando um cliente preencher telefone no motor de reservas mas não concluir o pagamento.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifyOnAbandonedCart}
                      onCheckedChange={v => setSettings(s => ({ ...s, notifyOnAbandonedCart: v }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Submit button */}
              <div className="flex items-center justify-between pt-2">
                {settingsSavedSuccess && (
                  <div className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
                    <Check className="w-4 h-4" />
                    <span>Preferências de notificação salvas com sucesso!</span>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSavingSettings}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs ml-auto shadow-sm"
                >
                  {isSavingSettings ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  )
}
