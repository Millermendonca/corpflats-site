import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "wouter"
import { useGetMe, useLogout, getGetMeQueryKey, useGetAlerts } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { showNativeNotification, markInitialHistoryAsSeen } from "@/lib/push-notifications"
import { playHotelChime } from "@/lib/sound"
import { cancelGoogleOneTap } from "@/lib/auth-client"
import { 
  LogOut, LayoutDashboard, History, Settings, UserCircle, ClipboardList, 
  MessageSquareWarning, BarChart3, Bell, ClipboardCheck, Sparkles, Key, Check, AlertCircle,
  CalendarDays, Users, Tablet, Globe, DollarSign, Bot, FileText, Coffee, Menu, X, Search, ChevronRight,
  CreditCard, Palette, Coins, ScrollText, Building2, Package, TrendingUp, Car, ThumbsUp, MessageSquare,
  Smartphone, ShoppingCart, Wallet, Mail, Workflow, Wrench, Activity,
  Inbox, Pin, PinOff, ChevronDown, UserCheck
} from "lucide-react"
import { Button } from "./ui/button"
import { Skeleton } from "./ui/skeleton"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { QuickShoppingModal } from "./quick-shopping-modal"
import { hasModuleAccess } from "@/lib/permissions"

interface NavItem {
  href: string
  label: string
  title?: string
  icon: any
  badge?: number | string | null
  description?: string
  devOnly?: boolean
}

