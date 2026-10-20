import React, { useState, useEffect, useRef, useMemo } from "react"
import { useLocation } from "wouter"
import { Shell } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Mail,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings,
  Play,
  Pause,
  Search,
  Eye,
  Building2,
  Calendar,
  User,
  Check,
  Trash2,
  Workflow,
  Inbox,
  Star,
  FileEdit,
  SendHorizontal,
  Archive,
  ShieldAlert,
  Plus,
  Tag,
  FolderPlus,
  Paperclip,
  Reply,
  ReplyAll,
  Forward,
  Printer,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Minimize2,
  Maximize2,
  X,
  Sparkles,
  FileText,
  Download,
  Car,
  KeyRound,
  MailCheck,
  MailOpen,
  FolderInput,
  Bold,
  Italic,
  Underline,
  List,
  Link2,
  CheckSquare,
  Square,
  ExternalLink
} from "lucide-react"

// Utilitário de cor determinística para avatares
function getAvatarColor(nameOrEmail: string = "") {
  const palette = [
    "bg-blue-600 text-white",
    "bg-emerald-600 text-white",
    "bg-violet-600 text-white",
    "bg-amber-600 text-white",
    "bg-rose-600 text-white",
    "bg-cyan-600 text-white",
    "bg-indigo-600 text-white",
    "bg-teal-600 text-white"
  ]
  let hash = 0
  for (let i = 0; i < nameOrEmail.length; i++) {
    hash = nameOrEmail.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

function getInitials(nameOrEmail: string = "") {
  const clean = String(nameOrEmail || "")
    .replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .trim()
  if (!clean) return "CF"
  const parts = clean.split(/[\s._@-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}

function formatSmartDate(dateStr?: string) {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ""
    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    if (isToday) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    }

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()

    if (isYesterday) return "Ontem"

    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
  } catch {
    return ""
  }
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "PDF"
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function EmailHub() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  // ── Estado Global do Motor & Status Zoho ──────────────────────────────────
  const [webmailStatus, setWebmailStatus] = useState<any>({
    oauthConfigured: false,
    oauthConnected: false,
    primaryEmailAddress: "reservas@corpflats.com.br",
    dc: "com",
    smtpConfigured: false,
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    smtpUser: "",
    fromName: "CorpFlats",
    fromEmail: "reservas@corpflats.com.br",
    engineEnabled: true,
    receptionEmail: "soho@promenade.com.br",
    garageEmail: "promenadesoho@pfbestacionamentos.com.br"
  })
  const [togglingEngine, setTogglingEngine] = useState(false)

  // ── Navegação 3-Pane (Pastas, Etiquetas, Filtros e Busca) ────────────────
  const [systemFolders, setSystemFolders] = useState<any[]>([])
  const [customFolders, setCustomFolders] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [activeReservations, setActiveReservations] = useState<any[]>([])

  const [selectedFolder, setSelectedFolder] = useState<string>("inbox")
  const [selectedLabelId, setSelectedLabelId] = useState<string>("")
  const [quickFilter, setQuickFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // ── Lista de Mensagens (Coluna 2) & Seleção em Lote ──────────────────────
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false)
  const [syncingRemote, setSyncingRemote] = useState<boolean>(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // ── Mensagem Aberta & Thread (Coluna 3) ──────────────────────────────────
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [messageDetail, setMessageDetail] = useState<any | null>(null)
  const [threadMessages, setThreadMessages] = useState<any[]>([])
  const [expandedThreadIds, setExpandedThreadIds] = useState<string[]>([])
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)

  // Quick Reply no rodapé do painel de leitura
  const [quickReplyOpen, setQuickReplyOpen] = useState<boolean>(false)
  const [quickReplyText, setQuickReplyText] = useState<string>("")
  const [sendingQuickReply, setSendingQuickReply] = useState<boolean>(false)

  // Ações de Fila e Retry
  const [dispatchingQueueId, setDispatchingQueueId] = useState<string | null>(null)
  const [resendingCommId, setResendingCommId] = useState<string | null>(null)

  // ── Janela Flutuante de Composição (Docked Compose - Estilo Gmail) ───────
  const [composeOpen, setComposeOpen] = useState<boolean>(false)
  const [composeMinimized, setComposeMinimized] = useState<boolean>(false)
  const [composeMaximized, setComposeMaximized] = useState<boolean>(false)
  const [composePreviewMode, setComposePreviewMode] = useState<boolean>(false)

  const [draftId, setDraftId] = useState<string | null>(null)
  const [composeToChips, setComposeToChips] = useState<string[]>([])
  const [composeToInput, setComposeToInput] = useState<string>("")
  const [showCcBcc, setShowCcBcc] = useState<boolean>(false)
  const [composeCcChips, setComposeCcChips] = useState<string[]>([])
  const [composeCcInput, setComposeCcInput] = useState<string>("")
  const [composeBccChips, setComposeBccChips] = useState<string[]>([])
  const [composeBccInput, setComposeBccInput] = useState<string>("")
  const [composeSubject, setComposeSubject] = useState<string>("")
  const [composeBody, setComposeBody] = useState<string>("")
  const [composeRichHtml, setComposeRichHtml] = useState<string>("")
  const [composeReservationId, setComposeReservationId] = useState<string>("none")
  const [composeTemplateKey, setComposeTemplateKey] = useState<string>("custom")
  const [composeUseTransactional, setComposeUseTransactional] = useState<boolean>(true)
  const [composeAttachResDocs, setComposeAttachResDocs] = useState<boolean>(false)
  const [composeAttachments, setComposeAttachments] = useState<any[]>([])
  const [composeReplyType, setComposeReplyType] = useState<string>("")
  const [composeInReplyTo, setComposeInReplyTo] = useState<string>("")
  const [draftSaveStatus, setDraftSaveStatus] = useState<string>("")
  const [sendingCompose, setSendingCompose] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Modais Auxiliares (Nova Pasta, Nova Etiqueta, Config Zoho OAuth/SMTP, Teste SMTP) ──
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newLabelModalOpen, setNewLabelModalOpen] = useState(false)
  const [newLabelName, setNewLabelName] = useState("")
  const [newLabelColor, setNewLabelColor] = useState("#10B981")

  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [oauthClientId, setOauthClientId] = useState("")
  const [oauthClientSecret, setOauthClientSecret] = useState("")
  const [oauthRefreshToken, setOauthRefreshToken] = useState("")
  const [oauthGrantCode, setOauthGrantCode] = useState("")
  const [oauthAccountId, setOauthAccountId] = useState("")
  const [oauthDc, setOauthDc] = useState("com")
  const [savingOauth, setSavingOauth] = useState(false)

  const [smtpHost, setSmtpHost] = useState("smtp.zoho.com")
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [smtpFromName, setSmtpFromName] = useState("CorpFlats")
  const [smtpFromEmail, setSmtpFromEmail] = useState("")
  const [savingSmtp, setSavingSmtp] = useState(false)

  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testTargetEmail, setTestTargetEmail] = useState("")
  const [testingSmtp, setTestingSmtp] = useState(false)

  // ── Carregamento Inicial e Reativo ────────────────────────────────────────
  useEffect(() => {
    fetchWebmailStatus()
  }, [])

  useEffect(() => {
    fetchMessages(false)
  }, [selectedFolder, selectedLabelId, quickFilter, searchQuery])

  const fetchWebmailStatus = async () => {
    try {
      const res = await fetch("/api/webmail/status")
      if (res.ok) {
        const d = await res.json()
        setWebmailStatus(d)
        if (Array.isArray(d.systemFolders)) setSystemFolders(d.systemFolders)
        if (Array.isArray(d.customFolders)) setCustomFolders(d.customFolders)
        if (Array.isArray(d.labels)) setLabels(d.labels)
        if (Array.isArray(d.activeReservations)) setActiveReservations(d.activeReservations)

        if (d.oauthConfigMasked) {
          setOauthClientId(d.oauthConfigMasked.clientId || "")
          setOauthClientSecret(d.oauthConfigMasked.hasClientSecret ? "••••••••" : "")
          setOauthRefreshToken(d.oauthConfigMasked.hasRefreshToken ? "••••••••" : "")
          setOauthAccountId(d.oauthConfigMasked.accountId || "")
          setOauthDc(d.oauthConfigMasked.dc || "com")
        }
        setSmtpHost(d.smtpHost || "smtp.zoho.com")
        setSmtpPort(d.smtpPort || 465)
        setSmtpUser(d.smtpUser || "")
        setSmtpFromName(d.fromName || "CorpFlats")
        setSmtpFromEmail(d.fromEmail || "")
        if (d.fromEmail && !testTargetEmail) setTestTargetEmail(d.fromEmail)
      }
    } catch (err) {
      console.error("Erro ao carregar status do webmail:", err)
    }
  }

  const fetchMessages = async (syncRemote = false) => {
    if (syncRemote) setSyncingRemote(true)
    else setLoadingMessages(true)

    try {
      const params = new URLSearchParams({
        folder: selectedFolder,
        labelId: selectedLabelId,
        quickFilter,
        search: searchQuery,
        sync: syncRemote ? "true" : "false"
      })
      const res = await fetch(`/api/webmail/messages?${params.toString()}`)
      if (res.ok) {
        const d = await res.json()
        const list = Array.isArray(d.messages) ? d.messages : []
        setMessages(list)
        if (Array.isArray(d.systemFolders)) setSystemFolders(d.systemFolders)
        if (Array.isArray(d.customFolders)) setCustomFolders(d.customFolders)
        if (Array.isArray(d.labels)) setLabels(d.labels)
        if (d.zohoStatus) setWebmailStatus((prev: any) => ({ ...prev, ...d.zohoStatus }))

        // Se nenhuma mensagem estiver aberta ou a aberta não estiver na lista, abre a primeira automaticamente em desktop
        if (list.length > 0 && (!activeMessageId || !list.some((m: any) => m.id === activeMessageId))) {
          openMessageDetail(list[0].id, false)
        } else if (list.length === 0) {
          setActiveMessageId(null)
          setMessageDetail(null)
          setThreadMessages([])
        }
      }
    } catch (err) {
      console.error("Erro ao listar mensagens:", err)
    } finally {
      setLoadingMessages(false)
      setSyncingRemote(false)
    }
  }

  const openMessageDetail = async (id: string, markReadOptimistic = true) => {
    setActiveMessageId(id)
    setQuickReplyOpen(false)
    setQuickReplyText("")

    if (markReadOptimistic) {
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, isRead: true } : m)))
    }

    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/webmail/messages/${encodeURIComponent(id)}`)
      if (res.ok) {
        const d = await res.json()
        setMessageDetail(d.message)
        const tList = Array.isArray(d.threadMessages) ? d.threadMessages : [d.message]
        setThreadMessages(tList)
        // Expande por padrão a última mensagem da conversa e a mensagem clicada
        const lastId = tList[tList.length - 1]?.id
        setExpandedThreadIds(Array.from(new Set([id, lastId].filter(Boolean))))
      }
    } catch (err) {
      console.error("Erro ao abrir mensagem:", err)
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── Auto-Save de Rascunho com Debounce (1.4s) ────────────────────────────
  useEffect(() => {
    if (!composeOpen) return
    const hasContent =
      composeToChips.length > 0 ||
      composeToInput.trim().length > 0 ||
      composeSubject.trim().length > 0 ||
      composeBody.trim().length > 0

    if (!hasContent) return

    setDraftSaveStatus("Salvando nos rascunhos...")
    const timer = setTimeout(async () => {
      try {
        const allTo = [...composeToChips, ...(composeToInput.trim() ? [composeToInput.trim()] : [])]
        const allCc = [...composeCcChips, ...(composeCcInput.trim() ? [composeCcInput.trim()] : [])]
        const allBcc = [...composeBccChips, ...(composeBccInput.trim() ? [composeBccInput.trim()] : [])]

        const res = await fetch("/api/webmail/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId || undefined,
            to: allTo,
            cc: allCc,
            bcc: allBcc,
            subject: composeSubject,
            bodyText: composeBody,
            bodyHtml: composeRichHtml || undefined,
            reservationId: composeReservationId !== "none" ? composeReservationId : null,
            templateKey: composeTemplateKey,
            useTransactionalLayout: composeUseTransactional,
            attachReservationDocs: composeAttachResDocs
          })
        })
        if (res.ok) {
          const d = await res.json()
          if (d.draft?.id && !draftId) setDraftId(d.draft.id)
          if (Array.isArray(d.systemFolders)) setSystemFolders(d.systemFolders)
          const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          setDraftSaveStatus(`Salvo nos rascunhos às ${timeStr}`)
        }
      } catch {
        setDraftSaveStatus("")
      }
    }, 1400)

    return () => clearTimeout(timer)
  }, [
    composeOpen,
    composeToChips,
    composeToInput,
    composeCcChips,
    composeCcInput,
    composeBccChips,
    composeBccInput,
    composeSubject,
    composeBody,
    composeReservationId,
    composeTemplateKey,
    composeUseTransactional,
    composeAttachResDocs
  ])

  // ── Controles do Motor Automático ─────────────────────────────────────────
  const handleToggleEngine = async (newState: boolean) => {
    setTogglingEngine(true)
    try {
      const res = await fetch("/api/emails/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newState })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        setWebmailStatus((prev: any) => ({ ...prev, engineEnabled: newState }))
        toast({
          title: newState ? "🟢 Motor de E-mails Ativado" : "⏸️ Motor de E-mails Pausado",
          description: newState
            ? "Os disparos automáticos de reserva, portaria e fila serão processados normalmente."
            : "Disparos automáticos pausados. Você ainda pode antecipar envios manualmente na Fila Agendada."
        })
      }
    } catch (err: any) {
      toast({ title: "Erro ao alterar motor", description: err.message, variant: "destructive" })
    } finally {
      setTogglingEngine(false)
    }
  }

  // ── Ações Otimistas em Massa e Individuais ────────────────────────────────
  const executeBulkAction = async (
    ids: string[],
    action: string,
    extra: { targetFolderId?: string; labelId?: string; toastMsg?: string } = {}
  ) => {
    if (!ids.length) return

    // Atualização otimista imediata na UI
    setMessages(prev => {
      return prev
        .map(m => {
          if (!ids.includes(m.id)) return m
          if (action === "markAsRead") return { ...m, isRead: true }
          if (action === "markAsUnread") return { ...m, isRead: false }
          if (action === "star") return { ...m, isStarred: true }
          if (action === "unstar") return { ...m, isStarred: false }
          if (action === "applyLabel" && extra.labelId) {
            const set = new Set([...(m.labels || []), extra.labelId])
            return { ...m, labels: Array.from(set) }
          }
          if (action === "removeLabel" && extra.labelId) {
            return { ...m, labels: (m.labels || []).filter((l: string) => l !== extra.labelId) }
          }
          return m
        })
        .filter(m => {
          if (!ids.includes(m.id)) return true
          if (action === "archive" && selectedFolder !== "archive") return false
          if (action === "trash" && selectedFolder !== "trash") return false
          if (action === "deleteForever") return false
          if (action === "moveToFolder" && extra.targetFolderId && extra.targetFolderId !== selectedFolder) return false
          return true
        })
    })

    if (messageDetail && ids.includes(messageDetail.id)) {
      if (action === "star") setMessageDetail((p: any) => ({ ...p, isStarred: true }))
      if (action === "unstar") setMessageDetail((p: any) => ({ ...p, isStarred: false }))
      if (action === "applyLabel" && extra.labelId) {
        setMessageDetail((p: any) => ({
          ...p,
          labels: Array.from(new Set([...(p?.labels || []), extra.labelId]))
        }))
      }
      if (action === "removeLabel" && extra.labelId) {
        setMessageDetail((p: any) => ({
          ...p,
          labels: (p?.labels || []).filter((l: string) => l !== extra.labelId)
        }))
      }
    }

    try {
      const res = await fetch("/api/webmail/messages/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: ids,
          action,
          targetFolderId: extra.targetFolderId,
          labelId: extra.labelId
        })
      })
      if (res.ok) {
        const d = await res.json()
        if (Array.isArray(d.systemFolders)) setSystemFolders(d.systemFolders)
        if (Array.isArray(d.customFolders)) setCustomFolders(d.customFolders)
        if (Array.isArray(d.labels)) setLabels(d.labels)
        setSelectedIds([])
        if (extra.toastMsg) {
          toast({ title: extra.toastMsg })
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar ação", description: err.message, variant: "destructive" })
      fetchMessages(false)
    }
  }

  // ── Ações da Fila Agendada ("Enviar Agora" e "Cancelar") & Reenvio de Falhas ──
  const handleQueueSendNow = async (queueId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setDispatchingQueueId(queueId)
    try {
      const res = await fetch(`/api/emails/queue/${queueId}/send-now`, { method: "POST" })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "⚡ E-mail Agendado Enviado Agora!",
          description: "O disparo foi antecipado com sucesso e movido para Enviados."
        })
        fetchMessages(false)
      } else {
        toast({
          title: "Falha ao antecipar envio",
          description: d.error || "Verifique as configurações de SMTP.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setDispatchingQueueId(null)
    }
  }

  const handleCancelQueueItem = async (queueId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const res = await fetch(`/api/emails/queue/${queueId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Agendamento Cancelado", description: "O e-mail foi removido da fila programada." })
        fetchMessages(false)
      }
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" })
    }
  }

  const handleResendFailed = async (commId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setResendingCommId(commId)
    try {
      const res = await fetch(`/api/pms/reservations/communications/${commId}/resend`, { method: "POST" })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({ title: "✓ E-mail Reenviado com Sucesso!", description: "O disparo foi processado pelo servidor SMTP." })
        fetchMessages(false)
        if (activeMessageId === commId) openMessageDetail(commId, false)
      } else {
        toast({ title: "Falha no Reenvio", description: d.error || "Erro ao reenviar", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao reenviar", description: err.message, variant: "destructive" })
    } finally {
      setResendingCommId(null)
    }
  }

  // ── Abertura e Controle da Janela Flutuante de Composição (Docked Compose) ──
  const openComposer = (opts: {
    mode?: "new" | "reply" | "replyall" | "forward" | "draft"
    sourceMessage?: any
    reservationId?: string
    templateKey?: string
  } = {}) => {
    const mode = opts.mode || "new"
    const msg = opts.sourceMessage

    setComposeOpen(true)
    setComposeMinimized(false)
    setComposePreviewMode(false)
    setDraftSaveStatus("")
    setComposeAttachments([])

    if (mode === "draft" && msg) {
      setDraftId(msg.draftId || msg.id)
      const toArr = String(msg.recipient || "")
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(Boolean)
      setComposeToChips(toArr)
      setComposeToInput("")
      const ccArr = String(msg.cc || "")
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(Boolean)
      setComposeCcChips(ccArr)
      setComposeCcInput("")
      setShowCcBcc(ccArr.length > 0)
      setComposeSubject(msg.subject === "(Rascunho sem assunto)" ? "" : msg.subject || "")
      setComposeBody(msg.bodyText || "")
      setComposeRichHtml(msg.bodyHtml || "")
      setComposeReservationId(msg.reservation_id ? String(msg.reservation_id) : "none")
      setComposeTemplateKey(msg.templateKey || "custom")
      setComposeAttachResDocs(Boolean(msg.attachReservationDocs))
      setComposeReplyType("")
      setComposeInReplyTo("")
      return
    }

    setDraftId(null)
    setComposeCcChips([])
    setComposeCcInput("")
    setComposeBccChips([])
    setComposeBccInput("")
    setShowCcBcc(false)
    setComposeRichHtml("")

    if ((mode === "reply" || mode === "replyall") && msg) {
      const targetEmail = msg.direction === "inbound" ? msg.fromEmail : msg.recipient
      setComposeToChips(targetEmail ? [targetEmail] : [])
      setComposeToInput("")
      if (mode === "replyall" && msg.cc) {
        const ccList = String(msg.cc).split(/[,;]/).map(s => s.trim()).filter(Boolean)
        setComposeCcChips(ccList)
        setShowCcBcc(ccList.length > 0)
      }
      const cleanSubj = String(msg.subject || "").replace(/^re:\s*/i, "")
      setComposeSubject(`Re: ${cleanSubj}`)
      setComposeBody(`\n\n---\nEm ${new Date(msg.created_at).toLocaleString("pt-BR")}, ${msg.fromName || msg.fromEmail} escreveu:\n> ${msg.snippet || ""}`)
      setComposeReservationId(msg.matchedReservation?.id ? String(msg.matchedReservation.id) : "none")
      setComposeTemplateKey("custom")
      setComposeAttachResDocs(false)
      setComposeReplyType(mode)
      setComposeInReplyTo(msg.zohoMessageId || msg.id)
      return
    }

    if (mode === "forward" && msg) {
      setComposeToChips([])
      setComposeToInput("")
      const cleanSubj = String(msg.subject || "").replace(/^enc:\s*|^fwd:\s*/i, "")
      setComposeSubject(`Enc: ${cleanSubj}`)
      setComposeBody(`\n\n---------- Mensagem encaminhada ----------\nDe: ${msg.fromName} <${msg.fromEmail}>\nAssunto: ${msg.subject}\nPara: ${msg.recipient}\n\n${msg.bodyText || msg.snippet || ""}`)
      setComposeReservationId(msg.matchedReservation?.id ? String(msg.matchedReservation.id) : "none")
      setComposeTemplateKey("custom")
      setComposeAttachResDocs(false)
      setComposeReplyType("forward")
      setComposeInReplyTo(msg.zohoMessageId || msg.id)
      return
    }

    // Novo E-mail
    setComposeToChips([])
    setComposeToInput("")
    setComposeSubject("")
    setComposeBody("")
    setComposeReplyType("")
    setComposeInReplyTo("")
    const initialResId = opts.reservationId || "none"
    setComposeReservationId(initialResId)
    const initialTpl = opts.templateKey || "custom"
    setComposeTemplateKey(initialTpl)
    setComposeAttachResDocs(false)

    if (initialResId !== "none" || initialTpl !== "custom") {
      applyComposerTemplate(initialTpl, initialResId)
    }
  }

  const applyComposerTemplate = async (tplKey: string, resId: string = composeReservationId) => {
    setComposeTemplateKey(tplKey)
    if (tplKey === "custom" && resId === "none") {
      setComposeRichHtml("")
      return
    }

    try {
      const res = await fetch("/api/webmail/composer-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: tplKey,
          reservationId: resId !== "none" ? resId : undefined
        })
      })
      if (res.ok) {
        const d = await res.json()
        if (d.to) {
          setComposeToChips(String(d.to).split(/[,;]/).map(s => s.trim()).filter(Boolean))
          setComposeToInput("")
        }
        if (d.subject) setComposeSubject(d.subject)
        if (d.bodyText) setComposeBody(d.bodyText)
        if (d.bodyHtml) setComposeRichHtml(d.bodyHtml)
        else setComposeRichHtml("")
        if (d.attachReservationDocs !== undefined) {
          setComposeAttachResDocs(Boolean(d.attachReservationDocs))
        }
      }
    } catch (err) {
      console.error("Erro ao aplicar template no compositor:", err)
    }
  }

  // Adição de chips de destinatário (Para, Cc, Cco)
  const handleChipKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputVal: string,
    setInputVal: (v: string) => void,
    chips: string[],
    setChips: (c: string[]) => void
  ) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault()
      const clean = inputVal.replace(/[,;]/g, "").trim()
      if (clean && !chips.includes(clean)) {
        setChips([...chips, clean])
      }
      setInputVal("")
    } else if (e.key === "Backspace" && !inputVal && chips.length > 0) {
      setChips(chips.slice(0, -1))
    }
  }

  // Inserção de formatação no editor do compositor
  const insertComposerFormat = (prefix: string, suffix: string = prefix) => {
    const el = composeTextareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = composeBody.substring(start, end) || "texto"
    const updated = composeBody.substring(0, start) + prefix + selected + suffix + composeBody.substring(end)
    setComposeBody(updated)
    setComposeRichHtml("") // Usa a versão editada pelo usuário
  }

  // Upload de Anexos (Drag & Drop ou Seletor)
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setComposeAttachments(prev => [
          ...prev,
          {
            name: file.name,
            filename: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            dataUrl: reader.result
          }
        ])
      }
      reader.readAsDataURL(file)
    })
  }

  // Disparo final do Compositor Flutuante
  const handleSendCompose = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const finalTo = [...composeToChips, ...(composeToInput.trim() ? [composeToInput.trim()] : [])]
    const finalCc = [...composeCcChips, ...(composeCcInput.trim() ? [composeCcInput.trim()] : [])]
    const finalBcc = [...composeBccChips, ...(composeBccInput.trim() ? [composeBccInput.trim()] : [])]

    if (finalTo.length === 0 || !composeSubject.trim() || (!composeBody.trim() && !composeRichHtml)) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe ao menos um destinatário, o assunto e a mensagem.",
        variant: "destructive"
      })
      return
    }

    setSendingCompose(true)
    try {
      const res = await fetch("/api/webmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          to: finalTo,
          cc: finalCc,
          bcc: finalBcc,
          subject: composeSubject.trim(),
          bodyText: composeBody.trim(),
          bodyHtml: composeRichHtml || undefined,
          reservationId: composeReservationId !== "none" ? composeReservationId : undefined,
          useTransactionalLayout: composeUseTransactional,
          attachReservationDocs: composeAttachResDocs,
          attachments: composeAttachments,
          replyType: composeReplyType || undefined,
          inReplyTo: composeInReplyTo || undefined
        })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "✈️ E-mail Enviado com Sucesso!",
          description: `Disparado para ${finalTo.join(", ")}${composeAttachResDocs ? " com documentação da reserva anexada" : ""}.`
        })
        setComposeOpen(false)
        setDraftId(null)
        fetchMessages(false)
      } else {
        toast({
          title: "Falha no Envio",
          description: d.error || "Verifique as configurações de envio.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar e-mail", description: err.message, variant: "destructive" })
    } finally {
      setSendingCompose(false)
    }
  }

  // Envio pelo Quick Reply no rodapé da mensagem aberta
  const handleSendQuickReply = async () => {
    if (!messageDetail || !quickReplyText.trim()) return
    setSendingQuickReply(true)
    try {
      const targetEmail = messageDetail.direction === "inbound" ? messageDetail.fromEmail : messageDetail.recipient
      const cleanSubj = String(messageDetail.subject || "").replace(/^re:\s*/i, "")
      const res = await fetch("/api/webmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [targetEmail],
          subject: `Re: ${cleanSubj}`,
          bodyText: quickReplyText.trim(),
          reservationId: messageDetail.matchedReservation?.id || undefined,
          useTransactionalLayout: true,
          replyType: "reply",
          inReplyTo: messageDetail.zohoMessageId || messageDetail.id
        })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "✓ Resposta enviada!",
          description: `Respondido para ${targetEmail}.`
        })
        setQuickReplyText("")
        setQuickReplyOpen(false)
        fetchMessages(false)
        openMessageDetail(messageDetail.id, false)
      } else {
        toast({ title: "Erro ao responder", description: d.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao responder", description: err.message, variant: "destructive" })
    } finally {
      setSendingQuickReply(false)
    }
  }

  // ── Criação de Pastas e Etiquetas Customizadas ────────────────────────────
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    try {
      const res = await fetch("/api/webmail/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        setCustomFolders(d.customFolders || [])
        setNewFolderName("")
        setNewFolderModalOpen(false)
        toast({ title: "📁 Pasta criada com sucesso!" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar pasta", description: err.message, variant: "destructive" })
    }
  }

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabelName.trim()) return
    try {
      const res = await fetch("/api/webmail/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        setLabels(d.labels || [])
        setNewLabelName("")
        setNewLabelModalOpen(false)
        toast({ title: "🏷️ Etiqueta criada com sucesso!" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar etiqueta", description: err.message, variant: "destructive" })
    }
  }

  // ── Salvar Configurações Zoho OAuth2 e SMTP ───────────────────────────────
  const handleSaveOauthConfig = async (testNow = false) => {
    setSavingOauth(true)
    try {
      const res = await fetch("/api/webmail/oauth-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: oauthClientId,
          clientSecret: oauthClientSecret,
          refreshToken: oauthRefreshToken,
          grantCode: oauthGrantCode || undefined,
          accountId: oauthAccountId,
          dc: oauthDc,
          testNow
        })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({ title: "🟢 Zoho OAuth2 Atualizado!", description: d.message })
        setOauthGrantCode("")
        fetchWebmailStatus()
        fetchMessages(true)
      } else {
        toast({
          title: "Aviso na validação Zoho OAuth2",
          description: d.error || "Verifique as credenciais informadas.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setSavingOauth(false)
    }
  }

  const handleSaveSmtpConfig = async () => {
    setSavingSmtp(true)
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpHost,
          port: Number(smtpPort),
          user: smtpUser,
          pass: smtpPass || undefined,
          fromName: smtpFromName,
          fromEmail: smtpFromEmail
        })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({ title: "✓ Configurações SMTP Salvas!", description: "Servidor Zoho SMTP atualizado com sucesso." })
        setSmtpPass("")
        fetchWebmailStatus()
      } else {
        toast({ title: "Erro ao salvar SMTP", description: d.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSavingSmtp(false)
    }
  }

  const handleTestSmtp = async () => {
    if (!testTargetEmail.trim()) return
    setTestingSmtp(true)
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail: testTargetEmail.trim() })
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast({
          title: "🟢 Conexão SMTP Operacional!",
          description: `E-mail de teste enviado para ${testTargetEmail}.`
        })
        setTestModalOpen(false)
        fetchMessages(false)
      } else {
        toast({
          title: "Falha no Teste SMTP",
          description: d.error || "Verifique usuário e senha de aplicativo do Zoho.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro no teste", description: err.message, variant: "destructive" })
    } finally {
      setTestingSmtp(false)
    }
  }

  // Helper para renderizar ícone da pasta
  const renderFolderIcon = (iconName: string, isActive: boolean, accent?: string) => {
    const cls = `w-4 h-4 shrink-0 ${
      isActive
        ? "text-primary font-bold"
        : accent === "amber"
        ? "text-amber-500"
        : accent === "rose"
        ? "text-rose-500"
        : "text-muted-foreground"
    }`
    switch (iconName) {
      case "Inbox":
        return <Inbox className={cls} />
      case "Star":
        return <Star className={cls} />
      case "FileEdit":
        return <FileEdit className={cls} />
      case "Clock":
        return <Clock className={cls} />
      case "SendHorizontal":
        return <SendHorizontal className={cls} />
      case "Send":
        return <Send className={cls} />
      case "Archive":
        return <Archive className={cls} />
      case "ShieldAlert":
        return <ShieldAlert className={cls} />
      case "Trash2":
        return <Trash2 className={cls} />
      default:
        return <Mail className={cls} />
    }
  }

  // Mapa rápido de etiquetas por ID
  const labelsById = useMemo(() => {
    const map: Record<string, any> = {}
    labels.forEach(l => {
      map[l.id] = l
    })
    return map
  }, [labels])

  const allSelected = messages.length > 0 && selectedIds.length === messages.length

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([])
    else setSelectedIds(messages.map(m => m.id))
  }

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  // Reserva selecionada no compositor flutuante
  const selectedComposeReservation = useMemo(() => {
    if (composeReservationId === "none") return null
    return activeReservations.find(r => String(r.id) === String(composeReservationId) || r.code === composeReservationId) || null
  }, [composeReservationId, activeReservations])

  return (
    <Shell>
      <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[640px] -mt-2 select-none">
        {/* ════════════════════════════════════════════════════════════════════
            TOPBAR INTEGRADA: STATUS DO MOTOR, ZOHO API, JORNADA & AÇÕES RÁPIDAS
           ════════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-500/20 text-white dark:text-amber-400 flex items-center justify-center shadow-2xs">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground leading-none">
                  CorpFlats Webmail
                </h1>
                <Badge
                  variant="outline"
                  onClick={() => setConfigModalOpen(true)}
                  className={`cursor-pointer text-[10px] px-2 py-0 h-5 font-semibold gap-1 rounded-full transition-colors ${
                    webmailStatus.oauthConnected
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                      : "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      webmailStatus.oauthConnected ? "bg-emerald-500" : "bg-sky-500"
                    }`}
                  />
                  {webmailStatus.oauthConnected
                    ? "Zoho REST API Conectada"
                    : "Zoho SMTP Ativo • Configurar OAuth2"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {webmailStatus.primaryEmailAddress || "reservas@corpflats.com.br"} • Recepção:{" "}
                {webmailStatus.receptionEmail}
              </p>
            </div>
          </div>

          {/* Controles Operacionais Direitos */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Switch do Motor Automático Preservado */}
            <div className="flex items-center gap-2 bg-card px-2.5 py-1 rounded-xl border border-border shadow-2xs">
              <div className="flex items-center gap-1.5">
                {webmailStatus.engineEnabled ? (
                  <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                ) : (
                  <Pause className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                )}
                <span className="text-[11px] font-bold text-foreground">
                  Motor {webmailStatus.engineEnabled ? "Ativo" : "Pausado"}
                </span>
              </div>
              <Switch
                checked={webmailStatus.engineEnabled !== false}
                disabled={togglingEngine}
                onCheckedChange={handleToggleEngine}
                className="scale-90 data-[state=checked]:bg-emerald-600"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/jornada-reservas")}
              className="h-8 text-[11px] font-semibold gap-1.5 rounded-xl bg-amber-500/10 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
            >
              <Workflow className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mapa da Jornada</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTestModalOpen(true)}
              className="h-8 text-[11px] font-semibold gap-1.5 rounded-xl"
            >
              <Send className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Testar SMTP</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(true)}
              className="h-8 text-[11px] font-semibold gap-1.5 rounded-xl"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Zoho API & SMTP</span>
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            CONTAINER PRINCIPAL 3-PANE SPLIT VIEW (ALTURA TOTAL SEM SCROLL DUPLO)
           ════════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-h-0 flex rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {/* ──────────────────────────────────────────────────────────────────
              COLUNA 1: SIDEBAR DE NAVEGAÇÃO, PASTAS E ETIQUETAS (~235px)
             ────────────────────────────────────────────────────────────────── */}
          <aside className="w-[220px] xl:w-[240px] shrink-0 border-r border-border bg-muted/20 flex flex-col h-full overflow-hidden">
            {/* Botão Primário + Escrever */}
            <div className="p-3 shrink-0">
              <Button
                onClick={() => openComposer({ mode: "new" })}
                className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 text-white font-bold text-xs gap-2 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Escrever E-mail</span>
              </Button>
            </div>

            {/* Lista de Caixas do Sistema + Pastas Personalizadas + Etiquetas */}
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
              {/* Caixas do Sistema */}
              <div className="space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  Caixas & Motor
                </div>
                {systemFolders.map(fld => {
                  const isActive = selectedFolder === fld.id && !selectedLabelId
                  const badgeCount = fld.badgeType === "unread" ? fld.unread : fld.total
                  return (
                    <button
                      key={fld.id}
                      type="button"
                      onClick={() => {
                        setSelectedLabelId("")
                        setSelectedFolder(fld.id)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                        isActive
                          ? "bg-primary/12 text-primary font-bold shadow-2xs"
                          : "text-foreground/85 hover:bg-muted/70 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderFolderIcon(fld.icon, isActive, fld.accent)}
                        <span className="truncate">{fld.name}</span>
                      </div>
                      {badgeCount > 0 && fld.badgeType !== "none" && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            fld.id === "inbox" && fld.unread > 0
                              ? "bg-blue-600 text-white"
                              : fld.accent === "amber"
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                              : fld.accent === "rose"
                              ? "bg-rose-600 text-white"
                              : isActive
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Pastas Personalizadas */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2.5 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Pastas
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewFolderModalOpen(true)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted"
                    title="Criar Nova Pasta"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {customFolders.map(cf => {
                  const isActive = selectedFolder === cf.id && !selectedLabelId
                  return (
                    <button
                      key={cf.id}
                      type="button"
                      onClick={() => {
                        setSelectedLabelId("")
                        setSelectedFolder(cf.id)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                        isActive
                          ? "bg-primary/12 text-primary font-bold"
                          : "text-foreground/85 hover:bg-muted/70 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: cf.color || "#6366F1" }}
                        />
                        <span className="truncate">{cf.name}</span>
                      </div>
                      {cf.total > 0 && (
                        <span className="text-[10px] text-muted-foreground font-semibold">{cf.total}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Etiquetas Coloridas */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2.5 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Etiquetas
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewLabelModalOpen(true)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted"
                    title="Nova Etiqueta"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {labels.map(lb => {
                  const isActive = selectedLabelId === lb.id
                  return (
                    <button
                      key={lb.id}
                      type="button"
                      onClick={() => {
                        if (selectedLabelId === lb.id) setSelectedLabelId("")
                        else setSelectedLabelId(lb.id)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                        isActive
                          ? "bg-primary/12 text-primary font-bold"
                          : "text-foreground/85 hover:bg-muted/70 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: lb.color || "#10B981" }}
                        />
                        <span className="truncate">{lb.name}</span>
                      </div>
                      {lb.total > 0 && (
                        <span className="text-[10px] text-muted-foreground font-semibold">{lb.total}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          {/* ──────────────────────────────────────────────────────────────────
              COLUNA 2: LISTA DE E-MAILS / THREADS (~390px a 420px)
             ────────────────────────────────────────────────────────────────── */}
          <section className="w-full md:w-[360px] xl:w-[405px] shrink-0 border-r border-border flex flex-col h-full bg-background overflow-hidden">
            {/* Barra de Busca Instantânea + Quick Toggles */}
            <div className="p-2.5 border-b border-border space-y-2 shrink-0 bg-card/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar remetente, assunto, #RES ou Flat..."
                  className="pl-8 pr-7 h-8 text-xs rounded-xl bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Pílulas de Filtro Rápido */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { id: "all", label: "Todos" },
                  { id: "unread", label: "Não lidos" },
                  { id: "hasReservation", label: "Com Reserva" },
                  { id: "hasAttachment", label: "Com Anexo" },
                  { id: "starred", label: "Com Estrela" }
                ].map(pill => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setQuickFilter(pill.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      quickFilter === pill.id
                        ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Barra de Ações em Massa (Bulk Actions Toolbar) */}
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
                  title="Selecionar todos"
                >
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                {selectedIds.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-primary mr-1">
                      {selectedIds.length} sel.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        executeBulkAction(selectedIds, "markAsRead", { toastMsg: "Marcados como lidos" })
                      }
                      className="p-1 rounded-lg hover:bg-muted text-foreground"
                      title="Marcar como lido"
                    >
                      <MailOpen className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        executeBulkAction(selectedIds, "markAsUnread", {
                          toastMsg: "Marcados como não lidos"
                        })
                      }
                      className="p-1 rounded-lg hover:bg-muted text-foreground"
                      title="Marcar como não lido"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        executeBulkAction(selectedIds, "archive", { toastMsg: "Conversas arquivadas" })
                      }
                      className="p-1 rounded-lg hover:bg-muted text-foreground"
                      title="Arquivar"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        executeBulkAction(selectedIds, "trash", { toastMsg: "Movidos para a lixeira" })
                      }
                      className="p-1 rounded-lg hover:bg-rose-500/15 text-rose-600"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] font-semibold text-muted-foreground truncate">
                    {selectedLabelId
                      ? `Etiqueta: ${labelsById[selectedLabelId]?.name || ""}`
                      : systemFolders.find(f => f.id === selectedFolder)?.name ||
                        customFolders.find(f => f.id === selectedFolder)?.name ||
                        "Mensagens"}{" "}
                    ({messages.length})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchMessages(true)}
                disabled={loadingMessages || syncingRemote}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Sincronizar Agora com Zoho Mail"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingMessages || syncingRemote ? "animate-spin text-primary" : ""}`}
                />
              </button>
            </div>

            {/* Aviso Contextual se estiver na pasta Fila Agendada e o Motor estiver Pausado */}
            {selectedFolder === "queue" && !webmailStatus.engineEnabled && (
              <div className="px-3 py-2 bg-amber-500/15 border-b border-amber-300 dark:border-amber-800 flex items-center justify-between gap-2 text-[11px] text-amber-800 dark:text-amber-300 shrink-0">
                <span className="font-medium">⏸️ Motor automático pausado.</span>
                <button
                  type="button"
                  onClick={() => handleToggleEngine(true)}
                  className="font-bold underline hover:opacity-80 shrink-0"
                >
                  Ativar agora
                </button>
              </div>
            )}

            {/* Lista de Cards de Linha do E-mail */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/70">
              {loadingMessages ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n} className="animate-pulse flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-2/3" />
                        <div className="h-2.5 bg-muted rounded w-full" />
                        <div className="h-2 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <Inbox className="w-9 h-9 mx-auto text-muted-foreground/30 mb-2.5" />
                  <p className="text-xs font-bold text-foreground">Nenhuma mensagem nesta visualização</p>
                  <p className="text-[11px] mt-1">
                    {searchQuery
                      ? "Tente ajustar o termo pesquisado ou limpar os filtros rápidos."
                      : "Sua caixa está limpa e organizada."}
                  </p>
                </div>
              ) : (
                messages.map(item => {
                  const isSelected = selectedIds.includes(item.id)
                  const isActive = activeMessageId === item.id
                  const isUnread = !item.isRead
                  const isScheduled = item.status === "scheduled" || item.folder === "queue"
                  const isFailed = item.status === "failed"
                  const isDraft = item.status === "draft" || item.folder === "drafts"

                  const displayParty =
                    item.direction === "inbound"
                      ? item.fromName || item.fromEmail
                      : `Para: ${item.recipient || "(Sem destinatário)"}`

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (isDraft) {
                          openComposer({ mode: "draft", sourceMessage: item })
                        } else {
                          openMessageDetail(item.id, true)
                        }
                      }}
                      className={`group relative px-3 py-2.5 cursor-pointer transition-colors flex items-start gap-2.5 ${
                        isActive
                          ? "bg-primary/10 dark:bg-primary/15"
                          : isSelected
                          ? "bg-primary/5"
                          : isUnread
                          ? "bg-blue-50/45 dark:bg-blue-950/20 hover:bg-muted/70"
                          : "bg-background hover:bg-muted/50"
                      }`}
                    >
                      {/* Indicador lateral azul para Não Lidos */}
                      {isUnread && (
                        <span className="w-1 h-full bg-blue-600 absolute left-0 top-0 bottom-0" />
                      )}

                      {/* Coluna Esquerda do Card: Checkbox + Estrela + Avatar */}
                      <div className="flex flex-col items-center gap-1.5 pt-0.5 shrink-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={e => toggleSelectOne(item.id, e)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <Square className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              executeBulkAction([item.id], item.isStarred ? "unstar" : "star")
                            }}
                            className="text-muted-foreground hover:text-amber-500"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                item.isStarred ? "fill-amber-400 text-amber-500" : "opacity-50 group-hover:opacity-100"
                              }`}
                            />
                          </button>
                        </div>

                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${getAvatarColor(
                            item.direction === "inbound" ? item.fromEmail : item.recipient
                          )}`}
                        >
                          {getInitials(item.direction === "inbound" ? item.fromName || item.fromEmail : item.recipient)}
                        </div>
                      </div>

                      {/* Conteúdo Central do Card */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            )}
                            <span
                              className={`text-xs truncate ${
                                isUnread
                                  ? "font-bold text-[#111827] dark:text-white"
                                  : "font-medium text-[#4B5563] dark:text-slate-300"
                              }`}
                            >
                              {displayParty}
                            </span>
                            {item.threadCount > 1 && (
                              <span className="text-[10px] font-bold px-1 rounded bg-muted text-muted-foreground shrink-0">
                                {item.threadCount}
                              </span>
                            )}
                          </div>

                          <span
                            className={`text-[10px] whitespace-nowrap shrink-0 ${
                              isUnread ? "font-bold text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                            }`}
                          >
                            {formatSmartDate(item.scheduledFor || item.created_at)}
                          </span>
                        </div>

                        {/* Linha de Assunto */}
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className={`text-xs truncate ${
                              isUnread
                                ? "font-semibold text-[#111827] dark:text-slate-100"
                                : "font-normal text-[#374151] dark:text-slate-300"
                            }`}
                          >
                            {item.subject}
                          </span>
                          {(item.hasAttachments || item.matchedReservation?.attachmentsAvailableCount > 0) && (
                            <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                        </div>

                        {/* Snippet de 1 linha */}
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {item.snippet || "Sem pré-visualização de texto."}
                        </p>

                        {/* Badges Inferiores: Reserva Vinculada, Status da Fila/Erro e Etiquetas */}
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {item.matchedReservation && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-slate-900/8 dark:bg-white/10 text-foreground border border-border">
                              <Building2 className="w-2.5 h-2.5 text-amber-600" />
                              Flat {item.matchedReservation.flatNumber} • #{item.matchedReservation.code}
                            </span>
                          )}

                          {isScheduled && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              ⏳ Agendado
                            </span>
                          )}

                          {isFailed && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                              ⚠️ Falha SMTP
                            </span>
                          )}

                          {isDraft && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300">
                              📝 Rascunho
                            </span>
                          )}

                          {Array.isArray(item.labels) &&
                            item.labels.slice(0, 3).map((lid: string) => {
                              const lb = labelsById[lid]
                              if (!lb) return null
                              return (
                                <span
                                  key={lid}
                                  className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-md"
                                  style={{
                                    backgroundColor: `${lb.color}20`,
                                    color: lb.color
                                  }}
                                >
                                  {lb.name}
                                </span>
                              )
                            })}
                        </div>
                      </div>

                      {/* Hover Quick Actions (Flutuante ao passar o mouse na linha) */}
                      <div
                        onClick={e => e.stopPropagation()}
                        className="hidden group-hover:flex items-center gap-1 absolute right-2 top-2 bg-card/95 backdrop-blur-xs border border-border shadow-sm rounded-xl px-1.5 py-1 z-10"
                      >
                        {isScheduled && item.queueId ? (
                          <>
                            <button
                              type="button"
                              disabled={dispatchingQueueId === item.queueId}
                              onClick={e => handleQueueSendNow(item.queueId, e)}
                              className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1"
                              title="Antecipar e Enviar Agora"
                            >
                              <Send className="w-2.5 h-2.5" />
                              <span>Enviar Agora</span>
                            </button>
                            <button
                              type="button"
                              onClick={e => handleCancelQueueItem(item.queueId, e)}
                              className="p-1 rounded-lg hover:bg-rose-500/15 text-rose-600"
                              title="Cancelar Agendamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : isFailed && item.communicationId ? (
                          <button
                            type="button"
                            disabled={resendingCommId === item.communicationId}
                            onClick={e => handleResendFailed(item.communicationId, e)}
                            className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1"
                            title="Reenviar E-mail"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Reenviar</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                executeBulkAction([item.id], "archive", { toastMsg: "Arquivado" })
                              }
                              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Arquivar"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                executeBulkAction([item.id], item.isRead ? "markAsUnread" : "markAsRead")
                              }
                              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={item.isRead ? "Marcar como não lido" : "Marcar como lido"}
                            >
                              {item.isRead ? (
                                <Mail className="w-3.5 h-3.5" />
                              ) : (
                                <MailOpen className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                executeBulkAction([item.id], "trash", { toastMsg: "Movido para a lixeira" })
                              }
                              className="p-1 rounded-lg hover:bg-rose-500/15 text-rose-600"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* ──────────────────────────────────────────────────────────────────
              COLUNA 3: PAINEL DE LEITURA E CONVERSA EM THREAD (FLEX 1)
             ────────────────────────────────────────────────────────────────── */}
          <main className="hidden md:flex flex-1 flex-col h-full bg-card overflow-hidden">
            {!messageDetail ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
                  <Mail className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-bold text-foreground">Selecione um e-mail para leitura</p>
                <p className="text-xs mt-1 max-w-sm">
                  Visualize o histórico em conversa, anexos FNRH, vínculo com reservas ou clique em{" "}
                  <strong>+ Escrever E-mail</strong>.
                </p>
              </div>
            ) : (
              <>
                {/* Toolbar Superior da Mensagem Aberta */}
                <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2 bg-muted/15 shrink-0 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openComposer({ mode: "reply", sourceMessage: messageDetail })}
                      className="h-8 text-xs font-semibold gap-1.5 rounded-xl px-2.5"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Responder</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openComposer({ mode: "replyall", sourceMessage: messageDetail })}
                      className="h-8 text-xs font-semibold gap-1.5 rounded-xl px-2.5"
                    >
                      <ReplyAll className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Resp. a todos</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openComposer({ mode: "forward", sourceMessage: messageDetail })}
                      className="h-8 text-xs font-semibold gap-1.5 rounded-xl px-2.5"
                    >
                      <Forward className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Encaminhar</span>
                    </Button>

                    <div className="h-4 w-px bg-border mx-1" />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        executeBulkAction([messageDetail.id], "archive", { toastMsg: "Conversa arquivada" })
                      }
                      className="h-8 text-xs font-semibold gap-1 rounded-xl px-2"
                      title="Arquivar"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </Button>

                    {/* Seletor Rápido para Mover para Pasta */}
                    <Select
                      onValueChange={val =>
                        executeBulkAction([messageDetail.id], "moveToFolder", {
                          targetFolderId: val,
                          toastMsg: "Movido para a pasta"
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[110px] text-[11px] rounded-xl border-none bg-transparent hover:bg-muted px-2 gap-1">
                        <FolderInput className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Mover..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbox">📥 Caixa de Entrada</SelectItem>
                        <SelectItem value="archive">🗄️ Arquivo</SelectItem>
                        {customFolders.map(cf => (
                          <SelectItem key={cf.id} value={cf.id}>
                            📁 {cf.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Seletor Rápido para Aplicar Etiqueta */}
                    <Select
                      onValueChange={val =>
                        executeBulkAction([messageDetail.id], "applyLabel", {
                          labelId: val,
                          toastMsg: "Etiqueta aplicada"
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[110px] text-[11px] rounded-xl border-none bg-transparent hover:bg-muted px-2 gap-1">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Etiqueta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {labels.map(lb => (
                          <SelectItem key={lb.id} value={lb.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: lb.color }}
                              />
                              <span>{lb.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.print()}
                      className="h-8 text-xs font-semibold gap-1 rounded-xl px-2"
                      title="Imprimir e-mail"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        executeBulkAction([messageDetail.id], "trash", {
                          toastMsg: "Movido para a lixeira"
                        })
                      }
                      className="h-8 text-xs font-semibold gap-1 rounded-xl px-2 text-rose-600 hover:bg-rose-500/10"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Botões Especiais quando o E-mail é da Fila Agendada ou Falha */}
                  <div className="flex items-center gap-2">
                    {messageDetail.queueId && messageDetail.status === "scheduled" && (
                      <>
                        <Button
                          size="sm"
                          disabled={dispatchingQueueId === messageDetail.queueId}
                          onClick={() => handleQueueSendNow(messageDetail.queueId)}
                          className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Antecipar e Enviar Agora</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelQueueItem(messageDetail.queueId)}
                          className="h-8 text-xs font-semibold rounded-xl text-rose-600 border-rose-200"
                        >
                          Cancelar Fila
                        </Button>
                      </>
                    )}

                    {messageDetail.status === "failed" && messageDetail.communicationId && (
                      <Button
                        size="sm"
                        disabled={resendingCommId === messageDetail.communicationId}
                        onClick={() => handleResendFailed(messageDetail.communicationId)}
                        className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            resendingCommId === messageDetail.communicationId ? "animate-spin" : ""
                          }`}
                        />
                        <span>Tentar Novamente (Reenviar)</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Área Rolável de Leitura da Conversa */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
                  {/* Banner de Erro se o disparo falhou */}
                  {messageDetail.status === "failed" && messageDetail.metadata?.error && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                        <div>
                          <div className="font-bold">Falha no envio SMTP</div>
                          <div className="text-[11px] opacity-90">{messageDetail.metadata.error}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleResendFailed(messageDetail.communicationId || messageDetail.id)}
                        className="h-7 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shrink-0"
                      >
                        Reenviar Agora
                      </Button>
                    </div>
                  )}

                  {/* SMART CRM CARD: Contexto da Reserva Vinculada */}
                  {messageDetail.matchedReservation && (
                    <div className="p-3.5 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.04] border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              Flat {messageDetail.matchedReservation.flatNumber} •{" "}
                              {messageDetail.matchedReservation.guestName}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5">
                              #{messageDetail.matchedReservation.code}
                            </Badge>
                            <Badge
                              className={`text-[10px] h-4 px-1.5 font-bold ${
                                messageDetail.matchedReservation.fnhrCompleted
                                  ? "bg-emerald-600 text-white"
                                  : "bg-amber-500 text-white"
                              }`}
                            >
                              {messageDetail.matchedReservation.fnhrCompleted
                                ? "✓ FNRH Digital Assinada"
                                : "FNRH Pendente"}
                            </Badge>
                            {messageDetail.matchedReservation.vehiclePlate && (
                              <Badge variant="secondary" className="text-[10px] font-mono h-4 px-1.5">
                                🚗 {messageDetail.matchedReservation.vehiclePlate}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>
                              📅 Estadia: <strong>{messageDetail.matchedReservation.checkinDate}</strong> até{" "}
                              <strong>{messageDetail.matchedReservation.checkoutDate}</strong>
                            </span>
                            {messageDetail.matchedReservation.attachmentsAvailableCount > 0 && (
                              <span>
                                • 📎{" "}
                                <strong>
                                  {messageDetail.matchedReservation.attachmentsAvailableCount} doc(s) oficial(is)
                                </strong>{" "}
                                disponíveis na reserva
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openComposer({
                              mode: "new",
                              reservationId: String(messageDetail.matchedReservation.id),
                              templateKey: "portaria"
                            })
                          }
                          className="h-7 text-[11px] font-bold rounded-xl gap-1"
                        >
                          <Building2 className="w-3 h-3 text-blue-600" />
                          <span>Enviar p/ Portaria</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openComposer({
                              mode: "new",
                              reservationId: String(messageDetail.matchedReservation.id),
                              templateKey: "garagem"
                            })
                          }
                          className="h-7 text-[11px] font-bold rounded-xl gap-1"
                        >
                          <Car className="w-3 h-3 text-amber-600" />
                          <span>Liberar Garagem</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Header Principal do Assunto (`20px`, semibold) + Etiquetas */}
                  <div className="space-y-2 pb-3 border-b border-border">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-[20px] font-semibold text-foreground leading-snug">
                        {messageDetail.subject}
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          executeBulkAction(
                            [messageDetail.id],
                            messageDetail.isStarred ? "unstar" : "star"
                          )
                        }
                        className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground shrink-0"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            messageDetail.isStarred ? "fill-amber-400 text-amber-500" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {/* Pílulas de Etiquetas Aplicadas */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {Array.isArray(messageDetail.labels) &&
                        messageDetail.labels.map((lid: string) => {
                          const lb = labelsById[lid]
                          if (!lb) return null
                          return (
                            <span
                              key={lid}
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg"
                              style={{
                                backgroundColor: `${lb.color}20`,
                                color: lb.color
                              }}
                            >
                              <span>{lb.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  executeBulkAction([messageDetail.id], "removeLabel", { labelId: lid })
                                }
                                className="hover:opacity-70"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                    </div>
                  </div>

                  {/* Visualização em Thread (Acordeão de Mensagens da Conversa) */}
                  <div className="space-y-3">
                    {threadMessages.map((tm, idx) => {
                      const isExpanded =
                        expandedThreadIds.includes(tm.id) || threadMessages.length === 1
                      const isLast = idx === threadMessages.length - 1

                      return (
                        <div
                          key={tm.id}
                          className={`rounded-2xl border transition-all overflow-hidden ${
                            isExpanded ? "border-border bg-card shadow-2xs" : "border-border/60 bg-muted/20"
                          }`}
                        >
                          {/* Barra de Cabeçalho do Item da Thread (Acordeão) */}
                          <div
                            onClick={() => {
                              if (threadMessages.length <= 1) return
                              setExpandedThreadIds(prev =>
                                prev.includes(tm.id) ? prev.filter(x => x !== tm.id) : [...prev, tm.id]
                              )
                            }}
                            className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/30"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(
                                  tm.fromEmail || tm.recipient
                                )}`}
                              >
                                {getInitials(tm.fromName || tm.fromEmail)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-foreground">
                                    {tm.fromName || tm.fromEmail}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    &lt;{tm.fromEmail}&gt;
                                  </span>
                                </div>
                                {isExpanded ? (
                                  <div className="text-[11px] text-muted-foreground">
                                    Para: <strong className="text-foreground">{tm.recipient}</strong>
                                    {tm.cc ? ` • Cc: ${tm.cc}` : ""}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground truncate max-w-xl">
                                    {tm.snippet}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
                              <span>
                                {new Date(tm.scheduledFor || tm.created_at).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                              {threadMessages.length > 1 && (
                                isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )
                              )}
                            </div>
                          </div>

                          {/* Corpo Renderizado e Anexos (Quando Expandido) */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-4">
                              <div
                                className="rounded-xl overflow-x-auto p-3 bg-[#F8FAFC] text-[#1F2937] border border-[#E5E7EB]"
                                dangerouslySetInnerHTML={{
                                  __html: tm.bodyHtml || `<p>${tm.bodyText || tm.snippet || ""}</p>`
                                }}
                              />

                              {/* Cards de Anexos */}
                              {Array.isArray(tm.attachments) && tm.attachments.length > 0 && (
                                <div className="space-y-2 pt-1">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span>Anexos ({tm.attachments.length})</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {tm.attachments.map((att: any, aIdx: number) => (
                                      <a
                                        key={att.id || aIdx}
                                        href={att.downloadUrl || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors group"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-xs font-bold text-foreground truncate">
                                              {att.filename || "Documento.pdf"}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                              {formatBytes(att.size)} • Clique para abrir
                                            </div>
                                          </div>
                                        </div>
                                        <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Caixa de Resposta Rápida (Quick Reply) no Rodapé da Conversa */}
                  <div className="pt-2">
                    {!quickReplyOpen ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuickReplyOpen(true)}
                          className="flex-1 text-left px-4 py-3 rounded-2xl border border-border bg-muted/25 hover:bg-muted/50 text-xs text-muted-foreground transition-colors flex items-center justify-between"
                        >
                          <span>
                            Clique aqui para responder rapidamente a{" "}
                            <strong className="text-foreground">
                              {messageDetail.direction === "inbound"
                                ? messageDetail.fromName || messageDetail.fromEmail
                                : messageDetail.recipient}
                            </strong>
                            ...
                          </span>
                          <Reply className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openComposer({ mode: "forward", sourceMessage: messageDetail })}
                          className="h-11 rounded-2xl px-4 text-xs font-semibold gap-1.5"
                        >
                          <Forward className="w-3.5 h-3.5" />
                          <span>Encaminhar</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-primary/40 bg-card shadow-sm p-3.5 space-y-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Respondendo para:{" "}
                            <strong className="text-foreground">
                              {messageDetail.direction === "inbound"
                                ? messageDetail.fromEmail
                                : messageDetail.recipient}
                            </strong>
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setQuickReplyOpen(false)
                                openComposer({ mode: "reply", sourceMessage: messageDetail })
                              }}
                              className="h-6 text-[11px] gap-1 px-2"
                            >
                              <Maximize2 className="w-3 h-3" />
                              <span>Expandir no Compositor</span>
                            </Button>
                            <button
                              type="button"
                              onClick={() => setQuickReplyOpen(false)}
                              className="p-1 hover:bg-muted rounded-lg"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <Textarea
                          rows={4}
                          value={quickReplyText}
                          onChange={e => setQuickReplyText(e.target.value)}
                          placeholder="Escreva sua resposta rápida..."
                          className="text-xs rounded-xl"
                        />

                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">
                            Enviado com assinatura e layout oficial CorpFlats
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setQuickReplyOpen(false)}
                              className="h-8 text-xs rounded-xl"
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              disabled={sendingQuickReply || !quickReplyText.trim()}
                              onClick={handleSendQuickReply}
                              className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:text-slate-950 text-white"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{sendingQuickReply ? "Enviando..." : "Enviar Resposta"}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            JANELA FLUTUANTE DE COMPOSIÇÃO (DOCKED COMPOSE MODAL - ESTILO GMAIL)
           ════════════════════════════════════════════════════════════════════ */}
        {composeOpen && (
          <div
            className={
              composeMaximized
                ? "fixed inset-4 md:inset-10 z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                : composeMinimized
                ? "fixed bottom-0 right-6 z-50 w-[300px] bg-slate-900 text-white rounded-t-2xl shadow-xl overflow-hidden"
                : "fixed bottom-0 right-4 md:right-6 z-50 w-[95vw] sm:w-[560px] max-h-[86vh] bg-card border border-border rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
            }
          >
            {/* Barra de Título da Janela Flutuante */}
            <div
              onClick={() => {
                if (composeMinimized) setComposeMinimized(false)
              }}
              className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2 cursor-pointer shrink-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Send className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-bold truncate">
                  {composeSubject.trim() || "Nova Mensagem • CorpFlats"}
                </span>
                {draftSaveStatus && !composeMinimized && (
                  <span className="text-[10px] text-slate-300 font-normal hidden sm:inline">
                    • {draftSaveStatus}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    setComposeMinimized(!composeMinimized)
                    setComposeMaximized(false)
                  }}
                  className="p-1 rounded hover:bg-white/15 text-slate-200"
                  title="Minimizar"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposeMaximized(!composeMaximized)
                    setComposeMinimized(false)
                  }}
                  className="p-1 rounded hover:bg-white/15 text-slate-200"
                  title="Maximizar"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="p-1 rounded hover:bg-white/15 text-slate-200"
                  title="Fechar (Salvo nos rascunhos)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Corpo do Compositor (Oculto quando minimizado) */}
            {!composeMinimized && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col">
                {/* Superpoder Hoteleiro: Vínculo com Reserva + Templates Rápidos */}
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Contexto da Reserva & Templates:</span>
                    </div>

                    <Select
                      value={composeReservationId}
                      onValueChange={val => {
                        setComposeReservationId(val)
                        if (composeTemplateKey !== "custom") {
                          applyComposerTemplate(composeTemplateKey, val)
                        } else if (val !== "none") {
                          applyComposerTemplate("portaria", val)
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-[11px] rounded-lg w-full sm:w-[250px] bg-background">
                        <SelectValue placeholder="Vincular Reserva / Flat (Opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem reserva vinculada (E-mail livre)</SelectItem>
                        {activeReservations.map(r => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            Flat {r.flatNumber} - {r.guestName} (#{r.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Botões de Templates Rápidos */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {[
                      { key: "portaria", label: "🏢 Portaria (Liberação)" },
                      { key: "garagem", label: "🚗 Garagem (PFB)" },
                      { key: "hospede_welcome", label: "👋 Confirmação Hóspede" },
                      { key: "acesso_wifi", label: "🔑 Acesso & Wi-Fi" },
                      { key: "lembrete_checkin", label: "⏰ Lembrete Check-in" },
                      { key: "custom", label: "✍️ Livre" }
                    ].map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => applyComposerTemplate(t.key, composeReservationId)}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors ${
                          composeTemplateKey === t.key
                            ? "bg-amber-600 text-white"
                            : "bg-background hover:bg-muted text-foreground border border-border"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Opção de Anexar FNRH + Documento Oficial quando há reserva selecionada */}
                  {selectedComposeReservation && (
                    <div className="pt-1 border-t border-border/60 flex items-center justify-between gap-2 text-[11px]">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-700 dark:text-emerald-400">
                        <input
                          type="checkbox"
                          checked={composeAttachResDocs}
                          onChange={e => setComposeAttachResDocs(e.target.checked)}
                          className="rounded border-border"
                        />
                        <span>
                          📎 Anexar FNRH PDF + Documento Oficial de{" "}
                          <strong>{selectedComposeReservation.guestName}</strong> automaticamente
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Destinatários (Para, Cc, Cco em formato de Chips) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 border-b border-border pb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-muted-foreground w-10">Para:</span>
                    {composeToChips.map(chip => (
                      <span
                        key={chip}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/12 text-primary text-[11px] font-semibold"
                      >
                        <span>{chip}</span>
                        <button
                          type="button"
                          onClick={() => setComposeToChips(composeToChips.filter(c => c !== chip))}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="email"
                      value={composeToInput}
                      onChange={e => setComposeToInput(e.target.value)}
                      onKeyDown={e =>
                        handleChipKeyDown(
                          e,
                          composeToInput,
                          setComposeToInput,
                          composeToChips,
                          setComposeToChips
                        )
                      }
                      onBlur={() => {
                        if (composeToInput.trim() && !composeToChips.includes(composeToInput.trim())) {
                          setComposeToChips([...composeToChips, composeToInput.trim()])
                          setComposeToInput("")
                        }
                      }}
                      placeholder={
                        composeToChips.length === 0 ? "Digite o e-mail e pressione Enter..." : ""
                      }
                      className="flex-1 min-w-[140px] bg-transparent text-xs outline-none"
                    />
                    <div className="flex items-center gap-1 text-[10.5px]">
                      <button
                        type="button"
                        onClick={() => {
                          const rec = webmailStatus.receptionEmail || "soho@promenade.com.br"
                          if (!composeToChips.includes(rec)) setComposeToChips([...composeToChips, rec])
                        }}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-semibold"
                        title="Adicionar e-mail da Portaria Soho"
                      >
                        +Portaria
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const gar =
                            webmailStatus.garageEmail || "promenadesoho@pfbestacionamentos.com.br"
                          if (!composeToChips.includes(gar)) setComposeToChips([...composeToChips, gar])
                        }}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-semibold"
                        title="Adicionar e-mail da Garagem PFB"
                      >
                        +Garagem
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCcBcc(!showCcBcc)}
                        className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground font-bold"
                      >
                        Cc/Cco
                      </button>
                    </div>
                  </div>

                  {showCcBcc && (
                    <>
                      <div className="flex items-center gap-1.5 border-b border-border pb-1.5 flex-wrap">
                        <span className="text-xs font-bold text-muted-foreground w-10">Cc:</span>
                        {composeCcChips.map(chip => (
                          <span
                            key={chip}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-semibold"
                          >
                            <span>{chip}</span>
                            <button
                              type="button"
                              onClick={() => setComposeCcChips(composeCcChips.filter(c => c !== chip))}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={composeCcInput}
                          onChange={e => setComposeCcInput(e.target.value)}
                          onKeyDown={e =>
                            handleChipKeyDown(
                              e,
                              composeCcInput,
                              setComposeCcInput,
                              composeCcChips,
                              setComposeCcChips
                            )
                          }
                          placeholder="Com cópia..."
                          className="flex-1 bg-transparent text-xs outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 border-b border-border pb-1.5 flex-wrap">
                        <span className="text-xs font-bold text-muted-foreground w-10">Cco:</span>
                        {composeBccChips.map(chip => (
                          <span
                            key={chip}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-semibold"
                          >
                            <span>{chip}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setComposeBccChips(composeBccChips.filter(c => c !== chip))
                              }
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={composeBccInput}
                          onChange={e => setComposeBccInput(e.target.value)}
                          onKeyDown={e =>
                            handleChipKeyDown(
                              e,
                              composeBccInput,
                              setComposeBccInput,
                              composeBccChips,
                              setComposeBccChips
                            )
                          }
                          placeholder="Cópia oculta..."
                          className="flex-1 bg-transparent text-xs outline-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Campo Assunto */}
                  <div className="flex items-center gap-1.5 border-b border-border pb-1.5">
                    <span className="text-xs font-bold text-muted-foreground w-14">Assunto:</span>
                    <input
                      type="text"
                      value={composeSubject}
                      onChange={e => setComposeSubject(e.target.value)}
                      placeholder="Assunto do e-mail..."
                      className="flex-1 bg-transparent text-xs font-semibold outline-none"
                    />
                  </div>
                </div>

                {/* Barra de Ferramentas Rich Text + Toggle de Preview 600px */}
                <div className="flex items-center justify-between gap-2 bg-muted/30 px-2 py-1 rounded-xl border border-border">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => insertComposerFormat("<strong>", "</strong>")}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Negrito"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertComposerFormat("<em>", "</em>")}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Itálico"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertComposerFormat("<u>", "</u>")}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Sublinhado"
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertComposerFormat("\n• ", "")}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Lista"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Anexar Arquivo"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => handleFilesSelected(e.target.files)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10.5px] text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={composeUseTransactional}
                        onChange={e => setComposeUseTransactional(e.target.checked)}
                        className="rounded"
                      />
                      <span>Template 600px</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setComposePreviewMode(!composePreviewMode)}
                      className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 ${
                        composePreviewMode
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{composePreviewMode ? "Editar" : "Preview"}</span>
                    </button>
                  </div>
                </div>

                {/* Editor de Corpo ou Preview HTML 600px */}
                {composePreviewMode ? (
                  <div className="flex-1 min-h-[180px] max-h-[300px] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    {composeRichHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: composeRichHtml }} />
                    ) : (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-5 text-[#374151] text-xs space-y-3">
                        <div className="font-bold text-sm text-[#111827] border-b pb-2">
                          CorpFlats • Preview Transacional
                        </div>
                        <div className="font-semibold text-base text-[#111827]">
                          {composeSubject || "(Sem assunto)"}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed bg-[#F9FAFB] p-3 rounded border">
                          {composeBody || "(Mensagem vazia)"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Textarea
                    ref={composeTextareaRef}
                    rows={composeMaximized ? 14 : 7}
                    value={composeBody}
                    onChange={e => {
                      setComposeBody(e.target.value)
                      if (composeTemplateKey === "custom") setComposeRichHtml("")
                    }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      handleFilesSelected(e.dataTransfer.files)
                    }}
                    placeholder="Escreva sua mensagem aqui (ou arraste arquivos para anexar)..."
                    className="flex-1 text-xs rounded-xl resize-none"
                  />
                )}

                {/* Lista de Anexos Adicionados no Compositor */}
                {composeAttachments.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {composeAttachments.map((att, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-xs font-medium"
                      >
                        <Paperclip className="w-3 h-3 text-primary" />
                        <span className="truncate max-w-[160px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setComposeAttachments(composeAttachments.filter((_, i) => i !== idx))
                          }
                          className="text-muted-foreground hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Rodapé do Compositor Flutuante */}
                <div className="pt-2 border-t border-border flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      disabled={sendingCompose}
                      onClick={() => handleSendCompose()}
                      className="h-9 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold gap-1.5 shadow-sm"
                    >
                      {sendingCompose ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{sendingCompose ? "Enviando..." : "Enviar Agora"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 rounded-xl text-xs gap-1"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Anexar</span>
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (draftId) {
                        await fetch(`/api/webmail/drafts/${draftId}`, { method: "DELETE" })
                      }
                      setComposeOpen(false)
                      setDraftId(null)
                      fetchMessages(false)
                    }}
                    className="p-2 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                    title="Descartar rascunho"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL: CONFIGURAÇÃO ZOHO MAIL REST API (OAUTH2) & SERVIDOR SMTP
           ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <span>Integração Zoho Mail REST API (OAuth2) & Motor SMTP</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure as credenciais OAuth2 para sincronização bidirecional com a Zoho Mail API ou mantenha o motor SMTP corporativo como transporte principal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Bloco 1: Zoho Mail REST API (OAuth2) */}
              <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>1. Zoho Mail REST API (OAuth 2.0)</span>
                  </div>
                  <Badge
                    variant={webmailStatus.oauthConnected ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {webmailStatus.oauthConnected ? "🟢 OAuth2 Conectado" : "Modo Local + SMTP Ativo"}
                  </Badge>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Para gerar as chaves gratuitamente no{" "}
                  <a
                    href="https://api-console.zoho.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-semibold text-foreground"
                  >
                    Zoho API Console (Self Client)
                  </a>
                  , crie um <strong>Self Client</strong>, copie o <code>Client ID</code> e{" "}
                  <code>Client Secret</code>, e gere um código com os escopos:{" "}
                  <code className="bg-muted px-1 rounded">
                    ZohoMail.accounts.READ,ZohoMail.messages.ALL,ZohoMail.folders.ALL,ZohoMail.tags.ALL
                  </code>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] font-bold">ZOHO_CLIENT_ID</Label>
                    <Input
                      value={oauthClientId}
                      onChange={e => setOauthClientId(e.target.value)}
                      placeholder="1000.XXXXXXXXXXXXXXXXXXXXXXXX"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Data Center (ZOHO_DC)</Label>
                    <Select value={oauthDc} onValueChange={setOauthDc}>
                      <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="com">zoho.com (Global / BR)</SelectItem>
                        <SelectItem value="eu">zoho.eu (Europa)</SelectItem>
                        <SelectItem value="in">zoho.in (Índia)</SelectItem>
                        <SelectItem value="com.au">zoho.com.au (Austrália)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">ZOHO_CLIENT_SECRET</Label>
                    <Input
                      type="password"
                      value={oauthClientSecret}
                      onChange={e => setOauthClientSecret(e.target.value)}
                      placeholder="Client Secret do Zoho"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">ZOHO_REFRESH_TOKEN (Permanente)</Label>
                    <Input
                      type="password"
                      value={oauthRefreshToken}
                      onChange={e => setOauthRefreshToken(e.target.value)}
                      placeholder="1000.xxxx (ou use o Grant Code abaixo)"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-300/60 dark:border-amber-800 space-y-1.5">
                  <Label className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    ⚡ Gerador Automático de Refresh Token (Opcional — Cole o Grant Code do Self Client):
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={oauthGrantCode}
                      onChange={e => setOauthGrantCode(e.target.value)}
                      placeholder="Cole aqui o código temporário gerado na aba 'Generate Code' do Zoho..."
                      className="h-8 text-xs font-mono rounded-xl bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingOauth || !oauthGrantCode.trim()}
                      onClick={() => handleSaveOauthConfig(true)}
                      className="h-8 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shrink-0"
                    >
                      Trocar por Refresh Token
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingOauth}
                    onClick={() => handleSaveOauthConfig(true)}
                    className="h-8 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white gap-1.5"
                  >
                    {savingOauth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Salvar & Testar Zoho API</span>
                  </Button>
                </div>
              </div>

              {/* Bloco 2: Servidor Zoho SMTP (Transporte Direto & Fallback) */}
              <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-primary" />
                  <span>2. Servidor Zoho SMTP (Motor Transacional & Fallback)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] font-bold">Servidor SMTP</Label>
                    <Input
                      value={smtpHost}
                      onChange={e => setSmtpHost(e.target.value)}
                      placeholder="smtp.zoho.com"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Porta SSL</Label>
                    <Input
                      type="number"
                      value={smtpPort}
                      onChange={e => setSmtpPort(Number(e.target.value))}
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Conta SMTP (E-mail Zoho)</Label>
                    <Input
                      value={smtpUser}
                      onChange={e => setSmtpUser(e.target.value)}
                      placeholder="reservas@corpflats.com.br"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Senha / Senha de Aplicativo Zoho</Label>
                    <Input
                      type="password"
                      value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)}
                      placeholder="Deixe em branco para manter a atual"
                      className="h-8 text-xs font-mono rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingSmtp}
                    onClick={handleSaveSmtpConfig}
                    className="h-8 text-xs font-bold rounded-xl"
                  >
                    Salvar Configurações SMTP
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfigModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Criar Nova Pasta */}
        <Dialog open={newFolderModalOpen} onOpenChange={setNewFolderModalOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Criar Nova Pasta</DialogTitle>
              <DialogDescription className="text-xs">
                Organize seus e-mails em pastas sincronizadas.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome da Pasta *</Label>
                <Input
                  required
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="ex: Hóspedes Mensalistas"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
              <DialogFooter>
                <Button type="submit" size="sm" className="rounded-xl text-xs font-bold">
                  Criar Pasta
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Criar Nova Etiqueta */}
        <Dialog open={newLabelModalOpen} onOpenChange={setNewLabelModalOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Criar Nova Etiqueta Colorida</DialogTitle>
              <DialogDescription className="text-xs">
                Classifique conversas por categoria operacional.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateLabel} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome da Etiqueta *</Label>
                <Input
                  required
                  value={newLabelName}
                  onChange={e => setNewLabelName(e.target.value)}
                  placeholder="ex: Faturamento Corporativo"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Cor da Etiqueta</Label>
                <div className="flex items-center gap-2">
                  {["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"].map(
                    c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewLabelColor(c)}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          newLabelColor === c ? "scale-125 ring-2 ring-offset-2 ring-primary" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    )
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" size="sm" className="rounded-xl text-xs font-bold">
                  Criar Etiqueta
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Teste Rápido SMTP */}
        <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <span>Testar Disparo SMTP Zoho</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Enviaremos um e-mail transacional de validação para confirmar que as credenciais e o servidor estão operando perfeitamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">E-mail de Destino do Teste *</Label>
                <Input
                  type="email"
                  value={testTargetEmail}
                  onChange={e => setTestTargetEmail(e.target.value)}
                  placeholder="ex: seuemail@gmail.com"
                  className="text-xs h-9 rounded-xl"
                />
              </div>
              <div className="p-3 bg-muted/40 rounded-xl text-[11px] text-muted-foreground space-y-1">
                <div>
                  <strong>Host:</strong> {webmailStatus.smtpHost}:{webmailStatus.smtpPort}
                </div>
                <div>
                  <strong>Remetente:</strong> {webmailStatus.fromName} (
                  {webmailStatus.fromEmail || webmailStatus.smtpUser})
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTestModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={testingSmtp || !testTargetEmail}
                onClick={handleTestSmtp}
                className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1.5"
              >
                {testingSmtp ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{testingSmtp ? "Validando..." : "Disparar E-mail de Teste"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
