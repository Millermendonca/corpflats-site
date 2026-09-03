import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "wouter"
import { useGetMe, useLogout, getGetMeQueryKey, useGetAlerts } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { showNativeNotification, markInitialHistoryAsSeen } from "@/lib/push-notifications"
import { playHotelChime } from "@/lib/sound"
import { 
  LogOut, LayoutDashboard, History, Settings, UserCircle, ClipboardList, 
  MessageSquareWarning, BarChart3, Bell, ClipboardCheck, Sparkles, Key, Check, AlertCircle,
  CalendarDays, Users, Tablet, Globe, DollarSign, Bot, FileText, Coffee, Menu, X, Search, ChevronRight,
  CreditCard, Palette, Coins, ScrollText, Building2, Package, TrendingUp, Car, ThumbsUp
} from "lucide-react"
import { Button } from "./ui/button"
import { Skeleton } from "./ui/skeleton"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

interface NavItem {
  href: string
  label: string
  icon: any
  badge?: number | string | null
  description?: string
}

interface NavCategory {
  title: string
  icon?: any
  items: NavItem[]
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading, error } = useGetMe()
  const queryClient = useQueryClient()
  
  // Mobile drawer state & search
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Change password modal state
  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSuccess, setPwSuccess] = useState("")
  const [isSubmittingPw, setIsSubmittingPw] = useState(false)

  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null)
        setLocation("/login")
      }
    }
  })

  const isAuthenticated = !isLoading && !!user && location !== "/login"
  const { data: alerts } = useGetAlerts({
    query: {
      enabled: isAuthenticated,
      refetchInterval: isAuthenticated ? 60000 : false,
      queryKey: ["alerts"] as const,
    },
  })
  const alertCount = alerts?.filter(a => a.severity === "critical" || a.severity === "warning").length ?? 0

  const [unreadNotifications, setUnreadNotifications] = useState<number>(0)
  const [recentNotificationsList, setRecentNotificationsList] = useState<any[]>([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState<boolean>(false)
  const [activeToastNotif, setActiveToastNotif] = useState<any | null>(null)
  const seenNotifIdsRef = useRef<Set<number>>(new Set())
  const isInitialPollRef = useRef<boolean>(true)

  useEffect(() => {
    if (!isAuthenticated) return
    const checkNotifs = async () => {
      try {
        const res = await fetch("/api/notifications")
        if (res.ok) {
          const d = await res.json()
          setUnreadNotifications(d.unreadCount || 0)
          const items: any[] = d.notifications || []
          setRecentNotificationsList(items.slice(0, 8))

          if (isInitialPollRef.current) {
            isInitialPollRef.current = false
            items.forEach(it => seenNotifIdsRef.current.add(it.id))
            const existingIds = items.map(it => it.id).filter(Boolean)
            markInitialHistoryAsSeen(existingIds)
            return
          }

          // Identifica itens novos
          const newItems = items.filter(it => !it.read && !seenNotifIdsRef.current.has(it.id))
          if (newItems.length > 0) {
            const latest = newItems[0]
            newItems.forEach(it => seenNotifIdsRef.current.add(it.id))

            // Dispara Som e Pop-up Toast Visual
            playHotelChime(latest.severity === "warning" || latest.severity === "danger" ? "urgent" : "normal")
            setActiveToastNotif(latest)

            // Auto-oculta o toast após 10 segundos
            setTimeout(() => {
              setActiveToastNotif(prev => prev?.id === latest.id ? null : prev)
            }, 10000)

            // Notificação nativa de browser se permitido
            showNativeNotification({
              id: latest.id,
              title: latest.title,
              message: latest.message,
              url: latest.targetUrl || "/notificacoes",
              createdAt: latest.createdAt
            })
          }
        }
      } catch {}
    }
    checkNotifs()
    const intv = setInterval(checkNotifs, 6000)
    return () => clearInterval(intv)
  }, [isAuthenticated])

  useEffect(() => {
    if (!isLoading && error) {
      if (location !== "/login") {
        setLocation("/login")
      }
    }
  }, [isLoading, error, location, setLocation])

  // Fecha o drawer ao navegar
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError("")
    setPwSuccess("")

    if (!currentPassword || !newPassword) {
      setPwError("Preencha todos os campos.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError("A nova senha e a confirmação não conferem.")
      return
    }
    if (newPassword.length < 4) {
      setPwError("A nova senha deve ter no mínimo 4 caracteres.")
      return
    }

    setIsSubmittingPw(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setPwSuccess("Senha alterada com sucesso!")
        setTimeout(() => {
          setPwModalOpen(false)
          setCurrentPassword("")
          setNewPassword("")
          setConfirmPassword("")
        }, 1500)
      } else {
        setPwError(data.error || "Erro ao alterar a senha.")
      }
    } catch (err) {
      setPwError("Falha na comunicação com o servidor.")
    } finally {
      setIsSubmittingPw(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Skeleton className="w-16 h-16 rounded-full" />
      </div>
    )
  }

  if (!user && location !== "/login") {
    return null
  }

  if (location === "/login") {
    return <>{children}</>
  }

  const isAdmin = user?.role === "admin"

  // Estrutura Categorizada dos Módulos do Sistema
  const navCategories: NavCategory[] = [
    {
      title: "🧹 Governança & Camareiras",
      items: [
        { href: "/dashboard", label: "Painel de Limpeza", icon: LayoutDashboard, description: "Quartos sujos, limpos e em andamento" },
        { href: "/achados-perdidos", label: "Achados & Perdidos", icon: Package, description: "Objetos esquecidos, custódia e devoluções" },
        { href: "/tasks", label: "Tarefas Preventivas", icon: ClipboardList, description: "Trocas de filtro, dedetizações e rotinas" },
        { href: "/observations", label: "Ocorrências & Avarias", icon: MessageSquareWarning, description: "Defeitos e manutenções relatadas" },
        ...(isAdmin ? [{ href: "/surveys", label: "Vistorias de Saída", icon: ClipboardCheck, description: "Conferência de itens e fotos pós checkout" }] : []),
        { href: "/reports", label: isAdmin ? "Relatório & Fechamento de Limpeza" : "Meu Relatório", icon: BarChart3, description: "Fechamento quinzenal, histórico e métricas" },
      ]
    },
    ...(isAdmin ? [
      {
        title: "📅 Reservas & Hospedagem",
        items: [
          { href: "/reservas", label: "Mapa de Reservas (PMS)", icon: CalendarDays, description: "Calendário de ocupação e reservas" },
          { href: "/relatorios-reservas", label: "Relatórios & Ocupação (PMS)", icon: TrendingUp, description: "Taxa de ocupação, diária média, RevPAR e ranking" },
          { href: "/crm", label: "Hóspedes & Empresas (CRM 360)", icon: Users, description: "LTV, fidelidade, preferências e faturamento PJ" },
          { href: "/portaria", label: "Terminal da Portaria (Tablet)", icon: Tablet, description: "Check-in presencial e liberação" },
          { href: "/pedidos-cafe", label: "Produção de Café da Manhã", icon: Coffee, description: "Ficha técnica e montagem das cestas" },
          { href: "/reservar", label: "Site de Reservas Diretas", icon: Globe, description: "Página pública de vendas" },
        ]
      },
      {
        title: "🧾 Gestão Fiscal & NFS-e",
        items: [
          { href: "/notas", label: "Hub de Notas Fiscais", icon: FileText, description: "Chat IA, formulário, livro fiscal e templates" },
        ]
      },
      {
        title: "💰 Financeiro & Vendas",
        items: [
          { href: "/financeiro", label: "ERP Financeiro & DRE", icon: DollarSign, description: "Contas a Pagar/Receber e DRE gerencial" },
          { href: "/tarifas", label: "Gestão de Tarifas & Taxas", icon: Coins, description: "Preços com/sem café, limpeza, pet e camas" },
          { href: "/pagamentos", label: "Pagamentos & Conciliação PIX", icon: CreditCard, description: "PIX Inter automático, Mercado Pago e taxas" },
          { href: "/trafego", label: "Marketing & Tráfego IA", icon: Bot, description: "Automação de campanhas e conversão" },
        ]
      },
      {
        title: "🏨 Propriedade & Regras",
        items: [
          { href: "/propriedade", label: "Flats, Políticas & Regras", icon: Building2, description: "Quartos, horários, regras da casa e contratos" },
          { href: "/garagem", label: "Controle de Garagem & Vagas", icon: Car, description: "Vagas rotativas e placas de veículos" },
          { href: "/avaliacoes-ia", label: "Avaliações & Satisfação IA", icon: ThumbsUp, description: "Análise de sentimentos e reviews do Google" },
          { href: "/editor-site", label: "Editor Visual do Site", icon: Palette, description: "Fotos, comodidades, slogans e textos" },
        ]
      },
      {
        title: "⚙️ Sistema & Integrações",
        items: [
          { href: "/configuracoes", label: "Integrações Técnicas & Nuvem", icon: Settings, description: "Cloudflare R2, Microsoft Graph, usuários" },
          { href: "/notificacoes", label: "Central de Notificações", icon: Bell, badge: unreadNotifications > 0 ? unreadNotifications : null, description: "Alertas de pedidos e chamados" },
          { href: "/logs", label: "Logs & Auditoria Fail-Safe", icon: ScrollText, description: "Auditoria fail-safe de eventos e erros" },
        ]
      }
    ] : [])
  ]

  // Lista linear filtrada por busca (se o usuário pesquisar algo no drawer)
  const filteredCategories = navCategories.map(cat => ({
    ...cat,
    items: cat.items.filter(it => 
      !searchQuery.trim() || 
      it.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.description && it.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Alert banner */}
      {alertCount > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-2 text-sm shadow-md">
          <Bell className="w-4 h-4 shrink-0" />
          <span className="font-medium">{alertCount} flat{alertCount > 1 ? "s" : ""} com checkout pendente após o horário limite</span>
        </div>
      )}

      {/* Header Fixo Mobile (Celular) */}
      <header className="md:hidden sticky top-0 z-40 bg-card border-b border-border px-4 py-3 flex items-center justify-between shadow-xs print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-black text-sm block leading-tight text-foreground">CorpFlats</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">{user?.role === "admin" ? "Administração" : "Camareira"}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <div className="relative">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="h-9 w-9 relative text-muted-foreground hover:text-foreground"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-rose-600 text-white font-black text-[9px] rounded-full flex items-center justify-center animate-bounce shadow-xs">
                    {unreadNotifications}
                  </span>
                )}
              </Button>

              {/* Dropdown Flutuante de Notificações Recentes */}
              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-3xl shadow-2xl z-50 p-4 space-y-3 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      <span className="font-black text-xs text-foreground">Central de Alertas & Notificações</span>
                    </div>
                    {unreadNotifications > 0 && (
                      <span className="text-[10px] font-bold bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full">
                        {unreadNotifications} novas
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
                    {recentNotificationsList.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-xs">
                        Nenhum alerta recente no momento.
                      </div>
                    ) : (
                      recentNotificationsList.map(n => (
                        <div 
                          key={n.id}
                          onClick={() => {
                            setNotifDropdownOpen(false)
                            if (n.targetUrl) setLocation(n.targetUrl)
                          }}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                            !n.read 
                              ? 'bg-primary/5 border-primary/30 hover:bg-primary/10' 
                              : 'bg-muted/30 border-border/60 hover:bg-muted/50 opacity-80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-foreground text-xs leading-tight">{n.title}</span>
                            <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                              {n.createdAt ? new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await fetch("/api/notifications/mark-all-read", { method: "POST" })
                        setUnreadNotifications(0)
                        setRecentNotificationsList(prev => prev.map(p => ({ ...p, read: true })))
                      }}
                      className="text-[11px] h-7 px-2 font-bold text-muted-foreground hover:text-foreground"
                    >
                      Marcar todas como lidas
                    </Button>

                    <Link href="/notificacoes" onClick={() => setNotifDropdownOpen(false)}>
                      <Button size="sm" className="text-[11px] h-7 px-3 font-bold rounded-xl bg-primary text-primary-foreground">
                        Ver todas
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setMobileMenuOpen(true)}
            className="h-9 px-3 gap-1.5 font-bold text-xs rounded-xl border-border"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
          </Button>
        </div>
      </header>

      {/* Sidebar Desktop */}
      <aside className={`hidden md:flex w-64 lg:w-72 bg-card border-r border-border flex-col shrink-0 print:hidden ${alertCount > 0 ? "mt-9" : ""}`}>
        {/* Brand Header */}
        <div className="p-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base block leading-tight text-foreground">CorpFlats</span>
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Gestão Hoteleira</span>
            </div>
          </div>

          {isAdmin && unreadNotifications > 0 && (
            <Link href="/notificacoes">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                {unreadNotifications}
              </span>
            </Link>
          )}
        </div>
        
        {/* Nav Items Categorizados com Scroll Suave */}
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto max-h-[calc(100dvh-130px)]">
          {navCategories.map((cat, idx) => (
            <div key={idx} className="space-y-1">
              <span className="px-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">
                {cat.title}
              </span>
              <div className="space-y-0.5">
                {cat.items.map(item => {
                  const isActive = location === item.href
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive 
                          ? 'bg-primary text-primary-foreground shadow-xs' 
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}>
                        <div className="flex items-center gap-2.5 truncate">
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge ? (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${isActive ? 'bg-white text-primary' : 'bg-rose-600 text-white animate-pulse'}`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        
        {/* User Footer Profile & Password Change */}
        <div className="p-3.5 border-t border-border mt-auto flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <UserCircle className="w-8 h-8 text-muted-foreground shrink-0" />
            <div className="flex flex-col truncate">
              <span className="text-xs font-bold truncate text-foreground capitalize">{user?.username}</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                {user?.role === "admin" ? "Administrador" : "Camareira"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link href="/configuracoes">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                  title="Configurações do Sistema"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-primary" 
              onClick={() => {
                setPwError("")
                setPwSuccess("")
                setPwModalOpen(true)
              }} 
              title="Alterar minha senha"
            >
              <Key className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-destructive" 
              onClick={() => logout.mutate()} 
              title="Sair" 
              disabled={logout.isPending}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>
      
      {/* Conteúdo Principal */}
      <main className="flex-1 flex flex-col min-w-0 max-h-[100dvh] overflow-y-auto pb-20 md:pb-0 print:max-h-none print:h-auto print:overflow-visible print:pb-0 print:m-0 print:p-0">
        {children}
      </main>

      {/* Barra de Navegação Inferior Móvel (Bottom Bar para Celular) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border px-2 py-1.5 flex items-center justify-around shadow-2xl print:hidden">
        <Link href="/dashboard">
          <div className={`flex flex-col items-center py-1 px-2 rounded-xl transition-all ${
            location === "/dashboard" ? "text-primary font-black scale-105" : "text-muted-foreground"
          }`}>
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Limpeza</span>
          </div>
        </Link>

        {isAdmin && (
          <Link href="/portaria">
            <div className={`flex flex-col items-center py-1 px-2 rounded-xl transition-all ${
              location === "/portaria" ? "text-primary font-black scale-105" : "text-muted-foreground"
            }`}>
              <Tablet className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Portaria</span>
            </div>
          </Link>
        )}

        {isAdmin && (
          <Link href="/pedidos-cafe">
            <div className={`flex flex-col items-center py-1 px-2 rounded-xl transition-all ${
              location === "/pedidos-cafe" ? "text-primary font-black scale-105" : "text-muted-foreground"
            }`}>
              <Coffee className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Café</span>
            </div>
          </Link>
        )}

        {isAdmin && (
          <Link href="/reservas">
            <div className={`flex flex-col items-center py-1 px-2 rounded-xl transition-all ${
              location === "/reservas" ? "text-primary font-black scale-105" : "text-muted-foreground"
            }`}>
              <CalendarDays className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Reservas</span>
            </div>
          </Link>
        )}

        <button 
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center py-1 px-2 rounded-xl transition-all ${
            mobileMenuOpen ? "text-primary font-black" : "text-muted-foreground"
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-bold">Mais</span>
        </button>
      </div>

      {/* Drawer / Gaveta Lateral Completa Mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Overlay escuro */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Painel lateral deslizante */}
          <div className="relative w-4/5 max-w-sm bg-card border-r border-border flex flex-col h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-sm block leading-tight text-foreground">Menu do Sistema</span>
                  <span className="text-[10px] text-muted-foreground font-semibold">Todas as telas e módulos</span>
                </div>
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setMobileMenuOpen(false)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Campo de Busca Rápida no Drawer */}
            <div className="p-3 border-b border-border bg-card">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo ou tela..."
                  className="pl-9 h-9 text-xs rounded-xl bg-muted/40 border-border"
                />
              </div>
            </div>

            {/* Lista Categorizada com Scroll */}
            <div className="flex-1 p-3 overflow-y-auto space-y-4">
              {filteredCategories.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <span className="px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1">
                    {cat.title}
                  </span>
                  <div className="space-y-1">
                    {cat.items.map(item => {
                      const isActive = location === item.href
                      return (
                        <Link key={item.href} href={item.href}>
                          <div className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-card border-border/70 hover:bg-muted text-foreground"
                          }`}>
                            <div className="flex items-center gap-2.5 truncate">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isActive ? "bg-white/20 text-white" : "bg-muted text-foreground"
                              }`}>
                                <item.icon className="w-4 h-4" />
                              </div>
                              <div className="truncate">
                                <span className="text-xs font-bold block leading-tight truncate">{item.label}</span>
                                {item.description && (
                                  <span className={`text-[10px] truncate block ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                    {item.description}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-muted-foreground"}`} />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Perfil e Ações do Rodapé do Drawer */}
            <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <UserCircle className="w-7 h-7 text-muted-foreground shrink-0" />
                <div className="truncate">
                  <span className="text-xs font-bold text-foreground block truncate capitalize">{user?.username}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase">{user?.role}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setPwError("")
                    setPwSuccess("")
                    setPwModalOpen(true)
                  }}
                  title="Alterar Senha"
                >
                  <Key className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => logout.mutate()}
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <Dialog open={pwModalOpen} onOpenChange={setPwModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Alterar Minha Senha
            </DialogTitle>
            <DialogDescription>
              Atualize sua senha de acesso para maior segurança.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordChange} className="space-y-4 py-2">
            {pwError && (
              <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pwError}</span>
              </div>
            )}
            {pwSuccess && (
              <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-lg border border-emerald-300 flex items-center gap-2 font-semibold">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{pwSuccess}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="curr-pw" className="text-xs">Senha Atual</Label>
              <Input 
                id="curr-pw" 
                type="password" 
                value={currentPassword} 
                onChange={e => setCurrentPassword(e.target.value)} 
                placeholder="Digite sua senha atual" 
                required 
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pw" className="text-xs">Nova Senha</Label>
              <Input 
                id="new-pw" 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="No mínimo 4 caracteres" 
                required 
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conf-pw" className="text-xs">Confirmar Nova Senha</Label>
              <Input 
                id="conf-pw" 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Repita a nova senha" 
                required 
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPwModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmittingPw}>
                {isSubmittingPw ? "Salvando..." : "Salvar Nova Senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