interface NavCategory {
  id: string
  title: string
  icon?: any
  devOnly?: boolean
  items: NavItem[]
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading, error } = useGetMe()
  const queryClient = useQueryClient()
  
  // Desktop Auto-Hide Sidebar and Pin state (persisted in localStorage)
  const [isDesktopOpen, setIsDesktopOpen] = useState(false)
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gfm_sidebar_pinned") === "true"
    } catch {
      return false
    }
  })
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Accordion state (Reservas & Hospedagem and Frigobar & Anserve open by default)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => ({
    reservas: true,
    frigobar: true
  }))

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev
      try {
        localStorage.setItem("gfm_sidebar_pinned", String(next))
        window.dispatchEvent(new CustomEvent("gfm-sidebar-pin-changed", { detail: { isPinned: next } }))
      } catch {}
      return next
    })
  }

  const handleMouseEnterSidebar = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setIsDesktopOpen(true)
  }

  const handleMouseLeaveSidebar = () => {
    if (isPinned) return
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setIsDesktopOpen(false)
    }, 280)
  }

  const toggleCategory = (catId: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }))
  }

  // Mobile drawer state & quick search
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Fecha o drawer mobile e fecha a sidebar desktop desfixada ao navegar
  useEffect(() => {
    setMobileMenuOpen(false)
    if (!isPinned) {
      setIsDesktopOpen(false)
    }
  }, [location, isPinned])

  // Garante que nenhum prompt do Google One Tap apareça na área administrativa/backend
  useEffect(() => {
    cancelGoogleOneTap()
  }, [location])

  // Pending shopping count — fetched directly (no modal needed)
  const [pendingShoppingCount, setPendingShoppingCount] = useState(0)
  useEffect(() => {
    const loadCount = () => {
      fetch("/api/shopping-list")
        .then(r => r.json())
        .then((d: any[]) => { if (Array.isArray(d)) setPendingShoppingCount(d.filter(i => !i.completed).length) })
        .catch(() => {})
    }
    loadCount()
    const interval = setInterval(loadCount, 60000)
    return () => clearInterval(interval)
  }, [])

  // Pending quarantine count for WBP integration
  const [quarantineCount, setQuarantineCount] = useState<number>(0)
  useEffect(() => {
    const loadQuarantine = () => {
      fetch("/api/wbp/quarantine")
        .then(r => r.json())
        .then((d: any) => {
          if (Array.isArray(d)) {
            setQuarantineCount(d.length)
          } else if (d && Array.isArray(d.items)) {
            setQuarantineCount(d.items.length)
          }
        })
        .catch(() => {})
    }
    loadQuarantine()
    const interval = setInterval(loadQuarantine, 30000)
    return () => clearInterval(interval)
  }, [])

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
        try {
          localStorage.removeItem("corpflats_anserve_token")
          localStorage.removeItem("corpflats_anserve_user_name")
          localStorage.removeItem("corpflats_anserve_user_id")
          localStorage.removeItem("corpflats_anserve_username")
        } catch {}
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
              setActiveToastNotif((prev: any) => prev?.id === latest.id ? null : prev)
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
    const intv = setInterval(checkNotifs, 12000)
    return () => clearInterval(intv)
  }, [isAuthenticated])

  const isAnservePinRoute = location === "/frigobar-reposicao" || location === "/anserve/reposicao"
  const hasLocalAnservePinToken = (() => {
    try {
      return typeof window !== "undefined" && Boolean(localStorage.getItem("corpflats_anserve_token"))
    } catch {
      return false
    }
  })()

  const effectiveUser = user || (isAnservePinRoute && hasLocalAnservePinToken
    ? {
        id: Number(typeof window !== "undefined" ? localStorage.getItem("corpflats_anserve_user_id") : 10) || 10,
        username: (typeof window !== "undefined" ? localStorage.getItem("corpflats_anserve_username") : null) || "repositora",
        name: (typeof window !== "undefined" ? localStorage.getItem("corpflats_anserve_user_name") : null) || "Repositora Anserve",
        role: "anserve_repositora",
        allowedModules: ["/frigobar-reposicao", "/anserve/reposicao"]
      }
    : null)

  const role = effectiveUser?.role
  const isDev = role === "dev"
  const isAdmin = role === "admin"
  const isAdminOrDev = isDev || isAdmin
  const isCamareira = role === "camareira"
  const isRecepcao = role === "recepcao"
  const isAnserveRepositora = role === "anserve_repositora"
  const isAnserveGestor = role === "anserve_gestor"

  // Helper de checagem de rota ativa
  const isItemActive = (href: string) => {
    if (location === href) return true
    if (href === "/anserve" && (location === "/frigobar-gestao")) return true
    if (href === "/frigobar-notas" && (location === "/anserve/notas" || location === "/notas-frigobar")) return true
    if (href === "/frigobar-reposicao" && (location === "/anserve/reposicao")) return true
    if (href === "/frigobar" && (location === "/minibar" || location === "/minibar-admin" || location === "/admin/frigobar")) return true
    if (href === "/reservas" && (location === "/relatorio-reservas" || location === "/relatorios-reservas" || location === "/pms-reports")) return false
    if (href === "/tarifas" && (location === "/precificacao-sebrae" || location === "/pricing-sebrae" || location === "/gestao-tarifas" || location === "/tabela-tarifas" || location === "/precos")) return true
    if (href === "/pagamentos" && (location === "/payments" || location === "/recebiveis" || location === "/taxas")) return true
    if (href === "/funil-vendas" && (location === "/trafego" || location === "/marketing" || location === "/ads")) return true
    if (href === "/financeiro" && (location === "/financial" || location === "/finance" || location === "/precificacao" || location === "/dre" || location === "/contas" || location === "/fluxo-caixa")) return true
    if (href === "/equipe" && (location === "/usuarios" || location === "/usuarios-equipe" || location === "/users")) return true
    if (href === "/rh" && (location === "/rh" || location === "/colaboradores" || location === "/funcionarios" || location === "/recursos-humanos" || location === "/admin/rh" || location === "/gestao-rh")) return true
    if (href === "/configuracoes" && (location === "/settings" || location === "/configuracao" || location === "/ajustes")) return true
    if (href === "/zapi-conexao" && (location === "/conexao-zapi" || location === "/sistema/zapi" || location === "/zapi")) return true
    if (href === "/emails" && (location === "/email-hub" || location === "/gerenciador-emails")) return true
    if (href === "/jornada-reservas" && (location === "/jornada-comunicacao" || location === "/fluxo-reservas" || location === "/mapa-jornada" || location === "/jornada")) return true
    if (href === "/monitor-servidor" && (location === "/servidor" || location === "/server-monitor")) return true
    if (href === "/ia-status" && (location === "/ai-status" || location === "/status-ia")) return true
    if (href === "/logs" && (location === "/auditoria" || location === "/system-logs" || location === "/audit")) return true
    if (href === "/raio-x-flats" && (location === "/raio-x-flats" || location === "/diario-flats" || location === "/hub-manutencao" || location === "/servicos" || location === "/tasks" || location === "/observations" || location === "/surveys")) return true
    return false
  }

  // Estrutura Categorizada dos Módulos do Sistema em 6 Categorias por Prioridade de Uso
  const rawNavCategories: NavCategory[] = [
    // 1. 📅 Reservas & Hospedagem
    {
      id: "reservas",
      title: "📅 Reservas & Hospedagem",
      items: [
        { href: "/reservas", label: "Mapa de Reservas (PMS)", icon: CalendarDays, description: "Calendário de ocupação e reservas" },
        ...(isAdminOrDev ? [{ href: "/painel-aovivo", label: "Painel Ao Vivo (Monitor 32\")", icon: Activity, badge: "LIVE", description: "Centro de comando das 19 unidades, giro do dia, WhatsApp, NPS e financeiro" }] : []),
        { href: "/caixa-entrada-ota", label: "Caixa de Entrada OTA", icon: Inbox, badge: quarantineCount > 0 ? quarantineCount : null, description: "Reservas Booking/Airbnb, quarentena e conciliação" },
        { href: "/relatorios-reservas", label: "Relatórios & Ocupação (PMS)", icon: TrendingUp, description: "Taxa de ocupação, diária média, RevPAR e ranking" },
        { href: "/crm", label: "Hóspedes & Empresas (CRM 360)", icon: Users, description: "LTV, fidelidade, preferências e faturamento PJ" },
        { href: "/portaria", label: "Terminal da Portaria (Tablet)", icon: Tablet, description: "Check-in presencial e liberação" },
        { href: "/pedidos-cafe", label: "Café da Manhã & Produção", icon: Coffee, description: "Ficha técnica e montagem dos pedidos" },
        { href: "/relatorios-cafe", label: "Relatórios & Histórico do Café", icon: BarChart3, description: "Insights de consumo, custos e histórico geral" },
        { href: "/reservar", label: "Site de Reservas Diretas", icon: Globe, description: "Página pública de vendas" },
      ]
    },

    // 2. 💬 Comunicação & Atendimento
    {
      id: "comunicacao",
      title: "💬 Comunicação & Atendimento",
      items: [
        { href: "/whatsapp-chat", label: "WhatsApp Web (Chat)", icon: MessageSquare, description: "Conversas em tempo real, envio e histórico completo" },
        { href: "/whatsapp", label: "Automação WhatsApp", icon: Bot, description: "Réguas de gatilhos, editor, fila e histórico" },
        { href: "/emails", label: "Gerenciador de E-mails", icon: Mail, description: "E-mails enviados, agendados, redator e controle do motor" },
        { href: "/notificacoes", label: "Central de Notificações", icon: Bell, badge: unreadNotifications > 0 ? unreadNotifications : null, description: "Alertas de pedidos, chamados e auditoria" },
      ]
    },

    // 3. 🧹 Governança & Manutenção
    {
      id: "governanca",
      title: "🧹 Governança & Manutenção",
      items: [
        { href: "/dashboard", label: "Painel de Limpeza", icon: LayoutDashboard, description: "Quartos sujos, limpos e em andamento" },
        { href: "/reports", label: isAdminOrDev ? "Fechamento & Diárias das Camareiras" : "Meu Fechamento & Extrato", icon: Wallet, description: "Fechamento quinzenal, extrato em tempo real, vales e PIX" },
        { href: "/lista-compras", label: "Lista de Compras", icon: ShoppingCart, badge: pendingShoppingCount > 0 ? pendingShoppingCount : null, description: "Itens para reposição, compras e governança" },
        ...(isCamareira ? [{ href: "/observations", label: "Ocorrências & Avarias", icon: MessageSquareWarning, description: "Defeitos e manutenções relatadas" }] : [{ href: "/raio-x-flats", label: "Raio-X & Hub dos Flats", icon: Wrench, description: "Diário do flat, campanhas (AC/dedetização/cortinas), ficha técnica, 76 tags, preventivas e vistorias" }]),
        ...(isCamareira ? [{ href: "/tasks", label: "Tarefas Preventivas", icon: ClipboardList, description: "Trocas de filtro, dedetizações e rotinas" }] : []),
        { href: "/achados-perdidos", label: "Achados & Perdidos", icon: Package, description: "Objetos esquecidos, custódia e devoluções" },
        { href: "/automacoes-camareiras", label: "Automação WhatsApp Camareiras", icon: MessageSquare, description: "Gatilhos automáticos, alertas de quarto e fechamentos" },
      ]
    },

    // 4. 💰 Financeiro, Tarifas & Fiscal
    {
      id: "financeiro",
      title: "💰 Financeiro, Tarifas & Fiscal",
      items: [
        { href: "/financeiro", label: "ERP Financeiro & DRE", icon: DollarSign, description: "DRE Gerencial, Contas a Pagar/Receber, Long-Stay e Fluxo de Caixa" },
        { href: "/tarifas", label: "Tarifas & Precificação SEBRAE", icon: Coins, description: "Calendário, Custo por UH (R$ 149,38), Tarifa Mínima R$ 276,63, Sazonalidade, Canais e WBP" },
        { href: "/pagamentos", label: "Pagamentos, PIX & Cauções", icon: CreditCard, description: "Conciliação PIX Inter, Mercado Pago, Taxas e Cauções" },
        { href: "/notas", label: "Hub de Notas Fiscais (NFS-e)", icon: FileText, description: "Chat IA, formulário, livro fiscal e templates" },
        { href: "/funil-vendas", label: "Funil de Vendas & Tráfego IA", icon: TrendingUp, description: "Funil 5 etapas, recuperação WhatsApp e anúncios Meta/Google IA" },
      ]
    },

    // 5. 🏨 Propriedade & Equipe
    {
      id: "propriedade",
      title: "🏨 Propriedade & Equipe",
      items: [
        { href: "/equipe", label: "Equipe & Níveis de Acesso", icon: Users, description: "Usuários do sistema, permissões, WhatsApp e senhas" },
        { href: "/rh", label: "Gestão de RH & Ponto CLT", icon: UserCheck, description: "Funcionários CLT, escalas 6x1, ponto eletrônico, travas, folha e ASO" },
        { href: "/propriedade", label: "Flats, Políticas & Regras", icon: Building2, description: "Quartos, horários, regras da casa e contratos" },
        { href: "/garagem", label: "Controle de Garagem & Vagas", icon: Car, description: "Vagas rotativas e placas de veículos" },
        { href: "/avaliacoes-ia", label: "Avaliações & Satisfação IA", icon: ThumbsUp, description: "Análise de sentimentos e reviews do Google" },
        { href: "/editor-site", label: "Editor Visual do Site", icon: Palette, description: "Fotos, comodidades, slogans e textos" },
      ]
    },

    // 6. 🧊 Frigobar & Anserve
    {
      id: "frigobar",
      title: "🧊 Frigobar & Anserve",
      items: [
        { href: "/frigobar", label: "Gestão de Frigobar (CorpFlats)", icon: Package, description: "Catálogo, gabarito por flat, QR Codes e extrato de repasse" },
        { href: "/anserve", label: "Painel de Supervisão Anserve", icon: FileText, description: "Supervisão geral, equipe, vendas e fechamento" },
        { href: "/frigobar-notas", label: "Emissão de Notas Fiscais (Frigobar)", icon: FileText, description: "Tela exclusiva p/ emissão e anexo de Notas Fiscais do frigobar por flat" },
        { href: "/frigobar-reposicao", label: "Portal da Repositora", icon: Package, description: "Conferência rápida, lançamento diário e reposição" },
        { href: "/frigobar-gestao", label: "Relatórios & Estoque Anserve", icon: BarChart3, description: "Métricas de saída, consumo de cortesias e auditoria" },
      ]
    },

    // 7. 🛠️ Engenharia & Dev (devOnly: true)
    {
      id: "engenharia",
      title: "🛠️ Engenharia & Dev",
      devOnly: true,
      items: [
        { href: "/configuracoes", label: "Integrações Técnicas & Nuvem", icon: Settings, description: "Cloudflare R2, Microsoft Graph, chaves de API e certificados", devOnly: true },
        { href: "/zapi-conexao", label: "Conexão Z-API (WhatsApp)", icon: Smartphone, description: "Instância, QR Code, credenciais e status de conexão", devOnly: true },
        { href: "/jornada-reservas", label: "Mapa da Jornada (Fluxograma)", icon: Workflow, description: "Fluxograma completo de mensagens WhatsApp e e-mails por etapa da reserva", devOnly: true },
        { href: "/monitor-servidor", label: "Monitor do Servidor & IA", icon: Activity, description: "Telemetria de CPU, RAM em tempo real, RCA e Render stream", devOnly: true },
        { href: "/ia-status", label: "Status da IA", icon: Bot, description: "Monitoramento dos modelos Gemini, OpenAI e latências", devOnly: true },
        { href: "/logs", label: "Logs & Auditoria Fail-Safe", icon: ScrollText, description: "Auditoria fail-safe de eventos e erros", devOnly: true },
      ]
    }
  ]

  // R4: Filtragem dinâmica de itens pelo catálogo granular allowedModules (ocultando categorias vazias)
  const navCategories: NavCategory[] = effectiveUser
    ? rawNavCategories
        .map(cat => ({
          ...cat,
          items: cat.items.filter(item => hasModuleAccess(effectiveUser as any, item.href))
        }))
        .filter(cat => cat.items.length > 0)
    : []

  useEffect(() => {
    if (!isLoading && error && !effectiveUser) {
      if (location !== "/login" && !isAnservePinRoute) {
        setLocation("/login")
      }
    }
  }, [isLoading, error, effectiveUser, location, isAnservePinRoute, setLocation])

  // Fecha o drawer ao navegar
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location])

  // Auto-expande categoria ativa na navegação (SEMPRE antes de early returns para respeitar Rules of Hooks)
  useEffect(() => {
    navCategories.forEach(cat => {
      if (cat.items.some(item => isItemActive(item.href))) {
        setOpenCategories(prev => ({ ...prev, [cat.id]: true }))
      }
    })
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

  if (isLoading && !effectiveUser) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Skeleton className="w-16 h-16 rounded-full" />
      </div>
    )
  }

  if (!effectiveUser && location !== "/login") {
    return null
  }

  if (location === "/login") {
    return <>{children}</>
  }

  // Checagem de categoria aberta (auto-expande durante busca)
  const isCategoryOpen = (catId: string) => {
    if (searchQuery.trim().length > 0) return true
    return Boolean(openCategories[catId])
  }

  // Contador de badges por categoria
  const getCategoryBadge = (cat: NavCategory) => {
    let count = 0
    for (const it of cat.items) {
      if (typeof it.badge === "number") count += it.badge
    }
    return count
  }

  // Filtragem rápida em tempo real por rótulo, descrição e rota
  const filteredCategories = navCategories.map(cat => ({
    ...cat,
    items: cat.items.filter(it => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const matchLabel = it.label.toLowerCase().includes(q)
      const matchDesc = it.description && it.description.toLowerCase().includes(q)
      const matchHref = it.href.toLowerCase().includes(q)
      const matchTitle = it.title && it.title.toLowerCase().includes(q)
      return Boolean(matchLabel || matchDesc || matchHref || matchTitle)
    })
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
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">
              {isDev ? "Dev / Engenharia" : isAdmin ? "Administração" : isAnserveGestor ? "Gestor Anserve" : isAnserveRepositora ? "Repositora Anserve" : isRecepcao ? "Recepção" : "Camareira"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdminOrDev && (
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
          {isAdminOrDev && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("toggle-sofia-copilot"))}
              className="h-9 px-2.5 gap-1.5 font-bold text-xs rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
              title="Abrir Sofia Copiloto IA (Ctrl+J)"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden xs:inline">Sofia IA</span>
            </Button>
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

      {/* Gatilho sensível na borda esquerda (Desktop Hover Edge Trigger) */}
      {!isPinned && (
        <div
          onMouseEnter={handleMouseEnterSidebar}
          className={`fixed left-0 z-30 hidden md:flex items-center justify-start w-3 hover:w-7 cursor-pointer group transition-all duration-200 select-none ${
            alertCount > 0 ? "top-9 bottom-0" : "top-0 bottom-0"
          }`}
          title="Aproximar o mouse para abrir o menu lateral"
        >
          <div className="w-1.5 h-16 rounded-r-full bg-primary/40 group-hover:bg-primary group-hover:h-24 group-hover:w-2 transition-all duration-300 shadow-md flex items-center justify-center">
            <ChevronRight className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 -ml-0.5" />
          </div>
        </div>
      )}

      {/* Gatilho visual no topo esquerdo (Desktop Menu Trigger) */}
      {!isPinned && !isDesktopOpen && (
        <div className={`fixed left-3 z-30 hidden md:block ${alertCount > 0 ? "top-12" : "top-3"}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDesktopOpen(true)}
            className="h-8 px-2.5 gap-1.5 font-bold text-xs rounded-xl bg-card/90 backdrop-blur-sm shadow-md border-border/80 hover:bg-card hover:border-primary/50 text-foreground transition-all"
            title="Abrir menu lateral flutuante"
          >
            <Menu className="w-4 h-4 text-primary" />
            <span className="text-[11px]">Menu</span>
          </Button>
        </div>
      )}

      {/* Backdrop sutil ao abrir overlay flutuante desktop */}
      {!isPinned && isDesktopOpen && (
        <div 
          aria-hidden="true"
          onClick={() => setIsDesktopOpen(false)}
          className="fixed inset-0 z-30 hidden md:block bg-black/10 backdrop-blur-[0.5px] transition-opacity animate-in fade-in"
        />
      )}

      {/* Espaçador flexbox desktop (largura 0px quando desfixado para 100% de largura da tela) */}
      <div 
        aria-hidden="true" 
        className={`hidden md:block shrink-0 transition-[width] duration-300 ease-in-out ${
          isPinned ? "w-64 lg:w-72" : "w-0 overflow-hidden pointer-events-none"
        }`} 
      />

      {/* Sidebar Desktop Flutuante / Retrátil */}
      <aside
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
        className={`hidden md:flex fixed top-0 bottom-0 left-0 z-40 w-64 lg:w-72 bg-card/95 backdrop-blur-md border-r border-border flex-col shrink-0 print:hidden transition-transform duration-300 ease-in-out shadow-2xl md:shadow-lg ${
          alertCount > 0 ? "top-9" : "top-0"
        } ${
          isPinned || isDesktopOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-3.5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm block leading-tight text-foreground">CorpFlats</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Gestão Hoteleira</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isAdminOrDev && unreadNotifications > 0 && (
              <Link href="/notificacoes">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                  {unreadNotifications}
                </span>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePin}
              className={`h-7 w-7 rounded-lg transition-colors ${
                isPinned ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-foreground"
              }`}
              title={isPinned ? "Desafixar menu (Auto-ocultar para tela cheia)" : "Fixar menu lateral"}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Botão Fixo da Sofia Copiloto na Sidebar */}
        {isAdminOrDev && (
          <div className="px-3 pt-2.5 pb-1">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("toggle-sofia-copilot"))}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white font-semibold text-xs shadow-sm hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
              title="Abrir Copiloto IA de Gestão (Ctrl+J)"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Sofia Copiloto IA</span>
              </div>
              <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-white/15 rounded border border-white/10">
                Ctrl+J
              </span>
            </button>
          </div>
        )}

        {/* Barra de Busca Rápida no Topo da Sidebar Desktop */}
        <div className="px-3 pt-1.5 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar módulo ou rota..."
              className="pl-8 pr-7 h-8 text-xs rounded-xl bg-muted/40 border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Nav Items em Accordion com 6 Categorias */}
        <nav className="flex-1 px-2.5 py-1.5 space-y-1.5 overflow-y-auto max-h-[calc(100dvh-170px)]">
          {filteredCategories.map(cat => {
            const isOpen = isCategoryOpen(cat.id)
            const catBadgeCount = getCategoryBadge(cat)
            const hasActiveItem = cat.items.some(it => isItemActive(it.href))

            return (
              <div key={cat.id} className="rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-all ${
                    hasActiveItem
                      ? "bg-primary/10 text-primary font-bold"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  <span className="text-[11px] truncate tracking-tight">{cat.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isOpen && catBadgeCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white animate-pulse">
                        {catBadgeCount}
                      </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="pl-1 pr-0.5 space-y-0.5 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {cat.items.map(item => {
                      const isActive = isItemActive(item.href)
                      return (
                        <Link key={item.href} href={item.href}>
                          <div
                            title={item.description}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                              isActive
                                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground font-medium"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <item.icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge ? (
                              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black shrink-0 ${
                                isActive ? "bg-white text-primary" : "bg-rose-600 text-white animate-pulse"
                              }`}>
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {filteredCategories.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground font-medium">Nenhum módulo encontrado</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs font-bold text-primary h-7 px-2"
              >
                Limpar busca
              </Button>
            </div>
          )}
        </nav>
        
        {/* User Footer Profile & Password Change */}
        <div className="p-3 border-t border-border mt-auto flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 overflow-hidden">
            <UserCircle className="w-8 h-8 text-muted-foreground shrink-0" />
            <div className="flex flex-col truncate">
              <span className="text-xs font-bold truncate text-foreground capitalize">{effectiveUser?.name || effectiveUser?.username}</span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                {isDev ? "Dev / Engenharia" : isAdmin ? "Administrador" : isAnserveGestor ? "Gestor Anserve" : isAnserveRepositora ? "Repositora Anserve" : isRecepcao ? "Recepção" : "Camareira"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {isDev ? (
              <Link href="/configuracoes">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                  title="Configurações Técnicas & Nuvem"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            ) : isAdmin ? (
              <Link href="/equipe">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                  title="Gestão da Equipe & Níveis de Acesso"
                >
                  <Users className="w-4 h-4" />
                </Button>
              </Link>
            ) : null}
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
      <main className="flex-1 flex flex-col w-full min-w-0 max-w-full md:max-h-[100dvh] overflow-x-hidden overflow-y-auto pb-24 md:pb-0 print:max-h-none print:h-auto print:overflow-visible print:pb-0 print:m-0 print:p-0">
        {children}
      </main>

      {/* Barra de Navegação Inferior Móvel (Menus Permanentes no Rodapé) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-1 py-1.5 flex items-center justify-around shadow-2xl print:hidden">
        {isAnserveRepositora ? (
          <>
            {/* 1. Portal Reposição */}
            <Link href="/frigobar-reposicao" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/frigobar-reposicao" || location === "/anserve/reposicao" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <Package className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Reposição</span>
              </div>
            </Link>

            {/* 2. Mais */}
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                mobileMenuOpen ? "text-primary font-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Mais</span>
            </button>
          </>
        ) : isAnserveGestor ? (
          <>
            {/* 1. Painel Supervisão */}
            <Link href="/anserve" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/anserve" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <FileText className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Supervisão</span>
              </div>
            </Link>

            {/* 2. Reposição */}
            <Link href="/frigobar-reposicao" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/frigobar-reposicao" || location === "/anserve/reposicao" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <Package className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Reposição</span>
              </div>
            </Link>

            {/* 3. Gestão / Extrato */}
            <Link href="/frigobar-gestao" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/frigobar-gestao" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <BarChart3 className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Estoque & NF</span>
              </div>
            </Link>

            {/* 4. Mais */}
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                mobileMenuOpen ? "text-primary font-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Mais</span>
            </button>
          </>
        ) : isAdminOrDev ? (
          <>
            {/* 1. Mapa de Reservas */}
            <Link href="/reservas" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/reservas" || location === "/relatorios-reservas" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <CalendarDays className="w-5 h-5" />
                <span className="text-[9.5px] sm:text-[10.5px] mt-0.5 font-bold text-center leading-tight">Mapa Reservas</span>
              </div>
            </Link>

            {/* 2. Painel de Limpeza */}
            <Link href="/dashboard" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/dashboard" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-[9.5px] sm:text-[10.5px] mt-0.5 font-bold text-center leading-tight">Painel Limpeza</span>
              </div>
            </Link>

            {/* 3. Café da Manhã */}
            <Link href="/pedidos-cafe" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/pedidos-cafe" || location === "/cafe-dashboard" || location === "/historico-cafe" || location === "/relatorios-cafe" || location === "/insights-cafe"
                  ? "text-primary font-black scale-105" 
                  : "text-muted-foreground hover:text-foreground"
              }`}>
                <Coffee className="w-5 h-5" />
                <span className="text-[9.5px] sm:text-[10.5px] mt-0.5 font-bold text-center leading-tight">Café da Manhã</span>
              </div>
            </Link>

            {/* 4. Lista de Compras */}
            <Link href="/lista-compras" className="flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all relative text-muted-foreground hover:text-foreground active:scale-95 cursor-pointer" title="Ver Lista de Compras">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                {pendingShoppingCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-white font-black text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-xs">
                    {pendingShoppingCount > 9 ? "9+" : pendingShoppingCount}
                  </span>
                )}
              </div>
              <span className="text-[9.5px] sm:text-[10.5px] mt-0.5 font-bold text-center leading-tight">Lista Compras</span>
            </Link>

            {/* 5. Mais */}
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                mobileMenuOpen ? "text-primary font-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[9.5px] sm:text-[10.5px] mt-0.5 font-bold text-center leading-tight">Mais</span>
            </button>
          </>
        ) : (
          <>
            {/* 1. Limpeza */}
            <Link href="/dashboard" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/dashboard" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Limpeza</span>
              </div>
            </Link>

            {/* 2. Atalho Rápido para Lista de Compras */}
            <Link href="/lista-compras" className="flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all relative text-muted-foreground hover:text-foreground active:scale-95 cursor-pointer" title="Ver Lista de Compras">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                {pendingShoppingCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-white font-black text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-xs">
                    {pendingShoppingCount > 9 ? "9+" : pendingShoppingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Compras</span>
            </Link>

            {/* 3. Extrato */}
            <Link href="/extrato" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/extrato" || location === "/meu-extrato" || location === "/extrato-camareiras" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <Wallet className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Extrato</span>
              </div>
            </Link>

            {/* 4. Manutenções */}
            <Link href="/observations" className="flex-1">
              <div className={`flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                location === "/observations" ? "text-primary font-black scale-105" : "text-muted-foreground hover:text-foreground"
              }`}>
                <MessageSquareWarning className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Manutenções</span>
              </div>
            </Link>

            {/* 5. Mais */}
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                mobileMenuOpen ? "text-primary font-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 font-bold text-center leading-tight">Mais</span>
            </button>
          </>
        )}
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
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                <Input 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo ou rota..."
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-muted/40 border-border"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista Categorizada com Scroll e Accordion */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {filteredCategories.map(cat => {
                const isOpen = isCategoryOpen(cat.id)
                const catBadgeCount = getCategoryBadge(cat)
                const hasActiveItem = cat.items.some(it => isItemActive(it.href))

                return (
                  <div key={cat.id} className="rounded-2xl border border-border/60 overflow-hidden bg-card">
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`w-full flex items-center justify-between p-2.5 text-left transition-all ${
                        hasActiveItem
                          ? "bg-primary/10 text-primary font-bold"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground font-semibold"
                      }`}
                    >
                      <span className="text-xs font-bold truncate">{cat.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isOpen && catBadgeCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                            {catBadgeCount}
                          </span>
                        )}
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-1.5 space-y-1 border-t border-border/40">
                        {cat.items.map(item => {
                          const isActive = isItemActive(item.href)
                          return (
                            <Link key={item.href} href={item.href}>
                              <div className={`p-2 rounded-xl transition-all flex items-center justify-between ${
                                isActive
                                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                  : "bg-muted/30 hover:bg-muted text-foreground"
                              }`}>
                                <div className="flex items-center gap-2.5 truncate">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isActive ? "bg-white/20 text-white" : "bg-card text-foreground"
                                  }`}>
                                    <item.icon className="w-3.5 h-3.5" />
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
                                <div className="flex items-center gap-1 shrink-0">
                                  {item.badge ? (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                      isActive ? "bg-white text-primary" : "bg-rose-600 text-white animate-pulse"
                                    }`}>
                                      {item.badge}
                                    </span>
                                  ) : null}
                                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-muted-foreground"}`} />
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {filteredCategories.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground font-medium">Nenhum módulo encontrado</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="mt-2 text-xs font-bold text-primary"
                  >
                    Limpar busca
                  </Button>
                </div>
              )}
            </div>

            {/* Perfil e Ações do Rodapé do Drawer */}
            <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <UserCircle className="w-7 h-7 text-muted-foreground shrink-0" />
                <div className="truncate">
                  <span className="text-xs font-bold text-foreground block truncate capitalize">{effectiveUser?.name || effectiveUser?.username}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                    {isDev ? "Dev / Engenharia" : isAdmin ? "Administrador" : isAnserveGestor ? "Gestor Anserve" : isAnserveRepositora ? "Repositora Anserve" : isRecepcao ? "Recepção" : "Camareira"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {isDev ? (
                  <Link href="/configuracoes">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary" 
                      title="Configurações Técnicas & Nuvem"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : isAdmin ? (
                  <Link href="/equipe">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary" 
                      title="Gestão da Equipe & Níveis de Acesso"
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : null}
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
